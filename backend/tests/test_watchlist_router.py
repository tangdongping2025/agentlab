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
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_watchlist_empty(client):
    r = client.get("/api/db/watchlist")
    assert r.status_code == 200
    assert r.json() == []


def test_watchlist_add_and_list(client):
    r = client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    assert r.status_code == 201
    body = r.json()
    assert body["ts_code"] == "600519.SH"
    assert body["name"] == "贵州茅台"
    assert body["add_time"] is not None

    r = client.get("/api/db/watchlist")
    assert len(r.json()) == 1


def test_watchlist_add_with_note(client):
    r = client.post(
        "/api/db/watchlist",
        json={"ts_code": "000001.SZ", "name": "平安银行", "note": "银行龙头"},
    )
    assert r.status_code == 201
    assert r.json()["note"] == "银行龙头"


def test_watchlist_duplicate_returns_409(client):
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    r = client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    assert r.status_code == 409


def test_watchlist_delete(client):
    client.post("/api/db/watchlist", json={"ts_code": "600519.SH", "name": "贵州茅台"})
    r = client.delete("/api/db/watchlist/600519.SH")
    assert r.status_code == 200
    assert client.get("/api/db/watchlist").json() == []


def test_watchlist_delete_not_found(client):
    r = client.delete("/api/db/watchlist/000001.SZ")
    assert r.status_code == 404


def test_watchlist_add_without_name_auto_fill(client, monkeypatch):
    """不传 name,由后端自动补齐"""
    from routers import watchlist as wl
    called = []

    def mock_post(api_name, params):
        called.append((api_name, params))
        if api_name == "stock_basic":
            assert params.get("ts_code") == "600519.SH"
            return [{"ts_code": "600519.SH", "name": "贵州茅台", "area": "贵州", "industry": "白酒", "list_date": "20010731"}]
        return []
    monkeypatch.setattr(wl, "_tushare_post", mock_post)

    r = client.post("/api/db/watchlist", json={"ts_code": "600519"})
    assert r.status_code == 201
    body = r.json()
    assert body["ts_code"] == "600519.SH"
    assert body["name"] == "贵州茅台"
    assert called


def test_watchlist_add_with_suffix_and_without_name(client, monkeypatch):
    """有后缀但不传 name"""
    from routers import watchlist as wl

    def mock_post(api_name, params):
        return [{"ts_code": "000001.SZ", "name": "平安银行", "area": "深圳", "industry": "银行", "list_date": "19910403"}]
    monkeypatch.setattr(wl, "_tushare_post", mock_post)

    r = client.post("/api/db/watchlist", json={"ts_code": "000001.SZ"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "平安银行"


def test_watchlist_add_not_found(client, monkeypatch):
    """tushare 查不到该代码 → 404"""
    from routers import watchlist as wl

    def mock_post(api_name, params):
        return []
    monkeypatch.setattr(wl, "_tushare_post", mock_post)

    r = client.post("/api/db/watchlist", json={"ts_code": "999999"})
    assert r.status_code == 404
    assert "不存在" in r.json()["detail"]
