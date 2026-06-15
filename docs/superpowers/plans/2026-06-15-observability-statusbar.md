# ObservabilityBar(可观察性状态栏)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 RQ-6 的「原理探索」从独立 PrincipleExplorerAgent 重新定位为横切所有 agent 的可观察性状态栏(ObservabilityBar),底部常驻双行摘要 + 展开看完整可视化(复用解耦后的 StrategyEffectCard/TokenAllocation/TimelineReplay)。

**Architecture:** BaseAgent 加 `_apply_strategy`(从 PrincipleExplorer 下沉)+ 透传 token_usage;3 个旧可视化组件解耦为 props 驱动(新旧界面共享);agentRuntimeStore 加 observability 聚合状态;eventAdapter 把 SSE 事件映射成各组件 props;新建 ObservabilityBar;布局改 column + 配套调整(AgentLibrary 过滤 assistant、AssistantSidebar 可折叠)。

**Tech Stack:** Python / pytest + respx(mock provider);React + TypeScript + Vitest

**Spec:** `docs/superpowers/specs/2026-06-15-observability-statusbar-design.md`

---

## 关键约束(读代码确认)

1. **provider 无 THINKING 事件**(`backend/infra/llm/base.py:23`)→ v1 步骤时间线基于 text/tool_call/tool_result;thinking 推后(需扩展 provider)。
2. **token usage 在 DONE 事件**(`StreamEvent.usage`)→ BaseAgent 现在忽略了,要透传 emit `TOKEN_USAGE`。
3. **strategy_effect 数据要扩展**:旧 StrategyEffectCard 需要 `beforeMessages`/`afterMessages`/`triggered`/`beforeTokenCount`/`afterTokenCount` 等明细(见 `StrategyEffectCard.tsx:14-77`),principle_explorer 当前只 emit counts → 下沉时必须扩展。
4. **TimelineReplay 用 store 的 `toggleStepExpanded`**(`TimelineReplay.tsx:13`),解耦时展开状态改组件自管理(本地 state),props 只接收只读 steps。

---

### Task 1: BaseAgent 加 _apply_strategy + 透传 token_usage

**Files:**
- Modify: `backend/runtime/base_agent.py`
- Test: `backend/tests/test_base_agent_strategy.py` (Create)

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_base_agent_strategy.py`:
```python
import pytest
from unittest.mock import patch, AsyncMock
from runtime.agent import AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from infra.llm.base import LLMMessage, StreamEvent, EventType as LLMEventType


async def test_apply_strategy_sliding():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    msgs = [LLMMessage(role="user", content=f"msg{i}") for i in range(15)]
    after, effect = await agent._apply_strategy(msgs, "sliding")
    assert effect["strategy"] == "sliding"
    assert effect["after_count"] == 10
    assert effect["before_count"] == 15
    assert len(effect["beforeMessages"]) == 15
    assert len(effect["afterMessages"]) == 10


async def test_apply_strategy_none():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    msgs = [LLMMessage(role="user", content=f"m{i}") for i in range(5)]
    after, effect = await agent._apply_strategy(msgs, "none")
    assert effect["after_count"] == 1
    assert effect["triggered"] is True


async def test_apply_strategy_full_no_change():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    msgs = [LLMMessage(role="user", content="x") for _ in range(8)]
    after, effect = await agent._apply_strategy(msgs, "full")
    assert effect["after_count"] == 8
    assert effect["triggered"] is False


async def test_run_emits_strategy_effect_and_token_usage():
    from runtime.base_agent import BaseAgent

    class _DummyAgent(BaseAgent):
        metadata = AgentMetadata(id="dummy", name="Dummy", description="", workspace={"type": "chat"})
        tool_names = []
        system_prompt = ""

    agent = _DummyAgent.__new__(_DummyAgent)
    emit = EventEmitter()

    async def fake_stream(messages, **kw):
        yield StreamEvent(type=LLMEventType.TEXT, text="回复")
        yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 12, "output_tokens": 3})

    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}], config={}), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.ACTION in types
    action_ev = next(e for e in events if e.type == EventType.ACTION)
    assert action_ev.data.get("action") == "strategy_effect"
    assert EventType.TOKEN_USAGE in types
    tu = next(e for e in events if e.type == EventType.TOKEN_USAGE)
    assert tu.data.get("input_tokens") == 12
    assert events[-1].type == EventType.DONE
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_base_agent_strategy.py -v`
Expected: FAIL (AttributeError: `_apply_strategy` 不存在 / import 失败)

- [ ] **Step 3: 实现 _apply_strategy + 辅助方法**

在 `backend/runtime/base_agent.py` 的 `BaseAgent` 类内(`__init__` 之后,`run` 之前)加入:
```python
    def _estimate_tokens(self, messages: list[LLMMessage]) -> int:
        total = 0
        for m in messages:
            text = m.content if isinstance(m.content, str) else str(m.content)
            total += len(text) // 4
        return total

    def _extract_text(self, msg: LLMMessage) -> str:
        if isinstance(msg.content, str):
            return msg.content
        if isinstance(msg.content, list):
            return " ".join(b.get("text", "") for b in msg.content if isinstance(b, dict) and b.get("type") == "text")
        return str(msg.content)

    async def _generate_summary(self, messages: list[LLMMessage]) -> str:
        conv_text = "\n".join(
            f"{'用户' if m.role == 'user' else '助手'}: {self._extract_text(m)[:200]}" for m in messages
        )
        try:
            result = await self._provider.complete([
                LLMMessage(role="user", content=f"请用 2-3 句话总结以下对话的关键信息:\n\n{conv_text}")
            ])
            return result.content
        except Exception as e:
            return f"(摘要失败: {e})"

    async def _apply_strategy(self, messages: list[LLMMessage], strategy: str = "sliding"):
        before_tokens = self._estimate_tokens(messages)
        before_count = len(messages)
        before_snapshot = [{"role": m.role, "content": self._extract_text(m)[:80]} for m in messages]
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
            recent, threshold = 4, 6
            if len(messages) <= threshold:
                after = list(messages)
            else:
                old = list(messages[:-recent])
                summary_content = await self._generate_summary(old)
                after = [LLMMessage(role="assistant", content=f"[对话摘要] {summary_content}")] + list(messages[-recent:])
                removed = old
        else:
            after = list(messages)

        after_tokens = self._estimate_tokens(after)
        after_snapshot = [{"role": m.role, "content": self._extract_text(m)[:80]} for m in after]
        return after, {
            "action": "strategy_effect",
            "strategy": strategy,
            "triggered": len(removed) > 0,
            "before_count": before_count,
            "after_count": len(after),
            "before_tokens": before_tokens,
            "after_tokens": after_tokens,
            "beforeTokenCount": before_tokens,
            "afterTokenCount": after_tokens,
            "beforeMessages": before_snapshot,
            "afterMessages": after_snapshot,
            "removed_count": len(removed),
            "summary": summary_content,
            "summarySourceCount": len(removed) if strategy == "summary" and removed else None,
        }
