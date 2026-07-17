"""K 线管线 + 端点测试。纯管线测试不依赖 DB;端点测试用 sqlite in-memory。"""
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
from database import Base, get_db
import models


def _rows(closes, start="20230103", adj=1.0):
    """造连续交易日(跳过周末)的 rows:close 来自列表,adj_factor 恒定。"""
    out = []
    d = datetime.strptime(start, "%Y%m%d")
    for c in closes:
        while d.weekday() >= 5:      # 跳过周六周日
            d += timedelta(days=1)
        out.append({"trade_date": d.strftime("%Y%m%d"), "close": float(c), "adj_factor": adj})
        d += timedelta(days=1)
    return out


def test_build_kline_daily_passthrough_and_ma():
    from routers import watchlist as wl
    rows = _rows([1, 2, 3, 4, 5, 6])
    pts = wl._build_kline_points(rows, "daily", 100)
    assert [p["close"] for p in pts] == [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    assert pts[0]["ma5"] is None            # 不足 5 根
    assert pts[3]["ma5"] is None
    assert pts[4]["ma5"] == 3.0             # mean(1..5)
    assert pts[5]["ma5"] == 4.0             # mean(2..6)
    assert pts[5]["ma10"] is None           # 不足 10
    assert pts[5]["ma20"] is None
    assert pts[5]["ma60"] is None           # 不足 60 根


def test_build_kline_weekly_takes_last_trade_day_of_week():
    from routers import watchlist as wl
    # 2023-01-03(周二)起 10 个交易日:1/3,4,5,6 | 1/9,10,11,12,13 | 1/16
    rows = _rows([10, 11, 12, 13, 14, 15, 16, 17, 18, 19], start="20230103")
    pts = wl._build_kline_points(rows, "weekly", 100)
    assert [p["close"] for p in pts] == [13.0, 18.0, 19.0]   # 每周最后交易日 close
    assert [p["date"] for p in pts] == ["20230106", "20230113", "20230116"]


def test_build_kline_monthly_takes_last_trade_day_of_month():
    from routers import watchlist as wl
    rows = [
        {"trade_date": "20230130", "close": 30.0, "adj_factor": 1.0},
        {"trade_date": "20230131", "close": 31.0, "adj_factor": 1.0},
        {"trade_date": "20230201", "close": 1.0, "adj_factor": 1.0},
        {"trade_date": "20230228", "close": 28.0, "adj_factor": 1.0},
        {"trade_date": "20230301", "close": 1.0, "adj_factor": 1.0},
        {"trade_date": "20230331", "close": 31.0, "adj_factor": 1.0},
    ]
    pts = wl._build_kline_points(rows, "monthly", 100)
    assert [p["close"] for p in pts] == [31.0, 28.0, 31.0]
    assert [p["date"] for p in pts] == ["20230131", "20230228", "20230331"]


def test_build_kline_qfq_adjusts_by_latest_adj():
    from routers import watchlist as wl
    # adj 恒定 → 前复权=原值
    rows = [
        {"trade_date": "20230103", "close": 20.0, "adj_factor": 2.0},
        {"trade_date": "20230104", "close": 10.0, "adj_factor": 2.0},
    ]
    pts = wl._build_kline_points(rows, "daily", 100)
    assert pts[0]["close"] == 20.0 and pts[1]["close"] == 10.0
    # 早期 adj=1、最新 adj=2 → 历史 close 减半(前复权,基准=最新日)
    rows2 = [
        {"trade_date": "20230103", "close": 20.0, "adj_factor": 1.0},
        {"trade_date": "20230104", "close": 10.0, "adj_factor": 2.0},
    ]
    pts2 = wl._build_kline_points(rows2, "daily", 100)
    assert pts2[0]["close"] == 10.0   # 20 * 1 / 2
    assert pts2[1]["close"] == 10.0   # 10 * 2 / 2


def test_build_kline_empty():
    from routers import watchlist as wl
    assert wl._build_kline_points([], "daily", 100) == []
    assert wl._build_kline_points([{"trade_date": "x", "close": None, "adj_factor": 1}], "daily", 100) == []


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("main.init_database", lambda: None)
    monkeypatch.setattr("main.create_tables", lambda: None)
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.IndexDailyModel.__table__])
    S = sessionmaker(bind=eng)

    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = _db
    from routers import watchlist as wl
    wl._KLINE_CACHE.clear()
    wl._BENCHMARK_CACHE.clear()
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _seed(client, code, rows):
    db = next(main.app.dependency_overrides[get_db]())
    for r in rows:
        db.add(models.StockDailyModel(code=code, trade_date=r["trade_date"],
                                      close=r["close"], adj_factor=r.get("adj_factor", 1.0)))
    db.commit()


