# Agent 对话窗口消息窗口化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Agent 对话窗口按 12 条消息分页/窗口化展示，同时保持 MySQL 原始历史完整、Agent 运行上下文完整、任务列表覆盖全局会话。

**Architecture:** 后端新增 session message window、append、message index 三类轻量接口；前端 `agentRuntimeStore` 只维护当前已加载窗口和全局任务索引。Claude SDK Agent 运行前根据 `sessionId` 从 MySQL 读取完整历史并套用已有上下文压缩，前端加载了多少消息不影响 Agent 记忆。

**Tech Stack:** Python FastAPI + SQLAlchemy + MySQL；React 18 + TypeScript + Zustand + Vitest；pytest。

---

## File Structure

- Modify: `backend/schemas.py` — 增加消息分页、增量追加、任务索引响应模型。
- Modify: `backend/routers/sessions.py` — 增加 `/sessions/{id}/messages` GET/POST 与 `/sessions/{id}/message-index`；保留现有 `getSession`/`updateSession` 行为供历史页兼容。
- Test: `backend/tests/test_session_messages_windowing.py` — 覆盖分页、aroundSeq、append、message-index。
- Modify: `backend/runtime/claude_sdk_agent.py` — 在压缩前用 `sessionId` 读取完整 MySQL 历史，并合并当前请求，替代直接信任前端窗口消息。
- Test: `backend/tests/test_claude_sdk_agent.py` — 覆盖前端只传窗口消息时仍使用数据库完整历史。
- Modify: `src/services/dbApi.ts` — 增加分页、append、message-index API 类型和方法。
- Modify: `src/stores/agentRuntimeStore.ts` — 增加窗口状态、加载更早、跳到最新、任务跳转、增量追加落库。
- Test: `src/stores/agentRuntimeStore.test.ts` — 覆盖初始 12 条、prepend、更早加载并发保护、发送消息切回最新、runAgent 不再使用窗口全量上下文。
- Modify: `src/components/agentRuntime/SessionTaskNavigator.tsx` — 改为接收全局任务索引，点击按 `messageSeq` 跳转。
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx` — 增加顶部加载状态、滚动触发、滚动锚点保持、“有新回复，跳到最新”。
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx` — 覆盖加载提示、失败重试、任务跳转、跳到最新。
- Modify: `项目执行跟踪矩阵.md` — 增加本需求记录。

---

### Task 1: 后端消息分页与增量追加接口

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/routers/sessions.py`
- Test: `backend/tests/test_session_messages_windowing.py`

- [ ] **Step 1: Write failing backend API tests**

Create `backend/tests/test_session_messages_windowing.py`:

```python
from __future__ import annotations


def _create_session_with_messages(client, session_id="window-session", count=30):
    resp = client.post("/api/db/sessions", json={"id": session_id, "name": "window"})
    assert resp.status_code == 200
    messages = []
    for i in range(count):
        role = "user" if i % 2 == 0 else "assistant"
        messages.append({"role": role, "content": f"消息{i}"})
    resp = client.put(f"/api/db/sessions/{session_id}", json={"messages": messages})
    assert resp.status_code == 200
    return session_id