```

- [ ] **Step 4: 改 run() —— 开头 apply strategy + DONE 透传 token_usage**

把 `backend/runtime/base_agent.py` 的 `run` 方法替换为:
```python
    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in task.messages]
        strategy = "sliding"
        try:
            cfg = getattr(task, "config", None) or {}
            strategy = cfg.get("strategy", "sliding")
            messages, effect = await self._apply_strategy(messages, strategy)
            await emit.emit(EventType.ACTION, **effect)
            for _ in range(5):
                text_buf = ""
                tool_calls: list[dict] = []
                async for ev in self._provider.stream(
                    messages,
                    system=self.system_prompt or None,
                    tools=self._tool_defs or None,
                ):
                    if ev.type == LLMEventType.TEXT:
                        text_buf += ev.text or ""
                        await emit.emit(EventType.TEXT, text=ev.text)
                    elif ev.type == LLMEventType.TOOL_USE:
                        tool_calls.append({"id": ev.tool_id, "name": ev.tool_name, "input": ev.input or {}})
                    elif ev.type == LLMEventType.DONE:
                        if ev.usage:
                            await emit.emit(EventType.TOKEN_USAGE,
                                            input_tokens=ev.usage.get("input_tokens", 0),
                                            output_tokens=ev.usage.get("output_tokens", 0))
                    elif ev.type == LLMEventType.ERROR:
                        await emit.emit_error(ev.error or "stream error")
                        return
                if tool_calls:
                    assistant_content = []
                    if text_buf:
                        assistant_content.append({"type": "text", "text": text_buf})
                    for call in tool_calls:
                        assistant_content.append({"type": "tool_use", "id": call["id"], "name": call["name"], "input": call["input"]})
                    messages.append(LLMMessage(role="assistant", content=assistant_content))
                    for call in tool_calls:
                        await emit.emit(EventType.TOOL_CALL, name=call["name"], params=call["input"])
                        tool = self._tool_map.get(call["name"])
                        try:
                            tool_result = await tool.execute(**call["input"]) if tool else f"工具 {call['name']} 不存在"
                        except Exception as e:
                            tool_result = f"工具执行错误: {e}"
                        try:
                            import json as _json
                            _parsed = _json.loads(tool_result) if isinstance(tool_result, str) else None
                            if isinstance(_parsed, dict) and "_action" in _parsed:
                                await emit.emit(EventType.ACTION, **_parsed)
                                tool_result = f"已执行动作: {_parsed['_action']}"
                        except (ValueError, TypeError):
                            pass
                        await emit.emit(EventType.TOOL_RESULT, name=call["name"], result=tool_result)
                        messages.append(LLMMessage(role="user", content=[{"type": "tool_result", "tool_use_id": call["id"], "content": tool_result}]))
                    continue
                await emit.emit_done()
                return
            await emit.emit_done()
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_base_agent_strategy.py -v`
Expected: PASS(4 tests)

- [ ] **Step 6: 全量后端无回归**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q`
Expected: 全绿(注意:principle_explorer 测试此时仍存在且仍通过,下一 Task 删)

- [ ] **Step 7: Commit**

```bash
git add backend/runtime/base_agent.py backend/tests/test_base_agent_strategy.py
git commit -m "feat(runtime): BaseAgent 加 _apply_strategy + 透传 token_usage(RQ-6 重新定位)"
```

---

### Task 2: 删除 PrincipleExplorerAgent(逻辑已下沉)

**Files:**
- Delete: `backend/agents/principle_explorer_agent.py`
- Delete: `backend/tests/test_principle_explorer.py`
- Modify: `backend/agents/__init__.py`