def _seed_index(client, rows):
    db = next(main.app.dependency_overrides[get_db]())
    for r in rows:
        db.add(models.IndexDailyModel(ts_code="000300.SH", trade_date=r["trade_date"], close=r["close"]))
    db.commit()


def test_kline_local_hit(monkeypatch, client):
    _seed(client, "600519.SH", [
        {"trade_date": "20230103", "close": 1, "adj_factor": 1},
        {"trade_date": "20230104", "close": 2, "adj_factor": 1},
        {"trade_date": "20230105", "close": 3, "adj_factor": 1},
    ])
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("本地命中不应调 tushare")))
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "local"
    assert [p["close"] for p in body["points"]] == [1.0, 2.0, 3.0]


def test_kline_tushare_fallback(monkeypatch, client):
    from routers import watchlist as wl

    def fake_post(api_name, params):
        if api_name == "daily":
            return [{"trade_date": "20230103", "close": 100},
                    {"trade_date": "20230104", "close": 110}]
        if api_name == "adj_factor":
            return [{"trade_date": "20230103", "adj_factor": 1.0},
                    {"trade_date": "20230104", "adj_factor": 1.0}]
        return []

    monkeypatch.setattr(wl, "_tushare_post", fake_post)
    r = client.get("/api/db/watchlist/stock-detail/999999.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "tushare"
    assert [p["close"] for p in body["points"]] == [100.0, 110.0]


def test_kline_empty_when_both_miss(monkeypatch, client):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post", lambda *a, **k: [])
    r = client.get("/api/db/watchlist/stock-detail/999998.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["points"] == []
    assert body["source"] == "tushare"     # 走了兜底分支但空


def test_kline_tushare_error_returns_500(monkeypatch, client):
    from routers import watchlist as wl

    def boom(*a, **k):
        raise RuntimeError("token 未配置")

    monkeypatch.setattr(wl, "_tushare_post", boom)
    r = client.get("/api/db/watchlist/stock-detail/999997.SH/kline?freq=daily&limit=10")
    assert r.status_code == 500
    assert "K线数据获取失败" in r.json()["detail"]


def test_kline_freq_sanitize(client):
    _seed(client, "600519.SH", [{"trade_date": "20230103", "close": 5, "adj_factor": 1}])
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=bogus&limit=10")
    assert r.status_code == 200
    assert r.json()["freq"] == "daily"


def test_build_kline_ma_uses_full_history_before_tail():
    """limit 截断历史时,返回序列首根的 MA 应基于截断前的真实历史(非 None)。"""
    from routers import watchlist as wl
    rows = _rows([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])   # 10 个交易日
    pts = wl._build_kline_points(rows, "daily", 5)   # 只取最近 5 根
    assert len(pts) == 5
    # 第一根(close=6,原 index5)的 ma5 = mean(2..6)=4.0 —— 前面有历史,非 None
    assert pts[0]["close"] == 6.0
    assert pts[0]["ma5"] == 4.0
    # ma10 需 10 根,第一根(index5)只有 6 根历史 → None
    assert pts[0]["ma10"] is None
    assert pts[0]["ma60"] is None   # 10 根不足 60
    assert pts[-1]["ma5"] == 8.0   # mean(6..10)


def test_aggregate_close_daily_passthrough():
    from routers import watchlist as wl
    rows = [{"trade_date": "20230103", "close": 100},
            {"trade_date": "20230104", "close": 110}]
    assert wl._aggregate_close_by_freq(rows, "daily") == [("20230103", 100.0), ("20230104", 110.0)]


def test_aggregate_close_weekly_last_trade_day():
    from routers import watchlist as wl
    # 2023-01-03(周二)起 6 个交易日:1/3,4,5,6 | 1/9,10
    rows = [{"trade_date": "2023010%d" % d, "close": float(d)} for d in (3, 4, 5, 6)]
    rows += [{"trade_date": "20230109", "close": 9.0}, {"trade_date": "20230110", "close": 10.0}]
    assert wl._aggregate_close_by_freq(rows, "weekly") == [("20230106", 6.0), ("20230110", 10.0)]


def test_aggregate_close_empty():
    from routers import watchlist as wl
    assert wl._aggregate_close_by_freq([], "daily") == []


def test_build_benchmark_points_normalizes_first_day_to_100():
    from routers import watchlist as wl
    series = [("20230103", 4000.0), ("20230104", 4400.0), ("20230105", 3960.0)]
    ref = ["20230103", "20230104", "20230105"]
    out = wl._build_benchmark_points(series, ref)
    assert [p["date"] for p in out] == ref
    assert out[0]["value"] == 100.0
    assert out[1]["value"] == 110.0     # 4400/4000*100
    assert out[2]["value"] == 99.0      # 3960/4000*100


def test_build_benchmark_points_aligns_to_ref_dates_missing_null():
    from routers import watchlist as wl
    # series 缺 20230104;ref_dates 含它 → 该日 value=null
    series = [("20230103", 100.0), ("20230105", 120.0)]
    out = wl._build_benchmark_points(series, ["20230103", "20230104", "20230105"])
    assert out[0]["value"] == 100.0
    assert out[1]["value"] is None
    assert out[2]["value"] == 120.0


def test_build_benchmark_points_base_skips_missing_first_day():
    from routers import watchlist as wl
    # 首日 ref series 缺值 → 基准顺延到首个有值日(20230104=100)
    series = [("20230104", 100.0), ("20230105", 90.0)]
    out = wl._build_benchmark_points(series, ["20230103", "20230104", "20230105"])
    assert out[0]["value"] is None      # series 无 20230103
    assert out[1]["value"] == 100.0     # 基准
    assert out[2]["value"] == 90.0


def test_build_benchmark_points_empty_inputs():
    from routers import watchlist as wl
    assert wl._build_benchmark_points([], ["20230103"]) == []
    assert wl._build_benchmark_points([("20230103", 1.0)], []) == []


def test_benchmark_series_local_hit(monkeypatch, client):
    _seed_index(client, [{"trade_date": "20230103", "close": 4000},
                         {"trade_date": "20230104", "close": 4400}])
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("本地命中不应调 tushare")))
    db = next(main.app.dependency_overrides[get_db]())
    assert wl._get_benchmark_series("daily", db) == [("20230103", 4000.0), ("20230104", 4400.0)]


