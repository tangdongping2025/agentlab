# agent runtime 会话持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** agent runtime 每个 workspace agent 一个累积会话,落 MySQL,切换 agent 恢复各自历史;HistoryPage 按 agent 筛选 + 颜色标签,不再显示老会话。

**Architecture:** `sessions` 表加 `agent_id`(每 agent 一个 session,按 agent_id 查/建);`agentRuntimeStore` 去掉 `workspaceByAgent` 内存 → 改 MySQL(selectAgent 加载/创建 session,runWorkspace 乐观更新+异步落库);HistoryPage 加 agent 下拉筛选 + 颜色标签 + 过滤 agent_id=null。后端先行(T1-T3),前端跟(T4-T6)。

**Tech Stack:** 后端 Python FastAPI + SQLAlchemy + pytest(conftest 连 context_lab_test);前端 React + Zustand + vitest + @testing-library/react

**关键约束(来自 spec `2026-06-15-agent-runtime-session-persistence-design.md`):**
- 每 agent 一个累积会话(1 agent = 1 session,按 agent_id 查;没则 create)
- 只 workspace agent;assistant 不动;老体系 view='chat' 保留(其会话 agent_id=null,HistoryPage 过滤)
- message 只存 role+content;observability 不持久化
- 持久化策略:乐观更新内存 + 异步落库(复刻 appStore 模式)

---

### Task 1: SessionModel 加 agent_id 字段

**Files:**
- Modify: `backend/models.py`(SessionModel 加 agent_id)
- Test: `backend/tests/test_sessions_crud.py`(加测试)

- [ ] **Step 1: 写失败测试 —— SessionModel 存取 agent_id**

追加到 `backend/tests/test_sessions_crud.py` 末尾:

```python
def test_session_model_persists_agent_id(db):
    """SessionModel 能存取 agent_id(agent runtime 会话的 agent 标识)。"""
    import models
    sess = models.SessionModel(id="s-agent-test", agent_id="claude-sdk", total_tokens=0)
    db.add(sess)
    db.commit()
    got = db.query(models.SessionModel).filter_by(agent_id="claude-sdk").first()
    assert got is not None
    assert got.agent_id == "claude-sdk"


def test_session_model_agent_id_nullable(db):
    """老会话 agent_id 为 null(向后兼容)。"""
    import models
    sess = models.SessionModel(id="s-null-test", agent_id=None, total_tokens=0)
    db.add(sess)
    db.commit()
    got = db.get(models.SessionModel, "s-null-test")
    assert got.agent_id is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py::test_session_model_persists_agent_id tests/test_sessions_crud.py::test_session_model_agent_id_nullable -v`
Expected: FAIL —— `TypeError: 'agent_id' is an invalid keyword argument` 或 AttributeError(SessionModel 还没 agent_id)

- [ ] **Step 3: 实现 —— SessionModel 加 agent_id**

`backend/models.py` 的 `SessionModel` 类,在 `updated_at` 字段后加:

```python
    agent_id = Column(String(64), nullable=True, index=True)
```

(放在 `total_tokens` 之后、`created_at` 之前均可,字段顺序不影响。)

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py -v`
Expected: PASS(含新 2 个 + 原有 sessions_crud 测试)。conftest 的 `Base.metadata.create_all` 会自动在 test 库建含 agent_id 的表。

- [ ] **Step 5: 记录生产迁移(部署文档)**

在 `docs/deploy-mysql.md` 末尾加一节(生产库要手动 ALTER):

```markdown
## sessions 表加 agent_id(2026-06-15)

agent runtime 会话持久化需要 agent_id 列。生产 my-mysql 的 context_lab 库执行:

```sql
ALTER TABLE sessions ADD COLUMN agent_id VARCHAR(64) NULL;
CREATE INDEX idx_sessions_agent_id ON sessions(agent_id);
```

老会话 agent_id 保持 NULL(向后兼容,HistoryPage 过滤不显示)。
```

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/tests/test_sessions_crud.py docs/deploy-mysql.md
git commit -m "feat(persist): SessionModel 加 agent_id 字段 + 生产迁移说明"
```

---

### Task 2: schemas 加 agentId