- [ ] **Step 1: 删除 agent 文件 + 测试**

```bash
rm backend/agents/principle_explorer_agent.py
rm backend/tests/test_principle_explorer.py
```

- [ ] **Step 2: 移除 __init__.py 的 import**

修改 `backend/agents/__init__.py`,删除这一行:
```python
from . import principle_explorer_agent  # noqa: F401
```

- [ ] **Step 3: 全量测试 + 启动确认 agent 列表**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q`
Expected: 全绿(无 principle_explorer 相关测试)

Run(重启 uvicorn 后): `curl -s http://localhost:8000/api/agents`
Expected: 返回列表**不再包含** `principle_explorer`,只剩 echo / assistant / research

- [ ] **Step 4: Commit**

```bash
git add -A backend/agents/
git commit -m "refactor(agents): 删除 PrincipleExplorerAgent(逻辑下沉到 BaseAgent)"
```

---

### Task 3: eventAdapter 增强(事件 → 可观察性数据结构)

**Files:**
- Modify: `src/services/eventAdapter.ts`
- Test: `src/services/eventAdapter.test.ts` (Create)

- [ ] **Step 1: 写失败测试**

创建 `src/services/eventAdapter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { aggregateObservability, type ObservabilityData } from './eventAdapter';
import type { AgentEvent } from './agentRuntimeApi';

describe('aggregateObservability', () => {
  it('把 text/tool_call/tool_result/token_usage/action 聚合成结构', () => {
    const events: AgentEvent[] = [
      { type: 'text', data: { text: '你好' } },
      { type: 'tool_call', data: { name: 'anysearch', params: { q: 'x' } } },
      { type: 'tool_result', data: { name: 'anysearch', result: '...' } },
      { type: 'token_usage', data: { input_tokens: 12, output_tokens: 3 } },
      { type: 'action', data: { action: 'strategy_effect', strategy: 'sliding', before_count: 15, after_count: 10, beforeTokenCount: 30, afterTokenCount: 20, triggered: true, beforeMessages: [], afterMessages: [] } },
    ];
    const obs = aggregateObservability(events);
    expect(obs.steps.length).toBe(3);  // text + tool_call + tool_result
    expect(obs.tokenUsage.input).toBe(12);
    expect(obs.tokenUsage.output).toBe(3);
    expect(obs.strategyEffect?.strategy).toBe('sliding');
    expect(obs.strategyEffect?.triggered).toBe(true);
  });

  it('无 strategy_effect 时 strategyEffect 为 null', () => {
    const obs = aggregateObservability([{ type: 'text', data: { text: 'hi' } }]);
    expect(obs.strategyEffect).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- eventAdapter`
Expected: FAIL(`aggregateObservability` 未导出)

- [ ] **Step 3: 实现 aggregateObservability + 类型**

在 `src/services/eventAdapter.ts` 末尾追加:
```typescript
export interface ObsStep {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result';
  label: string;
  detail?: string;
}

export interface ObsTokenUsage {
  input: number;
  output: number;
}

export interface ObsStrategyEffect {
  strategy: string;
  triggered: boolean;
  before_count: number;
  after_count: number;
  beforeTokenCount: number;
  afterTokenCount: number;
  beforeMessages: Array<{ role: string; content: string }>;
  afterMessages: Array<{ role: string; content: string }>;
  summary?: string | null;
  summarySourceCount?: number | null;
}

export interface ObservabilityData {
  steps: ObsStep[];
  tokenUsage: ObsTokenUsage;
  strategyEffect: ObsStrategyEffect | null;
}

export function aggregateObservability(events: AgentEvent[]): ObservabilityData {
  const steps: ObsStep[] = [];
  let input = 0, output = 0;
  let strategyEffect: ObsStrategyEffect | null = null;
  let textCount = 0, toolIdx = 0;

  for (const ev of events) {
    if (ev.type === 'text') {
      textCount++;
      steps.push({ id: `text-${textCount}`, type: 'text', label: '生成文本', detail: String(ev.data.text || '').slice(0, 120) });
    } else if (ev.type === 'tool_call') {
      toolIdx++;
      steps.push({ id: `tool-${toolIdx}`, type: 'tool_call', label: `调用工具: ${ev.data.name || ''}`, detail: JSON.stringify(ev.data.params || {}) });
    } else if (ev.type === 'tool_result') {
      steps.push({ id: `result-${toolIdx}`, type: 'tool_result', label: `工具结果: ${ev.data.name || ''}`, detail: String(ev.data.result || '').slice(0, 200) });
    } else if (ev.type === 'token_usage') {
      input = ev.data.input_tokens ?? 0;
      output = ev.data.output_tokens ?? 0;
    } else if (ev.type === 'action' && ev.data.action === 'strategy_effect') {
      const d = ev.data;
      strategyEffect = {
        strategy: d.strategy,
        triggered: !!d.triggered,
        before_count: d.before_count ?? 0,
        after_count: d.after_count ?? 0,
        beforeTokenCount: d.beforeTokenCount ?? d.before_tokens ?? 0,
        afterTokenCount: d.afterTokenCount ?? d.after_tokens ?? 0,
        beforeMessages: d.beforeMessages ?? [],
        afterMessages: d.afterMessages ?? [],
        summary: d.summary ?? null,
        summarySourceCount: d.summarySourceCount ?? null,
      };
    }
  }
  return { steps, tokenUsage: { input, output }, strategyEffect };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:run -- eventAdapter`
