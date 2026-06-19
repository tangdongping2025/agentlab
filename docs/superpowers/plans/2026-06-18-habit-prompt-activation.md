# Habit Prompt Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let accepted habit insights affect supported agents only when the user explicitly enables them for prompt injection.

**Architecture:** Extend persisted insight items with `enabledForPrompt`, add a PATCH endpoint, expose a toggle in the deposit library, and add a small prompt builder used by BaseAgent and ClaudeSdkAgent after global prompt, agent prompt, and Skill prompt. Keep knowledge items and echo excluded.

**Tech Stack:** FastAPI + SQLAlchemy + MySQL, React 18 + TypeScript + Vitest + React Testing Library, pytest.

---

## File Structure

- Modify `backend/models.py`: add `enabled_for_prompt` to `InsightItemModel`.
- Modify `backend/schemas.py`: add `enabledForPrompt` to insight output and update schema.
- Modify `backend/routers/insights.py`: support PATCH update for `enabledForPrompt`.
- Create `backend/habit_prompt_settings.py`: build prompt text from enabled habit insights.
- Modify `backend/runtime/base_agent.py`: append habit prompt for BaseAgent agents.
- Modify `backend/runtime/claude_sdk_agent.py`: append habit prompt for Claude SDK agent.
- Modify `backend/conftest.py`: no new cleanup if `InsightItemModel` cleanup already exists.
- Modify `backend/tests/test_insights.py`: cover default disabled and PATCH toggle.
- Create `backend/tests/test_habit_prompt_settings.py`: cover prompt building and supported agents.
- Modify `src/services/dbApi.ts`: add `enabledForPrompt` and `updateInsight`.
- Modify `src/components/HistoryPage.tsx`: add “用于智能体提示词” toggle and “已生效” label.
- Modify `src/components/HistoryPage.test.tsx`: cover toggle persistence call and label rendering.
- Modify `项目执行跟踪矩阵.md`: add RQ-050 after validation.

---

### Task 1: Backend Insight Prompt Flag

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/schemas.py`
- Modify: `backend/routers/insights.py`
- Test: `backend/tests/test_insights.py`

- [ ] **Step 1: Write failing backend tests**

Extend `backend/tests/test_insights.py` with:

```python
def test_insight_defaults_disabled_for_prompt(client, db):
    res = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "适合先明确方案再实现。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    })
    assert res.status_code == 200
    assert res.json()["enabledForPrompt"] is False


def test_update_insight_enabled_for_prompt(client, db):
    insight_id = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "适合先明确方案再实现。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    }).json()["id"]

    patch = client.patch(f"/api/db/insights/{insight_id}", json={"enabledForPrompt": True})
    assert patch.status_code == 200
    assert patch.json()["enabledForPrompt"] is True

    listed = client.get("/api/db/insights").json()["items"]
    assert listed[0]["enabledForPrompt"] is True
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_insights.py
```

Expected: FAIL because `enabledForPrompt` and PATCH do not exist.

- [ ] **Step 3: Add model/schema field**

Add `enabled_for_prompt = Column(Boolean, nullable=False, default=False)` to `InsightItemModel`.

Update schemas:

- `InsightItemCreate`: no required `enabledForPrompt`; creation always defaults false unless explicitly present is ignored.
- `InsightItemOut`: add `enabledForPrompt: bool = False`.
- `InsightItemUpdate`: add optional `enabledForPrompt: bool`.

- [ ] **Step 4: Add PATCH endpoint**

In `backend/routers/insights.py` add:

```python
@router.patch("/insights/{insight_id}", response_model=InsightItemOut)
def update_insight(insight_id: str, payload: InsightItemUpdate, db: Session = Depends(get_db)):
    item = db.get(models.InsightItemModel, insight_id)
    if not item:
        raise HTTPException(status_code=404, detail="insight not found")
    if payload.enabledForPrompt is not None:
        item.enabled_for_prompt = bool(payload.enabledForPrompt)
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return _to_out(item)
```

- [ ] **Step 5: Run backend insight tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_insights.py
```

Expected: PASS.

---

### Task 2: Habit Prompt Builder and Runtime Injection

**Files:**
- Create: `backend/habit_prompt_settings.py`
- Modify: `backend/runtime/base_agent.py`
- Modify: `backend/runtime/claude_sdk_agent.py`
- Test: `backend/tests/test_habit_prompt_settings.py`
- Test: `backend/tests/test_base_agent.py` or `backend/tests/test_claude_sdk_agent.py` if direct prompt construction tests already exist.

- [ ] **Step 1: Write failing prompt builder tests**

Create `backend/tests/test_habit_prompt_settings.py`:

