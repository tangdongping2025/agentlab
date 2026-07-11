import asyncio
import json
from datetime import datetime


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *args, **kwargs):
        return self

    def filter_by(self, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)

    def count(self):
        return len(self._rows)


class _FakeDb:
    def __init__(self, rows=None, snapshots=None, pool_rows=None, watchlist_rows=None):
        self._rows = rows or []
        self._snapshots = snapshots or []
        self._pool_rows = pool_rows or []
        self._watchlist_rows = watchlist_rows or []
        self.added = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False
        self.flushed = False

    def query(self, model):
        if model.__name__ == "StockDailyModel":
            return _FakeQuery(self._rows)
        elif model.__name__ == "CandidateSnapshotModel":
            return _FakeQuery(self._snapshots)
        elif model.__name__ == "CandidatePoolModel":
            return _FakeQuery(self._pool_rows)
        elif model.__name__ == "WatchlistModel":
            return _FakeQuery(self._watchlist_rows)
        return _FakeQuery([])

    def add(self, row):
        self.added.append(row)

    def delete(self, row):
        self.deleted.append(row)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def flush(self):
        self.flushed = True

    def close(self):
        pass


def test_list_candidates_empty(monkeypatch):
    from runtime.tools import candidates as ct

    db = _FakeDb()
    monkeypatch.setattr(ct, "SessionLocal", lambda: db)
    tool = ct.ListCandidatesTool()
    data = json.loads(_run(tool.execute()))
    assert data["count"] == 0


def test_run_screener_uses_default_preset(monkeypatch):
    from runtime.tools import candidates as ct

    called = {}
    def fake(db, strategy, params, as_of_date=None):
        called["strategy"] = strategy
        return []
    monkeypatch.setattr(ct, "compute_candidates", fake)
    db = _FakeDb(rows=[type("R", (), {})()])  # 非空底座
    monkeypatch.setattr(ct, "SessionLocal", lambda: db)
    tool = ct.RunScreenerTool()
    data = json.loads(_run(tool.execute()))
    assert data["count"] == 0
    assert called["strategy"] == "rank_composite"


def test_promote_candidate(monkeypatch):
    from runtime.tools import candidates as ct

    snap_row = type("Snap", (), {"id": 1, "strategy_name": "rank_composite", "params": {}, "count": 1,
                                   "run_at": datetime.utcnow()})()
    pool_row = type("Pool", (), {"id": 1, "snapshot_id": 1, "rank": 1, "ts_code": "A.SH",
                                  "name": "甲", "score": 90, "pe_rank": 1, "roe_rank": 1,
                                  "momentum_rank": 1, "promoted": False, "promoted_at": None})()
    db = _FakeDb(snapshots=[snap_row], pool_rows=[pool_row])
    monkeypatch.setattr(ct, "SessionLocal", lambda: db)
    tool = ct.PromoteCandidateTool()
    result = _run(tool.execute(ts_code="A.SH", snapshot_id=1))
    data = json.loads(result)
    assert data["promoted"] == "A.SH"
    assert db.committed is True


def test_three_candidates_tools_registered():
    from runtime.tools.registry import get_tool

    for name in ("run_screener", "list_candidates", "promote_candidate"):
        assert get_tool(name) is not None, f"{name} 未注册"

