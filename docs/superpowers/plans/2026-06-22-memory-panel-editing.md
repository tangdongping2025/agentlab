# 记忆透视台 global/task 段编辑能力 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 记忆透视台 global(全局系统提示词)+ task(任务段)两段可在透视台行内编辑;task 段用户值覆盖 `_DEFAULT_SYSTEM_PROMPT`。

**Architecture:** 后端新增 `task_system_settings.py`(仿 `global_prompt_settings.py`,AppSetting 存 `{enabled, content}`)+ `/api/settings/task-system` 端点 + 接入 `claude_sdk_agent.py:117`(`task.system or 用户覆盖 or 默认`)+ `memory_preview.py` task 段;前端 `SegmentCard` 加 `editable` 行内编辑(global 复用现有 service,task 新增 service)。

**Tech Stack:** Python FastAPI + SQLAlchemy(`AppSettingModel`)+ pytest;React + TypeScript + Vitest(Testing Library)。

**关键约束:** `task_system_settings.py` 模块级**不得** import `claude_sdk_agent`(否则循环:`claude_sdk_agent` 要 import `task_system_settings` 接入 :117)。`_DEFAULT_SYSTEM_PROMPT` 在 `build_task_system_settings_response` 内用**延迟 import** 取。

---

### Task 1: backend task_system_settings.py + routers 端点(TDD)

**Files:**
- Create: `backend/task_system_settings.py`
- Create: `backend/tests/test_task_system_settings.py`
- Modify: `backend/routers/settings.py:10`(import)+ `:59` 后(新端点)

- [ ] **Step 1: 写失败测试 `backend/tests/test_task_system_settings.py`**

```python
from runtime.claude_sdk_agent import _DEFAULT_SYSTEM_PROMPT


def clear_task_system_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "task_system")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_save_task_system_settings_roundtrip():
    import task_system_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    clear_task_system_setting()

    saved = mod.save_task_system_settings({"enabled": True, "content": "自定义任务指令"})

    assert saved == {"enabled": True, "content": "自定义任务指令"}
    assert mod.load_task_system_settings() == saved
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "task_system")
        assert row.setting_value == saved
    finally:
        db.close()


def test_task_system_truncates_too_long_content(monkeypatch):
    import task_system_settings as mod

    clear_task_system_setting()
    monkeypatch.setattr(mod, "MAX_TASK_SYSTEM_CHARS", 5)

    saved = mod.save_task_system_settings({"enabled": True, "content": "123456789"})

    assert saved["content"] == "12345"


def test_build_task_system_for_agent():
    import task_system_settings as mod

    clear_task_system_setting()
    mod.save_task_system_settings({"enabled": True, "content": "  自定义任务指令  "})

    assert mod.build_task_system_for_agent("claude-sdk") == "自定义任务指令"
    assert mod.build_task_system_for_agent("echo") is None

    mod.save_task_system_settings({"enabled": False, "content": "自定义任务指令"})
    assert mod.build_task_system_for_agent("claude-sdk") is None


def test_build_task_system_settings_response():
    import task_system_settings as mod

    clear_task_system_setting()
    mod.save_task_system_settings({"enabled": True, "content": "自定义任务指令"})

    body = mod.build_task_system_settings_response()
    agents = {a["id"]: a for a in body["agents"]}

    assert body["enabled"] is True
    assert body["content"] == "自定义任务指令"
    assert body["defaultPreview"] == _DEFAULT_SYSTEM_PROMPT[:200]
    assert agents["claude-sdk"]["supportsTaskSystem"] is True
    assert agents["echo"]["supportsTaskSystem"] is False


def test_task_system_settings_api_roundtrip():
    from fastapi.testclient import TestClient
    from main import app

    clear_task_system_setting()

    with TestClient(app) as client:
        resp = client.get("/api/settings/task-system")
        assert resp.status_code == 200
        body = resp.json()
        assert body["enabled"] is False
        assert body["content"] == ""
        assert body["defaultPreview"] == _DEFAULT_SYSTEM_PROMPT[:200]

        resp = client.post("/api/settings/task-system", json={"enabled": True, "content": "自定义任务指令"})
        assert resp.status_code == 200
        body = resp.json()
        agents = {a["id"]: a for a in body["agents"]}
        assert body["enabled"] is True
        assert body["content"] == "自定义任务指令"
        assert agents["claude-sdk"]["supportsTaskSystem"] is True
        assert agents["echo"]["supportsTaskSystem"] is False
```

