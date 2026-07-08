"""RQ-093 AI 深挖端点测试。mock LLM 调用,不真连。"""
from fastapi.testclient import TestClient
import main


def _fake_analysis():
    return {
        "basic": {"name": "长江电力", "industry": "水力发电", "market": "主板", "list_date": "20031118"},
        "panel": None,
        "profit": {"roe": 16.0, "gross_margin": 61.7, "net_margin": 40.5, "cash_ratio": 1.76},
        "safety": {"debt_ratio": 58.3, "current_ratio": 0.12, "max_dd": -0.20},
        "fina_annual": [
            {"end_date": "20211231", "grossprofit_margin": 62.1, "roic": 9.5},
            {"end_date": "20221231", "grossprofit_margin": 61.9, "roic": 9.0},
            {"end_date": "20231231", "grossprofit_margin": 61.8, "roic": 8.9},
        ],
        "audit_result": "标准无保留意见",
    }


def test_ai_deepdive_moat_type(monkeypatch):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "analyze_stock", lambda tc: _fake_analysis())
    monkeypatch.setattr(wl, "_call_llm", lambda sys_p, usr_p: "长江电力的护城河是资源特许型...")
    wl._AI_CACHE.clear()

    client = TestClient(main.app)
    r = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                    json={"dimension": "moat_type"})
    assert r.status_code == 200
    body = r.json()
    assert body["dimension"] == "moat_type"
    assert "护城河" in body["text"]
    assert body["cached"] is False


def test_ai_deepdive_cache_hit(monkeypatch):
    from routers import watchlist as wl
    calls = {"n": 0}
    def fake_llm(sys_p, usr_p):
        calls["n"] += 1
        return "管理层诚信良好..."
    monkeypatch.setattr(wl, "analyze_stock", lambda tc: _fake_analysis())
    monkeypatch.setattr(wl, "_call_llm", fake_llm)
    wl._AI_CACHE.clear()

    client = TestClient(main.app)
    client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                json={"dimension": "management_integrity"})
    r2 = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                     json={"dimension": "management_integrity"})
    assert calls["n"] == 1  # 第二次命中缓存
    assert r2.json()["cached"] is True


def test_ai_deepdive_invalid_dimension():
    client = TestClient(main.app)
    r = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                    json={"dimension": "unknown"})
    assert r.status_code == 400


def test_ai_deepdive_llm_failure(monkeypatch):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "analyze_stock", lambda tc: _fake_analysis())
    monkeypatch.setattr(wl, "_call_llm", lambda sys_p, usr_p: (_ for _ in ()).throw(RuntimeError("LLM 挂了")))
    wl._AI_CACHE.clear()

    client = TestClient(main.app)
    r = client.post("/api/db/watchlist/stock-detail/600900.SH/ai-deepdive",
                    json={"dimension": "moat_type"})
    assert r.status_code == 500
    assert "AI 深挖失败" in r.json()["detail"]
