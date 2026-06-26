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

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


class _FakeDb:
    def __init__(self, rows=None):
        self._rows = rows or []
        self.added = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False

    def query(self, model):
        return _FakeQuery(self._rows)

    def add(self, row):
        self.added.append(row)

    def delete(self, row):
        self.deleted.append(row)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        pass


def _row(ts_code="600519.SH", name="贵州茅台", note=None, add_time=None):
    return type("R", (), {
        "ts_code": ts_code,
        "name": name,
        "note": note,
        "add_time": add_time or datetime(2026, 6, 26, 10, 0),
    })()


def test_suggest_pin_stock_returns_action_with_already_pinned(monkeypatch):
    from runtime.tools import watchlist

    db = _FakeDb(rows=[_row()])
    monkeypatch.setattr(watchlist, "SessionLocal", lambda: db)
    tool = watchlist.SuggestPinStockTool()
    data = json.loads(_run(tool.execute(ts_code="600519.SH", name="贵州茅台")))
    assert data["_action"] == "suggest_pin_stock"
    assert data["ts_code"] == "600519.SH"
    assert data["name"] == "贵州茅台"
    assert data["already_pinned"] is True


def test_suggest_pin_stock_already_pinned_false_when_not_in_db(monkeypatch):
    from runtime.tools import watchlist

    db = _FakeDb(rows=[])
    monkeypatch.setattr(watchlist, "SessionLocal", lambda: db)
    tool = watchlist.SuggestPinStockTool()
    data = json.loads(_run(tool.execute(ts_code="000001.SZ", name="平安银行")))
    assert data["already_pinned"] is False


def test_pin_stock_inserts_when_not_exists(monkeypatch):
    from runtime.tools import watchlist

    db = _FakeDb(rows=[])
    monkeypatch.setattr(watchlist, "SessionLocal", lambda: db)
    tool = watchlist.PinStockTool()
    result = _run(tool.execute(ts_code="600519.SH", name="贵州茅台", note="核心资产"))
    assert "已加入自选股" in result
    assert len(db.added) == 1
    assert db.committed is True


def test_pin_stock_ignores_when_exists(monkeypatch):
    from runtime.tools import watchlist

    db = _FakeDb(rows=[_row()])
    monkeypatch.setattr(watchlist, "SessionLocal", lambda: db)
    tool = watchlist.PinStockTool()
    result = _run(tool.execute(ts_code="600519.SH", name="贵州茅台"))
    assert "已在自选股中" in result
    assert len(db.added) == 0


def test_unpin_stock_deletes_when_exists(monkeypatch):
    from runtime.tools import watchlist

    existing = _row()
    db = _FakeDb(rows=[existing])
    monkeypatch.setattr(watchlist, "SessionLocal", lambda: db)
    tool = watchlist.UnpinStockTool()
    result = _run(tool.execute(ts_code="600519.SH"))
    assert "已移除自选股" in result
    assert len(db.deleted) == 1
    assert db.committed is True


def test_unpin_stock_reports_when_not_exists(monkeypatch):
    from runtime.tools import watchlist

    db = _FakeDb(rows=[])
    monkeypatch.setattr(watchlist, "SessionLocal", lambda: db)
    tool = watchlist.UnpinStockTool()
    result = _run(tool.execute(ts_code="000001.SZ"))
    assert "不在自选股中" in result


def test_list_watchlist_returns_items(monkeypatch):
    from runtime.tools import watchlist

    rows = [_row("600519.SH", "贵州茅台"), _row("000001.SZ", "平安银行")]
    db = _FakeDb(rows=rows)
    monkeypatch.setattr(watchlist, "SessionLocal", lambda: db)
    tool = watchlist.ListWatchlistTool()
    data = json.loads(_run(tool.execute()))
    assert data["count"] == 2
    codes = {item["ts_code"] for item in data["items"]}
    assert codes == {"600519.SH", "000001.SZ"}


def test_four_watchlist_tools_registered():
    from runtime.tools.registry import get_tool

    for name in ("suggest_pin_stock", "pin_stock", "unpin_stock", "list_watchlist"):
        assert get_tool(name) is not None, f"{name} 未注册"
