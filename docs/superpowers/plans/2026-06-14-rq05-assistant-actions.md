# RQ-5 助手写操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** 助手能代用户操作平台——加平台工具(list_agents 查询 / switch_agent 操作),BaseAgent 检测工具返回的 `_action` 指令 → emit ACTION 事件 → 前端执行(selectAgent)。assistant 改用 BaseAgent(tool use)。

**Architecture:** 操作类工具 execute 返回指令 JSON(`{"_action":"switch_agent","agent_id":...}`),BaseAgent 执行工具后检测 `_action` → emit ACTION + 回灌 LLM "已执行"。前端 store.onEvent 收到 ACTION → 执行(selectAgent)+ eventAdapter 显示。查询类工具(list_agents)正常返回数据。

## 前置确认(已确认)
A1-A4 + B 全认可。

---

### Task 1: BaseAgent _action 检测 + 平台工具 + assistant 改造

**Files:**
- Modify `backend/runtime/base_agent.py`(工具执行后检测 _action → emit ACTION)
- Create `backend/runtime/tools/platform.py`(ListAgentsTool / SwitchAgentTool)
- Modify `backend/runtime/tools/__init__.py`(import platform 触发注册)
- Modify `backend/agents/assistant_agent.py`(改用 BaseAgent)
- Create `backend/tests/test_platform_tools.py`
- Modify `backend/tests/test_base_agent.py`(加 _action 测试)

- [ ] **Step 1: 写平台工具测试**
创建 `backend/tests/test_platform_tools.py`:
```python
import json
from runtime.tools.platform import ListAgentsTool, SwitchAgentTool


async def test_list_agents_returns_json():
    import agents  # 触发注册
    t = ListAgentsTool()
    r = await t.execute()
    data = json.loads(r)
    assert isinstance(data, list)
    ids = [a["id"] for a in data]
    assert "echo" in ids


async def test_switch_agent_returns_action_directive():
    t = SwitchAgentTool()
    r = await t.execute(agent_id="echo")
    data = json.loads(r)
    assert data["_action"] == "switch_agent"
    assert data["agent_id"] == "echo"
```

- [ ] **Step 2: 写 BaseAgent _action 测试**
`backend/tests/test_base_agent.py` 加:
```python
async def test_base_agent_emits_action_from_tool_result():
    """工具返回 _action 指令 → BaseAgent emit ACTION。"""
    from runtime.base_agent import BaseAgent
    from infra.llm.base import StreamEvent, EventType as LLMEventType

    class _ActionTool:
        name = "do_switch"
        description = "switch"
        input_schema = {"type": "object"}
        async def execute(self, **params):
            return '{"_action":"switch_agent","agent_id":"echo"}'

    class _TestAgent(BaseAgent):
        from runtime.agent import AgentMetadata
        metadata = AgentMetadata(id="_act_test", name="T", description="d", workspace={"type": "chat"})
        tool_names = ["do_switch"]
        system_prompt = "test"

    from runtime.tools.registry import _TOOL_REGISTRY
    _TOOL_REGISTRY["do_switch"] = _ActionTool()
    agent = _TestAgent()
    agent._tool_map = {"do_switch": _ActionTool()}

    call_count = [0]
    async def fake_stream(messages, **kw):
        call_count[0] += 1
        if call_count[0] == 1:
            yield StreamEvent(type=LLMEventType.TOOL_USE, tool_name="do_switch", tool_input={}, tool_id="t1")
            yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 1, "output_tokens": 1})
        else:
            yield StreamEvent(type=LLMEventType.TEXT, text="已切换")
            yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 1, "output_tokens": 1})

    from unittest.mock import patch
    from runtime.events import EventEmitter, EventType
    emit = EventEmitter()
    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        await agent.run(__import__('runtime.agent', fromlist=['AgentTask']).AgentTask(
            messages=[{"role": "user", "content": "切换到 echo"}]
        ), emit)

    events = [e async for e in emit]
    actions = [e for e in events if e.type == EventType.ACTION]
    assert len(actions) == 1
    assert actions[0].data.get("_action") == "switch_agent"
    assert actions[0].data.get("agent_id") == "echo"
    _TOOL_REGISTRY.pop("do_switch", None)
```