- [ ] **Step 2: 跑测试验证失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_task_system_settings.py -v`
Expected: FAIL — `No module named 'task_system_settings'`

- [ ] **Step 3: 实现 `backend/task_system_settings.py`**

```python
from __future__ import annotations

from typing import Any

from database import SessionLocal
from models import AppSettingModel
from runtime.registry import _AGENT_REGISTRY

TASK_SYSTEM_SETTING_KEY = "task_system"
SUPPORTED_TASK_SYSTEM_AGENT_IDS = {"claude-sdk"}
MAX_TASK_SYSTEM_CHARS = 20000
_DEFAULT_PREVIEW_LIMIT = 200


def sanitize_task_system_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    content = (raw or {}).get("content", "")
    if not isinstance(content, str):
        content = ""
    content = content[:MAX_TASK_SYSTEM_CHARS]
    return {
        "enabled": bool((raw or {}).get("enabled", False)),
        "content": content,
    }


def load_task_system_settings() -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, TASK_SYSTEM_SETTING_KEY)
        if row:
            return sanitize_task_system_settings(row.setting_value)
        return {"enabled": False, "content": ""}
    finally:
        db.close()


def save_task_system_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_task_system_settings(raw)
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, TASK_SYSTEM_SETTING_KEY)
        if row:
            row.setting_value = settings
        else:
            db.add(AppSettingModel(setting_key=TASK_SYSTEM_SETTING_KEY, setting_value=settings))
        db.commit()
        return settings
    finally:
        db.close()


def build_task_system_for_agent(agent_id: str) -> str | None:
    if agent_id not in SUPPORTED_TASK_SYSTEM_AGENT_IDS:
        return None
    settings = load_task_system_settings()
    content = settings["content"].strip()
    if not settings["enabled"] or not content:
        return None
    return content


def build_task_system_settings_response() -> dict[str, Any]:
    # 延迟 import:claude_sdk_agent 模块级 import 本模块(接入 :117),模块级反 import 会循环
    from runtime.claude_sdk_agent import _DEFAULT_SYSTEM_PROMPT

    settings = load_task_system_settings()
    agents = [
        {
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsTaskSystem": agent_id in SUPPORTED_TASK_SYSTEM_AGENT_IDS,
            "unsupportedReason": "任务段覆盖仅支持 claude-sdk Agent" if agent_id not in SUPPORTED_TASK_SYSTEM_AGENT_IDS else "",
        }
        for agent_id, cls in _AGENT_REGISTRY.items()
    ]
    return {**settings, "defaultPreview": _DEFAULT_SYSTEM_PROMPT[:_DEFAULT_PREVIEW_LIMIT], "agents": agents}
```

- [ ] **Step 4: 跑测试(除 api roundtrip)验证通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_task_system_settings.py -v -k "not api_roundtrip"`
Expected: 4 passed(roundtrip / truncates / build_for_agent / build_response);`api_roundtrip` 仍 fail(端点未加)

- [ ] **Step 5: 加 routers 端点**

Modify `backend/routers/settings.py`:

`:10` import 行:
```python
from global_prompt_settings import build_global_prompt_settings_response, save_global_prompt_settings
from task_system_settings import build_task_system_settings_response, save_task_system_settings
```

`:59` 后(global-prompt 端点块之后)加:
```python
@router.get("/task-system")
def get_task_system_settings() -> dict:
    return build_task_system_settings_response()


@router.post("/task-system")
def update_task_system_settings(payload: dict) -> dict:
    save_task_system_settings(payload)
    return build_task_system_settings_response()
```

