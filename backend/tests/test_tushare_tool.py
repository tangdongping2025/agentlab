import json


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, payload, status=200):
        self._payload = payload
        self._status = status
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json})
        return FakeResponse(self._payload, self._status)


async def test_tushare_normal_query(monkeypatch):
    from runtime.tools import tushare
    monkeypatch.setenv("TUSHARE_TOKEN", "fake-token")
    fake = FakeClient({"code": 0, "msg": "", "data": {
        "fields": ["ts_code", "close"],
        "items": [["600519.SH", 1680.0]],
    }})
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: fake)
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="daily", params={"ts_code": "600519.SH"})
    data = json.loads(result)
    assert data["fields"] == ["ts_code", "close"]
    assert data["items"] == [["600519.SH", 1680.0]]
    assert fake.calls[0]["json"]["api_name"] == "daily"
    assert fake.calls[0]["json"]["token"] == "fake-token"


async def test_tushare_error_code_returns_human_message(monkeypatch):
    from runtime.tools import tushare
    monkeypatch.setenv("TUSHARE_TOKEN", "fake-token")
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: FakeClient(
        {"code": 40001, "msg": "积分不足", "data": None}))
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="some_api", params={})
    assert "积分不足" in result
    assert "some_api" in result


async def test_tushare_missing_token(monkeypatch):
    from runtime.tools import tushare
    monkeypatch.delenv("TUSHARE_TOKEN", raising=False)
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="daily", params={})
    assert "TUSHARE_TOKEN" in result


async def test_tushare_output_file_writes_csv(monkeypatch, tmp_path):
    from runtime.tools import tushare
    monkeypatch.setenv("TUSHARE_TOKEN", "fake-token")
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: FakeClient(
        {"code": 0, "msg": "", "data": {
            "fields": ["ts_code", "close"],
            "items": [["600519.SH", 1680.0], ["000001.SZ", 12.3]],
        }}))
    monkeypatch.setattr(tushare, "_resolve", lambda rel: (tmp_path / rel))
    monkeypatch.setattr(tushare, "_root", lambda: tmp_path)
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="daily", params={}, output_file="out.csv")
    csv_text = (tmp_path / "out.csv").read_text(encoding="utf-8")
    assert "ts_code,close" in csv_text
    assert "600519.SH" in csv_text
    assert "2 行" in result