def test_benchmark_series_tushare_fallback(monkeypatch, client):
    from routers import watchlist as wl

    def fake_post(api_name, params):
        assert api_name == "index_daily"
        return [{"trade_date": "20230103", "close": 4000},
                {"trade_date": "20230104", "close": 4200}]

    monkeypatch.setattr(wl, "_tushare_post", fake_post)
    db = next(main.app.dependency_overrides[get_db]())
    assert wl._get_benchmark_series("daily", db) == [("20230103", 4000.0), ("20230104", 4200.0)]


def test_benchmark_series_cache_hit_skips_db(monkeypatch, client):
    from routers import watchlist as wl
    db = next(main.app.dependency_overrides[get_db]())
    # 第一次走 tushare 兜底(本地空)
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: [{"trade_date": "20230103", "close": 4000}])
    s1 = wl._get_benchmark_series("daily", db)
    assert s1 == [("20230103", 4000.0)]
    # 第二次应命中缓存,即使 tushare 抛错也不调
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("不应再调")))
    s2 = wl._get_benchmark_series("daily", db)
    assert s2 == s1


def test_kline_returns_benchmark_local(monkeypatch, client):
    _seed(client, "600519.SH", [
        {"trade_date": "20230103", "close": 100, "adj_factor": 1},
        {"trade_date": "20230104", "close": 110, "adj_factor": 1},
    ])
    _seed_index(client, [{"trade_date": "20230103", "close": 4000},
                         {"trade_date": "20230104", "close": 4400}])
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    b = r.json()["benchmark"]
    assert b["name"] == "沪深300" and b["code"] == "000300.SH"
    assert [p["date"] for p in b["points"]] == ["20230103", "20230104"]
    assert b["points"][0]["value"] == 100.0
    assert b["points"][1]["value"] == 110.0     # 4400/4000*100


def test_kline_benchmark_null_when_tushare_fails(monkeypatch, client):
    _seed(client, "600519.SH", [{"trade_date": "20230103", "close": 100, "adj_factor": 1}])
    from routers import watchlist as wl
    # 本地指数空 + tushare 抛错 → benchmark 降级 null,个股正常
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["benchmark"] is None
    assert [p["close"] for p in body["points"]] == [100.0]   # 个股不受影响


def test_kline_benchmark_null_when_stock_points_empty(monkeypatch, client):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post", lambda *a, **k: [])   # 个股也空
    r = client.get("/api/db/watchlist/stock-detail/999996.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    assert r.json()["benchmark"] is None     # 个股无 points → 不算 benchmark


def test_build_kline_ma60_uses_full_history():
    from routers import watchlist as wl
    rows = _rows([1.0] * 65)   # 65 个交易日,close 全 1
    pts = wl._build_kline_points(rows, "daily", 100)
    assert len(pts) == 65
    assert pts[58]["ma60"] is None    # 前 59 根不足
    assert pts[59]["ma60"] == 1.0     # 第 60 根起 = mean(60 个 1)
    assert pts[-1]["ma60"] == 1.0
