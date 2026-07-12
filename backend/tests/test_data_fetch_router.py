import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from database import Base, get_db
import models


@pytest.fixture
def client():
    from routers.data_fetch import router
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__, models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__, models.FetchLogModel.__table__])
    S = sessionmaker(bind=eng)
    app = FastAPI()
    app.include_router(router)
    def _get_db():
        db = S()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = _get_db
    yield TestClient(app)


def test_status_empty(client):
    r = client.get("/api/db/fetch/status")
    assert r.status_code == 200
    d = r.json()
    assert d["stock_daily"] == 0 and d["last_anchor_date"] is None


def test_trigger_returns_running(client, monkeypatch):
    import routers.data_fetch as df
    df._reset_job()
    monkeypatch.setattr(df, "_run_fetch_job", lambda force_full: None)  # 不真抓
    r = client.post("/api/db/fetch/trigger", json={})
    assert r.status_code == 200 and r.json()["state"] == "running"


def test_trigger_mutex_when_running(client):
    import routers.data_fetch as df
    df._reset_job()
    df._JOB["state"] = "running"
    r = client.post("/api/db/fetch/trigger", json={})
    assert r.status_code == 409


def test_progress_reflects_job(client):
    import routers.data_fetch as df
    df._reset_job()
    df._JOB.update(state="done", done=30, total=30)
    p = client.get("/api/db/fetch/progress").json()
    assert p["state"] == "done" and p["done"] == 30