**Files:**
- Modify: `backend/schemas.py`(SessionCreate/Update/Out/ListItem 加 agentId)
- Test: `backend/tests/test_sessions_crud.py`(加测试)

- [ ] **Step 1: 写失败测试 —— schema 带 agentId**

追加到 `backend/tests/test_sessions_crud.py`:

```python
def test_session_create_schema_has_agent_id():
    from schemas import SessionCreate, SessionUpdate
    c = SessionCreate(agentId="claude-sdk")
    assert c.agentId == "claude-sdk"
    u = SessionUpdate(agentId="echo")
    assert u.agentId == "echo"


def test_session_out_schema_has_agent_id():
    from schemas import SessionOut, SessionListItem
    o = SessionOut(id="s1", agentId="claude-sdk")
    assert o.agentId == "claude-sdk"
    li = SessionListItem(id="s1", agentId="claude-sdk", preview="x")
    assert li.agentId == "claude-sdk"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py::test_session_create_schema_has_agent_id tests/test_sessions_crud.py::test_session_out_schema_has_agent_id -v`
Expected: FAIL —— agentId 不存在(ValidationError 或 AttributeError)

- [ ] **Step 3: 实现 —— 4 个 schema 加 agentId**

`backend/schemas.py`:

`SessionCreate`(在 `contextSize` 后):
```python
    agentId: Optional[str] = None
```

`SessionUpdate`(在 `messages` 前):
```python
    agentId: Optional[str] = None
```

`SessionOut`(在 `totalTokens` 后):
```python
    agentId: Optional[str] = None
```

`SessionListItem`(在 `preview` 后):
```python
    agentId: Optional[str] = None
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/schemas.py backend/tests/test_sessions_crud.py
git commit -m "feat(persist): schemas 4 个 Session schema 加 agentId"
```

---

### Task 3: routers/sessions 处理 agent_id(create/query/update/out)

**Files:**
- Modify: `backend/routers/sessions.py`(create 写 agent_id、query agent 筛选、update、_to_session_out)
- Test: `backend/tests/test_query.py`(query agent 筛选)+ `test_sessions_crud.py`(create/out)

- [ ] **Step 1: 写失败测试 —— create 带 agent_id + query 筛选 + out 返回**

追加到 `backend/tests/test_sessions_crud.py`:

```python
def test_create_session_persists_agent_id(client, db):
    """create_session 带 agentId 落库,SessionOut 返回 agentId。"""
    resp = client.post("/api/db/sessions", json={"id": "s-create-agent", "agentId": "claude-sdk"})
    assert resp.status_code == 200
    assert resp.json()["agentId"] == "claude-sdk"
    import models
    got = db.get(models.SessionModel, "s-create-agent")
    assert got.agent_id == "claude-sdk"
```

追加到 `backend/tests/test_query.py`(文件顶部已有 `from fastapi.testclient import TestClient` 等,看现有 import 风格;若用 `client` fixture 同 conftest):

```python
def test_query_sessions_filter_by_agent(client, db):
    """query_sessions 的 agent 参数筛选 agent_id。"""
    import models
    db.add(models.SessionModel(id="q-a", agent_id="claude-sdk", total_tokens=0))
    db.add(models.SessionModel(id="q-b", agent_id="echo", total_tokens=0))
    db.add(models.SessionModel(id="q-old", agent_id=None, total_tokens=0))
    db.commit()
    resp = client.get("/api/db/sessions/query", params={"agent": "claude-sdk"})
    assert resp.status_code == 200
    ids = [it["id"] for it in resp.json()["items"]]
    assert "q-a" in ids
    assert "q-b" not in ids
    assert "q-old" not in ids


def test_query_sessions_no_agent_returns_all_including_null(client, db):
    """不传 agent 时不过滤(含 null 老会话)。"""
    import models
    db.add(models.SessionModel(id="q-all-a", agent_id="echo", total_tokens=0))
    db.add(models.SessionModel(id="q-all-old", agent_id=None, total_tokens=0))
    db.commit()
    resp = client.get("/api/db/sessions/query")
    ids = [it["id"] for it in resp.json()["items"]]
    assert "q-all-a" in ids
    assert "q-all-old" in ids
```