```python
def test_build_habit_prompt_includes_only_enabled_habits(client, db):
    client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "适合先明确方案再实现。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    })
    enabled_id = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "重视验证和验收",
        "description": "完成判断需要可检查证据。",
        "sourceSessionIds": ["s2"],
        "status": "accepted",
    }).json()["id"]
    client.patch(f"/api/db/insights/{enabled_id}", json={"enabledForPrompt": True})
    knowledge_id = client.post("/api/db/insights", json={
        "kind": "knowledge",
        "title": "知识库素材",
        "description": "不应注入提示词。",
        "sourceSessionIds": ["s3"],
        "status": "accepted",
    }).json()["id"]
    client.patch(f"/api/db/insights/{knowledge_id}", json={"enabledForPrompt": True})

    from habit_prompt_settings import build_habit_prompt_for_agent
    prompt = build_habit_prompt_for_agent("assistant")

    assert "用户协作偏好" in prompt
    assert "重视验证和验收" in prompt
    assert "偏好先设计和计划" not in prompt
    assert "知识库素材" not in prompt


def test_build_habit_prompt_skips_unsupported_agent(client, db):
    insight_id = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "重视验证和验收",
        "description": "完成判断需要可检查证据。",
        "sourceSessionIds": ["s2"],
        "status": "accepted",
    }).json()["id"]
    client.patch(f"/api/db/insights/{insight_id}", json={"enabledForPrompt": True})

    from habit_prompt_settings import build_habit_prompt_for_agent
    assert build_habit_prompt_for_agent("echo") == ""
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_habit_prompt_settings.py
```

Expected: FAIL because `habit_prompt_settings.py` does not exist.

- [ ] **Step 3: Implement prompt builder**

Create `backend/habit_prompt_settings.py` with:

- `SUPPORTED_HABIT_PROMPT_AGENT_IDS = {"assistant", "research", "claude-sdk"}`
- `build_habit_prompt_for_agent(agent_id: str) -> str`

Query `InsightItemModel` where:

- `kind == "habit"`
- `status == "accepted"`
- `enabled_for_prompt == True`

Return empty string for unsupported agents or no enabled habits. Otherwise return:

```text
[用户协作偏好]
- title：description
[/用户协作偏好]

```

- [ ] **Step 4: Inject into BaseAgent and ClaudeSdkAgent**

In `backend/runtime/base_agent.py`, import `build_habit_prompt_for_agent` and append after Skill prompt:

```python
system_prompt = (
    build_global_prompt_for_agent(self.metadata.id)
    + (self.system_prompt or "")
    + build_skill_prompt_for_agent(self.metadata.id)
    + build_habit_prompt_for_agent(self.metadata.id)
)
```

In `backend/runtime/claude_sdk_agent.py`, import and append similarly after Skill prompt.

- [ ] **Step 5: Run backend prompt tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_habit_prompt_settings.py tests/test_insights.py
```

Expected: PASS.

---

### Task 3: Frontend Toggle in Deposit Library

**Files:**
- Modify: `src/services/dbApi.ts`
- Modify: `src/components/HistoryPage.tsx`
- Test: `src/components/HistoryPage.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Extend HistoryPage tests:

```tsx
it('toggles habit prompt activation in deposit library', async () => {
  mockedListInsights.mockResolvedValue({
    items: [{
      id: 'i1', kind: 'habit', title: '偏好先设计和计划', description: '适合先明确方案再实现。',
      sourceSessionIds: ['s1'], status: 'accepted', enabledForPrompt: false,
    }],
  });
  mockedUpdateInsight.mockResolvedValue({
    id: 'i1', kind: 'habit', title: '偏好先设计和计划', description: '适合先明确方案再实现。',
    sourceSessionIds: ['s1'], status: 'accepted', enabledForPrompt: true,
  });

  render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
  fireEvent.click(screen.getByText('沉淀库'));
  fireEvent.click(await screen.findByLabelText('用于智能体提示词'));

  expect(mockedUpdateInsight).toHaveBeenCalledWith('i1', { enabledForPrompt: true });
});
```

Also verify an enabled habit renders `已生效`.

- [ ] **Step 2: Add API client update method**

In `dbApi.ts`:

- Add `enabledForPrompt: boolean` to `PersistedInsightItem`.
- Add:

```ts
updateInsight: (id: string, payload: { enabledForPrompt?: boolean }) =>
  req<PersistedInsightItem>(`/insights/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
```

- [ ] **Step 3: Add toggle UI**

In “用户习惯库” item rendering only:

- Add checkbox labeled `用于智能体提示词`.
- Checked state from `item.enabledForPrompt`.
- On change call `dbApi.updateInsight(item.id, { enabledForPrompt: e.target.checked })`, then reload persisted insights.
- If enabled, render `已生效`.

Do not render this toggle for knowledge items.

- [ ] **Step 4: Run frontend tests**

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
cd backend && .venv/Scripts/python.exe -m pytest tests/test_insights.py tests/test_habit_prompt_settings.py tests/test_base_agent.py tests/test_claude_sdk_agent.py
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

1. Accepted habit items in “用户习惯库” show “用于智能体提示词”.
2. Toggle defaults off for newly accepted habits.
3. Toggling on shows `已生效` and survives refresh.
4. Toggling off removes `已生效` and survives refresh.
5. Knowledge items do not show the prompt toggle.
6. Running `assistant` or `research` receives enabled habit prompt behavior.
7. Existing history recovery and source session opening still work.

- [ ] **Step 5: Update tracking matrix**

Add RQ-050 for “习惯生效 v1” with links to spec and plan, and append a 2026-06-18 timeline entry. Keep the item in progress until browser verification is confirmed.

---

## Self-Review

- Spec coverage: Plan covers explicit toggle, default disabled, persistence, supported agents, prompt injection, and knowledge/echo exclusion.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: Backend uses `enabled_for_prompt`; API and frontend use `enabledForPrompt`.