Expected: PASS(2 tests)

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 无错

- [ ] **Step 6: Commit**

```bash
git add src/services/eventAdapter.ts src/services/eventAdapter.test.ts
git commit -m "feat(frontend): eventAdapter 加 aggregateObservability(事件→可观察性数据)"
```

---

### Task 4: agentRuntimeStore 加 observability 聚合状态

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`

- [ ] **Step 1: 加状态字段 + runWorkspace 聚合**

修改 `src/stores/agentRuntimeStore.ts`:

在 import 行后加:
```typescript
import { aggregateObservability, type ObservabilityData } from '../services/eventAdapter';
```

在 `AgentRuntimeState` interface 里(`workspaceEvents` 之后)加:
```typescript
  workspaceObservability: ObservabilityData;
```

在初始 state(`workspaceEvents: [],` 之后)加:
```typescript
  workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
```

在 `runWorkspace` 里把回调改为累积事件后聚合。把当前的 `runAgent(agentId, ..., (ev) => {...}, ...)` 改成先收集原始事件:
```typescript
  runWorkspace: async (input) => {
    const agentId = get().currentAgentId;
    if (!agentId || get().workspaceRunning) return;
    const messages = [...get().workspaceMessages, { role: 'user' as const, content: input }];
    const rawEvents: AgentEvent[] = [];
    set({ workspaceMessages: messages, workspaceStreaming: '', workspaceEvents: [], workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null }, workspaceRunning: true });
    await runAgent(
      agentId,
      messages.map(m => ({ role: m.role, content: m.content })),
      (ev) => {
        rawEvents.push(ev);
        if (ev.type === 'text') {
          set({ workspaceStreaming: get().workspaceStreaming + (ev.data.text || '') });
        } else {
          const de = toDisplayEvent(ev);
          if (de) set({ workspaceEvents: [...get().workspaceEvents, de] });
        }
        set({ workspaceObservability: aggregateObservability(rawEvents) });
      },
      () => {
        const full = get().workspaceStreaming;
        set({
          workspaceMessages: [...get().workspaceMessages, { role: 'assistant', content: full }],
          workspaceStreaming: '',
          workspaceRunning: false,
        });
      },
      (err) => {
        set({
          workspaceMessages: [...get().workspaceMessages, { role: 'assistant', content: `[错误] ${err}` }],
          workspaceStreaming: '',
          workspaceRunning: false,
        });
      },
    );
  },
```

在文件顶部 import 加 `AgentEvent` 类型:
```typescript
import { listAgents, runAgent, type AgentInfo, type AgentEvent } from '../services/agentRuntimeApi';
```

`resetWorkspace` 也加清空:
```typescript
  resetWorkspace: () => set({ workspaceMessages: [], workspaceStreaming: '', workspaceEvents: [], workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null }, workspaceRunning: false }),
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错

- [ ] **Step 3: 全量前端测试无回归**

Run: `npm run test:run`
Expected: 通过(memory 提示:App.test.tsx / appStore.test.ts 是 main 上预存在的失败测试,非本 Task 引入,忽略那两个)

- [ ] **Step 4: Commit**

```bash
git add src/stores/agentRuntimeStore.ts
git commit -m "feat(frontend): agentRuntimeStore 加 workspaceObservability 聚合状态"
```

---

### Task 5: 解耦 StrategyEffectCard 为 props 驱动

**Files:**
- Modify: `src/components/StrategyEffectCard.tsx`
- Create: `src/components/StrategyEffectCardWrapper.tsx`(旧 appStore 适配)

- [ ] **Step 1: 改 StrategyEffectCard 接 props**

把 `src/components/StrategyEffectCard.tsx` 整体替换为:
```typescript
const STRATEGY_LABELS: Record<string, string> = {
  sliding: '滑动窗口',
  full: '完整记忆',
  summary: '摘要记忆',
  none: '无记忆',
};

export interface StrategyEffectData {
  triggered: boolean;
  strategy: string;
  beforeTokenCount: number;
  afterTokenCount: number;
  beforeMessages: Array<{ role: string; content: string }>;
  afterMessages: Array<{ role: string; content: string }>;
  degraded?: boolean;
  degradeReason?: string;
  summarySourceCount?: number | null;
  summarySourceTokens?: number | null;
  summaryDuration?: number | null;
}

interface Props {
  effect: StrategyEffectData | null;
  strategy: string;
}

function StrategyEffectCard({ effect, strategy }: Props) {
  if (!effect || !effect.triggered) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        {effect === null ? '发送消息后，策略效果将在此展示' : `当前策略: ${STRATEGY_LABELS[strategy] || strategy} · 无消息被过滤`}
      </div>
    );
  }
  const savingsPercent = effect.beforeTokenCount > 0
    ? Math.round((1 - effect.afterTokenCount / effect.beforeTokenCount) * 100) : 0;
  return (
    <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{STRATEGY_LABELS[effect.strategy] || effect.strategy}</span>
        {effect.degraded && <span style={{ color: 'var(--accent-red)', fontSize: '10px' }}>降级</span>}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略前</div>
          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{effect.beforeMessages.length} 条 · {effect.beforeTokenCount}t</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-amber)', fontSize: '14px' }}>→</div>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略后</div>
          <div style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>{effect.afterMessages.length} 条 · {effect.afterTokenCount}t</div>
        </div>
      </div>
      <div style={{ marginTop: '6px', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>节省 {savingsPercent}%</div>
      {effect.strategy === 'summary' && effect.summarySourceCount != null && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>对 {effect.summarySourceCount} 条消息生成摘要</div>
      )}
      {effect.degraded && effect.degradeReason && (
        <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--accent-red)' }}>{effect.degradeReason}</div>
      )}
    </div>
  );
}

export default StrategyEffectCard;
```