- [ ] **Step 3: 确认失败** — Run: `cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -m pytest tests/test_platform_tools.py tests/test_base_agent.py -v` → FAIL(platform 不存在 / _action 测试失败)

- [ ] **Step 4: 实现 platform.py**
创建 `backend/runtime/tools/platform.py`:
```python
from __future__ import annotations
import json
from .registry import register_tool


class ListAgentsTool:
    """列出所有已注册的智能体。"""
    name = "list_agents"
    description = "列出所有可用的智能体(id/名称/描述),帮助用户了解能切换到哪些。"
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, **params) -> str:
        from runtime.registry import _AGENT_REGISTRY
        agents = [
            {"id": cls.metadata.id, "name": cls.metadata.name, "description": cls.metadata.description}
            for cls in _AGENT_REGISTRY.values()
        ]
        return json.dumps(agents, ensure_ascii=False)


class SwitchAgentTool:
    """切换到指定智能体(平台操作,触发前端动作)。"""
    name = "switch_agent"
    description = "切换到指定的智能体。用户想用别的 agent 时调用。agent_id 必填(从 list_agents 获取)。"
    input_schema = {
        "type": "object",
        "properties": {"agent_id": {"type": "string", "description": "目标 agent 的 id"}},
        "required": ["agent_id"],
    }

    async def execute(self, **params) -> str:
        return json.dumps({"_action": "switch_agent", "agent_id": params.get("agent_id", "")})


register_tool(ListAgentsTool())
register_tool(SwitchAgentTool())
```

- [ ] **Step 5: tools/__init__.py import platform**
在 `from . import anysearch` 后加:
```python
from . import platform  # noqa: F401  触发平台工具注册
```

- [ ] **Step 6: BaseAgent 加 _action 检测**
`backend/runtime/base_agent.py` 找到执行工具的循环里 `await emit.emit(EventType.TOOL_RESULT, ...)` 之前,加 _action 检测。把:
```python
                        tool_result = await tool.execute(**call["input"]) if tool else f"工具 {call['name']} 不存在"
                        except Exception as e:
                            tool_result = f"工具执行错误: {e}"
                        await emit.emit(EventType.TOOL_RESULT, name=call["name"], result=tool_result)
```
改成(在 TOOL_RESULT emit 前插入 _action 检测):
```python
                        try:
                            tool_result = await tool.execute(**call["input"]) if tool else f"工具 {call['name']} 不存在"
                        except Exception as e:
                            tool_result = f"工具执行错误: {e}"
                        # 检测 _action 指令(平台操作工具返回)→ emit ACTION
                        try:
                            import json as _json
                            parsed = _json.loads(tool_result) if isinstance(tool_result, str) else None
                            if isinstance(parsed, dict) and "_action" in parsed:
                                await emit.emit(EventType.ACTION, **parsed)
                                tool_result = f"已执行动作: {parsed['_action']}"
                        except (ValueError, TypeError):
                            pass
                        await emit.emit(EventType.TOOL_RESULT, name=call["name"], result=tool_result)
```

- [ ] **Step 7: assistant_agent 改用 BaseAgent**
把 `backend/agents/assistant_agent.py` 全文替换为:
```python
from pathlib import Path

from runtime.agent import AgentMetadata
from runtime.base_agent import BaseAgent
from runtime.registry import register_agent


def _load_claude_md() -> str:
    root = Path(__file__).resolve().parent.parent.parent
    md_path = root / "CLAUDE.md"
    try:
        return md_path.read_text(encoding="utf-8")
    except Exception:
        return "Context Lab 是一个智能体载体平台。"


@register_agent
class AssistantAgent(BaseAgent):
    """项目助手:调 LLM 回答平台疑问 + 用平台工具(list_agents/switch_agent)代用户操作。"""

    metadata = AgentMetadata(
        id="assistant",
        name="项目助手",
        description="回答平台疑问 + 代你切换 agent(CLAUDE.md 知识源)",
        workspace={"type": "chat"},
    )
    tool_names = ["list_agents", "switch_agent"]
    system_prompt = (
        "你是 Context Lab 的项目助手。回答用户关于本平台的疑问(怎么用、各 agent 是什么)。\n"
        "用户想切换 agent 时,用 switch_agent 工具(先 list_agents 查可用 agent)。\n\n"
        "以下是项目说明文档:\n\n"
        f"{_load_claude_md()}"
    )
```

