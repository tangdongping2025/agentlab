# RQ-3 前端工作台 + 助手 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** 第一个用户可见切片——前端主界面(三栏:应用库 | 工作区 | 助手栏)+ 后端助手 agent(调 LLM 回答项目疑问,知识源 CLAUDE.md)。前端连后端 `/api/agents`,UI 上能选 echo agent 看流式回复 + 用助手问答。与现有 chat 并存(新 view)。

**Architecture:** App.tsx 加第三个 view `'agentRuntime'`,渲染 `AgentRuntimeView`(三栏)。新建独立 `agentRuntimeStore`(Zustand),不混入巨型 appStore。`agentRuntimeApi` 用 `EventSource` 订阅 SSE。后端 `assistant_agent` 调 RQ-1 的 `ArkProvider` stream + emit 事件,system prompt 含 CLAUDE.md。

**Tech Stack:** 后端 Python(FastAPI + RQ-1 provider)/ 前端 React + TS + Tailwind + Zustand + EventSource / 测试 pytest + Vitest

---

## 前置确认(已批量确认)

- A1 范围:主界面三栏 + 可视化 + 助手 agent(无工具)
- A2 LLM 来源:代码支持 ARK + 代理(.env 切换),验证用能通的
- A3 助手 v1:调 LLM 回答项目疑问,CLAUDE.md 知识源,无工具
- A4 前端组件:主界面布局 + Library + Workspace + AssistantSidebar + agentRuntimeApi + eventAdapter + 复用可视化
- A5 现有 agentService 并存(RQ-6 迁移)
- B1-B5 全认可

## v1 务实说明

- 可视化复用(TimelineReplay 等)**v1 简化**:Workspace 内联显示事件流(text/thinking/tool 小标记),完整 TimelineReplay 复用推后(eventAdapter → TimelineStep 格式映射复杂,v1 先跑通主流程)
- 助手调 LLM 依赖代理/ARK 可用;代理 502 时助手会报错事件,代码正确

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/agents/assistant_agent.py` | 新建 | 助手 agent(调 provider stream + CLAUDE.md system prompt + emit) |
| `backend/agents/__init__.py` | 修改 | 导入 assistant_agent 触发注册 |
| `backend/tests/test_assistant_agent.py` | 新建 | 助手 agent 测试(mock provider) |
| `src/services/agentRuntimeApi.ts` | 新建 | GET /api/agents + EventSource 订阅 /run SSE |
| `src/services/eventAdapter.ts` | 新建 | SSE 事件 → 显示格式 |
| `src/stores/agentRuntimeStore.ts` | 新建 | 独立 Zustand store(agents/current/对话/事件) |
| `src/components/agentRuntime/AgentLibrary.tsx` | 新建 | 应用库(列 agent,选择) |
| `src/components/agentRuntime/AgentWorkspace.tsx` | 新建 | 工作区(调 agent + 显示对话/事件) |
| `src/components/agentRuntime/AssistantSidebar.tsx` | 新建 | 助手栏(调 assistant agent + 显示) |
| `src/components/agentRuntime/AgentRuntimeView.tsx` | 新建 | 三栏主布局 |
| `src/App.tsx` | 修改 | 加 view 'agentRuntime' + Header 入口 |

---

### Task 1: 后端 assistant_agent.py

**Files:** Create `backend/agents/assistant_agent.py`; Modify `backend/agents/__init__.py`; Create `backend/tests/test_assistant_agent.py`

- [ ] **Step 1: 写测试** — 创建 `backend/tests/test_assistant_agent.py`:
```python
import pytest
from unittest.mock import AsyncMock, patch

from runtime.agent import AgentTask
from runtime.events import EventType
from runtime.registry import get_agent_class, create_agent


def test_assistant_registered():
    import agents  # 触发注册
    assert get_agent_class("assistant") is not None