> 注:test_query.py 现有测试都用 `(client, db)` 签名(conftest 提供 db fixture),query 用 `params={...}` 风格,本测试对齐。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_query.py tests/test_sessions_crud.py::test_create_session_persists_agent_id -v`
Expected: FAIL —— create 不写 agent_id / query 无 agent 筛选 / out 不返回 agentId

- [ ] **Step 3: 实现 —— create/update/_to_session_out/query**

`backend/routers/sessions.py`:

`create_session`(model 构造加 agent_id):
```python
    sess = models.SessionModel(
        id=payload.id or str(uuid4()),
        name=payload.name,
        scene_id=payload.sceneId,
        system_prompt=payload.systemPrompt,
        selected_tools=payload.selectedTools,
        context_strategy=payload.contextStrategy,
        context_size=payload.contextSize,
        agent_id=payload.agentId,
        total_tokens=0,
        created_at=now,
        updated_at=now,
    )
```

`_to_session_out`(SessionOut 构造加 agentId):
```python
    return SessionOut(
        id=sess.id,
        name=sess.name,
        sceneId=sess.scene_id,
        systemPrompt=sess.system_prompt,
        selectedTools=sess.selected_tools or [],
        contextStrategy=sess.context_strategy,
        contextSize=sess.context_size,
        agentId=sess.agent_id,
        totalTokens=sess.total_tokens or 0,
        messages=messages,
        createdAt=sess.created_at.isoformat() if sess.created_at else None,
        updatedAt=sess.updated_at.isoformat() if sess.updated_at else None,
    )
```

`query_sessions`(签名加 agent 参数 + where):
```python
def query_sessions(
    q: Optional[str] = None,
    scene: Optional[str] = None,
    agent: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    min_token: Optional[int] = None,
    max_token: Optional[int] = None,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
):
    stmt = select(models.SessionModel)
    # ... 现有 q/scene/start/end/min_token/max_token 筛选不动 ...
    if agent:
        stmt = stmt.where(models.SessionModel.agent_id == agent)
```

query 的 `SessionListItem` 构造加 `agentId`(在 items.append):
```python
        items.append(SessionListItem(
            id=sess.id, name=sess.name, sceneId=sess.scene_id, agentId=sess.agent_id, preview=preview,
            totalTokens=sess.total_tokens or 0,
            createdAt=sess.created_at.isoformat() if sess.created_at else None,
            updatedAt=sess.updated_at.isoformat() if sess.updated_at else None,
        ))
```

`update_session`(加 agent_id 更新,在现有字段更新后):
```python
    if payload.agentId is not None:
        sess.agent_id = payload.agentId
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_query.py tests/test_sessions_crud.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/sessions.py backend/tests/test_query.py backend/tests/test_sessions_crud.py
git commit -m "feat(persist): sessions 路由处理 agent_id(create/query/update/out)"
```

---

### Task 4: dbApi.ts 类型加 agent

**Files:**
- Modify: `src/services/dbApi.ts`(SessionListItem + QueryParams 加 agent)
- Test: `src/services/dbApi.test.ts`(加 querySessions agent 参数测试)

- [ ] **Step 1: 写失败测试 —— querySessions 带 agent 参数**

追加到 `src/services/dbApi.test.ts`:

```typescript
  it('querySessions passes agent param in query string', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, size: 20 }), { status: 200 })
    );
    await dbApi.querySessions({ agent: 'claude-sdk' });
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('agent=claude-sdk'),
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/services/dbApi.test.ts`
Expected: FAIL 或 Warning —— querySessions({agent}) 的 agent 没进 query string(QueryParams 还没 agent 字段,TS 报错或 URLSearchParams 过滤掉)

- [ ] **Step 3: 实现 —— types 加 agent**

`src/services/dbApi.ts`:

`SessionListItem` 加:
```typescript
  agentId?: string;
```

`QueryParams` 加:
```typescript
  agent?: string;
```

(querySessions 已用 URLSearchParams 过滤 undefined,加 agent 字段后会自动进 query string,无需改函数体。)

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/services/dbApi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/dbApi.ts src/services/dbApi.test.ts
git commit -m "feat(persist): dbApi SessionListItem/QueryParams 加 agent"
```

---

