import pytest

from runtime.events import EventEmitter, EventType


@pytest.mark.asyncio
async def test_emit_error_default_category_is_internal():
    emit = EventEmitter()
    await emit.emit_error("boom")
    events = [e async for e in emit]
    assert len(events) == 1
    assert events[0].type == EventType.ERROR
    assert events[0].data == {"error": "boom", "category": "internal"}


@pytest.mark.asyncio
async def test_emit_error_carries_category():
    emit = EventEmitter()
    await emit.emit_error("refused", "network")
    events = [e async for e in emit]
    assert events[0].data == {"error": "refused", "category": "network"}
