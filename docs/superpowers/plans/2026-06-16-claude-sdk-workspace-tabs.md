# AgentWorkspace 容器化 + claude-sdk tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AgentWorkspace 从硬编码 chat 改通用容器(形态由 agent.workspace.type 驱动);claude-sdk 作为首个 tabs 型 agent(tab1 对话 + tab2 工作目录/文件),tab2 工作目录 = agent cwd,根目录约束 + 切换确认。

**Architecture:** 后端加 files API(列目录 + 根校验)+ claude_sdk_agent cwd 可配;前端拆 ChatWorkspace(对话)/ TabsWorkspace(tab 容器)/ FilesPanel(文件浏览),AgentWorkspace 按 workspace.type 分发;store 加 workspaceCwd,runWorkspace 传 cwd → AgentTask.config.cwd → agent。

**Tech Stack:** 后端 Python FastAPI + pytest;前端 React + Zustand + vitest + @testing-library/react

**关键约束(来自 spec `2026-06-16-claude-sdk-workspace-tabs-design.md`):**
- 工作目录必须根目录下(默认 `D:\我的个人区间\Projects\`,config root_dir 可配)
- 切换工作目录需确认对话框
- 文件列表只读(文件名/修改时间/大小/类型)
- chat 形态改进(markdown/宽列等)不在本 plan,独立后续

---

### Task 1: 后端 files API + config root_dir

**Files:**
- Modify: `backend/config.py`(加 root_dir)
- Create: `backend/routers/files.py`
- Modify: `backend/main.py`(挂载 router)
- Create: `backend/tests/test_files.py`

- [ ] **Step 1: config.py 加 root_dir**

`backend/config.py` 的 `Settings` 类,在 `llm_model` 后加:

```python
    # 工作目录根约束(claude-sdk agent 工作目录必须在其下)
    root_dir: str = r"D:\我的个人区间\Projects"
```

- [ ] **Step 2: 写失败测试 —— 列目录 + 根校验**

`backend/tests/test_files.py`:

```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_files_within_root(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.txt").write_text("x")
    (tmp_path / "sub").mkdir()
    resp = client.get("/api/files", params={"dir": str(tmp_path)})
    assert resp.status_code == 200
    names = [f["name"] for f in resp.json()]
    assert "a.txt" in names
    assert "sub" in names


def test_list_files_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    resp = client.get("/api/files", params={"dir": r"C:\Windows"})
    assert resp.status_code == 403


def test_list_files_dirs_first(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "z.txt").write_text("x")
    (tmp_path / "a_dir").mkdir()
    resp = client.get("/api/files", params={"dir": str(tmp_path)})
    items = resp.json()
    # 目录优先
    assert items[0]["is_dir"] is True
    assert items[0]["name"] == "a_dir"
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -v`
Expected: FAIL —— 404(无 /api/files 端点)

- [ ] **Step 4: 实现 routers/files.py**

`backend/routers/files.py`:

```python
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import settings

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("")
def list_files(dir: str):
    root = Path(settings.root_dir).resolve()
    try:
        target = Path(dir).resolve()
        target.relative_to(root)  # 不在 root 下 → ValueError
    except (ValueError, OSError):
        raise HTTPException(status_code=403, detail="dir must be under root_dir")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="not a directory")
    items = []
    for entry in os.scandir(target):
        st = entry.stat()
        items.append({
            "name": entry.name,
            "mtime": int(st.st_mtime),
            "size": st.st_size,
            "is_dir": entry.is_dir(),
        })
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return items
```

- [ ] **Step 5: main.py 挂载**

`backend/main.py`:

import 改(加 files):
```python
from routers import sessions, migrate, files
```

挂载(在 `app.include_router(agents_router)` 后):
```python
app.include_router(files.router)
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -v`
Expected: PASS(3 个)

- [ ] **Step 7: Commit**

```bash
git add backend/config.py backend/routers/files.py backend/main.py backend/tests/test_files.py
git commit -m "feat(tabs): files API(列目录 + 根校验)+ config root_dir"
```

---

### Task 2: claude_sdk_agent cwd 可配(从 config 读)

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`(`_build_options` cwd 从 config 读)
- Modify: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: 写失败测试 —— _build_options cwd**

追加到 `backend/tests/test_claude_sdk_agent.py`:

```python
def test_build_options_uses_config_cwd():
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.agent import AgentTask
    agent = ClaudeSdkAgent()
    opts = agent._build_options(AgentTask(messages=[], config={"cwd": "/some/path"}))
    assert opts.cwd == "/some/path"


def test_build_options_default_cwd():
    from runtime.claude_sdk_agent import ClaudeSdkAgent, _SANDBOX_DIR
    from runtime.agent import AgentTask
    agent = ClaudeSdkAgent()
    opts = agent._build_options(AgentTask(messages=[]))
    assert opts.cwd == _SANDBOX_DIR
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_build_options_uses_config_cwd tests/test_claude_sdk_agent.py::test_build_options_default_cwd -v`
Expected: FAIL —— `_build_options` 当前 cwd=_SANDBOX_DIR 写死,不读 config

- [ ] **Step 3: 实现 —— cwd 从 config 读**

`backend/runtime/claude_sdk_agent.py` 的 `_build_options`,把 `cwd=_SANDBOX_DIR` 改为:

```python
            cwd=(task.config or {}).get("cwd") or _SANDBOX_DIR,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(tabs): claude_sdk_agent cwd 从 task.config 读(默认 sandbox)"
```

---

### Task 3: 前端 cwd 联动(store workspaceCwd + runAgent 传 cwd)

**Files:**
- Modify: `src/services/agentRuntimeApi.ts`(runAgent 加 cwd)
- Modify: `src/stores/agentRuntimeStore.ts`(workspaceCwd + setter + runWorkspace 传)
- Modify: `src/stores/agentRuntimeStore.test.ts`(加测试)

- [ ] **Step 1: 写失败测试 —— runWorkspace 传 cwd**

追加到 `src/stores/agentRuntimeStore.test.ts`(顶部已 mock agentRuntimeApi/dbApi/eventAdapter):

```typescript
  it('runWorkspace passes workspaceCwd to runAgent', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, onEvent: any, onDone: any) => {
      onDone();
    });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'echo',
      workspaceSessionId: 's1',
      workspaceCwd: 'D:/proj',
      workspaceMessages: [],
    });
    await useAgentRuntimeStore.getState().runWorkspace('hi');
    expect(runAgent).toHaveBeenCalledWith('echo', expect.any(Array), 'D:/proj', expect.any(Function), expect.any(Function), expect.any(Function));
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: FAIL —— runAgent 当前签名没 cwd,或 runWorkspace 没传

- [ ] **Step 3: 实现 —— runAgent 加 cwd + store workspaceCwd**

`src/services/agentRuntimeApi.ts` 的 `runAgent`,签名加 cwd(在 messages 后),body 加 cwd:

```typescript
export async function runAgent(
  agentId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  cwd: string | null,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const resp = await fetch(`${BASE}/${agentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, cwd }),
  });
  // ... 其余不变 ...
```

`src/stores/agentRuntimeStore.ts`:

interface 加字段 + setter:
```typescript
  workspaceCwd: string | null;
  setWorkspaceCwd: (cwd: string | null) => void;
```

state 加 `workspaceCwd: null`。

加 setter(在 resetWorkspace 附近):
```typescript
  setWorkspaceCwd: (cwd) => set({ workspaceCwd: cwd }),
```

`runWorkspace` 调 runAgent 加 cwd 参数:
```typescript
    await runAgent(
      agentId,
      messages.map(m => ({ role: m.role, content: m.content })),
      get().workspaceCwd,
      (ev) => { ... },
      () => { ... },
      (err) => { ... },
    );
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agentRuntimeApi.ts src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(tabs): store workspaceCwd + runAgent 传 cwd(cwd 联动链路)"
```

---

### Task 4: ChatWorkspace 抽出 + AgentWorkspace 容器化

**Files:**
- Create: `src/components/agentRuntime/ChatWorkspace.tsx`(从 AgentWorkspace 抽对话)
- Modify: `src/components/agentRuntime/AgentWorkspace.tsx`(容器化,chat 分发)

- [ ] **Step 1: 创建 ChatWorkspace.tsx(从现 AgentWorkspace 抽对话部分)**

`src/components/agentRuntime/ChatWorkspace.tsx` —— 把现 `AgentWorkspace.tsx` 的全部内容(header + 消息 + 输入 + send 逻辑)原样搬来,组件名改 `ChatWorkspace`:

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-default)',
  background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 12,
};

const ChatWorkspace: React.FC = () => {
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

export default ChatWorkspace;
```

- [ ] **Step 2: AgentWorkspace.tsx 容器化(chat 分发)**

`src/components/agentRuntime/AgentWorkspace.tsx` —— 整个文件替换为容器(按 workspace.type 分发;本 task 先 chat 分发,tabs 留 Task 5):

```typescript
import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';

const AgentWorkspace: React.FC = () => {
  const { agents, currentAgentId } = useAgentRuntimeStore();
  const agent = agents.find(a => a.id === currentAgentId);
  // tabs 型由 Task 5 的 TabsWorkspace 处理;本 task 先全走 ChatWorkspace
  if (agent?.workspace?.type === 'tabs') return <ChatWorkspace />;
  return <ChatWorkspace />;
};

export default AgentWorkspace;
```

> 注:本 task tabs 暂走 ChatWorkspace(占位),Task 5 加 TabsWorkspace 后改回。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无错

- [ ] **Step 4: 跑现有测试确认不回归**

Run: `npm run test:run -- src/components/HistoryPage.test.tsx src/stores/agentRuntimeStore.test.ts`
Expected: PASS(现有测试不回归)

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/AgentWorkspace.tsx
git commit -m "feat(tabs): ChatWorkspace 抽出 + AgentWorkspace 容器化(chat 分发)"
```

---

### Task 5: TabsWorkspace(tab 容器)+ AgentWorkspace 分发 tabs

**Files:**
- Create: `src/components/agentRuntime/TabsWorkspace.tsx`
- Modify: `src/components/agentRuntime/AgentWorkspace.tsx`(tabs 分发 TabsWorkspace)
- Modify: `src/components/agentRuntime/AgentLibrary.tsx`(显示 workspace.type 标签已是 chat/tabs,确认)

- [ ] **Step 1: 创建 TabsWorkspace.tsx**

`src/components/agentRuntime/TabsWorkspace.tsx`:

```typescript
import React, { useState } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';
import FilesPanel from './FilesPanel';

const TabsWorkspace: React.FC = () => {
  const { agents, currentAgentId } = useAgentRuntimeStore();
  const agent = agents.find(a => a.id === currentAgentId);
  const tabs = (agent?.workspace as any)?.tabs || ['对话'];
  const [active, setActive] = useState(tabs[0]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-subtle)', padding: '0 16px' }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            style={{
              padding: '10px 16px', background: 'transparent', cursor: 'pointer',
              border: 'none', borderBottom: active === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: active === t ? 'var(--accent-blue)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 500,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {active === '对话' && <ChatWorkspace />}
        {active === '文件' && <FilesPanel />}
      </div>
    </div>
  );
};

export default TabsWorkspace;
```

> 注:FilesPanel 由 Task 6 创建。本 task 先引用,Task 6 实现后才能 typecheck 通过 —— 所以本 task 暂用占位 `{active === '文件' && <div>文件(Task 6)</div>}`,Task 6 替换为 FilesPanel。

**本 task 先用占位**(避免引用不存在的 FilesPanel):
```typescript
        {active === '文件' && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>文件面板(Task 6)</div>}
```

- [ ] **Step 2: AgentWorkspace.tsx tabs 分发**

`src/components/agentRuntime/AgentWorkspace.tsx`,把 tabs 分发改回 TabsWorkspace:

```typescript
import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';
import TabsWorkspace from './TabsWorkspace';

const AgentWorkspace: React.FC = () => {
  const { agents, currentAgentId } = useAgentRuntimeStore();
  const agent = agents.find(a => a.id === currentAgentId);
  if (agent?.workspace?.type === 'tabs') return <TabsWorkspace />;
  return <ChatWorkspace />;
};

export default AgentWorkspace;
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无错

- [ ] **Step 4: Commit**

```bash
git add src/components/agentRuntime/TabsWorkspace.tsx src/components/agentRuntime/AgentWorkspace.tsx
git commit -m "feat(tabs): TabsWorkspace tab 容器 + AgentWorkspace 分发 tabs"
```

---

### Task 6: FilesPanel(tab2 工作目录 + 切换确认 + 文件列表)

**Files:**
- Create: `src/components/agentRuntime/FilesPanel.tsx`
- Modify: `src/services/dbApi.ts`(加 listFiles)
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`(占位换 FilesPanel)

- [ ] **Step 1: dbApi 加 listFiles**

`src/services/dbApi.ts` 的 `dbApi` 对象加:

```typescript
  listFiles: (dir: string) =>
    req<Array<{ name: string; mtime: number; size: number; is_dir: boolean }>>(`/files?dir=${encodeURIComponent(dir)}`),
```

- [ ] **Step 2: 创建 FilesPanel.tsx**

`src/components/agentRuntime/FilesPanel.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { dbApi } from '../../services/dbApi';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-primary)', flex: 1,
};

const FilesPanel: React.FC = () => {
  const { workspaceCwd, setWorkspaceCwd } = useAgentRuntimeStore();
  const [input, setInput] = useState(workspaceCwd || '');
  const [files, setFiles] = useState<Array<{ name: string; mtime: number; size: number; is_dir: boolean }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async (dir: string) => {
    setLoading(true); setError('');
    try {
      setFiles(await dbApi.listFiles(dir));
    } catch (e: any) {
      setError(e?.message || '加载失败(可能不在根目录下)');
      setFiles([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (workspaceCwd) load(workspaceCwd); }, []);

  const switchDir = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!window.confirm(`将切换工作目录到:\n${trimmed}\n\nagent 的 Read/Edit/Bash 都将在此目录操作,确认?`)) return;
    setWorkspaceCwd(trimmed);
    load(trimmed);
  };

  const fmtTime = (t: number) => new Date(t * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtSize = (s: number) => s < 1024 ? `${s} B` : s < 1024 * 1024 ? `${(s / 1024).toFixed(1)} KB` : `${(s / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inputStyle} placeholder="工作目录(必须在根目录 D:\我的个人区间\Projects 下)" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && switchDir()} />
        <button onClick={switchDir} style={{ padding: '6px 14px', borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>切换</button>
      </div>
      {error && <div style={{ color: 'var(--accent-violet)', fontSize: 12 }}>{error}</div>}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        {loading && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>加载中…</div>}
        {!loading && files.length === 0 && !error && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>空目录(先切换到有效工作目录)</div>}
        {files.map(f => (
          <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
            <span style={{ color: f.is_dir ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{f.is_dir ? '📁 ' : '📄 '}{f.name}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{fmtTime(f.mtime)} · {f.is_dir ? '-' : fmtSize(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilesPanel;
```

- [ ] **Step 3: TabsWorkspace 占位换 FilesPanel**

`src/components/agentRuntime/TabsWorkspace.tsx`,把占位行:
```typescript
        {active === '文件' && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>文件面板(Task 6)</div>}
```
改为:
```typescript
        {active === '文件' && <FilesPanel />}
```
(顶部 import 已有 `import FilesPanel from './FilesPanel';` —— Task 5 占位时注释掉了,取消注释 / 加 import)

> TabsWorkspace 顶部 import 加(若 Task 5 占位时没加):`import FilesPanel from './FilesPanel';`

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/FilesPanel.tsx src/services/dbApi.ts src/components/agentRuntime/TabsWorkspace.tsx
git commit -m "feat(tabs): FilesPanel(工作目录设置 + 切换确认 + 文件列表)"
```

---

### Task 7: claude-sdk metadata 改 tabs(切 tabs 型)

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`(metadata workspace tabs)
- Modify: `backend/tests/test_claude_sdk_agent.py`(metadata 测试)

- [ ] **Step 1: 写失败测试 —— metadata tabs**

追加到 `backend/tests/test_claude_sdk_agent.py`:

```python
def test_claude_sdk_agent_metadata_tabs():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    assert agent.metadata.workspace == {"type": "tabs", "tabs": ["对话", "文件"]}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_claude_sdk_agent_metadata_tabs -v`
Expected: FAIL —— 当前 workspace={"type":"chat"}

- [ ] **Step 3: 实现 —— metadata workspace tabs**

`backend/runtime/claude_sdk_agent.py` 的 metadata,把 `workspace={"type": "chat"}` 改为:

```python
        workspace={"type": "tabs", "tabs": ["对话", "文件"]},
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: PASS(注意:`test_claude_sdk_agent_metadata` 旧测试断言 `workspace == {"type":"chat"}`,要更新为新值)

> 若 `test_claude_sdk_agent_metadata` 旧断言失败,把 `assert m.workspace == {"type": "chat"}` 改为 `assert m.workspace == {"type": "tabs", "tabs": ["对话", "文件"]}`。

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(tabs): claude-sdk metadata 改 tabs 型(对话/文件)"
```

---

### Task 8: 全测试 + 手动验证

**Files:**
- 无新文件(验证 + 跟踪矩阵)

- [ ] **Step 1: 后端全测试**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -v`
Expected: 全 PASS(含 test_files 新 + 原)

- [ ] **Step 2: 前端 typecheck + 关键测试**

Run: `npm run typecheck && npm run test:run -- src/stores/agentRuntimeStore.test.ts src/components/HistoryPage.test.tsx`
Expected: typecheck 无错 + 测试 PASS(前端全测的 13 failed 技术债非本次回归)

- [ ] **Step 3: 手动验证(前后端启动)**

启动后端(确保 ANTHROPIC env)+ 前端,浏览器验证:
1. 选 **Claude SDK Agent** → 工作区显示 **tabs**(对话 / 文件)
2. tab1「对话」:发消息,正常对话 + 流式
3. tab2「文件」:输入工作目录(如 `D:\我的个人区间\Projects\context-lab`)→ 点切换 → **确认对话框** → 确认 → 文件列表显示(文件名/时间/大小/类型)
4. 输入根目录外的路径(如 `C:\Windows`)→ 切换 → 拒绝(403 / 错误提示)
5. 切换工作目录后,tab1 对话让 agent "列出当前目录文件" → agent 在新 cwd 操作(Read/Bash 列的是新目录)

- [ ] **Step 4: 更新跟踪矩阵**

`项目执行跟踪矩阵.md` 加本次需求条目(workspace 容器化 + claude-sdk tabs)。

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "chore(tabs): 跟踪矩阵补录 workspace 容器化 + claude-sdk tabs"
```

---

## 验证清单(执行完所有 Task)

- [ ] 后端 pytest 全绿(含 test_files)
- [ ] 前端 typecheck 无错 + agentRuntimeStore/HistoryPage 测试 PASS
- [ ] 手动:claude-sdk tabs(tab1 对话 + tab2 文件)+ 工作目录切换确认 + 根校验 + cwd 联动(agent 在新目录操作)
- [ ] 其他 agent(echo/research/assistant)仍 chat 型(ChatWorkspace),不回归

## 已知风险

1. **bypassPermissions + 自定义 cwd**:用户设根目录内任意子目录,agent 在那 Bash/Edit。根约束(必须 Projects 下)+ 切换确认缓解,但仍比固定 sandbox 风险高(用户授权范围内)
2. **路径跨平台**:Windows 路径(反斜杠)+ 正斜杠混用。files API 用 Path.resolve() 规范化,应能处理;手动验证覆盖
3. **TabsWorkspace tab 名约定**:目前硬编码"对话"→ChatWorkspace、"文件"→FilesPanel。未来 agent 想用别的 tab 名要扩展映射(本 plan 不做,claude-sdk 用这俩)
4. **chat 改进延后**:tab1 对话仍朴素(纯文本气泡,无 markdown/宽列),独立 spec 改进
