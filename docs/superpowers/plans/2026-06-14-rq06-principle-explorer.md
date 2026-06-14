# RQ-6 v1 PrincipleExplorerAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** 把现有的"原理探索"(4 种上下文策略 full/sliding/summary/none)迁移成后端 `principle_explorer_agent`,emit 策略效果事件;前端 eventAdapter 处理 + 事件流面板显示。v1 务实(不做 tabs 配置 UI / 完整可视化复用)。

**Architecture:** PrincipleExplorerAgent 是独立 agent(不用 BaseAgent,因为 applyStrategy 不是 tool use)。`_apply_strategy` 移植现有 agentService.applyStrategy 逻辑(含 summary 调 LLM 摘要)。run: applyStrategy → emit ACTION(strategy_effect) → stream → emit text/done。

**Tech Stack:** Python / pytest + respx / React

## 前置确认(已确认)

- A1 v1 务实范围
- A2 4 策略后端实现
- A3 v1 简单显示(事件流面板)
- A4 v1 固定 summary 策略验证(前端固定传 strategy=summary)
- B1-B4 默认

---

### Task 1: PrincipleExplorerAgent 后端

**Files:** Create `backend/agents/principle_explorer_agent.py`; Modify `backend/agents/__init__.py`; Create `backend/tests/test_principle_explorer.py`

- [ ] **Step 1: 写测试(mock provider)**
创建 `backend/tests/test_principle_explorer.py`:
```python
import pytest
from unittest.mock import patch, AsyncMock
from runtime.agent import AgentTask
from runtime.events import EventType
from runtime.tools.registry import _TOOL_REGISTRY


async def test_apply_strategy_sliding():
    from runtime.agent import AgentMetadata
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import LLMMessage
    agent = PrincipleExplorerAgent()
    msgs = [LLMMessage(role="user", content=f"msg{i}") for i in range(15)]
    after, effect = await agent._apply_strategy(msgs, "sliding")
    assert effect["strategy"] == "sliding"
    assert effect["removed_count"] == 5  # 15-10
    assert len(after) == 10


async def test_apply_strategy_none():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import LLMMessage
    agent = PrincipleExplorerAgent()
    msgs = [LLMMessage(role="user", content=f"m{i}") for i in range(5)]
    after, effect = await agent._apply_strategy(msgs, "none")
    assert len(after) == 1
    assert effect["removed_count"] == 4


async def test_apply_strategy_full():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import LLMMessage
    agent = PrincipleExplorerAgent()
    msgs = [LLMMessage(role="user", content="x") for _ in range(8)]
    after, effect = await agent._apply_strategy(msgs, "full")
    assert len(after) == 8
    assert effect["removed_count"] == 0


async def test_run_emits_strategy_effect_and_text():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import StreamEvent, EventType as LLMEventType
    from runtime.events import EventEmitter

    agent = PrincipleExplorerAgent()
    emit = EventEmitter()

    async def fake_stream(messages, **kw):
        yield StreamEvent(type=LLMEventType.TEXT, text="回复")
        yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 5, "output_tokens": 2})

    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        await agent.run(AgentTask(
            messages=[{"role": "user", content="hi"}],
            config={"strategy": "sliding"},
        ), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.ACTION in types  # strategy_effect
    action_ev = next(e for e in events if e.type == EventType.ACTION)
    assert action_ev.data.get("action") == "strategy_effect"
    assert action_ev.data.get("strategy") == "sliding"
    assert events[-1].type == EventType.DONE


async def test_run_summary_strategy_calls_generate_summary():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import CompleteResult, StreamEvent, EventType as LLMEventType
    from runtime.events import EventEmitter

    agent = PrincipleExplorerAgent()
    emit = EventEmitter()
    agent._generate_summary = AsyncMock(return_value="摘要内容")

    async def fake_stream(messages, **kw):
        yield StreamEvent(type=LLMEventType.TEXT, text="ok")
        yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 1, "output_tokens": 1})

    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        mp.complete = AsyncMock(return_value=CompleteResult(content="摘要", usage={"input_tokens": 1, "output_tokens": 1}))
        await agent.run(AgentTask(
            messages=[{"role": "user", content: f"m{i}"} for i in range(8)],
            config={"strategy": "summary"},
        ), emit)

    events = [e async for e in emit]
    action_ev = next(e for e in events if e.type == EventType.ACTION)
    assert action_ev.data.get("summary") is not None
```

