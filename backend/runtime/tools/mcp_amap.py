from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx

from mcp_settings import AMAP_SECRET_ENV, AMAP_SERVER_ID, load_mcp_settings

AMAP_API_BASE = "https://restapi.amap.com"


@dataclass
class AMapTool:
    name: str
    description: str
    input_schema: dict
    endpoint: str
    param_names: list[str]
    api_key: str

    async def execute(self, **params) -> str:
        query = {name: value for name in self.param_names if (value := params.get(name))}
        query["key"] = self.api_key
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{AMAP_API_BASE}{self.endpoint}", params=query)
                resp.raise_for_status()
                return json.dumps(resp.json(), ensure_ascii=False)
        except Exception as e:
            return f"AMap 工具调用失败: {type(e).__name__}: {e}"


def _geo_tool(api_key: str) -> AMapTool:
    return AMapTool(
        name="mcp__amap-maps__maps_geo",
        description="将结构化地址转换为经纬度坐标。",
        input_schema={
            "type": "object",
            "properties": {
                "address": {"type": "string"},
                "city": {"type": "string"},
            },
            "required": ["address"],
        },
        endpoint="/v3/geocode/geo",
        param_names=["address", "city"],
        api_key=api_key,
    )


def _weather_tool(api_key: str) -> AMapTool:
    return AMapTool(
        name="mcp__amap-maps__maps_weather",
        description="根据城市名称或 adcode 查询天气。",
        input_schema={
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
        endpoint="/v3/weather/weatherInfo",
        param_names=["city"],
        api_key=api_key,
    )


def _text_search_tool(api_key: str) -> AMapTool:
    return AMapTool(
        name="mcp__amap-maps__maps_text_search",
        description="根据关键词搜索 POI。",
        input_schema={
            "type": "object",
            "properties": {
                "keywords": {"type": "string"},
                "city": {"type": "string"},
                "types": {"type": "string"},
            },
            "required": ["keywords"],
        },
        endpoint="/v3/place/text",
        param_names=["keywords", "city", "types"],
        api_key=api_key,
    )


def get_mcp_tools_for_agent(agent_id: str) -> list[Any]:
    settings = load_mcp_settings()
    cfg = settings["servers"].get(AMAP_SERVER_ID, {})
    if not cfg.get("enabled", True):
        return []
    if agent_id not in cfg.get("agentIds", []):
        return []
    api_key = os.environ.get(AMAP_SECRET_ENV, "").strip()
    if not api_key:
        return []
    return [_geo_tool(api_key), _weather_tool(api_key), _text_search_tool(api_key)]
