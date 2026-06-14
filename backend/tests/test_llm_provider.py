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