> 注:最后一个测试的 messages 构造有语法错(`content: f"m{i}"` 应为 `content=f"m{i}"`),执行者修正。

- [ ] **Step 2: 确认失败** — Run: `cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -m pytest tests/test_principle_explorer.py -v` → FAIL import

- [ ] **Step 3: 实现 principle_explorer_agent.py**
创建 `backend/agents/principle_explorer_agent.py`:
```python
from __future__ import annotations

from infra.llm import ArkProvider
from infra.llm.base import LLMMessage, EventType as LLMEventType
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent


def _estimate_tokens(messages: list[LLMMessage]) -> int:
    total = 0
    for m in messages:
        text = m.content if isinstance(m.content, str) else str(m.content)
        total += len(text) // 4
    return total


def _extract_text(msg: LLMMessage) -> str:
    if isinstance(msg.content, str):
        return msg.content
    if isinstance(msg.content, list):
        return " ".join(b.get("text", "") for b in msg.content if isinstance(b, dict) and b.get("type") == "text")
    return str(msg.content)


@register_agent
class PrincipleExplorerAgent(Agent):
    """原理探索 agent:演示 4 种上下文策略(full/sliding/summary/none),emit 策略效果。"""

    metadata = AgentMetadata(
        id="principle_explorer",
        name="原理探索",
        description="演示上下文策略(full/sliding/summary/none)对 token 的影响",
        workspace={"type": "chat"},
    )

    def __init__(self) -> None:
        from config import settings
        self._provider = ArkProvider(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            default_model=settings.llm_model,
        )

    async def _generate_summary(self, messages: list[LLMMessage]) -> str:
        """调 LLM 摘要旧消息。"""
        conv_text = "\n".join(
            f"{'用户' if m.role == 'user' else '助手'}: {_extract_text(m)[:200]}"
            for m in messages
        )
        try:
            result = await self._provider.complete([
                LLMMessage(role="user", content=f"请用 2-3 句话总结以下对话的关键信息:\n\n{conv_text}")
            ])
            return result.content
        except Exception as e:
            return f"(摘要失败: {e})"

    async def _apply_strategy(self, messages: list[LLMMessage], strategy: str):
        """应用上下文策略,返回 (after_messages, effect_dict)。"""
        before_tokens = _estimate_tokens(messages)
        before_count = len(messages)
        removed: list[LLMMessage] = []
        summary_content = None

        if strategy == "full" or len(messages) <= 1:
            after = list(messages)
        elif strategy == "none":
            after = [messages[-1]] if messages else []
            removed = list(messages[:-1])
        elif strategy == "sliding":
            window = 10
            if len(messages) <= window:
                after = list(messages)
            else:
                after = list(messages[-window:])
                removed = list(messages[:-window])
        elif strategy == "summary":
            recent = 4
            threshold = 6
            if len(messages) <= threshold:
                after = list(messages)
            else:
                old = list(messages[:-recent])
                summary_content = await self._generate_summary(old)
                after = [LLMMessage(role="assistant", content=f"[对话摘要] {summary_content}")] + list(messages[-recent:])
                removed = old
        else:
            after = list(messages)

        after_tokens = _estimate_tokens(after)
        return after, {
            "action": "strategy_effect",
            "strategy": strategy,
            "before_count": before_count,
            "after_count": len(after),
            "before_tokens": before_tokens,
            "after_tokens": after_tokens,
            "removed_count": len(removed),
            "summary": summary_content,
        }

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        strategy = task.config.get("strategy", "summary")
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in task.messages]
        try:
            after_messages, effect = await self._apply_strategy(messages, strategy)
            await emit.emit(EventType.ACTION, **effect)
            async for ev in self._provider.stream(after_messages):
                if ev.type == LLMEventType.TEXT:
                    await emit.emit(EventType.TEXT, text=ev.text)
                elif ev.type == LLMEventType.DONE:
                    await emit.emit_done()
                    return
                elif ev.type == LLMEventType.ERROR:
                    await emit.emit_error(ev.error or "error")
                    return
            await emit.emit_done()
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")
```

