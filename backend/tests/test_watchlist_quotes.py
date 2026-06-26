from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
from database import Base, get_db


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("main.init_database", lambda: None)
    monkeypatch.setattr("main.create_tables", lambda: None)
    engine = create_engine(
        "sqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    import models
    Base.metadata.create_all(bind=engine, tables=[models.WatchlistModel.__table__])
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = _override_get_db
    import routers.watchlist as w
    w._QUOTES_CACHE["quotes_map"] = None
    w._QUOTES_CACHE["ts"] = 0.0
    w._TRADE_DATE_CACHE["date"] = None
    w._TRADE_DATE_CACHE["ts"] = 0.0
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _mock_tushare_post(trade_cal_items=None, daily_items=None, fail_daily=False):
    trade_cal_items = trade_cal_items or [["20260624", 1]]
    daily_items = daily_items or []

    def fake_post(url, json=None, timeout=None):
        api = json["api_name"]
        if api == "trade_cal":
            return Mock(json=lambda: {"code": 0, "data": {"fields": ["cal_date", "is_open"], "items": trade_cal_items}})
        if api == "daily_basic":
            if fail_daily:
                raise RuntimeError("daily_basic failed")
            return Mock(json=lambda: {"code": 0, "data": {"fields": ["ts_code", "close", "pct_chg", "pe", "pb", "total_mv"], "items": daily_items}})
        raise AssertionError(f"unexpected api {api}")

    return fake_post


def test_quotes_empty_returns_empty_list(client):
    r = client.get("/api/db/watchlist/quotes")
    assert r.status_code == 200
    assert r.json() == []


def test_quotes_merges_market_data(client, monkeypatch):
    monkeypatch.setattr("routers.watchlist.httpx.post", _mock_tushare_post(
        daily_items=[["600519.SH", 1200.0, 1.5, 18.0, 5.5, 1500000000.0]],
    ))
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    body = client.get("/api/db/watchlist/quotes").json()
    assert len(body) == 1
    assert body[0]["ts_code"] == "600519.SH"
    assert body[0]["close"] == 1200.0
    assert body[0]["pct_chg"] == 1.5
    assert body[0]["pe"] == 18.0
    assert body[0]["pb"] == 5.5


def test_quotes_cache_hit_no_second_daily_call(client, monkeypatch):
    calls = []
    base = _mock_tushare_post(daily_items=[["600519.SH", 1200.0, 1.0, 18.0, 5.5, 1.5e9]])

    def counting_post(url, json=None, timeout=None):
        calls.append(json["api_name"])
        return base(url, json=json, timeout=timeout)

    monkeypatch.setattr("routers.watchlist.httpx.post", counting_post)
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    client.get("/api/db/watchlist/quotes")
    client.get("/api/db/watchlist/quotes")
    assert calls.count("daily_basic") == 1


def test_quotes_refresh_bypasses_cache(client, monkeypatch):
    calls = []
    base = _mock_tushare_post(daily_items=[["600519.SH", 1200.0, 1.0, 18.0, 5.5, 1.5e9]])

    def counting_post(url, json=None, timeout=None):
        calls.append(json["api_name"])
        return base(url, json=json, timeout=timeout)

    monkeypatch.setattr("routers.watchlist.httpx.post", counting_post)
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    client.get("/api/db/watchlist/quotes")
    client.get("/api/db/watchlist/quotes?refresh=true")
    assert calls.count("daily_basic") == 2


def test_quotes_degrades_when_tushare_fails(client, monkeypatch):
    monkeypatch.setattr("routers.watchlist.httpx.post", _mock_tushare_post(fail_daily=True))
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    body = client.get("/api/db/watchlist/quotes").json()
    assert body[0]["ts_code"] == "600519.SH"
    assert body[0]["name"] == "贵州茅台"
    assert body[0]["close"] is None
    assert body[0]["pct_chg"] is None


def test_quotes_stock_not_in_market_shows_null(client, monkeypatch):
    monkeypatch.setattr("routers.watchlist.httpx.post", _mock_tushare_post(
        daily_items=[["000001.SZ", 10.0, 0.5, 5.0, 0.5, 2e8]],
    ))
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    client.post("/api/db/watchlist", json={"ts_code": "000001.SZ", "name": "平安银行"})
    body = {b["ts_code"]: b for b in client.get("/api/db/watchlist/quotes").json()}
    assert body["000001.SZ"]["close"] == 10.0
    assert body["600519.SH"]["close"] is None