async def test_assistant_emits_text_from_provider():
    import agents  # noqa
    from runtime.events import EventEmitter
    from infra.llm.base import LLMMessage, StreamEvent

    agent = create_agent("assistant")
    emit = EventEmitter()

    # mock provider.stream 产 text + done
    async def fake_stream(messages, **kw):
        yield StreamEvent(type=EventType.TEXT, text="你")
        yield StreamEvent(type=EventType.TEXT, text="好")
        yield StreamEvent(type=EventType.DONE, usage={"input_tokens": 5, "output_tokens": 2})

    with patch.object(agent, "_provider") as mock_prov:
        mock_prov.stream = fake_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    texts = "".join(e.data.get("text", "") for e in events if e.type == EventType.TEXT)
    assert "你好" in texts
    assert events[-1].type == EventType.DONE


async def test_assistant_emits_error_on_provider_failure():
    import agents  # noqa
    from runtime.events import EventEmitter

    agent = create_agent("assistant")
    emit = EventEmitter()

    async def failing_stream(messages, **kw):
        raise RuntimeError("provider down")
        yield  # 让它成为 async generator

    with patch.object(agent, "_provider") as mock_prov:
        mock_prov.stream = failing_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    assert any(e.type == EventType.ERROR for e in events)
```

- [ ] **Step 2: 确认失败** — Run: `cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -m pytest tests/test_assistant_agent.py -v` → FAIL(assistant 不存在)

- [ ] **Step 3: 实现 assistant_agent.py** — 创建 `backend/agents/assistant_agent.py`:
```python
from __future__ import annotations

from pathlib import Path

from infra.llm import ArkProvider
from infra.llm.base import LLMMessage
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent


def _load_claude_md() -> str:
    """读项目根 CLAUDE.md 作为助手知识源。读不到用兜底。"""
    # backend/ 的上一级是项目根
    root = Path(__file__).resolve().parent.parent.parent
    md_path = root / "CLAUDE.md"
    try:
        return md_path.read_text(encoding="utf-8")
    except Exception:
        return "Context Lab 是一个智能体载体平台。"


@register_agent
class AssistantAgent(Agent):
    """项目助手:调 LLM 回答关于本平台的疑问,知识源 CLAUDE.md。v1 无工具。"""

    metadata = AgentMetadata(
        id="assistant",
        name="项目助手",
        description="回答关于本平台的疑问(知识源 CLAUDE.md)",
        workspace={"type": "chat"},
    )

    def __init__(self) -> None:
        from config import settings
        self._provider = ArkProvider(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            default_model=settings.llm_model,
        )
        self._system_prompt = (
            "你是 Context Lab 的项目助手。回答用户关于本平台的疑问(怎么用、各 agent 是什么、架构等)。\n\n"
            "以下是项目的说明文档,作为你的知识来源:\n\n"
            f"{_load_claude_md()}"
        )

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in task.messages]
        try:
            async for ev in self._provider.stream(messages, system=self._system_prompt):
                if ev.type == EventType.TEXT:
                    await emit.emit(EventType.TEXT, text=ev.text)
                elif ev.type == EventType.DONE:
                    await emit.emit_done()
                    return
                elif ev.type == EventType.ERROR:
                    await emit.emit_error(ev.error or "provider error")
                    return
            # 兜底:provider 流结束但没 DONE
            await emit.emit_done()
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")
```

- [ ] **Step 4: 修改 agents/__init__.py** — 把 `from . import echo_agent` 那行下面加:
```python
from . import assistant_agent  # noqa: F401
```

- [ ] **Step 5: 确认通过** — Run: `... pytest tests/test_assistant_agent.py tests/test_agents_api.py tests/test_echo_agent.py -v` → 全 passed(assistant 3 + api 4 + echo 3)

- [ ] **Step 6: Commit** — `git add backend/agents/assistant_agent.py backend/agents/__init__.py backend/tests/test_assistant_agent.py && git commit -m "feat(agents): RQ-3 AssistantAgent(调 provider + CLAUDE.md 知识源)"`

---

### Task 2: 前端 agentRuntimeApi.ts(SSE 订阅)

**Files:** Create `src/services/agentRuntimeApi.ts`

- [ ] **Step 1: 实现** — 创建 `src/services/agentRuntimeApi.ts`:
```typescript
// 调后端 /api/agents + 订阅 SSE 流

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  workspace: { type: 'chat' | 'tabs'; tabs?: string[] };
  capabilities: string[];
}