- [ ] **Step 4: agents/__init__.py 加导入** — 在 research_agent 后加:
```python
from . import principle_explorer_agent  # noqa: F401
```

- [ ] **Step 5: 确认通过** — Run: `... pytest tests/test_principle_explorer.py -v` → passed

- [ ] **Step 6: 全量无回归** — Run: `... pytest -q` → 全绿

- [ ] **Step 7: Commit** — `git add backend/agents/principle_explorer_agent.py backend/agents/__init__.py backend/tests/test_principle_explorer.py && git commit -m "feat(agents): RQ-6 PrincipleExplorerAgent(4 上下文策略 + emit 策略效果)"`

---

### Task 2: 前端 eventAdapter 处理 strategy_effect + AgentWorkspace 显示

**Files:** Modify `src/services/eventAdapter.ts`, `src/stores/agentRuntimeStore.ts`

- [ ] **Step 1: eventAdapter 加 action 处理**
`src/services/eventAdapter.ts` 的 `toDisplayEvent` switch 加:
```typescript
    case 'action': {
      const d = ev.data;
      if (d.action === 'strategy_effect') {
        const saving = d.before_tokens - d.after_tokens;
        return {
          type: 'action',
          label: `策略 ${d.strategy}: ${d.before_count}→${d.after_count} 条, ${d.before_tokens}→${d.after_tokens} tokens(省 ${saving})`,
          detail: d.summary ? `摘要: ${String(d.summary).slice(0, 150)}` : undefined,
          ts: Date.now(),
        };
      }
      return { type: 'action', label: `动作: ${d.action || ''}`, ts: Date.now() };
    }
```

- [ ] **Step 2: agentRuntimeStore.runWorkspace 传 strategy**
`src/stores/agentRuntimeStore.ts` 的 `runAgent` 调用,principle_explorer 时传 config。但 runAgent 签名没 config——v1 固定 summary。修改 `runWorkspace` 选 principle_explorer 时,在 messages 之外... 

> v1 简化:principle_explorer 用默认 summary(task.config 默认 summary,后端已默认)。前端不传 config(后端默认 summary)。所以这步只需 eventAdapter(Step 1),store 不改。

- [ ] **Step 3: typecheck** — Run: `cd "D:/我的个人区间/Projects/context-lab" && npm run typecheck` → 无错

- [ ] **Step 4: Commit** — `git add src/services/eventAdapter.ts && git commit -m "feat(frontend): RQ-6 eventAdapter 处理 strategy_effect 动作"`

---

### Task 3: 端到端验证

- [ ] **Step 1: 重启 uvicorn**(加载 principle_explorer_agent)
- [ ] **Step 2: curl principle_explorer** — `curl -s -N -X POST http://localhost:8000/api/agents/principle_explorer/run -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"你好"},{"role":"assistant","content":"你好"},{"role":"user","content":"天气"},{"role":"assistant","content":"晴天"},{"role":"user","content":"总结"},{"role":"assistant","content":"ok"},{"role":"user","content":"再见"}],"config":{"strategy":"summary"}}'` → 应有 action(strategy_effect summary)+ text + done
- [ ] **Step 3: 前端验证** — dev server 选「原理探索」对话,事件流面板显示策略效果

## 完成标准(v1)
- [ ] principle_explorer_agent 注册 + 4 策略 + emit 策略效果
- [ ] 测试通过(mock)
- [ ] 前端 eventAdapter 处理 strategy_effect
- [ ] 端到端:选原理探索对话,事件流显示策略效果