- [ ] **Step 2: 创建旧 appStore 适配 wrapper**

创建 `src/components/StrategyEffectCardWrapper.tsx`:
```typescript
import { useAppStore } from '../stores/appStore';
import StrategyEffectCard from './StrategyEffectCard';

export default function StrategyEffectCardWrapper() {
  const strategyEffect = useAppStore(s => s.strategyEffect);
  const contextStrategy = useAppStore(s => s.contextStrategy);
  return <StrategyEffectCard effect={strategyEffect as any} strategy={contextStrategy} />;
}
```

- [ ] **Step 3: BottomPanel 改用 Wrapper**

修改 `src/components/BottomPanel.tsx`:
- 把 `import StrategyEffectCard from './StrategyEffectCard';` 改为 `import StrategyEffectCardWrapper from './StrategyEffectCardWrapper';`
- 把 `<StrategyEffectCard />`(两处:`BottomPanel.tsx:87` 和 StrategyEffectMaximizedView 里若有直接用)替换为 `<StrategyEffectCardWrapper />`

(注:StrategyEffectMaximizedView 在 BottomPanel.tsx 内部直接读 appStore,保持不动。)

- [ ] **Step 4: typecheck + 测试**

Run: `npm run typecheck`
Expected: 无错

Run: `npm run test:run`
Expected: 无新增失败

- [ ] **Step 5: Commit**

```bash
git add src/components/StrategyEffectCard.tsx src/components/StrategyEffectCardWrapper.tsx src/components/BottomPanel.tsx
git commit -m "refactor(frontend): StrategyEffectCard 解耦为 props 驱动 + 旧 wrapper"
```

---

### Task 6: 解耦 TokenAllocation 为 props 驱动

**Files:**
- Modify: `src/components/TokenAllocation.tsx`
- Create: `src/components/TokenAllocationWrapper.tsx`

- [ ] **Step 1: 改 TokenAllocation 接 props(简化版:input/output/contextSize)**

把 `src/components/TokenAllocation.tsx` 整体替换为:
```typescript
export interface TokenAllocationData {
  input: number;
  output: number;
  contextSize: number;
}

interface Props {
  data: TokenAllocationData;
}

function TokenAllocation({ data }: Props) {
  const total = data.input + data.output;
  const rows = [
    { label: '输入', value: data.input, color: 'var(--accent-blue)' },
    { label: '输出', value: data.output, color: 'var(--accent-emerald)' },
    { label: '可用剩余', value: Math.max(0, data.contextSize - total), color: 'var(--accent-amber)' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {rows.map(r => {
        const pct = data.contextSize > 0 ? (r.value / data.contextSize) * 100 : 0;
        const displayVal = r.value >= 1000 ? `${(r.value / 1000).toFixed(1)}K` : `${r.value}`;
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', width: '56px', flexShrink: 0 }}>{r.label}</span>
            <div style={{ flex: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: r.color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-tertiary)', width: '44px', textAlign: 'right', flexShrink: 0 }}>{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}

export default TokenAllocation;
```

- [ ] **Step 2: 创建旧 appStore 适配 wrapper**

创建 `src/components/TokenAllocationWrapper.tsx`:
```typescript
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import TokenAllocation from './TokenAllocation';

const tokenService = new TokenService();

export default function TokenAllocationWrapper() {
  const { systemPrompt, lastUserInput, conversationHistory, apiInteractions, contextSize } = useAppStore();
  const systemTokens = tokenService.calculate(systemPrompt);
  const userTokens = tokenService.calculate(lastUserInput);
  const historyTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0);
  const apiTokens = apiInteractions.reduce((sum, api) => sum + tokenService.calculate(api.request.body) + (api.response ? tokenService.calculate(api.response.body) : 0), 0);
  const input = systemTokens + userTokens + historyTokens + apiTokens;
  return <TokenAllocation data={{ input, output: 0, contextSize }} />;
}
```

- [ ] **Step 3: BottomPanel 改用 Wrapper**

修改 `src/components/BottomPanel.tsx`:
- 把 `import TokenAllocation from './TokenAllocation';` 改为 `import TokenAllocationWrapper from './TokenAllocationWrapper';`
- 把 `<TokenAllocation />`(BottomPanel.tsx:65)替换为 `<TokenAllocationWrapper />`

- [ ] **Step 4: typecheck + 测试**

Run: `npm run typecheck` → 无错
Run: `npm run test:run` → 无新增失败

- [ ] **Step 5: Commit**

