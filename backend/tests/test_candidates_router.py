import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
from database import Base, get_db
import models
from screener import Candidate


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("main.init_database", lambda: None)
    monkeypatch.setattr("main.create_tables", lambda: None)
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.CandidateSnapshotModel.__table__,
                                          models.CandidatePoolModel.__table__,
                                          models.WatchlistModel.__table__])
    S = sessionmaker(bind=eng)
    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()
    main.app.dependency_overrides[get_db] = _db
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_run_empty_data_returns_409(client):
    r = client.post("/api/db/candidates/run", json={"strategy": "rank_composite"})
    assert r.status_code == 409
    assert "fetch" in r.json()["detail"]


def test_run_happy_creates_snapshot_and_pool(client, monkeypatch):
    # 假装底座有数据
    from routers import candidates as cands
    # 绕过空底座检查:直接塞一行 stock_daily
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()

    fake = [Candidate(ts_code="A.SH", name="甲", industry="I", score=90.0,
                      pe_rank=80.0, roe_rank=70.0, momentum_rank=95.0, rank=1)]
    monkeypatch.setattr(cands, "compute_candidates", lambda *a, **k: fake)

    r = client.post("/api/db/candidates/run", json={"strategy": "rank_composite",
                                                     "label": "多因子平衡"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    sid = body["snapshot_id"]
    # snapshot 落库
    snap = db.query(models.CandidateSnapshotModel).get(sid)
    assert snap.strategy_name == "rank_composite"
    assert snap.strategy_label == "多因子平衡"
    assert snap.params["w_pe"] == 0.3
    # pool 落库
    rows = db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid).all()
    assert len(rows) == 1 and rows[0].ts_code == "A.SH" and rows[0].rank == 1


def test_run_custom_params_stored(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    captured = {}
    def fake(db, strategy, params, as_of_date=None):
        captured["params"] = params
        return []
    monkeypatch.setattr(cands, "compute_candidates", fake)
    r = client.post("/api/db/candidates/run", json={
        "strategy": "rank_composite", "label": "自定义",
        "params": {"w_pe": 0.5, "w_roe": 0.5, "w_mom": 0.0, "top_n": 10}})
    assert r.status_code == 200
    assert captured["params"]["w_pe"] == 0.5


def test_strategies_endpoint(client):
    r = client.get("/api/db/candidates/strategies")
    assert r.status_code == 200
    names = [s["name"] for s in r.json()["strategies"]]
    assert "rank_composite" in names
    assert "多因子平衡" in r.json()["presets"]


def test_snapshots_list_and_candidates_default_latest(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    monkeypatch.setattr(cands, "compute_candidates", lambda *a, **k: [
        Candidate(ts_code="A.SH", name="甲", industry="I", score=90, pe_rank=80, roe_rank=70, momentum_rank=95, rank=1)])
    sid = client.post("/api/db/candidates/run", json={"strategy": "rank_composite"}).json()["snapshot_id"]

    snaps = client.get("/api/db/candidates/snapshots").json()
    assert len(snaps) == 1 and snaps[0]["id"] == sid

    lst = client.get("/api/db/candidates").json()       # 默认最新
    assert lst["snapshot_id"] == sid
    assert lst["items"][0]["ts_code"] == "A.SH"


def test_promote_inserts_watchlist_and_marks(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    monkeypatch.setattr(cands, "compute_candidates", lambda *a, **k: [
        Candidate(ts_code="A.SH", name="甲", industry="I", score=90, pe_rank=80, roe_rank=70, momentum_rank=95, rank=1)])
    sid = client.post("/api/db/candidates/run", json={"strategy": "rank_composite"}).json()["snapshot_id"]

    r = client.post(f"/api/db/candidates/{sid}/promote/A.SH")
    assert r.status_code == 200
    assert db.query(models.WatchlistModel).filter_by(ts_code="A.SH").count() == 1
    assert db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid, ts_code="A.SH").first().promoted is True

    # 防重:再 promote 不重复入 watchlist
    client.post(f"/api/db/candidates/{sid}/promote/A.SH")
    assert db.query(models.WatchlistModel).filter_by(ts_code="A.SH").count() == 1