### Task 5: agentRuntimeStore 持久化(核心)

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`(去 workspaceByAgent,selectAgent 加载/创建 session,runWorkspace 落库)
- Test: `src/stores/agentRuntimeStore.test.ts`(新建)

- [ ] **Step 1: 写失败测试 —— selectAgent 加载/创建 session + runWorkspace 落库**

新建 `src/stores/agentRuntimeStore.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/agentRuntimeApi', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
  ]),
  runAgent: vi.fn(),
}));
vi.mock('../services/eventAdapter', () => ({
  toDisplayEvent: vi.fn(() => null),
  aggregateObservability: vi.fn(() => ({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null })),
}));

const querySessions = vi.fn();
const createSession = vi.fn();
const updateSession = vi.fn();
vi.mock('../services/dbApi', () => ({
  dbApi: { querySessions, createSession, updateSession: updateSession, getSession: vi.fn() },
}));

import { useAgentRuntimeStore } from './agentRuntimeStore';

describe('agentRuntimeStore persistence', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('selectAgent loads existing session by agent_id', async () => {
    querySessions.mockResolvedValue({
      items: [{ id: 'sess-echo', agentId: 'echo', messages: [
        { role: 'user', content: '旧问题' },
        { role: 'assistant', content: '旧回答' },
      ] }],
      total: 1, page: 1, size: 20,
    });
    useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });
    await useAgentRuntimeStore.getState().selectAgent('echo');
    expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ agent: 'echo' }));
    expect(useAgentRuntimeStore.getState().workspaceMessages.map(m => m.content)).toEqual(['旧问题', '旧回答']);
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('sess-echo');
  });

  it('selectAgent creates session when none exists', async () => {
    querySessions.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    createSession.mockResolvedValue({ id: 'new-echo', agentId: 'echo', messages: [] });
    useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });
    await useAgentRuntimeStore.getState().selectAgent('echo');
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'echo' }));
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('new-echo');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: FAIL —— selectAgent 不调 querySessions(还是内存 workspaceByAgent 逻辑),workspaceSessionId 不存在

- [ ] **Step 3: 实现 —— store 持久化改造**

`src/stores/agentRuntimeStore.ts`:

(a) 接口加 `workspaceSessionId`,且 `selectAgent` 改 async:
```typescript
interface AgentRuntimeState {
  // ... 现有字段 ...
  workspaceSessionId: string | null;  // 当前 agent 的 session id(持久化用)
  selectAgent: (id: string) => Promise<void>;  // 改 async(持久化加载)
  // ... 其他现有方法 ...
}
```

(b) 初始 state 加 `workspaceSessionId: null`。

(c) **去掉 `workspaceByAgent` 字段**(及初始值)—— 改用 MySQL。

(d) 重写 `selectAgent`(改 async,查/建 session):
```typescript
  selectAgent: async (id) => {
    const oldId = get().currentAgentId;
    if (oldId === id) return;
    // 加载(或创建)目标 agent 的 session
    let session = null;
    try {
      const res = await dbApi.querySessions({ agent: id, size: 1 });
      session = res.items[0] ? await dbApi.getSession(res.items[0].id) : null;
    } catch (e) { console.error('querySessions for agent failed', e); }
    if (!session) {
      const agent = get().agents.find(a => a.id === id);
      try {
        session = await dbApi.createSession({ agentId: id, name: agent?.name || id });
      } catch (e) { console.error('createSession failed', e); session = { id: '', messages: [] } as any; }
    }
    set({
      currentAgentId: id,
      workspaceSessionId: (session as any)?.id || null,
      workspaceMessages: ((session as any)?.messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
    });
  },
```
> 注:`selectAgent` 改 async。调用方(`AgentLibrary.tsx` 的 `onClick={() => selectAgent(a.id)}`)无需改(fire-and-forget)。但 `dbApi` 要 import。

(e) `runWorkspace` 的 `onDone` 回调:乐观更新 + 异步落库。把现有 onDone:
```typescript
      () => {
        const full = get().workspaceStreaming;
        const msgs = [...get().workspaceMessages, { role: 'assistant', content: full }];
        set({ workspaceMessages: msgs, workspaceStreaming: '', workspaceRunning: false });
      },
```
改为:
```typescript
      () => {
        const full = get().workspaceStreaming;
        const msgs = [...get().workspaceMessages, { role: 'assistant' as const, content: full }];
        set({ workspaceMessages: msgs, workspaceStreaming: '', workspaceRunning: false });
        // 异步落库(乐观更新已同步内存)
        const sid = get().workspaceSessionId;
        if (sid) {
          dbApi.updateSession(sid, { messages: msgs.map(m => ({ role: m.role, content: m.content })) }).catch(e => console.error('persist failed', e));
        }
      },
```