```bash
git add src/components/TokenAllocation.tsx src/components/TokenAllocationWrapper.tsx src/components/BottomPanel.tsx
git commit -m "refactor(frontend): TokenAllocation 解耦为 props 驱动 + 旧 wrapper"
```

---

### Task 7: 解耦 TimelineReplay 为 props 驱动

**Files:**
- Modify: `src/components/TimelineReplay.tsx`
- Create: `src/components/TimelineReplayWrapper.tsx`

- [ ] **Step 1: 改 TimelineReplay 接 props + 自管理展开**

把 `src/components/TimelineReplay.tsx` 整体替换为:
```typescript
import React, { useState } from 'react';
import StepDetailPanel from './StepDetailPanel';
import type { TimelineStep } from '../stores/appStore';

interface TimelineReplayProps {
  steps: TimelineStep[];
  onViewFullPayload?: (title: string, content: string) => void;
  autoExpandPayload?: boolean;
  isMaximized?: boolean;
}

function TimelineReplay({ steps, onViewFullPayload, autoExpandPayload, isMaximized }: TimelineReplayProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const handleStepClick = (stepId: string, expandable: boolean) => {
    if (!expandable) return;
    setExpandedStepId(prev => prev === stepId ? null : stepId);
  };

  if (steps.length === 0) {
    return (
      <div style={{ fontSize: isMaximized ? '15px' : '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        发送消息后将显示交互过程
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
        {steps.map((step, i) => {
          const isClickable = step.expandable && (step.completed || step.details);
          const isExpanded = expandedStepId === step.id;
          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => handleStepClick(step.id, !!isClickable)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 8px', borderRadius: '4px', fontSize: isMaximized ? '14px' : '13px',
                  background: isExpanded ? 'rgba(91,156,245,0.12)' : step.active ? 'rgba(91,156,245,0.08)' : 'transparent',
                  color: step.completed ? 'var(--accent-emerald)' : step.active ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                  fontWeight: step.active || isExpanded ? 600 : 400, whiteSpace: 'nowrap',
                  border: 'none', cursor: isClickable ? 'pointer' : 'default', transition: 'all 0.15s',
                }}
              >
                {step.icon} {step.toolCallName || step.title}
              </button>
              {i < steps.length - 1 && (
                <span style={{ width: step.completed ? '12px' : '8px', height: '1px', background: step.completed ? 'var(--accent-emerald)' : 'var(--border-default)', flexShrink: 0, transition: 'all 0.3s' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {expandedStepId && (() => {
        const step = steps.find(s => s.id === expandedStepId);
        if (!step) return null;
        return (
          <div style={{ marginTop: '8px', border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', fontSize: isMaximized ? '15px' : '13px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{step.icon} {step.title}</span>
              <button onClick={() => setExpandedStepId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: isMaximized ? '18px' : '16px', lineHeight: 1 }}>×</button>
            </div>
            <StepDetailPanel step={step} onViewFullPayload={onViewFullPayload} autoExpandPayload={autoExpandPayload} isMaximized={isMaximized} />
          </div>
        );
      })()}
    </div>
  );
}

export default TimelineReplay;
```

- [ ] **Step 2: 创建旧 appStore 适配 wrapper**

创建 `src/components/TimelineReplayWrapper.tsx`:
```typescript
import { useAppStore } from '../stores/appStore';
import TimelineReplay from './TimelineReplay';

interface Props {
  onViewFullPayload?: (title: string, content: string) => void;
  autoExpandPayload?: boolean;
  isMaximized?: boolean;
}

export default function TimelineReplayWrapper({ onViewFullPayload, autoExpandPayload, isMaximized }: Props) {
  const timelineSteps = useAppStore(s => s.timelineSteps);
  return <TimelineReplay steps={timelineSteps} onViewFullPayload={onViewFullPayload} autoExpandPayload={autoExpandPayload} isMaximized={isMaximized} />;
}
```

- [ ] **Step 3: BottomPanel 改用 Wrapper**

修改 `src/components/BottomPanel.tsx`:
- 把 `import TimelineReplay from './TimelineReplay';` 改为 `import TimelineReplayWrapper from './TimelineReplayWrapper';`
- 把两处 `<TimelineReplay onViewFullPayload={handleViewFullPayload} ... />` 替换为 `<TimelineReplayWrapper onViewFullPayload={handleViewFullPayload} ... />`(BottomPanel.tsx:109 和 :200)

- [ ] **Step 4: typecheck + 测试**

Run: `npm run typecheck` → 无错
Run: `npm run test:run` → 无新增失败

- [ ] **Step 5: Commit**

```bash
git add src/components/TimelineReplay.tsx src/components/TimelineReplayWrapper.tsx src/components/BottomPanel.tsx
git commit -m "refactor(frontend): TimelineReplay 解耦为 props 驱动 + 旧 wrapper"
```

---

### Task 8: 新建 ObservabilityBar 组件

**Files:**
- Create: `src/components/agentRuntime/ObservabilityBar.tsx`

- [ ] **Step 1: 实现 ObservabilityBar**

