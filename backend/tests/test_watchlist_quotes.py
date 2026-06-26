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
    w._TRADE_DATE_CACHE["dates"] = None
    w._TRADE_DATE_CACHE["ts"] = 0.0
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _mock_post(basic_items=None, daily_items=None, fail=False):
    basic_items = basic_items if basic_items is not None else []
    daily_items = daily_items if daily_items is not None else []

    def fake(url, json=None, timeout=None):
        api = json["api_name"]
        if fail:
            raise RuntimeError("tushare failed")
        if api == "trade_cal":
            return Mock(json=lambda: {"code": 0, "data": {"fields": ["cal_date", "is_open"], "items": [["20260625", 1]]}})
        if api == "daily_basic":
            return Mock(json=lambda: {"code": 0, "data": {"fields": ["ts_code", "close", "pe", "pb", "total_mv"], "items": basic_items}})
        if api == "daily":
            return Mock(json=lambda: {"code": 0, "data": {"fields": ["ts_code", "pct_chg"], "items": daily_items}})
        raise AssertionError(f"unexpected api {api}")

    return fake


def test_quotes_empty_returns_empty_list(client):
    assert client.get("/api/db/watchlist/quotes").json() == []


def test_quotes_merges_basic_and_daily(client, monkeypatch):
    monkeypatch.setattr("routers.watchlist.httpx.post", _mock_post(
        basic_items=[["600519.SH", 1200.0, 18.0, 5.5, 1.5e9]],
        daily_items=[["600519.SH", 1.5]],
    ))
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    body = client.get("/api/db/watchlist/quotes").json()
    assert body[0]["close"] == 1200.0
    assert body[0]["pct_chg"] == 1.5
    assert body[0]["pe"] == 18.0
    assert body[0]["pb"] == 5.5
    assert body[0]["total_mv"] == 1.5e9


def test_quotes_cache_hits_no_second_call(client, monkeypatch):
    calls = []
    base = _mock_post(basic_items=[["600519.SH", 1200, 18, 5.5, 1.5e9]], daily_items=[["600519.SH", 1.0]])

    def counting(url, json=None, timeout=None):
        calls.append(json["api_name"])
        return base(url, json=json, timeout=timeout)

    monkeypatch.setattr("routers.watchlist.httpx.post", counting)
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "茅台"})
    client.get("/api/db/watchlist/quotes")
    client.get("/api/db/watchlist/quotes")
    assert calls.count("daily_basic") == 1
    assert calls.count("daily") == 1


def test_quotes_refresh_bypasses_cache(client, monkeypatch):
    calls = []
    base = _mock_post(basic_items=[["600519.SH", 1200, 18, 5.5, 1.5e9]], daily_items=[["600519.SH", 1.0]])

    def counting(url, json=None, timeout=None):
        calls.append(json["api_name"])
        return base(url, json=json, timeout=timeout)

    monkeypatch.setattr("routers.watchlist.httpx.post", counting)
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "茅台"})
    client.get("/api/db/watchlist/quotes")
    client.get("/api/db/watchlist/quotes?refresh=true")
    assert calls.count("daily_basic") == 2


def test_quotes_degrades_when_tushare_fails(client, monkeypatch):
    monkeypatch.setattr("routers.watchlist.httpx.post", _mock_post(fail=True))
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "茅台"})
    body = client.get("/api/db/watchlist/quotes").json()
    assert body[0]["name"] == "茅台"
    assert body[0]["close"] is None
    assert body[0]["pct_chg"] is None


def test_quotes_partial_daily_missing(client, monkeypatch):
    monkeypatch.setattr("routers.watchlist.httpx.post", _mock_post(
        basic_items=[["600519.SH", 1200.0, 18.0, 5.5, 1.5e9]],
        daily_items=[],
    ))
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "茅台"})
    body = client.get("/api/db/watchlist/quotes").json()
    assert body[0]["close"] == 1200.0
    assert body[0]["pct_chg"] is None