def test_get_session_messages_defaults_to_latest_12_in_ascending_seq(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages")

    assert resp.status_code == 200
    body = resp.json()
    assert [m["seq"] for m in body["messages"]] == list(range(18, 30))
    assert [m["content"] for m in body["messages"]] == [f"消息{i}" for i in range(18, 30)]
    assert body["oldestSeq"] == 18
    assert body["newestSeq"] == 29
    assert body["hasMoreBefore"] is True
    assert body["hasMoreAfter"] is False
    assert body["total"] == 30


def test_get_session_messages_before_seq_returns_older_window(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages?beforeSeq=18&limit=12")

    assert resp.status_code == 200
    body = resp.json()
    assert [m["seq"] for m in body["messages"]] == list(range(6, 18))
    assert body["hasMoreBefore"] is True
    assert body["hasMoreAfter"] is True
    assert body["oldestSeq"] == 6
    assert body["newestSeq"] == 17


def test_get_session_messages_around_seq_includes_target(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages?aroundSeq=4&limit=12")

    assert resp.status_code == 200
    body = resp.json()
    seqs = [m["seq"] for m in body["messages"]]
    assert 4 in seqs
    assert seqs == list(range(0, 12))
    assert body["hasMoreBefore"] is False
    assert body["hasMoreAfter"] is True


def test_get_session_messages_rejects_before_and_around_together(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages?beforeSeq=18&aroundSeq=4")

    assert resp.status_code == 400


def test_append_session_messages_adds_without_replacing_existing_history(client, db):
    sid = _create_session_with_messages(client, count=2)

    resp = client.post(f"/api/db/sessions/{sid}/messages", json={
        "messages": [
            {"role": "user", "content": "新增问题"},
            {"role": "assistant", "content": "新增回答", "tokenUsage": {"input": 3, "output": 4}},
        ]
    })

    assert resp.status_code == 200
    body = resp.json()
    assert [m["seq"] for m in body["messages"]] == [2, 3]
    got = client.get(f"/api/db/sessions/{sid}").json()
    assert [m["content"] for m in got["messages"]] == ["消息0", "消息1", "新增问题", "新增回答"]
    assert got["totalTokens"] == 7
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_session_messages_windowing.py -q
```

Expected: FAIL with 404 for the new endpoints.

- [ ] **Step 3: Add schemas**

Append to `backend/schemas.py` after `MessageOut`:

```python
class MessageWindowOut(BaseModel):
    messages: list[MessageOut] = Field(default_factory=list)
    hasMoreBefore: bool = False
    hasMoreAfter: bool = False
    oldestSeq: Optional[int] = None
    newestSeq: Optional[int] = None
    total: int = 0


class AppendMessagesIn(BaseModel):
    messages: list[MessageIn] = Field(default_factory=list)
```

Modify `MessageOut` to include `seq`:

```python
class MessageOut(BaseModel):
    seq: Optional[int] = None
    role: str
    content: str = ""
    timestamp: Any = None
    tokenUsage: Optional[dict] = None
    toolsUsed: Optional[list] = None
    files: Optional[list] = None
    isFileOnly: Optional[bool] = None
    thinkingContent: Optional[str] = None
    thinkingTokens: Optional[int] = None
```

- [ ] **Step 4: Include seq in existing session serialization**

In `backend/routers/sessions.py`, modify `_to_session_out()` message construction:

```python
messages.append(MessageOut(
    seq=mm.seq,
    role=mm.role,
    content=mm.content or "",
    timestamp=payload.get("timestamp") or (mm.created_at.isoformat() if mm.created_at else None),
    tokenUsage=payload.get("tokenUsage"),
    toolsUsed=payload.get("toolsUsed"),
    files=payload.get("files"),
    isFileOnly=payload.get("isFileOnly"),
    thinkingContent=payload.get("thinkingContent"),
    thinkingTokens=payload.get("thinkingTokens"),
))
```

- [ ] **Step 5: Add helper functions in sessions router**

In `backend/routers/sessions.py`, update imports:

```python
from schemas import (
    AppendMessagesIn,
    MessageOut,
    MessageWindowOut,
    QueryResult,
    SessionCreate,
    SessionListItem,
    SessionOut,
    SessionUpdate,
)
```

Add helpers near `_sync_messages()`:

```python
DEFAULT_MESSAGE_WINDOW_LIMIT = 12
MAX_MESSAGE_WINDOW_LIMIT = 50


def _message_out(mm: models.MessageModel) -> MessageOut:
    payload = mm.payload or {}
    return MessageOut(
        seq=mm.seq,
        role=mm.role,
        content=mm.content or "",
        timestamp=payload.get("timestamp") or (mm.created_at.isoformat() if mm.created_at else None),
        tokenUsage=payload.get("tokenUsage"),
        toolsUsed=payload.get("toolsUsed"),
        files=payload.get("files"),
        isFileOnly=payload.get("isFileOnly"),
        thinkingContent=payload.get("thinkingContent"),
        thinkingTokens=payload.get("thinkingTokens"),
    )


def _message_payload(d: dict) -> dict:
    return {k: v for k, v in d.items() if k not in {"role", "content"} and v is not None}


def _bounded_limit(limit: int) -> int:
    return max(1, min(limit, MAX_MESSAGE_WINDOW_LIMIT))
```

- [ ] **Step 6: Add GET message window endpoint**

Add before `@router.get("/sessions/{session_id}")` so static path wins over dynamic `session_id` matching:

```python
@router.get("/sessions/{session_id}/messages", response_model=MessageWindowOut)
def get_session_messages(
    session_id: str,
    beforeSeq: Optional[int] = None,
    aroundSeq: Optional[int] = None,
    limit: int = DEFAULT_MESSAGE_WINDOW_LIMIT,
    db: Session = Depends(get_db),
):
    if beforeSeq is not None and aroundSeq is not None:
        raise HTTPException(status_code=400, detail="beforeSeq and aroundSeq cannot be used together")
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")

    limit = _bounded_limit(limit)
    total = db.execute(
        select(func.count()).select_from(models.MessageModel).where(models.MessageModel.session_id == session_id)
    ).scalar() or 0

    query = select(models.MessageModel).where(models.MessageModel.session_id == session_id)
    if aroundSeq is not None:
        start_seq = max(0, aroundSeq - limit // 2)
        query = query.where(models.MessageModel.seq >= start_seq).order_by(models.MessageModel.seq.asc()).limit(limit)
        rows = db.execute(query).scalars().all()
    elif beforeSeq is not None:
        rows = db.execute(
            query.where(models.MessageModel.seq < beforeSeq)
            .order_by(models.MessageModel.seq.desc())
            .limit(limit)
        ).scalars().all()
        rows = list(reversed(rows))
    else:
        rows = db.execute(query.order_by(models.MessageModel.seq.desc()).limit(limit)).scalars().all()
        rows = list(reversed(rows))

    oldest = rows[0].seq if rows else None
    newest = rows[-1].seq if rows else None
    return MessageWindowOut(
        messages=[_message_out(row) for row in rows],
        hasMoreBefore=oldest is not None and oldest > 0,
        hasMoreAfter=newest is not None and newest < total - 1,
        oldestSeq=oldest,
        newestSeq=newest,
        total=total,
    )
```

- [ ] **Step 7: Add POST append messages endpoint**

Add after the GET message window endpoint:

```python
@router.post("/sessions/{session_id}/messages", response_model=MessageWindowOut)
def append_session_messages(session_id: str, payload: AppendMessagesIn, db: Session = Depends(get_db)):
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if not payload.messages:
        return get_session_messages(session_id, db=db)

    next_seq = db.execute(
        select(func.coalesce(func.max(models.MessageModel.seq), -1)).where(models.MessageModel.session_id == session_id)
    ).scalar() + 1

    added: list[models.MessageModel] = []
    for offset, message in enumerate(payload.messages):
        data = message.model_dump(exclude_none=True)
        row = models.MessageModel(
            session_id=session_id,
            seq=next_seq + offset,
            role=data.get("role", "user"),
            content=data.get("content", "") or "",
            payload=_message_payload(data),
        )
        db.add(row)
        added.append(row)

    sess.total_tokens = (sess.total_tokens or 0) + _compute_total_tokens(payload.messages)
    sess.updated_at = datetime.utcnow()
    db.commit()
    for row in added:
        db.refresh(row)

    total = db.execute(
        select(func.count()).select_from(models.MessageModel).where(models.MessageModel.session_id == session_id)
    ).scalar() or 0
    return MessageWindowOut(
        messages=[_message_out(row) for row in added],
        hasMoreBefore=bool(added and added[0].seq > 0),
        hasMoreAfter=False,
        oldestSeq=added[0].seq if added else None,
        newestSeq=added[-1].seq if added else None,
        total=total,
    )
```

- [ ] **Step 8: Run backend window tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_session_messages_windowing.py -q
```

Expected: PASS.

- [ ] **Step 9: Run existing session CRUD tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py -q
```

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add backend/schemas.py backend/routers/sessions.py backend/tests/test_session_messages_windowing.py
git commit -m "feat(runtime): 添加会话消息窗口接口"
```

---

### Task 2: 后端全局任务索引接口

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/routers/sessions.py`
- Test: `backend/tests/test_session_messages_windowing.py`

- [ ] **Step 1: Add failing message-index tests**

Append to `backend/tests/test_session_messages_windowing.py`:

```python

def test_message_index_returns_all_user_tasks_without_full_content(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 15
    assert body["items"][0]["messageSeq"] == 0
    assert body["items"][0]["role"] == "user"
    assert body["items"][0]["title"] == "消息0"
    assert body["items"][0]["preview"] == "消息0"
    assert "content" not in body["items"][0]
    assert body["items"][-1]["messageSeq"] == 28


def test_message_index_truncates_long_title_and_preview(client, db):
    sid = client.post("/api/db/sessions", json={"id": "task-index-long"}).json()["id"]
    long_text = "这是一条非常长非常长非常长非常长非常长非常长的用户任务\n第二行不进标题"
    client.put(f"/api/db/sessions/{sid}", json={"messages": [{"role": "user", "content": long_text}]})

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    item = resp.json()["items"][0]
    assert item["title"].endswith("…")
    assert len(item["title"]) <= 37
    assert item["preview"].startswith("这是一条非常长")
    assert len(item["preview"]) <= 80
```

- [ ] **Step 2: Run message-index tests to verify they fail**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_session_messages_windowing.py::test_message_index_returns_all_user_tasks_without_full_content tests/test_session_messages_windowing.py::test_message_index_truncates_long_title_and_preview -q
```

Expected: FAIL with 404.

- [ ] **Step 3: Add schemas**

Append to `backend/schemas.py`:

```python
class MessageIndexItem(BaseModel):
    messageSeq: int
    role: str
    title: str
    preview: str
    timestamp: Optional[str] = None


class MessageIndexOut(BaseModel):
    items: list[MessageIndexItem] = Field(default_factory=list)
```

- [ ] **Step 4: Add router imports and title helpers**

Update `backend/routers/sessions.py` schema imports to include `MessageIndexItem` and `MessageIndexOut`.

Add helpers near `_message_payload()`:

```python
MAX_TASK_TITLE_LENGTH = 36
MAX_TASK_PREVIEW_LENGTH = 80


def _truncate(text: str, limit: int) -> str:
    value = text.strip().split("\n")[0].strip()
    if len(value) <= limit:
        return value
    return f"{value[:limit]}…"
```

- [ ] **Step 5: Add message-index endpoint**

Add before `@router.get("/sessions/{session_id}")`:

```python
@router.get("/sessions/{session_id}/message-index", response_model=MessageIndexOut)
def get_session_message_index(session_id: str, db: Session = Depends(get_db)):
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    rows = db.execute(
        select(models.MessageModel)
        .where(models.MessageModel.session_id == session_id, models.MessageModel.role == "user")
        .order_by(models.MessageModel.seq.asc())
    ).scalars().all()
    return MessageIndexOut(items=[
        MessageIndexItem(
            messageSeq=row.seq,
            role=row.role,
            title=_truncate(row.content or "", MAX_TASK_TITLE_LENGTH),
            preview=_truncate(row.content or "", MAX_TASK_PREVIEW_LENGTH),
            timestamp=(row.payload or {}).get("timestamp") or (row.created_at.isoformat() if row.created_at else None),
        )
        for row in rows
    ])
```

- [ ] **Step 6: Run message-index tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_session_messages_windowing.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/schemas.py backend/routers/sessions.py backend/tests/test_session_messages_windowing.py
git commit -m "feat(runtime): 添加会话任务索引接口"
```

---

### Task 3: Claude SDK Agent 使用 sessionId 读取完整历史

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`
- Test: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: Write failing test for full DB history context**

Append to `backend/tests/test_claude_sdk_agent.py`:

```python
async def test_claude_sdk_agent_loads_full_session_history_when_frontend_sends_window(client, db, monkeypatch):
    import agents
    from runtime.agent import AgentTask
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.events import EventEmitter

    client.post("/api/db/sessions", json={"id": "full-history-session", "agentId": "claude-sdk"})
    client.put("/api/db/sessions/full-history-session", json={
        "messages": [
            {"role": "user", "content": "早期关键事实：项目代号是 lobster"},
            {"role": "assistant", "content": "记住了"},
            {"role": "user", "content": "最近问题"},
        ]
    })
    captured = {}

    async def fake_query(*, prompt, options=None, transport=None):
        captured["prompt"] = prompt
        yield AssistantMessage(content=[TextBlock(text="ok")], model="glm-5.2")
        yield ResultMessage(
            subtype="success", duration_ms=1, duration_api_ms=1,
            is_error=False, num_turns=1, session_id="s",
            usage={"input_tokens": 1, "output_tokens": 1},
        )

    agent = ClaudeSdkAgent()
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=fake_query):
        await agent.run(
            AgentTask(
                sessionId="full-history-session",
                messages=[{"role": "user", "content": "最近问题"}],
            ),
            emit,
        )

    assert "早期关键事实：项目代号是 lobster" in captured["prompt"]
    assert "最近问题" in captured["prompt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_claude_sdk_agent_loads_full_session_history_when_frontend_sends_window -q
```

Expected: FAIL because `ClaudeSdkAgent.run()` only uses `task.messages`.

- [ ] **Step 3: Add DB history loader helper**

In `backend/runtime/claude_sdk_agent.py`, add import:

```python
import models
```

Add method inside `ClaudeSdkAgent` before `run()`:

```python
    @staticmethod
    def _load_runtime_messages(db, task: AgentTask) -> list[dict]:
        request_messages = list(task.messages or [])
        if not task.sessionId:
            return request_messages
        rows = db.query(models.MessageModel).filter_by(session_id=task.sessionId).order_by(models.MessageModel.seq.asc()).all()
        history = [{"role": row.role, "content": row.content or ""} for row in rows]
        if not request_messages:
            return history
        current = request_messages[-1]
        if history and history[-1].get("role") == current.get("role") and history[-1].get("content") == current.get("content"):
            return history
        return [*history, {"role": current.get("role", "user"), "content": current.get("content", "")}]
```

- [ ] **Step 4: Use runtime messages in compression and event payload**

In `ClaudeSdkAgent.run()`, replace:

```python
context = build_runtime_context(task.messages, summary_state)
```

with:

```python
runtime_messages = self._load_runtime_messages(db, task)
context = build_runtime_context(runtime_messages, summary_state)
```

Replace:

```python
await emit.emit(EventType.ACTION, **compression_action_payload(context, task.messages))
```

with:

```python
await emit.emit(EventType.ACTION, **compression_action_payload(context, runtime_messages))
```

- [ ] **Step 5: Run focused test**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_claude_sdk_agent_loads_full_session_history_when_frontend_sends_window -q
```

Expected: PASS.

- [ ] **Step 6: Run related backend tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py tests/test_context_compression.py tests/test_agents_api.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "fix(runtime): 用完整会话历史运行 Agent"
```

---

### Task 4: 前端 dbApi 增加窗口、追加和任务索引方法

**Files:**
- Modify: `src/services/dbApi.ts`
- Test: use store tests in Task 5 as API consumer tests.

- [ ] **Step 1: Add TypeScript types and methods**

In `src/services/dbApi.ts`, add after `SessionListItem`:

```ts
export interface SessionMessageItem {
  seq: number;
  role: 'user' | 'assistant' | string;
  content: string;
  timestamp?: string;
  tokenUsage?: { input?: number; output?: number };
}

export interface MessageWindowResult {
  messages: SessionMessageItem[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestSeq: number | null;
  newestSeq: number | null;
  total: number;
}

export interface MessageIndexItem {
  messageSeq: number;
  role: 'user' | 'assistant';
  title: string;
  preview: string;
  timestamp?: string;
}

export interface MessageIndexResult {
  items: MessageIndexItem[];
}
```

Add methods inside `dbApi` after `getSession`:

```ts
  getSessionMessages: (id: string, params: { beforeSeq?: number; aroundSeq?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return req<MessageWindowResult>(`/sessions/${id}/messages${qs ? `?${qs}` : ''}`);
  },
  appendSessionMessages: (id: string, messages: Array<{ role: 'user' | 'assistant'; content: string; tokenUsage?: { input?: number; output?: number } }>) =>
    req<MessageWindowResult>(`/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify({ messages }) }),
  getSessionMessageIndex: (id: string) => req<MessageIndexResult>(`/sessions/${id}/message-index`),
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit Task 4**

```bash
git add src/services/dbApi.ts
git commit -m "feat(runtime): 添加会话消息窗口 API 客户端"
```

---

### Task 5: Store 接入消息窗口状态和增量落库

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`
- Test: `src/stores/agentRuntimeStore.test.ts`

- [ ] **Step 1: Update dbApi mock in store tests**

In `src/stores/agentRuntimeStore.test.ts`, extend the `dbApi` mock:

```ts
vi.mock('../services/dbApi', () => ({
  dbApi: {
    querySessions: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    getSession: vi.fn(),
    getSessionMessages: vi.fn(),
    appendSessionMessages: vi.fn(),
    getSessionMessageIndex: vi.fn(),
  },
}));
```

Add aliases:

```ts
const getSessionMessages = dbApi.getSessionMessages as unknown as ReturnType<typeof vi.fn>;
const appendSessionMessages = dbApi.appendSessionMessages as unknown as ReturnType<typeof vi.fn>;
const getSessionMessageIndex = dbApi.getSessionMessageIndex as unknown as ReturnType<typeof vi.fn>;
```

Update `beforeEach()` defaults:

```ts
getSessionMessages.mockResolvedValue({
  messages: [],
  hasMoreBefore: false,
  hasMoreAfter: false,
  oldestSeq: null,
  newestSeq: null,
  total: 0,
});
appendSessionMessages.mockResolvedValue({
  messages: [],
  hasMoreBefore: false,
  hasMoreAfter: false,
  oldestSeq: null,
  newestSeq: null,
  total: 0,
});
getSessionMessageIndex.mockResolvedValue({ items: [] });
```

- [ ] **Step 2: Add failing store tests**

Append to the existing describe block:

```ts
  it('selectAgent loads only the latest message window and task index', async () => {
    querySessions.mockResolvedValue({ items: [{ id: 'sess-echo', agentId: 'echo' }], total: 1, page: 1, size: 20 });
    getSession.mockResolvedValue({ id: 'sess-echo', agentId: 'echo', messages: [{ role: 'user', content: 'full history should not be used' }] });
    getSessionMessages.mockResolvedValue({
      messages: Array.from({ length: 12 }, (_, i) => ({ seq: 18 + i, role: i % 2 ? 'assistant' : 'user', content: `窗口${18 + i}` })),
      hasMoreBefore: true,
      hasMoreAfter: false,
      oldestSeq: 18,
      newestSeq: 29,
      total: 30,
    });
    getSessionMessageIndex.mockResolvedValue({ items: [{ messageSeq: 0, role: 'user', title: '早期任务', preview: '早期任务' }] });
    useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });

    await useAgentRuntimeStore.getState().selectAgent('echo');

    expect(getSessionMessages).toHaveBeenCalledWith('sess-echo', { limit: 12 });
    expect(getSessionMessageIndex).toHaveBeenCalledWith('sess-echo');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toHaveLength(12);
    expect(useAgentRuntimeStore.getState().workspaceMessages[0].content).toBe('窗口18');
    expect(useAgentRuntimeStore.getState().workspaceHasMoreBefore).toBe(true);
    expect(useAgentRuntimeStore.getState().workspaceOldestSeq).toBe(18);
    expect(useAgentRuntimeStore.getState().workspaceTaskIndex).toEqual([{ messageSeq: 0, role: 'user', title: '早期任务', preview: '早期任务' }]);
  });

  it('loadOlderWorkspaceMessages prepends older messages and blocks duplicate loads', async () => {
    let resolveOlder: (value: any) => void = () => {};
    getSessionMessages.mockImplementation(() => new Promise(resolve => { resolveOlder = resolve; }));
    useAgentRuntimeStore.setState({
      workspaceSessionId: 'sess-1',
      workspaceMessages: [{ role: 'user', content: '窗口18', seq: 18 } as any],
      workspaceOldestSeq: 18,
      workspaceHasMoreBefore: true,
      workspaceLoadingOlder: false,
    });

    const first = useAgentRuntimeStore.getState().loadOlderWorkspaceMessages();
    const second = useAgentRuntimeStore.getState().loadOlderWorkspaceMessages();
    resolveOlder({
      messages: [{ seq: 6, role: 'user', content: '窗口6' }, { seq: 7, role: 'assistant', content: '窗口7' }],
      hasMoreBefore: true,
      hasMoreAfter: true,
      oldestSeq: 6,
      newestSeq: 7,
      total: 30,
    });
    await first;
    await second;

    expect(getSessionMessages).toHaveBeenCalledTimes(1);
    expect(getSessionMessages).toHaveBeenCalledWith('sess-1', { beforeSeq: 18, limit: 12 });
    expect(useAgentRuntimeStore.getState().workspaceMessages.map(m => m.content)).toEqual(['窗口6', '窗口7', '窗口18']);
    expect(useAgentRuntimeStore.getState().workspaceOldestSeq).toBe(6);
  });

  it('runWorkspace appends messages incrementally and sends only current request to Agent', async () => {
    appendSessionMessages
      .mockResolvedValueOnce({ messages: [{ seq: 30, role: 'user', content: '新问题' }], hasMoreBefore: true, hasMoreAfter: false, oldestSeq: 30, newestSeq: 30, total: 31 })
      .mockResolvedValueOnce({ messages: [{ seq: 31, role: 'assistant', content: '新回答' }], hasMoreBefore: true, hasMoreAfter: false, oldestSeq: 31, newestSeq: 31, total: 32 });
    runAgentMock.mockImplementation(async (_id, _messages, _cwd, _sessionId, onEvent, onDone) => {
      onEvent({ type: 'text', data: { text: '新回答' } });
      onDone();
    });
    useAgentRuntimeStore.setState({
      currentAgentId: 'claude-sdk',
      workspaceSessionId: 'sess-1',
      workspaceMessages: [{ role: 'user', content: '窗口历史', seq: 29 } as any],
      workspaceCwd: 'D:/repo',
      workspaceIsAtLatest: true,
      workspaceRunning: false,
    });

    await useAgentRuntimeStore.getState().runWorkspace('新问题');

    expect(appendSessionMessages).toHaveBeenNthCalledWith(1, 'sess-1', [{ role: 'user', content: '新问题' }]);
    expect(runAgentMock).toHaveBeenCalledWith(
      'claude-sdk',
      [{ role: 'user', content: '新问题' }],
      'D:/repo',
      'sess-1',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(appendSessionMessages).toHaveBeenNthCalledWith(2, 'sess-1', [{ role: 'assistant', content: '新回答' }]);
    expect(updateSession).not.toHaveBeenCalledWith('sess-1', expect.objectContaining({ messages: expect.any(Array) }));
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npx vitest run src/stores/agentRuntimeStore.test.ts -t "message window|loadOlder|incrementally"
```

Expected: FAIL because store methods/state do not exist or still use full messages.

- [ ] **Step 4: Add store state types and defaults**

In `src/stores/agentRuntimeStore.ts`, extend `ChatMessage` or local message shape to carry optional `seq`:

```ts
type WorkspaceChatMessage = ChatMessage & { seq?: number };
```

Update state interface:

```ts
workspaceMessages: WorkspaceChatMessage[];
workspaceOldestSeq: number | null;
workspaceNewestSeq: number | null;
workspaceHasMoreBefore: boolean;
workspaceHasMoreAfter: boolean;
workspaceLoadingOlder: boolean;
workspaceLoadOlderError: string | null;
workspaceIsAtLatest: boolean;
workspaceHasNewerNotice: boolean;
workspaceTaskIndex: MessageIndexItem[];
loadOlderWorkspaceMessages: () => Promise<void>;
jumpWorkspaceToLatest: () => Promise<void>;
jumpWorkspaceToMessageSeq: (messageSeq: number) => Promise<void>;
```

Add imports:

```ts
import type { MessageIndexItem, MessageWindowResult, SessionMessageItem } from '../services/dbApi';
```

Add constants and mapper near `EMPTY_OBS`:

```ts
const MESSAGE_WINDOW_LIMIT = 12;

function mapWindowMessage(message: SessionMessageItem): WorkspaceChatMessage {
  return {
    seq: message.seq,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content || '',
  };
}

function windowStateFromResult(result: MessageWindowResult) {
  return {
    workspaceMessages: result.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(mapWindowMessage),
    workspaceOldestSeq: result.oldestSeq,
    workspaceNewestSeq: result.newestSeq,
    workspaceHasMoreBefore: result.hasMoreBefore,
    workspaceHasMoreAfter: result.hasMoreAfter,
    workspaceIsAtLatest: !result.hasMoreAfter,
  };
}
```

Add defaults in initial state and test reset state:

```ts
workspaceOldestSeq: null,
workspaceNewestSeq: null,
workspaceHasMoreBefore: false,
workspaceHasMoreAfter: false,
workspaceLoadingOlder: false,
workspaceLoadOlderError: null,
workspaceIsAtLatest: true,
workspaceHasNewerNotice: false,
workspaceTaskIndex: [],
```

- [ ] **Step 5: Update selectAgent and resumeWorkspaceSession loading**

Replace `selectAgent` full-message assignment with:

```ts
    let windowResult: MessageWindowResult = { messages: [], hasMoreBefore: false, hasMoreAfter: false, oldestSeq: null, newestSeq: null, total: 0 };
    let taskIndex: MessageIndexItem[] = [];
    if (session?.id) {
      try { windowResult = await dbApi.getSessionMessages(session.id, { limit: MESSAGE_WINDOW_LIMIT }); }
      catch (e) { console.error('getSessionMessages failed', e); }
      try { taskIndex = (await dbApi.getSessionMessageIndex(session.id)).items; }
      catch (e) { console.error('getSessionMessageIndex failed', e); }
    }
    if (workspaceSelectionVersion !== selectionVersion) return;
    set({
      currentAgentId: id,
      workspaceSessionId: session?.id || null,
      ...windowStateFromResult(windowResult),
      workspaceTaskIndex: taskIndex,
      workspaceCwd: null,
      workspaceCwdHistory: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceLoadOlderError: null,
      workspaceHasNewerNotice: false,
    });
```

For `resumeWorkspaceSession`, keep the provided latest session id/agent id, then load latest window asynchronously:

```ts
  resumeWorkspaceSession: (session) => {
    if (!session.agentId) return;
    workspaceSelectionVersion += 1;
    get().workspaceAbortController?.abort();
    set({
      currentAgentId: session.agentId,
      workspaceSessionId: session.id,
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceResetToken: null,
      workspaceCwd: null,
      workspaceCwdHistory: [],
      workspaceTaskIndex: [],
      workspaceOldestSeq: null,
      workspaceNewestSeq: null,
      workspaceHasMoreBefore: false,
      workspaceHasMoreAfter: false,
      workspaceIsAtLatest: true,
      workspaceHasNewerNotice: false,
    });
    void get().jumpWorkspaceToLatest();
  },
```

- [ ] **Step 6: Add load older and jump methods**

Add methods in the store object before `runWorkspace`:

```ts
  loadOlderWorkspaceMessages: async () => {
    const state = get();
    if (!state.workspaceSessionId || !state.workspaceHasMoreBefore || state.workspaceLoadingOlder || state.workspaceOldestSeq == null) return;
    set({ workspaceLoadingOlder: true, workspaceLoadOlderError: null });
    try {
      const result = await dbApi.getSessionMessages(state.workspaceSessionId, { beforeSeq: state.workspaceOldestSeq, limit: MESSAGE_WINDOW_LIMIT });
      set({
        workspaceMessages: [...result.messages.map(mapWindowMessage), ...get().workspaceMessages],
        workspaceOldestSeq: result.oldestSeq,
        workspaceHasMoreBefore: result.hasMoreBefore,
        workspaceLoadingOlder: false,
        workspaceLoadOlderError: null,
      });
    } catch (e: any) {
      set({ workspaceLoadingOlder: false, workspaceLoadOlderError: e?.message || '加载更早消息失败' });
    }
  },

  jumpWorkspaceToLatest: async () => {
    const sid = get().workspaceSessionId;
    if (!sid) return;
    const result = await dbApi.getSessionMessages(sid, { limit: MESSAGE_WINDOW_LIMIT });
    set({
      ...windowStateFromResult(result),
      workspaceHasNewerNotice: false,
      workspaceLoadOlderError: null,
    });
  },

  jumpWorkspaceToMessageSeq: async (messageSeq) => {
    const sid = get().workspaceSessionId;
    if (!sid) return;
    const existing = get().workspaceMessages.some(m => m.seq === messageSeq);
    if (existing) return;
    const result = await dbApi.getSessionMessages(sid, { aroundSeq: messageSeq, limit: MESSAGE_WINDOW_LIMIT });
    set({
      ...windowStateFromResult(result),
      workspaceHasNewerNotice: result.hasMoreAfter,
      workspaceLoadOlderError: null,
    });
  },
```

- [ ] **Step 7: Update runWorkspace to append incrementally and send current request only**

In `runWorkspace`, replace full `messages` construction and persistence path with:

```ts
    if (!state.workspaceIsAtLatest && state.workspaceSessionId) {
      await get().jumpWorkspaceToLatest();
    }
    const userMessage = { role: 'user' as const, content: input };
    const optimisticMessages = [...get().workspaceMessages, userMessage];
    const rawEvents: AgentEvent[] = [];
    const controller = new AbortController();
    const isCurrentRun = () => get().workspaceAbortController === controller;
    set({ workspaceMessages: optimisticMessages, workspaceStreaming: '', workspaceEvents: [], workspaceObservability: EMPTY_OBS, workspaceRunning: true, workspaceAbortController: controller, workspaceIsAtLatest: true, workspaceHasNewerNotice: false });
    const sid = get().workspaceSessionId;
    if (sid) {
      dbApi.appendSessionMessages(sid, [userMessage]).catch(e => console.error('append user message failed', e));
    }
    await runAgent(
      agentId,
      [userMessage],
      get().workspaceCwd,
      get().workspaceSessionId,
```

In `onDone`, replace `updateSession` persistence with append:

```ts
        const assistantMessage = { role: 'assistant' as const, content: full };
        const msgs = [...get().workspaceMessages, assistantMessage];
        set({ workspaceMessages: msgs, workspaceStreaming: '', workspaceRunning: false, workspaceAbortController: null });
        const sid = get().workspaceSessionId;
        if (sid) {
          dbApi.appendSessionMessages(sid, [assistantMessage]).catch(e => console.error('append assistant message failed', e));
        }
```

In `onError`, after setting error message, append the error assistant message similarly:

```ts
        const errorMessage = { role: 'assistant' as const, content: formatWorkspaceError(err) };
        set({
          workspaceMessages: [...get().workspaceMessages, errorMessage],
          workspaceStreaming: '',
          workspaceRunning: false,
          workspaceAbortController: null,
        });
        const sid = get().workspaceSessionId;
        if (sid) {
          dbApi.appendSessionMessages(sid, [errorMessage]).catch(e => console.error('append error message failed', e));
        }
```

- [ ] **Step 8: Run focused store tests**

Run:

```bash
npx vitest run src/stores/agentRuntimeStore.test.ts -t "message window|loadOlder|incrementally"
```

Expected: PASS.

- [ ] **Step 9: Run full store tests**

Run:

```bash
npx vitest run src/stores/agentRuntimeStore.test.ts
```

Expected: PASS. Existing tests that assert full `getSession` messages should be updated to expect `getSessionMessages` window behavior, not full history.

- [ ] **Step 10: Commit Task 5**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(runtime): 窗口化加载 Agent 会话消息"
```

---

### Task 6: 对话窗口滚动、加载提示和任务索引跳转

**Files:**
- Modify: `src/components/agentRuntime/SessionTaskNavigator.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] **Step 1: Write failing component tests**

Append to `src/components/agentRuntime/ChatWorkspace.test.tsx`:

```tsx
  it('renders older-message loading states and retry action', () => {
    const loadOlder = vi.fn();
    useAgentRuntimeStore.setState({
      workspaceMessages: [{ role: 'user', content: '窗口18', seq: 18 } as any],
      workspaceHasMoreBefore: true,
      workspaceLoadingOlder: false,
      workspaceLoadOlderError: '网络失败',
      loadOlderWorkspaceMessages: loadOlder,
    } as any);

    render(<ChatWorkspace />);

    fireEvent.click(screen.getByText('加载更早消息失败，点击重试'));
    expect(loadOlder).toHaveBeenCalled();
  });

  it('passes global task index to navigator and jumps to unloaded task by seq', async () => {
    const jumpToSeq = vi.fn().mockResolvedValue(undefined);
    useAgentRuntimeStore.setState({
      workspaceMessages: [{ role: 'user', content: '最近任务', seq: 18 } as any],
      workspaceTaskIndex: [
        { messageSeq: 0, role: 'user', title: '早期任务', preview: '早期任务' },
        { messageSeq: 18, role: 'user', title: '最近任务', preview: '最近任务' },
      ],
      jumpWorkspaceToMessageSeq: jumpToSeq,
    } as any);

    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: /任务 2/ }));
    fireEvent.click(screen.getByText('早期任务'));

    expect(jumpToSeq).toHaveBeenCalledWith(0);
  });

  it('shows jump to latest notice when new reply arrives while user is reading history', () => {
    const jumpLatest = vi.fn();
    useAgentRuntimeStore.setState({
      workspaceMessages: [{ role: 'user', content: '早期窗口', seq: 0 } as any],
      workspaceHasNewerNotice: true,
      jumpWorkspaceToLatest: jumpLatest,
    } as any);

    render(<ChatWorkspace />);

    fireEvent.click(screen.getByText('有新回复，跳到最新'));
    expect(jumpLatest).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
npx vitest run src/components/agentRuntime/ChatWorkspace.test.tsx -t "older-message|global task|jump to latest"
```

Expected: FAIL because component does not render these controls or task-index props yet.

- [ ] **Step 3: Update SessionTaskNavigator props**

Replace `src/components/agentRuntime/SessionTaskNavigator.tsx` props with:

```tsx
import React, { useMemo, useState } from 'react';
import { deriveSessionTasks, type ChatMessageLike } from './sessionTasks';
import type { MessageIndexItem } from '../../services/dbApi';

interface Props {
  messages?: ChatMessageLike[];
  taskIndex?: MessageIndexItem[];
  activeMessageSeq: number | null;
  onJumpToMessageSeq: (messageSeq: number) => void;
}

const SessionTaskNavigator: React.FC<Props> = ({ messages = [], taskIndex, activeMessageSeq, onJumpToMessageSeq }) => {
  const [expanded, setExpanded] = useState(false);
  const tasks = useMemo(() => {
    if (taskIndex) {
      return taskIndex.map((item, index) => ({
        id: `task-${item.messageSeq}`,
        messageSeq: item.messageSeq,
        taskNumber: index + 1,
        title: item.title,
      }));
    }
    return deriveSessionTasks(messages).map(task => ({ ...task, messageSeq: task.messageIndex }));
  }, [messages, taskIndex]);
```

Inside button rendering, replace active and click:

```tsx
            const active = task.messageSeq === activeMessageSeq;
```

```tsx
                  onJumpToMessageSeq(task.messageSeq);
                  setExpanded(false);
```

Keep the existing visual styles unchanged.

- [ ] **Step 4: Update ChatWorkspace store selectors**

In `ChatWorkspace.tsx`, pull these fields/actions from store:

```tsx
  const workspaceHasMoreBefore = useAgentRuntimeStore(s => s.workspaceHasMoreBefore);
  const workspaceLoadingOlder = useAgentRuntimeStore(s => s.workspaceLoadingOlder);
  const workspaceLoadOlderError = useAgentRuntimeStore(s => s.workspaceLoadOlderError);
  const workspaceHasNewerNotice = useAgentRuntimeStore(s => s.workspaceHasNewerNotice);
  const workspaceTaskIndex = useAgentRuntimeStore(s => s.workspaceTaskIndex);
  const loadOlderWorkspaceMessages = useAgentRuntimeStore(s => s.loadOlderWorkspaceMessages);
  const jumpWorkspaceToLatest = useAgentRuntimeStore(s => s.jumpWorkspaceToLatest);
  const jumpWorkspaceToMessageSeq = useAgentRuntimeStore(s => s.jumpWorkspaceToMessageSeq);
```

Compute active seq:

```tsx
  const activeMessageSeq = activeMessageIndex == null ? null : (workspaceMessages[activeMessageIndex] as any)?.seq ?? null;
```

- [ ] **Step 5: Render loading controls and jump notice**

In the message viewport before `SessionTaskNavigator`, add:

```tsx
        {workspaceLoadOlderError ? (
          <button type="button" onClick={loadOlderWorkspaceMessages} style={{ alignSelf: 'center', border: '1px solid #FCA5A5', borderRadius: 999, background: '#FEF2F2', color: '#991B1B', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            加载更早消息失败，点击重试
          </button>
        ) : workspaceLoadingOlder ? (
          <div style={{ alignSelf: 'center', color: '#6B7280', fontSize: 12 }}>正在加载更早消息...</div>
        ) : workspaceHasMoreBefore ? (
          <button type="button" onClick={loadOlderWorkspaceMessages} style={{ alignSelf: 'center', border: '1px solid #D6CFC4', borderRadius: 999, background: '#FFFDF9', color: '#555555', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            上滑加载更早消息
          </button>
        ) : workspaceMessages.length > 0 ? (
          <div style={{ alignSelf: 'center', color: '#8A8175', fontSize: 12 }}>已到达会话开始</div>
        ) : null}
```

After `workspaceStreaming` rendering or near bottom of viewport, add:

```tsx
        {workspaceHasNewerNotice && (
          <button type="button" onClick={jumpWorkspaceToLatest} style={{ position: 'sticky', bottom: 8, alignSelf: 'center', border: '1px solid #C9B9FF', borderRadius: 999, background: '#F7F2FF', color: '#4C1D95', padding: '7px 12px', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>
            有新回复，跳到最新
          </button>
        )}
```

- [ ] **Step 6: Wire task navigator to messageSeq**

Replace navigator usage:

```tsx
        <SessionTaskNavigator
          taskIndex={workspaceTaskIndex}
          activeMessageSeq={activeMessageSeq}
          onJumpToMessageSeq={async messageSeq => {
            const existingIndex = workspaceMessages.findIndex(m => (m as any).seq === messageSeq);
            if (existingIndex >= 0) {
              jumpToMessage(existingIndex, fullscreen);
              return;
            }
            await jumpWorkspaceToMessageSeq(messageSeq);
            requestAnimationFrame(() => {
              const latestIndex = useAgentRuntimeStore.getState().workspaceMessages.findIndex(m => (m as any).seq === messageSeq);
              if (latestIndex >= 0) jumpToMessage(latestIndex, fullscreen);
            });
          }}
        />
```

- [ ] **Step 7: Add scroll-top trigger with anchor preservation**

Add a ref near other refs:

```tsx
  const olderLoadAnchorRef = useRef<{ height: number; top: number } | null>(null);
```

Add handler:

```tsx
  const handleViewportScroll = (viewport: HTMLDivElement | null) => {
    if (!viewport) return;
    if (viewport.scrollTop < 80 && workspaceHasMoreBefore && !workspaceLoadingOlder) {
      olderLoadAnchorRef.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
      void loadOlderWorkspaceMessages();
    }
  };
```

On viewport `div`, add:

```tsx
onScroll={e => handleViewportScroll(e.currentTarget)}
```

Add effect after load:

```tsx
  useEffect(() => {
    const anchor = olderLoadAnchorRef.current;
    if (!anchor || workspaceLoadingOlder) return;
    const viewport = fullscreen ? fullscreenScrollRef.current : scrollRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight - anchor.height + anchor.top;
    olderLoadAnchorRef.current = null;
  }, [workspaceMessages.length, workspaceLoadingOlder, fullscreen]);
```

- [ ] **Step 8: Run component tests**

Run:

```bash
npx vitest run src/components/agentRuntime/ChatWorkspace.test.tsx -t "older-message|global task|jump to latest"
```

Expected: PASS.

- [ ] **Step 9: Run full component tests**

Run:

```bash
npx vitest run src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: PASS. Existing React `act(...)` warnings may remain; do not broaden scope unless assertions fail.

- [ ] **Step 10: Commit Task 6**

```bash
git add src/components/agentRuntime/SessionTaskNavigator.tsx src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "feat(runtime): 支持对话窗口加载更早消息"
```

---

### Task 7: 跟踪矩阵与全量目标验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Update tracking matrix**

Modify `项目执行跟踪矩阵.md`:

- Increment total requirement count by 1.
- Add next available RQ row:

```md
| RQ-077 | Agent 对话窗口消息分页与任务索引 | [`2026-06-21-agent-chat-message-windowing-design.md`](docs/superpowers/specs/2026-06-21-agent-chat-message-windowing-design.md) | [`2026-06-21-agent-chat-message-windowing.md`](docs/superpowers/plans/2026-06-21-agent-chat-message-windowing.md) | 🚧 | 设计与计划完成，待实现与验证 |
```

Use the next available RQ number if `RQ-077` is already taken.

- [ ] **Step 2: Run backend targeted tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_session_messages_windowing.py tests/test_sessions_crud.py tests/test_claude_sdk_agent.py tests/test_context_compression.py tests/test_agents_api.py -q
```

Expected: PASS.

- [ ] **Step 3: Run frontend targeted tests**

Run:

```bash
npx vitest run src/stores/agentRuntimeStore.test.ts src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: PASS. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 5: Manual UI verification**

Start backend and frontend:

```bash
cd backend && .venv/Scripts/python.exe run_server.py
npm run dev
```

In the browser:

1. Open a Claude SDK Agent session with at least 30 messages.
2. Confirm only the latest 12 messages are initially visible in the Agent conversation window.
3. Scroll to the top and confirm 12 older messages load without the viewport jumping.
4. Open the task navigator and click an early task; confirm the target window loads and highlights the message.
5. While viewing older history, send a message; confirm the window returns to latest before sending.
6. During/after reply, confirm “有新回复，跳到最新” appears only when not at bottom.
7. Confirm a long session can still trigger the existing context compression notice.

- [ ] **Step 6: Commit tracking matrix**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(runtime): 更新消息窗口化跟踪记录"
```

---

## Self-Review

- Spec coverage: backend pagination, append, aroundSeq, task index, frontend 12-message window, scroll loading, jump latest, task navigator global index, Agent run full-history context, tests, manual UI verification are all covered.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or vague “proper handling” steps.
- Type consistency: `beforeSeq`, `aroundSeq`, `MessageWindowResult`, `MessageIndexItem`, `workspaceOldestSeq`, `workspaceTaskIndex`, and `jumpWorkspaceToMessageSeq` are named consistently across tasks.
- Scope check: first version only changes Agent conversation window; history detail page stays out of scope as required.