(f) `resetWorkspace`:清空该 agent session 的 messages:
```typescript
  resetWorkspace: () => {
    const sid = get().workspaceSessionId;
    set({ workspaceMessages: [], workspaceStreaming: '', workspaceEvents: [], workspaceObservability: EMPTY_OBS, workspaceRunning: false });
    if (sid) {
      dbApi.updateSession(sid, { messages: [] }).catch(e => console.error('reset persist failed', e));
    }
  },
```

(g) 顶部 import 加 `dbApi`:
```typescript
import { dbApi } from '../services/dbApi';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: PASS(2 个测试)

- [ ] **Step 5: typecheck 确认(去 workspaceByAgent 后无 TS 残留引用)**

Run: `npm run typecheck`
Expected: 无错(若 AgentRuntimeView 等引用 workspaceByAgent,一并清理)

- [ ] **Step 6: Commit**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(persist): agentRuntimeStore 持久化(selectAgent 加载/创建 session + runWorkspace 落库)"
```

---

### Task 6: HistoryPage agent 筛选 + 颜色标签 + 过滤老会话

**Files:**
- Modify: `src/components/HistoryPage.tsx`(agent 下拉 + 标签 + 过滤)
- Test: `src/components/HistoryPage.test.tsx`(加测试)

- [ ] **Step 1: 写失败测试 —— agent 筛选 + 标签显示**

追加到 `src/components/HistoryPage.test.tsx`:

```typescript
import { useAgentRuntimeStore } from '../stores/agentRuntimeStore';

describe('HistoryPage agent filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    mockedGet.mockResolvedValue({ id: '', messages: [] } as any);
    // 注入应用库 agent 列表
    useAgentRuntimeStore.setState({ agents: [
      { id: 'claude-sdk', name: 'Claude SDK Agent', description: '', workspace: { type: 'chat' }, capabilities: [] },
      { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
    ] });
  });

  it('renders agent filter dropdown with agent options', async () => {
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText(/全部 agent/i)).toBeInTheDocument();
  });

  it('shows agent tag on session item', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试', agentId: 'claude-sdk', preview: 'hi', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText('测试')).toBeInTheDocument();
    expect(screen.getByText('Claude SDK Agent')).toBeInTheDocument();  // agent 标签
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/components/HistoryPage.test.tsx`
Expected: FAIL —— 无 agent 下拉 / 无 agent 标签

- [ ] **Step 3: 实现 —— agent 下拉 + 颜色标签 + 过滤**

`src/components/HistoryPage.tsx`:

(a) 顶部 import 加:
```typescript
import { useAgentRuntimeStore } from '../stores/agentRuntimeStore';
```

(b) 组件内加 agent state + agents:
```typescript
  const agents = useAgentRuntimeStore(s => s.agents);
  const [agent, setAgent] = useState('');
```

(c) `runQuery` 的 params 加 agent:
```typescript
    if (agent) params.agent = agent;
```
(useCallback deps 加 `agent`)

(d) 筛选条加 agent 下拉(在 scene select 后):
```jsx
        <select style={inputStyle} value={agent} onChange={e => { setAgent(e.target.value); setPage(1); }}>
          <option value="">全部 agent</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
```

(e) 颜色映射辅助函数(组件外):
```typescript
const AGENT_COLORS = ['#5b9cf5', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#22d3ee'];
function agentColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[h % AGENT_COLORS.length];
}
```

(f) 列表项加 agent 标签(在 `{item.name || '未命名'}` 旁):
```jsx
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{item.name || '未命名'}</span>
                  {item.agentId && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      color: agentColor(item.agentId),
                      border: `1px solid ${agentColor(item.agentId)}40`,
                      background: `${agentColor(item.agentId)}14`,
                    }}>
                      {agents.find(a => a.id === item.agentId)?.name || item.agentId}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{fmt(item.updatedAt)}</span>
              </div>
```

