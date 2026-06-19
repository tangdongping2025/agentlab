# History Insight Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit human curation loop that turns history insight candidates into persisted user habits or knowledge material.

**Architecture:** Add a small backend persistence model and router for insight items. Extend HistoryPage to let users accept or ignore generated candidates, then show accepted items in a “沉淀库” view. Keep candidate generation deterministic and do not connect accepted items to memory, system prompts, RAG, or embeddings.

**Tech Stack:** FastAPI + SQLAlchemy + MySQL, React 18 + TypeScript + Vitest + React Testing Library, pytest.

---

## File Structure

- Modify `backend/models.py`: add `InsightItemModel`.
- Modify `backend/schemas.py`: add insight item schemas.
- Create `backend/routers/insights.py`: list/create/delete insight items.
- Modify `backend/main.py`: include the insights router.
- Modify `src/services/dbApi.ts`: add insight item types and API client methods.
- Modify `src/components/HistoryPage.tsx`: add candidate actions and “沉淀库” view.
- Modify `src/components/HistoryPage.test.tsx`: cover accept/ignore/deposit-library/source-open flows.
- Create `backend/tests/test_insights.py`: cover backend persistence API.
- Modify `项目执行跟踪矩阵.md`: add RQ-049 after validation.

---

### Task 1: Backend Insight Items API

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/schemas.py`
- Create: `backend/routers/insights.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_insights.py`

- [ ] **Step 1: Write failing backend tests**

Create `backend/tests/test_insights.py` with tests for:

```python
def test_create_and_list_insight_item(client):
    payload = {
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "多次提到设计、规格或计划。",
        "sourceSessionIds": ["s1", "s2"],
        "status": "accepted",
    }
    res = client.post("/api/db/insights", json=payload)
    assert res.status_code == 200
    created = res.json()
    assert created["kind"] == "habit"
    assert created["sourceSessionIds"] == ["s1", "s2"]

    listed = client.get("/api/db/insights").json()
    assert listed["items"][0]["title"] == "偏好先设计和计划"


def test_delete_insight_item(client):
    res = client.post("/api/db/insights", json={
        "kind": "knowledge",
        "title": "知识库素材",
        "description": "后续可整理为知识库素材。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    })
    insight_id = res.json()["id"]

    delete_res = client.delete(f"/api/db/insights/{insight_id}")
    assert delete_res.status_code == 200
    assert client.get("/api/db/insights").json()["items"] == []
```

- [ ] **Step 2: Run backend tests to verify failure**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_insights.py
```

Expected: FAIL because the router/model does not exist.

- [ ] **Step 3: Add model and schemas**

Add `InsightItemModel` with columns:

- `id`: string primary key
- `kind`: string
- `title`: string
- `description`: text
- `source_session_ids`: JSON/text field following existing project JSON storage style
- `status`: string
- `created_at`
- `updated_at`

Add Pydantic schemas with camelCase API fields:

- `InsightItemCreate`
- `InsightItemOut`
- `InsightItemList`

- [ ] **Step 4: Add router**

Create `backend/routers/insights.py`:

- `GET /insights`: return all items, newest first by `updated_at`.
- `POST /insights`: create an accepted or ignored item.
- `DELETE /insights/{insight_id}`: delete an item.

Keep validation minimal: `kind` must be `habit` or `knowledge`; `status` must be `accepted` or `ignored`.

- [ ] **Step 5: Wire router and run backend tests**

Include the router under `/api/db` in `backend/main.py`.

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_insights.py
```

Expected: PASS.

---

### Task 2: Frontend API Client

**Files:**
- Modify: `src/services/dbApi.ts`

- [ ] **Step 1: Add insight API types**

Add:

```ts
export type InsightKind = 'habit' | 'knowledge';
export type InsightStatus = 'accepted' | 'ignored';

export interface PersistedInsightItem {
  id: string;
  kind: InsightKind;
  title: string;
  description: string;
  sourceSessionIds: string[];
  status: InsightStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateInsightItemInput {
  kind: InsightKind;
  title: string;
  description: string;
  sourceSessionIds: string[];
  status: InsightStatus;
}
```

- [ ] **Step 2: Add dbApi methods**

Add:

```ts
listInsights: () => req<{ items: PersistedInsightItem[] }>(`/insights`),
createInsight: (payload: CreateInsightItemInput) => req<PersistedInsightItem>(`/insights`, {
  method: 'POST',
  body: JSON.stringify(payload),
}),
deleteInsight: (id: string) => req<{ ok: boolean }>(`/insights/${id}`, { method: 'DELETE' }),
```

No frontend fallback storage.

---

### Task 3: HistoryPage Curation UI

**Files:**
- Modify: `src/components/HistoryPage.tsx`
- Test: `src/components/HistoryPage.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Extend `HistoryPage.test.tsx` to mock:

- `dbApi.listInsights`
- `dbApi.createInsight`
- `dbApi.deleteInsight`

Add tests that verify:

1. Clicking “采纳为习惯” calls `createInsight` with `kind: 'habit'`, `status: 'accepted'`, candidate title/description, and source session ids.
2. Clicking “采纳为知识素材” calls `createInsight` with `kind: 'knowledge'`.
3. Clicking “忽略” calls `createInsight` with `status: 'ignored'` and removes the candidate from the visible list.
4. “沉淀库” shows accepted habit and knowledge items from `listInsights`.
5. Clicking a deposited item source opens the original session detail.

- [ ] **Step 2: Run frontend tests to verify failure**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: FAIL because curation actions and deposit library do not exist yet.

- [ ] **Step 3: Add persisted insight state**

In `HistoryPage.tsx`, add:

- `persistedInsights`
- `loadPersistedInsights`
- `acceptInsight(item, kind)`
- `ignoreInsight(item)`
- `deletePersistedInsight(id)`

When loading insights, filter generated candidates against ignored records with the same title and source session ids so ignored candidates stop reappearing.

- [ ] **Step 4: Render candidate actions**

Extend `InsightSection` so each candidate can render action buttons:

- `采纳为习惯`
- `采纳为知识素材`
- `忽略`

After successful action, reload persisted insights and rebuild/filter visible candidates.

- [ ] **Step 5: Render deposit library**

Add a third mode or sub-view button: `沉淀库`.

Render accepted items in two sections:

- `用户习惯库`
- `知识素材池`

Each persisted item shows title, description, source session ids as buttons, and a delete action.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: PASS.

---

### Task 4: Verification and Tracking Matrix

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run backend tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_insights.py
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx src/App.test.tsx --run
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Browser verification**

Verify in browser:

1. “历史洞察” candidates show accept/ignore actions.
2. Accept as habit creates an item under “用户习惯库”.
3. Accept as knowledge creates an item under “知识素材池”.
4. Ignore removes a candidate from the visible insight list.
5. Refresh keeps accepted items.
6. Source session buttons still open session detail.
7. “继续这个上下文” still works from the opened detail.

- [ ] **Step 5: Update tracking matrix**

Add RQ-049 for “历史洞察沉淀闭环” with links to spec and plan, and append a 2026-06-18 timeline entry. Keep the item in progress until browser verification is confirmed.

---

## Self-Review

- Spec coverage: Plan covers candidate accept/ignore, persisted habit/knowledge views, source traceability, deletion, and no automatic memory/RAG/system-prompt integration.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: API fields use camelCase on the frontend and convert to backend storage fields in the router/schema layer.