- [ ] **Step 6: 跑全部测试验证通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_task_system_settings.py -v`
Expected: 5 passed

- [ ] **Step 7: commit**

```bash
git add backend/task_system_settings.py backend/tests/test_task_system_settings.py backend/routers/settings.py
git commit -m "feat(backend): 新增 task_system_settings + /api/settings/task-system 端点"
```

---

### Task 2: backend 接入 claude_sdk_agent + memory_preview task 段(TDD)

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py:23`(import)+ `:117`(拼装)
- Modify: `backend/memory_preview.py:4`(import)+ `:92`(task_text)+ `:105`(source 注释)
- Modify: `backend/tests/test_memory_preview.py`(追加 2 个 task 段测试)

- [ ] **Step 1: 追加失败测试到 `backend/tests/test_memory_preview.py`**

```python
def test_memory_preview_task_segment_uses_override(monkeypatch):
    import memory_preview as mp

    monkeypatch.setattr(mp, "build_task_system_for_agent", lambda aid: "我的任务指令")
    resp = mp.build_memory_preview_response("claude-sdk")
    task_seg = next(s for s in resp["segments"] if s["key"] == "task")
    assert task_seg["preview"] == "我的任务指令"


def test_memory_preview_task_segment_falls_back_to_default(monkeypatch):
    import memory_preview as mp
    from runtime.claude_sdk_agent import _DEFAULT_SYSTEM_PROMPT

    monkeypatch.setattr(mp, "build_task_system_for_agent", lambda aid: None)
    resp = mp.build_memory_preview_response("claude-sdk")
    task_seg = next(s for s in resp["segments"] if s["key"] == "task")
    assert task_seg["preview"] == _DEFAULT_SYSTEM_PROMPT[:200]
```

- [ ] **Step 2: 跑测试验证失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_memory_preview.py -v -k task_segment`
Expected: FAIL — `AttributeError: module 'memory_preview' has no attribute 'build_task_system_for_agent'`(memory_preview 还没 import 它)

- [ ] **Step 3: 接入 `backend/runtime/claude_sdk_agent.py`**

`:23` import 行(在 `from global_prompt_settings import ...` 之后加一行):
```python
from global_prompt_settings import build_global_prompt_for_agent
from task_system_settings import build_task_system_for_agent
```

`:117` 拼装行,把 `(task.system or _DEFAULT_SYSTEM_PROMPT)` 改成 `(task.system or build_task_system_for_agent("claude-sdk") or _DEFAULT_SYSTEM_PROMPT)`:
```python
        system_prompt = build_global_prompt_for_agent("claude-sdk") + (task.system or build_task_system_for_agent("claude-sdk") or _DEFAULT_SYSTEM_PROMPT) + build_skill_prompt_for_agent("claude-sdk", task.cwd) + build_habit_prompt_for_agent("claude-sdk")
```

- [ ] **Step 4: 接入 `backend/memory_preview.py`**

`:4` import 区,在 `from global_prompt_settings import ...` 之后加:
```python
from task_system_settings import build_task_system_for_agent
```

`:92` 把 `task_text = _DEFAULT_SYSTEM_PROMPT` 改成:
```python
    task_text = build_task_system_for_agent("claude-sdk") or _DEFAULT_SYSTEM_PROMPT
```

`:105` task 段 `_segment(...)` 的 source 参数改成:
```python
        _segment("task", "任务段", task_text, "用户覆盖(启用)或 _DEFAULT_SYSTEM_PROMPT(代码默认);运行时 task.system 优先级更高"),
```

- [ ] **Step 5: 跑测试验证通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_memory_preview.py -v`
Expected: 全部 passed(原有测试 + 新 2 个 task_segment 测试)

