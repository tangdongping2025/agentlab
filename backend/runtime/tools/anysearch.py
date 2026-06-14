from __future__ import annotations
import httpx
from .registry import register_tool

ANYSEARCH_ENDPOINT = "https://api.anysearch.com/mcp"


class AnysearchTool:
    """联网搜索工具,调 anysearch API(JSON-RPC tools/call)。"""

    name = "anysearch"
    description = "联网搜索工具,支持通用网页搜索和垂直领域。query 必填。"
    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "搜索关键词"},
            "domain": {"type": "string"},
            "max_results": {"type": "number"},
        },
        "required": ["query"],
    }

    def __init__(self, api_key: str = "", timeout: int = 15):
        self._api_key = api_key
        self._timeout = timeout

    async def execute(self, **params) -> str:
        query = params.get("query")
        if not query:
            return "搜索必须提供 query 参数"
        payload = {
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "search", "arguments": params},
        }
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(ANYSEARCH_ENDPOINT, json=payload, headers=headers)
            data = resp.json()
            if resp.status_code >= 400:
                return f"搜索错误 HTTP {resp.status_code}: {data.get('error', {}).get('message', '')}"
            content = data.get("result", {}).get("content", [])
            text_item = next((c for c in content if c.get("type") == "text"), None)
            return text_item["text"] if text_item else str(data.get("result", ""))
        except Exception as e:
            return f"搜索请求错误: {type(e).__name__}: {e}"


# 默认实例注册(从环境读 key)
def _register_default():
    import os
    register_tool(AnysearchTool(api_key=os.environ.get("ANYSEARCH_API_KEY", "")))


_register_default()