- [ ] **Step 8: 确认通过** — Run: `... pytest tests/test_platform_tools.py tests/test_base_agent.py tests/test_assistant_agent.py -v` → passed

- [ ] **Step 9: 全量无回归** — Run: `... pytest -q` → 全绿

- [ ] **Step 10: Commit** — `git add backend/runtime/base_agent.py backend/runtime/tools/platform.py backend/runtime/tools/__init__.py backend/agents/assistant_agent.py backend/tests/ && git commit -m "feat(agents): RQ-5 助手写操作(平台工具 + BaseAgent _action 检测 + assistant 改 BaseAgent)"`

---

### Task 2: 前端 store ACTION 执行 + eventAdapter 显示

**Files:** Modify `src/stores/agentRuntimeStore.ts`, `src/services/eventAdapter.ts`

- [ ] **Step 1: store.onEvent 处理 ACTION switch_agent**
`src/stores/agentRuntimeStore.ts` 的 `runAssistant` 的 onEvent 回调,在 `if (ev.type === 'text')` 后加 ACTION 处理:
```typescript
      (ev) => {
        if (ev.type === 'text') {
          set({ assistantStreaming: get().assistantStreaming + (ev.data.text || '') });
        } else if (ev.type === 'action' && ev.data._action === 'switch_agent') {
          const agentId = ev.data.agent_id;
          if (agentId) {
            get().selectAgent(agentId);  // 执行切换
          }
          const de = toDisplayEvent(ev);
          if (de) set({ assistantEvents: [...get().assistantEvents, de] });
        } else {
          const de = toDisplayEvent(ev);
          if (de) set({ assistantEvents: [...get().assistantEvents, de] });
        }
      },
```

- [ ] **Step 2: eventAdapter ACTION 显示**
`src/services/eventAdapter.ts` 的 action case,在 strategy_effect 判断后加 _action 判断:
```typescript
    case 'action': {
      const d = ev.data;
      if (d._action === 'switch_agent') {
        return { type: 'action', label: `切换到 agent: ${d.agent_id || ''}`, ts: Date.now() };
      }
      if (d.action === 'strategy_effect') {
        const saving = (d.before_tokens ?? 0) - (d.after_tokens ?? 0);
        return {
          type: 'action',
          label: `策略 ${d.strategy}: ${d.before_count}→${d.after_count} 条, ${d.before_tokens}→${d.after_tokens} tokens(省 ${saving})`,
          detail: d.summary ? `摘要: ${String(d.summary).slice(0, 150)}` : undefined,
          ts: Date.now(),
        };
      }
      return { type: 'action', label: `动作: ${d.action || d._action || ''}`, ts: Date.now() };
    }
```

- [ ] **Step 3: typecheck** — Run: `cd "D:/我的个人区间/Projects/context-lab" && npm run typecheck` → 无错

- [ ] **Step 4: Commit** — `git add src/stores/agentRuntimeStore.ts src/services/eventAdapter.ts && git commit -m "feat(frontend): RQ-5 store 处理 switch_agent action + eventAdapter 显示"`

---

### Task 3: 端到端验证

- [ ] **Step 1: 重启 uvicorn**(加载新 assistant + 平台工具)
- [ ] **Step 2: curl assistant 切换** — `curl -s -N --max-time 40 -X POST http://localhost:8000/api/agents/assistant/run -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"帮我切换到 echo"}]}'` → 应有 tool_call(switch_agent)+ action(switch_agent echo)+ text(已切换)
- [ ] **Step 3: 前端验证** — dev server 选助手,输入"切换到 echo" → 助手调 switch_agent → 前端 selectAgent(echo)+ 事件流显示切换

## 完成标准
- [ ] 平台工具(list_agents/switch_agent)注册
- [ ] BaseAgent _action 检测(emit ACTION)
- [ ] assistant 改 BaseAgent + 平台工具
- [ ] 前端 store switch_agent → selectAgent
- [ ] 端到端:助手能切换 agent