export interface AgentEvent {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'token_usage' | 'action' | 'error' | 'done';
  data: Record<string, any>;
}

const BASE = '/api/agents';

export async function listAgents(): Promise<AgentInfo[]> {
  const resp = await fetch(BASE);
  if (!resp.ok) throw new Error(`listAgents failed: ${resp.status}`);
  return resp.json();
}

export async function getAgent(id: string): Promise<AgentInfo> {
  const resp = await fetch(`${BASE}/${id}`);
  if (!resp.ok) throw new Error(`getAgent failed: ${resp.status}`);
  return resp.json();
}

/**
 * 运行 agent,订阅 SSE 事件。用 fetch + ReadableStream 解析(EventSource 不支持 POST)。
 * onEvent 每个事件回调;onDone 流结束回调。
 */
export async function runAgent(
  agentId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const resp = await fetch(`${BASE}/${agentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok) {
    onError(`HTTP ${resp.status}`);
    return;
  }
  if (!resp.body) {
    onError('no response body');
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 以 \n\n 分隔事件
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const json = line.slice(6);
        try {
          const event: AgentEvent = JSON.parse(json);
          onEvent(event);
          if (event.type === 'done') { onDone(); return; }
          if (event.type === 'error') { onError(event.data.error || 'error'); return; }
        } catch { /* skip malformed */ }
      }
    }
    onDone();
  } catch (e: any) {
    onError(e?.message || 'stream error');
  }
}
```

- [ ] **Step 2: Commit** — `git add src/services/agentRuntimeApi.ts && git commit -m "feat(frontend): RQ-3 agentRuntimeApi(调 /api/agents + SSE 订阅)"`

> 注:前端 SSE 用 fetch + ReadableStream(EventSource 不支持 POST)。无单测(纯 fetch 封装,dev server 验证)。

---

### Task 3: eventAdapter.ts + agentRuntimeStore.ts

**Files:** Create `src/services/eventAdapter.ts`, `src/stores/agentRuntimeStore.ts`

- [ ] **Step 1: eventAdapter** — 创建 `src/services/eventAdapter.ts`:
```typescript
import type { AgentEvent } from './agentRuntimeApi';

// 把 SSE 事件累计成显示用的消息 + 事件流(v1 简化格式)

export interface DisplayEvent {
  type: AgentEvent['type'];
  label: string;       // 显示文本
  detail?: string;     // 详情
  ts: number;
}

/** 从 AgentEvent 生成 DisplayEvent(用于事件流面板) */
export function toDisplayEvent(ev: AgentEvent): DisplayEvent | null {
  switch (ev.type) {
    case 'text': return null;  // text 累计到消息,不单独显示
    case 'thinking': return { type: 'thinking', label: '思考', detail: ev.data.content || '', ts: Date.now() };
    case 'tool_call': return { type: 'tool_call', label: `调用工具: ${ev.data.name || ''}`, detail: JSON.stringify(ev.data.params || {}), ts: Date.now() };
    case 'tool_result': return { type: 'tool_result', label: '工具结果', detail: String(ev.data.result || '').slice(0, 200), ts: Date.now() };
    case 'token_usage': return { type: 'token_usage', label: `Token: in ${ev.data.input_tokens} / out ${ev.data.output_tokens}`, ts: Date.now() };
    case 'error': return { type: 'error', label: `错误: ${ev.data.error || ''}`, ts: Date.now() };
    default: return null;
  }
}
```

- [ ] **Step 2: agentRuntimeStore** — 创建 `src/stores/agentRuntimeStore.ts`:
```typescript
import { create } from 'zustand';
import { listAgents, runAgent, type AgentInfo } from '../services/agentRuntimeApi';
import { toDisplayEvent, type DisplayEvent } from '../services/eventAdapter';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentRuntimeState {
  agents: AgentInfo[];
  currentAgentId: string | null;
  isLoadingAgents: boolean;
  // 当前 agent 工作台对话
  workspaceMessages: ChatMessage[];
  workspaceStreaming: string;       // 流式中的 assistant 文本
  workspaceEvents: DisplayEvent[];  // 事件流
  workspaceRunning: boolean;
  // 助手对话(独立)
  assistantMessages: ChatMessage[];
  assistantStreaming: string;
  assistantEvents: DisplayEvent[];
  assistantRunning: boolean;

  loadAgents: () => Promise<void>;
  selectAgent: (id: string) => void;
  runWorkspace: (input: string) => Promise<void>;
  runAssistant: (input: string) => Promise<void>;
  resetWorkspace: () => void;
}

export const useAgentRuntimeStore = create<AgentRuntimeState>((set, get) => ({
  agents: [],
  currentAgentId: null,
  isLoadingAgents: false,
  workspaceMessages: [],
  workspaceStreaming: '',
  workspaceEvents: [],
  workspaceRunning: false,
  assistantMessages: [],
  assistantStreaming: '',
  assistantEvents: [],
  assistantRunning: false,

  loadAgents: async () => {
    set({ isLoadingAgents: true });
    try {
      const agents = await listAgents();
      set({ agents, isLoadingAgents: false, currentAgentId: get().currentAgentId || agents[0]?.id || null });
    } catch (e) {
      console.error('loadAgents failed:', e);
      set({ isLoadingAgents: false });
    }
  },

  selectAgent: (id) => set({ currentAgentId: id }),

  runWorkspace: async (input) => {
    const agentId = get().currentAgentId;
    if (!agentId || get().workspaceRunning) return;
    const messages = [...get().workspaceMessages, { role: 'user' as const, content: input }];
    set({
      workspaceMessages: messages,
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: true,
    });
    await runAgent(
      agentId,
      messages.map(m => ({ role: m.role, content: m.content })),
      (ev) => {
        if (ev.type === 'text') {
          set({ workspaceStreaming: get().workspaceStreaming + (ev.data.text || '') });
        } else {
          const de = toDisplayEvent(ev);
          if (de) set({ workspaceEvents: [...get().workspaceEvents, de] });
        }
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

  runAssistant: async (input) => {
    if (get().assistantRunning) return;
    const messages = [...get().assistantMessages, { role: 'user' as const, content: input }];
    set({ assistantMessages: messages, assistantStreaming: '', assistantEvents: [], assistantRunning: true });
    await runAgent(
      'assistant',
      messages.map(m => ({ role: m.role, content: m.content })),
      (ev) => {
        if (ev.type === 'text') set({ assistantStreaming: get().assistantStreaming + (ev.data.text || '') });
        else {
          const de = toDisplayEvent(ev);
          if (de) set({ assistantEvents: [...get().assistantEvents, de] });
        }
      },
      () => {
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: get().assistantStreaming }],
          assistantStreaming: '',
          assistantRunning: false,
        });
      },
      (err) => {
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: `[错误] ${err}` }],
          assistantStreaming: '',
          assistantRunning: false,
        });
      },
    );
  },

  resetWorkspace: () => set({ workspaceMessages: [], workspaceStreaming: '', workspaceEvents: [], workspaceRunning: false }),
}));
```

- [ ] **Step 3: typecheck** — Run: `npm run typecheck` → 无错

- [ ] **Step 4: Commit** — `git add src/services/eventAdapter.ts src/stores/agentRuntimeStore.ts && git commit -m "feat(frontend): RQ-3 eventAdapter + agentRuntimeStore"`

---

### Task 4: AgentLibrary.tsx + AgentWorkspace.tsx

**Files:** Create `src/components/agentRuntime/AgentLibrary.tsx`, `AgentWorkspace.tsx`

- [ ] **Step 1: AgentLibrary** — 创建 `src/components/agentRuntime/AgentLibrary.tsx`(应用库列 agent):
```tsx
import React, { useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const AgentLibrary: React.FC = () => {
  const { agents, currentAgentId, selectAgent, loadAgents, isLoadingAgents } = useAgentRuntimeStore();

  useEffect(() => {
    if (agents.length === 0) loadAgents();
  }, []);

  return (
    <div style={{ width: 220, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>应用库</div>
      {isLoadingAgents && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>加载中...</div>}
      {agents.map(a => (
        <div
          key={a.id}
          onClick={() => selectAgent(a.id)}
          style={{
            padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${currentAgentId === a.id ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
            background: currentAgentId === a.id ? 'rgba(91,156,245,0.1)' : 'var(--bg-base)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{a.description}</div>
          <span style={{ fontSize: 9, background: 'var(--bg-deep)', padding: '0 5px', borderRadius: 3, color: 'var(--text-tertiary)' }}>{a.workspace.type}</span>
        </div>
      ))}
    </div>
  );
};

export default AgentLibrary;
```

- [ ] **Step 2: AgentWorkspace** — 创建 `src/components/agentRuntime/AgentWorkspace.tsx`(工作区:对话 + 事件流):
```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const AgentWorkspace: React.FC = () => {
  const { agents, currentAgentId, workspaceMessages, workspaceStreaming, workspaceEvents, workspaceRunning, runWorkspace, resetWorkspace } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const agent = agents.find(a => a.id === currentAgentId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [workspaceMessages, workspaceStreaming]);

  const send = () => {
    if (!input.trim() || workspaceRunning) return;
    runWorkspace(input.trim());
    setInput('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>{agent?.name || '未选'}</strong> <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{agent?.description}</span></div>
        <button onClick={resetWorkspace} style={btnStyle}>新对话</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {workspaceMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: m.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-surface)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {m.content}
          </div>
        ))}
        {workspaceStreaming && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: 'var(--bg-surface)', whiteSpace: 'pre-wrap' }}>{workspaceStreaming}</div>
        )}
        {workspaceEvents.length > 0 && (
          <div style={{ alignSelf: 'stretch', background: 'var(--bg-deep)', borderRadius: 8, padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            {workspaceEvents.map((e, i) => <div key={i}>• {e.label}</div>)}
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="输入消息..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
        />
        <button onClick={send} disabled={workspaceRunning || !currentAgentId} style={{ ...btnStyle, opacity: (workspaceRunning || !currentAgentId) ? 0.5 : 1 }}>
          {workspaceRunning ? '运行中...' : '发送'}
        </button>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-default)',
  background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 12,
};

export default AgentWorkspace;
```

- [ ] **Step 3: typecheck** — Run: `npm run typecheck` → 无错

- [ ] **Step 4: Commit** — `git add src/components/agentRuntime && git commit -m "feat(frontend): RQ-3 AgentLibrary + AgentWorkspace 组件"`

---

### Task 5: AssistantSidebar.tsx

**Files:** Create `src/components/agentRuntime/AssistantSidebar.tsx`

- [ ] **Step 1: 实现** — 创建 `src/components/agentRuntime/AssistantSidebar.tsx`:
```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const AssistantSidebar: React.FC = () => {
  const { assistantMessages, assistantStreaming, assistantRunning, runAssistant } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [assistantMessages, assistantStreaming]);

  const send = () => {
    if (!input.trim() || assistantRunning) return;
    runAssistant(input.trim());
    setInput('');
  };

  return (
    <div style={{ width: 280, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <strong style={{ fontSize: 13 }}>项目助手</strong>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>关于本平台的疑问</div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {assistantMessages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 8 }}>你好!我是项目助手,可以问我怎么用 Context Lab、各 agent 是什么。</div>
        )}
        {assistantMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: m.role === 'user' ? 'var(--accent-violet)' : 'var(--bg-base)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {m.content}
          </div>
        ))}
        {assistantStreaming && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: 'var(--bg-base)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{assistantStreaming}</div>
        )}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="问助手..."
          style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12 }}
        />
        <button onClick={send} disabled={assistantRunning} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--accent-violet)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, opacity: assistantRunning ? 0.5 : 1 }}>
          {assistantRunning ? '...' : '➤'}
        </button>
      </div>
    </div>
  );
};

export default AssistantSidebar;
```

- [ ] **Step 2: typecheck + Commit** — `npm run typecheck` 无错后:`git add src/components/agentRuntime/AssistantSidebar.tsx && git commit -m "feat(frontend): RQ-3 AssistantSidebar 组件"`

---

### Task 6: AgentRuntimeView.tsx + App.tsx 接入

**Files:** Create `src/components/agentRuntime/AgentRuntimeView.tsx`; Modify `src/App.tsx`

- [ ] **Step 1: AgentRuntimeView** — 创建 `src/components/agentRuntime/AgentRuntimeView.tsx`(三栏布局):
```tsx
import React from 'react';
import AgentLibrary from './AgentLibrary';
import AgentWorkspace from './AgentWorkspace';
import AssistantSidebar from './AssistantSidebar';

const AgentRuntimeView: React.FC = () => {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <AgentLibrary />
      <AgentWorkspace />
      <AssistantSidebar />
    </div>
  );
};

export default AgentRuntimeView;
```

- [ ] **Step 2: App.tsx 接入** — 修改 `src/App.tsx`:
  - import 加:`import AgentRuntimeView from './components/agentRuntime/AgentRuntimeView';`
  - `useState<'chat' | 'history'>` 改成 `useState<'chat' | 'history' | 'agentRuntime'>`
  - Header 加一个切换 agentRuntime 的按钮(在历史按钮旁),style 参考现有按钮:
    ```tsx
    <button
      onClick={() => setView(view === 'agentRuntime' ? 'chat' : 'agentRuntime')}
      title="智能体平台"
      style={{ width: 32, height: 32, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, color: view === 'agentRuntime' ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    </button>
    ```
  - main 区的 view 判断加 agentRuntime 分支:
    ```tsx
    {view === 'history' ? (
      <HistoryPage onBack={() => setView('chat')} />
    ) : view === 'agentRuntime' ? (
      <AgentRuntimeView />
    ) : (
      <>
        <ChatInteraction key={currentSessionId} />
        {conversationHistory.length > 0 && <BottomPanel />}
      </>
    )}
    ```

- [ ] **Step 3: typecheck + build** — Run: `npm run typecheck && npm run build` → 无错

- [ ] **Step 4: Commit** — `git add src/components/agentRuntime/AgentRuntimeView.tsx src/App.tsx && git commit -m "feat(frontend): RQ-3 AgentRuntimeView 三栏布局 + App view 接入"`

---

### Task 7: 端到端 dev server 验证

**Files:** 无新文件(启动验证)

- [ ] **Step 1: 启动后端** — `cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000`(保持运行)

- [ ] **Step 2: 启动前端 dev server** — `npm run dev`(端口 5173,vite proxy 转发 /api)

- [ ] **Step 3: vite proxy 确认** — 检查 `vite.config.ts` 有 `/api` proxy → `localhost:8000`(现有 /api/db 应已配,确认 /api/agents 也走同 proxy;FastAPI 同一 app,共用 /api 前缀即可)

- [ ] **Step 4: 手动验证清单**(执行者用 webapp-testing skill 或描述给主控):
  - 打开 http://localhost:5173,Header 看到「智能体平台」齿轮按钮,点击切到 agentRuntime 视图
  - 左栏应用库显示 echo + assistant 两个 agent
  - 选 echo,输入"你好",点发送 → 中间工作台显示 "Echo: 你好"(流式)
  - 右栏助手输入"这个平台是什么" → 助手回复(调 LLM;若代理 502 显示 [错误])
  - 事件流面板显示事件(thinking/tool/token 等若有)

- [ ] **Step 5: 修复发现的问题(若有)** + commit

- [ ] **Step 6: 全量测试** — 后端 `... pytest -q` + 前端 `npm run typecheck` 全绿

---

## 完成标准(RQ-3 DoD)

- [ ] 后端 assistant_agent 注册并工作(mock provider 测试通过)
- [ ] 前端 agentRuntimeApi + eventAdapter + agentRuntimeStore
- [ ] AgentLibrary + AgentWorkspace + AssistantSidebar + AgentRuntimeView 四组件
- [ ] App.tsx 加 agentRuntime view + Header 入口
- [ ] typecheck + build 通过
- [ ] 端到端:dev server 上能切到 agentRuntime 视图,选 echo 看流式回复,助手能调(代理通时)

## 后续衔接

- RQ-4:anysearch 工具迁移(助手能用工具)+ 助手写操作
- 可视化复用(TimelineReplay 等)完善:eventAdapter → TimelineStep 映射
- 现有 agentService 迁移(RQ-6)
