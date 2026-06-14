from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from runtime.agent import AgentTask
from runtime.executor import run_agent
from runtime.registry import _AGENT_REGISTRY, create_agent

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _meta_dict(agent_cls):
    m = agent_cls.metadata
    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "workspace": m.workspace,
        "capabilities": m.capabilities,
    }


@router.get("")
async def list_agents():
    return [_meta_dict(cls) for cls in _AGENT_REGISTRY.values()]


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    agent = create_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return _meta_dict(type(agent))


@router.post("/{agent_id}/run")
async def run_agent_endpoint(agent_id: str, task: AgentTask):
    agent = create_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    emit = await run_agent(agent, task)

    async def event_stream():
        async for event in emit:
            payload = {"type": event.type.value, "data": event.data}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