创建 `src/components/agentRuntime/ObservabilityBar.tsx`:
```typescript
import React, { useState } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import TimelineReplay from '../TimelineReplay';
import TokenAllocation from '../TokenAllocation';
import StrategyEffectCard from '../StrategyEffectCard';
import type { TimelineStep } from '../../stores/appStore';
import type { ObsStep } from '../../services/eventAdapter';

const VITE_CONTEXT_SIZE = Number(import.meta.env.VITE_MAX_CONTEXT_SIZE || 1048576);

function obsStepToTimelineStep(s: ObsStep, idx: number): TimelineStep {
  const iconMap = { text: '💬', tool_call: '🔧', tool_result: '↩️' };
  return {
    id: s.id, type: s.type === 'tool_call' ? 'tool-call' : s.type === 'tool_result' ? 'api-response' : 'agent-response',
    icon: iconMap[s.type] || '•', title: s.label, description: s.detail || '',
    active: false, completed: true, expandable: !!s.detail, expanded: false,
    details: s.detail ? { type: 'agent-response', text: s.detail, tokenUsage: { input: 0, output: 0 }, toolsUsed: [], apiCallCount: 0 } as any : undefined,
  };
}

const ObservabilityBar: React.FC = () => {
  const { currentAgentId, agents, workspaceObservability, workspaceRunning } = useAgentRuntimeStore();
  const [expanded, setExpanded] = useState(false);
  const agent = agents.find(a => a.id === currentAgentId);
  const obs = workspaceObservability;
  const stepsForReplay = obs.steps.map(obsStepToTimelineStep);
  const eff = obs.strategyEffect;
  const savingPct = eff && eff.beforeTokenCount > 0
    ? Math.round((1 - eff.afterTokenCount / eff.beforeTokenCount) * 100) : 0;

  const baseStyle: React.CSSProperties = {
    borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    flexShrink: 0, display: 'flex', flexDirection: 'column',
  };

  const summaryStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px', cursor: 'pointer',
    fontSize: 14, color: 'var(--text-secondary)',
  };
  const metricStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' };

  return (
    <div style={baseStyle}>
      <div style={summaryStyle} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><span style={{ color: workspaceRunning ? 'var(--accent-emerald)' : 'var(--text-tertiary)' }}>●</span> {agent?.name || '未选'} <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{workspaceRunning ? '运行中' : '空闲'}</span></span>
          <button style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, padding: '2px 8px' }}>{expanded ? '收起 ⩘' : '展开 ⩘'}</button>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 13 }}>
          <span>Token <span style={metricStyle}>{obs.tokenUsage.input}/{obs.tokenUsage.output}</span></span>
          <span>步骤 <span style={metricStyle}>{obs.steps.length}</span></span>
          {eff && <span>策略 {eff.strategy} · 省<span style={{ color: 'var(--accent-emerald)' }}>{savingPct}%</span></span>}
        </div>
      </div>
      {expanded && (
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border-subtle)', maxHeight: 280, overflow: 'auto' }}>
          <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>运行步骤</div>
            <TimelineReplay steps={stepsForReplay} />
          </div>
          <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>Token 消耗</div>
            <TokenAllocation data={{ input: obs.tokenUsage.input, output: obs.tokenUsage.output, contextSize: VITE_CONTEXT_SIZE }} />
          </div>
          <div style={{ flex: 1.2, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>策略效果</div>
            <StrategyEffectCard effect={eff as any} strategy={eff?.strategy || 'sliding'} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ObservabilityBar;
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错(若有 ObsStep/StrategyEffectData 类型不匹配,调整 as any 或补类型)

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/ObservabilityBar.tsx
git commit -m "feat(frontend): 新建 ObservabilityBar(常驻摘要+展开可视化)"
```

---

### Task 9: AgentRuntimeView 布局改造(column + ObservabilityBar)

**Files:**
- Modify: `src/components/agentRuntime/AgentRuntimeView.tsx`

- [ ] **Step 1: 改 AgentRuntimeView 为 column**

把 `src/components/agentRuntime/AgentRuntimeView.tsx` 整体替换为:
```typescript
import React from 'react';
import AgentLibrary from './AgentLibrary';
import AgentWorkspace from './AgentWorkspace';
import AssistantSidebar from './AssistantSidebar';
import ObservabilityBar from './ObservabilityBar';

const AgentRuntimeView: React.FC = () => {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AgentLibrary />
        <AgentWorkspace />
        <AssistantSidebar />
      </div>
      <ObservabilityBar />
    </div>
  );
};

export default AgentRuntimeView;
```

- [ ] **Step 2: typecheck + 手动验证**

Run: `npm run typecheck` → 无错

