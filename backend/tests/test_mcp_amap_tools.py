import json

import pytest


@pytest.mark.asyncio
async def test_get_amap_tools_for_selected_agent(monkeypatch):
    from runtime.tools import mcp_amap

    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr(mcp_amap, "load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": ["assistant"], "launchMode": "auto"}}
    })

    tools = mcp_amap.get_mcp_tools_for_agent("assistant")

    assert [tool.name for tool in tools] == [
        "mcp__amap-maps__maps_geo",
        "mcp__amap-maps__maps_weather",
        "mcp__amap-maps__maps_text_search",
    ]


def test_get_amap_tools_returns_empty_when_not_selected(monkeypatch):
    from runtime.tools import mcp_amap

    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr(mcp_amap, "load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": ["research"], "launchMode": "auto"}}
    })

    assert mcp_amap.get_mcp_tools_for_agent("assistant") == []


@pytest.mark.asyncio
async def test_geo_tool_calls_amap_api(monkeypatch):
    from runtime.tools.mcp_amap import AMapTool

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"status": "1", "geocodes": [{"location": "116.397,39.908"}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params):
            assert url.endswith("/v3/geocode/geo")
            assert params["key"] == "fake-key"
            assert params["address"] == "北京天安门"
            assert params["city"] == "北京"
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", lambda timeout: FakeClient())
    tool = AMapTool(
        name="mcp__amap-maps__maps_geo",
        description="地理编码",
        input_schema={"type": "object", "properties": {}},
        endpoint="/v3/geocode/geo",
        param_names=["address", "city"],
        api_key="fake-key",
    )

    result = await tool.execute(address="北京天安门", city="北京")

    assert json.loads(result)["geocodes"][0]["location"] == "116.397,39.908"
