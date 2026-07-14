"""K 线管线 + 端点测试。纯管线测试不依赖 DB;端点测试用 sqlite in-memory。"""
from datetime import datetime, timedelta


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