- [ ] **Step 6: commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/memory_preview.py backend/tests/test_memory_preview.py
git commit -m "feat(backend): task 段接入用户覆盖(task.system or override or 默认)"
```

---

### Task 3: 前端 agentRuntimeApi service + MemoryPanel SegmentCard 行内编辑(TDD)

**Files:**
- Modify: `src/services/agentRuntimeApi.ts`(加 TaskSystem 类型 + service)
- Modify: `src/components/agentRuntime/MemoryPanel.tsx`(import + SegmentCard + 渲染 + reload)
- Create: `src/components/agentRuntime/MemoryPanel.test.tsx`

- [ ] **Step 1: 写失败测试 `src/components/agentRuntime/MemoryPanel.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MemoryPanel from './MemoryPanel';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('MemoryPanel segment editing', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/db/root-dir')) return jsonResponse({ root_dir: '/workspace' });
      if (url.includes('/api/settings/memory-preview')) {
        return jsonResponse({
          segments: [
            { key: 'global', name: '全局系统提示词', enabled: true, chars: 10, source: 'global_prompt_settings', preview: '旧全局' },
            { key: 'task', name: '任务段', enabled: true, chars: 20, source: '默认', preview: '旧任务' },
          ],
          totalChars: 30,
          tools: { system: [], mcp: [] },
          habits: [],
          knowledge: [],
          globalPrompt: { enabled: false, chars: 0 },
        });
      }
      if (url === '/api/settings/global-prompt' && init?.method === 'POST') return jsonResponse({ enabled: true, prompt: '新全局', agents: [] });
      if (url === '/api/settings/global-prompt') return jsonResponse({ enabled: true, prompt: '旧全局全文', agents: [] });
      if (url === '/api/settings/task-system' && init?.method === 'POST') return jsonResponse({ enabled: true, content: '新任务', defaultPreview: '默认', agents: [] });
      if (url === '/api/settings/task-system') return jsonResponse({ enabled: true, content: '旧任务全文', defaultPreview: '默认', agents: [] });
      return jsonResponse({});
    });
  });

  it('edits global segment inline and saves', async () => {
    render(<MemoryPanel cwd="/workspace" />);
    const editBtns = await screen.findAllByText('编辑');
    fireEvent.click(editBtns[0]); // global 段
    const textarea = await screen.findByDisplayValue('旧全局全文');
    fireEvent.change(textarea, { target: { value: '新全局' } });
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(c => String(c[0]) === '/api/settings/global-prompt' && (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({ enabled: true, prompt: '新全局' });
    });
  });

  it('edits task segment and resets to default (enabled=false, content kept)', async () => {
    render(<MemoryPanel cwd="/workspace" />);
    const editBtns = await screen.findAllByText('编辑');
    fireEvent.click(editBtns[1]); // task 段
    await screen.findByDisplayValue('旧任务全文');
    fireEvent.click(screen.getByText('恢复默认(关启用,保留内容)'));
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(c => String(c[0]) === '/api/settings/task-system' && (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({ enabled: false, content: '旧任务全文' });
    });
  });
});
```

- [ ] **Step 2: 跑测试验证失败**

Run: `npm run test -- MemoryPanel.test --run`
Expected: FAIL — 找不到「编辑」按钮(`SegmentCard` 还没 editable)

- [ ] **Step 3: 加 agentRuntimeApi service**

Modify `src/services/agentRuntimeApi.ts`,在 `GlobalPromptSettingsResponse`(`:95` 附近)之后加类型:
```tsx
export interface TaskSystemAgentSupport {
  id: string;
  name: string;
  supportsTaskSystem: boolean;
  unsupportedReason: string;
}

export interface TaskSystemSettingsResponse {
  enabled: boolean;
  content: string;
  defaultPreview: string;
  agents: TaskSystemAgentSupport[];
}
```

在 `saveGlobalPromptSettings`(`:215-223` 附近)之后加:
```tsx
export async function getTaskSystemSettings(): Promise<TaskSystemSettingsResponse> {
  const resp = await fetch('/api/settings/task-system');
  if (!resp.ok) throw new Error(`getTaskSystemSettings failed: ${resp.status}`);
  return resp.json();
}