手动:浏览器打开 http://localhost:5173 → AgentRuntime 界面底部出现 ObservabilityBar 常驻条;选 agent 发消息,摘要更新;点展开看三栏可视化。

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/AgentRuntimeView.tsx
git commit -m "feat(frontend): AgentRuntimeView 改 column + 挂 ObservabilityBar"
```

---

### Task 10: AgentLibrary 过滤 assistant

**Files:**
- Modify: `src/components/agentRuntime/AgentLibrary.tsx`

- [ ] **Step 1: 过滤 assistant**

修改 `src/components/agentRuntime/AgentLibrary.tsx` 的 `agents.map(...)`(第 15 行),在 map 前加 filter:
```typescript
      {agents.filter(a => a.id !== 'assistant').map(a => (
```
(即把 `{agents.map(a => (` 改成 `{agents.filter(a => a.id !== 'assistant').map(a => (`)

- [ ] **Step 2: 手动验证**

手动:AgentLibrary 不再显示「项目助手」卡片,只剩 echo / research。

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/AgentLibrary.tsx
git commit -m "feat(frontend): AgentLibrary 过滤 assistant(右侧已有,避免重复)"
```

---

### Task 11: AssistantSidebar 加折叠 toggle

**Files:**
- Modify: `src/components/agentRuntime/AssistantSidebar.tsx`

- [ ] **Step 1: 加折叠状态 + toggle**

把 `src/components/agentRuntime/AssistantSidebar.tsx` 的组件主体替换为(加 collapsed 本地 state + 折叠时窄条):
```typescript
const AssistantSidebar: React.FC = () => {
  const { assistantMessages, assistantStreaming, assistantRunning, runAssistant } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [assistantMessages, assistantStreaming]);

  const send = () => {
    if (!input.trim() || assistantRunning) return;
    runAssistant(input.trim());
    setInput('');
  };

  if (collapsed) {
    return (
      <div style={{ width: 32, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 8 }}>
        <button onClick={() => setCollapsed(false)} title="展开助手" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16 }}>›</button>
        <span style={{ writingMode: 'vertical-rl', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>项目助手</span>
      </div>
    );
  }

  return (
    <div style={{ width: 280, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: 13 }}>项目助手</strong>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>关于本平台的疑问</div>
        </div>
        <button onClick={() => setCollapsed(true)} title="收起助手" style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}>‹</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {assistantMessages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 8 }}>你好!我是项目助手,可以问我怎么用 Context Lab、各 agent 是什么。</div>
        )}
        {assistantMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: m.role === 'user' ? 'var(--accent-violet)' : 'var(--bg-base)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{m.content}</div>
        ))}
        {assistantStreaming && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: 'var(--bg-base)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{assistantStreaming}</div>
        )}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="问助手..." style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12 }} />
        <button onClick={send} disabled={assistantRunning} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--accent-violet)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, opacity: assistantRunning ? 0.5 : 1 }}>{assistantRunning ? '...' : '➤'}</button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: typecheck + 手动验证**

Run: `npm run typecheck` → 无错

手动:点助手栏右上「‹」收起 → 工作区变宽;点窄条「›」展开恢复。

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/AssistantSidebar.tsx
git commit -m "feat(frontend): AssistantSidebar 加折叠 toggle,收起时工作区变宽"
```

---

### Task 12: 端到端验证 + 更新跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: 重启 uvicorn(加载 BaseAgent 改动 + 删 PrincipleExplorer)**

后端进程需重启(Task 2 后 agent 列表变了)。停掉旧后端 task,重启:
```bash
cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000
```

- [ ] **Step 2: curl 验证 agent 列表 + research agent emit 完整事件**

Run: `curl -s http://localhost:8000/api/agents`
Expected: 列表含 echo / assistant / research(无 principle_explorer)

Run(测 research 跑策略 + token + 事件):
```bash
curl -s -N -m 30 -X POST http://localhost:8000/api/agents/research/run -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"你好"}]}'
```
Expected: 事件流含 `action`(strategy_effect)、`token_usage`、`text`、`done`

- [ ] **Step 3: 浏览器端到端验证**

打开 http://localhost:5173:
1. AgentLibrary 不再有「项目助手」
2. 选 research,发消息 → ObservabilityBar 摘要更新(token/步数/策略省%)
3. 展开 ObservabilityBar → 三栏(运行步骤 / Token 消耗 / 策略效果)有数据
4. 助手栏可收起,收起后工作区变宽
5. 旧 ChatInteraction 界面(如果还能切换)BottomPanel 三栏正常(解耦未破坏)

- [ ] **Step 4: 更新跟踪矩阵**

修改 `项目执行跟踪矩阵.md`:补录 RQ-6 重新定位(可观察性状态栏),状态 ✅ 已完成。

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs: 跟踪矩阵补录 RQ-6 重新定位(可观察性状态栏)"
```

---

## Self-Review(plan 写完后自查)

**1. Spec coverage:**
- 横切可观察性 → Task 1(策略下沉 BaseAgent)+ Task 8/9(ObservabilityBar)
- 解耦 3 组件 → Task 5/6/7
- 删 PrincipleExplorer → Task 2
- eventAdapter 增强 → Task 3
- 配套布局(AgentLibrary 过滤 / AssistantSidebar 折叠)→ Task 10/11
- 不破坏旧界面 → Task 5/6/7 的 Wrapper
- ✅ 全覆盖

**2. Placeholder 扫描:** 无 TBD/TODO;每个 code step 都有完整代码。✅

**3. Type 一致性:**
- `ObservabilityData` / `ObsStep` / `ObsStrategyEffect`(Task 3 定义)→ Task 4/8 使用一致
- `StrategyEffectData`(Task 5)→ Task 8 `as any` 传入(因 store 的 strategyEffect 来自 aggregateObservability,字段名一致)
- `TokenAllocationData`(Task 6)→ Task 8 使用一致
- `TimelineStep`(appStore)→ Task 7/8 使用;obsStepToTimelineStep 转换(Task 8)字段对齐
- ✅ 一致

**4. 风险已在 Task 内标注:** thinking 推后(provider 限制)、summary 成本(默认 sliding 规避)、解耦不破坏旧界面(Wrapper 兜底)。
