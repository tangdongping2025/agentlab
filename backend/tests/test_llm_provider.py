import pytest

from infra.llm.base import (
    CompleteResult,
    EventType,
    LLMMessage,
    LLMProvider,
    StreamEvent,
    ToolDefinition,
)


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