export async function saveTaskSystemSettings(payload: { enabled: boolean; content: string }): Promise<TaskSystemSettingsResponse> {
  const resp = await fetch('/api/settings/task-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`saveTaskSystemSettings failed: ${resp.status}`);
  return resp.json();
}
```

- [ ] **Step 4: 改 `src/components/agentRuntime/MemoryPanel.tsx`**

`:3` import 行扩展(把现有 `getMemoryPreview, type MemoryPreviewResponse, type MemorySegment` 那行追加 4 个 service):
```tsx
import {
  getMemoryPreview,
  getGlobalPromptSettings,
  saveGlobalPromptSettings,
  getTaskSystemSettings,
  saveTaskSystemSettings,
  type MemoryPreviewResponse,
  type MemorySegment,
} from '../../services/agentRuntimeApi';
```

替换 `SegmentCard` 整个函数(`:81-99`)为:
```tsx
const editButtonStyle: React.CSSProperties = {
  border: '1px solid #2563EB',
  borderRadius: 999,
  background: '#FFFDF9',
  color: '#2563EB',
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
};

const saveButtonStyle: React.CSSProperties = {
  border: '1px solid #16A34A',
  borderRadius: 999,
  background: '#16A34A',
  color: '#fff',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 12,
};

const cancelButtonStyle: React.CSSProperties = {
  border: '1px solid #D6CFC4',
  borderRadius: 999,
  background: '#FFFDF9',
  color: '#4A4A4A',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 12,
};

function SegmentCard({ seg, total, editable, onLoad, onSave, onSaved }: {
  seg: MemorySegment;
  total: number;
  editable?: boolean;
  onLoad?: () => Promise<{ enabled: boolean; text: string }>;
  onSave?: (enabled: boolean, text: string) => Promise<void>;
  onSaved?: () => void;
}) {
  const pct = total > 0 ? Math.round((seg.chars / total) * 100) : 0;
  const [editing, setEditing] = React.useState(false);
  const [draftEnabled, setDraftEnabled] = React.useState(seg.enabled);
  const [draftText, setDraftText] = React.useState(seg.preview);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editError, setEditError] = React.useState('');

  const enterEdit = async () => {
    if (!onLoad) return;
    setEditing(true);
    setEditError('');
    setLoading(true);
    try {
      const { enabled, text } = await onLoad();
      setDraftEnabled(enabled);
      setDraftText(text);
    } catch (e) {
      setEditError(`加载失败:${(e as Error).message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    setEditError('');
    try {
      await onSave(draftEnabled, draftText);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setEditError(`保存失败:${(e as Error).message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {seg.name}
          <span style={badgeStyle(seg.enabled)}>{seg.enabled ? '启用' : '空'}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#8A8177', fontSize: 11, whiteSpace: 'nowrap' }}>{seg.chars} 字符 · {pct}%</span>
          {editable && !editing && <button type="button" onClick={enterEdit} style={editButtonStyle}>编辑</button>}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: '#ECE7DE', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: seg.chars > 0 ? '#2563EB' : '#D6CFC4' }} />
      </div>
      {!editing && seg.preview && <pre style={previewStyle}>{seg.preview}</pre>}
      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4A4A4A' }}>
            <input type="checkbox" checked={draftEnabled} onChange={e => setDraftEnabled(e.target.checked)} />
            启用注入
          </label>
          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            disabled={loading}
            style={{ ...previewStyle, minHeight: 160, resize: 'vertical' }}
          />
          {loading && <div style={noteStyle}>加载全文...</div>}
          {editError && <div style={{ color: '#B91C1C', fontSize: 12 }}>{editError}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={saving || loading} style={saveButtonStyle}>{saving ? '保存中...' : '保存'}</button>
            <button type="button" onClick={() => { setEditing(false); setEditError(''); }} disabled={saving} style={cancelButtonStyle}>取消</button>
            {seg.key === 'task' && (
              <button type="button" onClick={() => setDraftEnabled(false)} disabled={saving} style={cancelButtonStyle}>恢复默认(关启用,保留内容)</button>
            )}
          </div>
        </div>
      )}
      {!editing && <div style={noteStyle}>{seg.source}</div>}
    </div>
  );
}
```

在 `MemoryPanel` 组件内,`toggleHabit` 之后(`:139` 附近)加 reload:
```tsx
  const reload = React.useCallback(() => {
    getMemoryPreview(cwd)
      .then(d => { setData(d); setError(''); })
      .catch(() => setError('记忆透视台刷新失败'));
  }, [cwd]);
