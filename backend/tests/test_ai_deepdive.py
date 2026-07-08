"""RQ-093/094 AI 深挖端点测试。SQLite in-memory + mock LLM。"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
from database import Base, get_db


@pytest.fixture
def client(monkeypatch):
    """SQLite in-memory + 建 buffett_ai_cache 表。"""
    monkeypatch.setattr("main.init_database", lambda: None)
    monkeypatch.setattr("main.create_tables", lambda: None)
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    import models
    Base.metadata.create_all(bind=engine, tables=[models.BuffettAiCacheModel.__table__])
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = _override
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _fake_analysis():
    return {
        "basic": {"name": "长江电力", "industry": "水力发电", "market": "主板", "list_date": "20031118"},
        "panel": None,
        "profit": {"roe": 16.0, "gross_margin": 61.7, "net_margin": 40.5, "cash_ratio": 1.76},
        "safety": {"debt_ratio": 58.3, "current_ratio": 0.12, "max_dd": -0.20},
        "fina_annual": [{"end_date": "20211231", "grossprofit_margin": 62.1, "roic": 9.5}],
        "audit_result": "标准无保留意见",
    }


def test_no_cache_returns_null_text(client, monkeypatch):
    """force=false + 库空 → text=null, 不调 LLM"""
    from routers import watchlist as wl
    llm_calls = {"n": 0}
    monkeypatch.setattr(wl, "analyze_stock", lambda tc: _fake_analysis())
    monkeypatch.setattr(wl, "_call_llm", lambda s, u: llm_calls.__setitem__("n", llm_calls["n"] + 1) or "不应调用")
    r = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                    json={"dimension": "moat_type"})
    assert r.status_code == 200
    body = r.json()
    assert body["text"] is None
    assert body["cached"] is False
    assert llm_calls["n"] == 0


def test_force_calls_llm_and_stores(client, monkeypatch):
    """force=true → 调 LLM + 入库"""
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "analyze_stock", lambda tc: _fake_analysis())
    monkeypatch.setattr(wl, "_call_llm", lambda s, u: "护城河是资源特许型")
    r = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                    json={"dimension": "moat_type", "force": True})
    assert r.status_code == 200
    assert r.json()["text"] == "护城河是资源特许型"


def test_cached_hit_from_db(client, monkeypatch):
    """force=false + 库有 → 返回 text, 不调 LLM"""
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "analyze_stock", lambda tc: _fake_analysis())
    monkeypatch.setattr(wl, "_call_llm", lambda s, u: "第一次")
    client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                json={"dimension": "moat_type", "force": True})
    # 第二次 force=false,应从库返回,不调 LLM
    monkeypatch.setattr(wl, "_call_llm", lambda s, u: "不应再调")
    r2 = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                     json={"dimension": "moat_type"})
    assert r2.json()["text"] == "第一次"
    assert r2.json()["cached"] is True


def test_force_overwrites(client, monkeypatch):
    """第二次 force → 覆盖文本"""
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "analyze_stock", lambda tc: _fake_analysis())
    monkeypatch.setattr(wl, "_call_llm", lambda s, u: "旧文本")
    client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                json={"dimension": "management_integrity", "force": True})
    monkeypatch.setattr(wl, "_call_llm", lambda s, u: "新文本")
    r = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                    json={"dimension": "management_integrity", "force": True})
    assert r.json()["text"] == "新文本"
    # 确认库内也只有新文本
    r2 = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                     json={"dimension": "management_integrity"})
    assert r2.json()["text"] == "新文本"


def test_invalid_dimension(client):
    r = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                    json={"dimension": "unknown"})
    assert r.status_code == 400
