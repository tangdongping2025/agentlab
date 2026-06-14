import pytest

from infra.llm.base import (
    CompleteResult,
    EventType,
    LLMMessage,
    LLMProvider,
    StreamEvent,
    ToolDefinition,
)

import httpx
import respx

from infra.llm.ark import ArkProvider


def test_llm_message_construct():
    m = LLMMessage(role="user", content="hi")
    assert m.role == "user"
    assert m.content == "hi"


def test_tool_definition_construct():
    t = ToolDefinition(name="search", description="搜索", input_schema={"type": "object"})
    assert t.name == "search"


def test_stream_event_text():
    e = StreamEvent(type=EventType.TEXT, text="你好")
    assert e.type == EventType.TEXT
    assert e.text == "你好"
    assert e.tool_name is None


def test_complete_result():
    r = CompleteResult(content="reply", usage={"input_tokens": 5, "output_tokens": 3})
    assert r.content == "reply"
    assert r.usage["input_tokens"] == 5


def test_llm_provider_is_protocol():
    assert hasattr(LLMProvider, "_is_protocol")


@pytest.fixture()
def ark_provider():
    return ArkProvider(
        api_key="test-key",
        base_url="https://ark.test",
        default_model="claude-3-5-sonnet-20240620",
    )


@respx.mock
async def test_complete_returns_text_and_usage(ark_provider):
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "你好"}],
                "model": "claude-3-5-sonnet-20240620",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 10, "output_tokens": 5},
            },
        )
    )
    result = await ark_provider.complete([LLMMessage(role="user", content="hi")])
    assert result.content == "你好"
    assert result.usage == {"input_tokens": 10, "output_tokens": 5}


@respx.mock
async def test_complete_sends_system_and_model(ark_provider):
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": "ok"}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )
    )
    await ark_provider.complete(
        [LLMMessage(role="user", content="hi")],
        system="你是助手",
        model="custom-model",
        max_tokens=100,
        temperature=0.5,
    )
    import json as _json
    body = _json.loads(respx.calls[0].request.content)
    assert body["system"] == "你是助手"
    assert body["model"] == "custom-model"
    assert body["max_tokens"] == 100
    assert body["temperature"] == 0.5
    assert body["messages"] == [{"role": "user", "content": "hi"}]


@respx.mock
async def test_stream_yields_text_and_done(ark_provider):
    sse = (
        'event: message_start\n'
        'data: {"type":"message_start","message":{"content":[],"usage":{"input_tokens":10}}}\n\n'
        'event: content_block_start\n'
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
        'event: content_block_delta\n'
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你"}}\n\n'
        'event: content_block_delta\n'
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"好"}}\n\n'
        'event: content_block_stop\n'
        'data: {"type":"content_block_stop","index":0}\n\n'
        'event: message_delta\n'
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n'
        'event: message_stop\n'
        'data: {"type":"message_stop"}\n\n'
    )
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200, text=sse, headers={"content-type": "text/event-stream"}
        )
    )
    events = [e async for e in ark_provider.stream([LLMMessage(role="user", content="hi")])]
    texts = "".join(e.text for e in events if e.type == EventType.TEXT)
    assert texts == "你好"
    assert events[-1].type == EventType.DONE
    assert events[-1].usage == {"input_tokens": 10, "output_tokens": 5}


import json as _json2


def _sse(event: str, data: dict) -> str:
    """构造一行 SSE(json.dumps data,避免手写转义出错)。"""
    return f"event: {event}\ndata: {_json2.dumps(data)}\n\n"


@respx.mock
async def test_complete_passes_tools(ark_provider):
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": "done"}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )
    )
    import json as _json
    await ark_provider.complete(
        [LLMMessage(role="user", content="搜新闻")],
        tools=[
            ToolDefinition(
                name="search",
                description="搜索",
                input_schema={"type": "object", "properties": {"q": {"type": "string"}}},
            )
        ],
    )
    body = _json.loads(respx.calls[0].request.content)
    assert body["tools"] == [
        {
            "name": "search",
            "description": "搜索",
            "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}},
        }
    ]


@respx.mock
async def test_stream_emits_tool_use_event(ark_provider):
    sse = (
        _sse("message_start", {"type": "message_start", "message": {"content": [], "usage": {"input_tokens": 5}}})
        + _sse("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "tool_1", "name": "search", "input": {}}})
        + _sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": '{"q":'}})
        + _sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": '"新闻"}'}})
        + _sse("content_block_stop", {"type": "content_block_stop", "index": 0})
        + _sse("message_delta", {"type": "message_delta", "delta": {}, "usage": {"output_tokens": 8}})
        + _sse("message_stop", {"type": "message_stop"})
    )
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200, text=sse, headers={"content-type": "text/event-stream"}
        )
    )
    events = [e async for e in ark_provider.stream([LLMMessage(role="user", content="hi")])]
    tool_events = [e for e in events if e.type == EventType.TOOL_USE]
    assert len(tool_events) == 1
    assert tool_events[0].tool_name == "search"
    assert tool_events[0].tool_input == {"q": "新闻"}