```

替换 segments 渲染行(`:157`):
```tsx
              {data.segments.map(seg => {
                if (seg.key === 'global') {
                  return (
                    <SegmentCard key={seg.key} seg={seg} total={data.totalChars} editable
                      onLoad={async () => { const r = await getGlobalPromptSettings(); return { enabled: r.enabled, text: r.prompt }; }}
                      onSave={(en, text) => saveGlobalPromptSettings({ enabled: en, prompt: text })}
                      onSaved={reload}
                    />
                  );
                }
                if (seg.key === 'task') {
                  return (
                    <SegmentCard key={seg.key} seg={seg} total={data.totalChars} editable
                      onLoad={async () => { const r = await getTaskSystemSettings(); return { enabled: r.enabled, text: r.content }; }}
                      onSave={(en, text) => saveTaskSystemSettings({ enabled: en, content: text })}
                      onSaved={reload}
                    />
                  );
                }
                return <SegmentCard key={seg.key} seg={seg} total={data.totalChars} />;
              })}
```

- [ ] **Step 5: 跑测试验证通过**

Run: `npm run test -- MemoryPanel.test --run`
Expected: 2 passed(global inline save + task reset default)

- [ ] **Step 6: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 通过

- [ ] **Step 7: commit**

```bash
git add src/services/agentRuntimeApi.ts src/components/agentRuntime/MemoryPanel.tsx src/components/agentRuntime/MemoryPanel.test.tsx
git commit -m "feat(frontend): MemoryPanel global/task 段行内编辑"
```

---

### Task 4: 容器更新 + 跟踪矩阵

- [ ] **Step 1: 浏览器验收(dev)**

Run: `npm run dev`(前端 5173)+ 后端 8000 已跑
验证:龙虾 Agent 工作台「记忆」tab,global/task 两段卡片有「编辑」按钮 → 点编辑 → textarea 出现(全文)→ 改内容/开关启用 → 保存 → 卡片刷新(字符数/百分比变);task「恢复默认」关启用保留内容。

- [ ] **Step 2: 薄层 patch 更新线上容器**

按 `memory/project_agentlab-docker-restart.md` 薄层 patch 模式:
1. `npm run build`(已出 dist)
2. `cp -r dist .docker-build/dist`
3. 写 `Dockerfile.patch`:`FROM agentlab:rq081` + `RUN rm -rf /usr/share/nginx/html/*` + `COPY .docker-build/dist/ /usr/share/nginx/html/` + `COPY backend/ /app/backend/`(本次前后端都改,backend 也要 COPY)
4. `MSYS_NO_PATHCONV=1 docker build -f Dockerfile.patch -t agentlab:rq082 .`
5. 重建容器(rq082 + env-file 继承 env + IS_SANDBOX=1 + supervisord command)
6. 验证:`supervisorctl status` 两程序 RUNNING + `/api/db/health` ok + memory-preview task 段返回用户覆盖内容
7. 清理 `Dockerfile.patch` + `.docker-build/dist`

- [ ] **Step 3: 更新跟踪矩阵**

`项目执行跟踪矩阵.md` 加 RQ-081(记忆透视台 global/task 段编辑)记录:spec + plan 路径、执行 commits、验证结果。commit。