> 过滤老会话:后端 query 传 agent 时天然只该 agent;不传 agent(全部)时,若要隐藏老的,前端 `items.filter(i => i.agentId)` —— 但 spec 说"全部"显示所有 agent runtime 会话(agent_id 非空),老的(agent_id=null)不显示。所以 query 不传 agent 时,前端过滤:
```typescript
    const visible = agent ? res.items : res.items.filter(i => i.agentId);
    setItems(visible);
```
(runQuery 里,setItems(visible) 替代 setItems(res.items))

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/components/HistoryPage.test.tsx`
Expected: PASS(原有 + 新 agent 测试)

- [ ] **Step 5: Commit**

```bash
git add src/components/HistoryPage.tsx src/components/HistoryPage.test.tsx
git commit -m "feat(persist): HistoryPage agent 筛选 + 颜色标签 + 过滤老会话"
```

---

### Task 7: 全测试回归 + 手动验证

**Files:**
- 无新文件(验证 + 部署)

- [ ] **Step 1: 后端全测试**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -v`
Expected: 全 PASS(含 health/migrate/query/sessions_crud/agents_api/agent_runtime/各 agent/llm_provider/tool_system/platform_tools/base_agent/claude_sdk)

- [ ] **Step 2: 前端全测试 + typecheck**

Run: `npm run test:run && npm run typecheck`
Expected: 全 PASS + 无 TS 错(注意 memory:App.test/appStore.test 是 pre-existing 技术债,若它们失败是已知,非本次回归)

- [ ] **Step 3: 生产迁移执行(部署)**

在 my-mysql 的 context_lab 库执行(见 deploy-mysql.md):
```sql
ALTER TABLE sessions ADD COLUMN agent_id VARCHAR(64) NULL;
CREATE INDEX idx_sessions_agent_id ON sessions(agent_id);
```
(本地 my-mysql 也要执行 —— memory:本地/线上共享同一个 MySQL,本地测试库 context_lab_test 由 conftest create_all 自动建,但正式库 context_lab 要手动 ALTER)

- [ ] **Step 4: 手动验证(前后端启动)**

启动后端(确保 ANTHROPIC env)+ 前端,浏览器验证:
1. 选 Claude SDK Agent,发几条消息 → 刷新页面 → 对话还在(从 MySQL 恢复)
2. 切到 Echo agent → 看到的是 echo 的历史(不是 claude-sdk 的)
3. 切回 Claude SDK Agent → 恢复之前对话
4. 点 header「历史」→ HistoryPage:
   - agent 下拉能筛选(选 Claude SDK Agent 只显示它的)
   - 列表项有颜色 agent 标签
   - 老会话(view='chat' 的)不显示

- [ ] **Step 5: 更新跟踪矩阵**

`项目执行跟踪矩阵.md` 时间线加本次需求条目(agent runtime 会话持久化)。

- [ ] **Step 6: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "chore(persist): 跟踪矩阵补录 agent runtime 会话持久化"
```

---

## 验证清单(执行完所有 Task)

- [ ] 后端 pytest 全绿
- [ ] 前端 vitest 全绿(除 pre-existing 技术债)+ typecheck 无错
- [ ] 生产 context_lab 库加了 agent_id 列
- [ ] 手动:agent 对话刷新后恢复 / 切换 agent 各自历史 / HistoryPage agent 筛选 + 标签 + 无老会话
- [ ] 老体系 view='chat' 仍可用(只是其会话不进 HistoryPage)

## 已知风险

1. **selectAgent 改 async**:从同步变异步,调用方 fire-and-forget;切换瞬间 workspaceMessages 是旧的,加载完才更新(短暂闪烁)。可接受。
2. **本地/线上共享 MySQL**:生产 ALTER agent_id 后,本地连同一库也能看到(agent_id 列)。本地测试用 context_lab_test(conftest 隔离)。
3. **observability 不持久化**:切换 agent 后 observability 重置(每次 run 实时算)。spec 已定,可接受。
4. **runWorkspace 落库时机**:onDone 落库(完整 assistant 回复后)。流式过程中不落库(中途刷新可能丢最后一条)。
