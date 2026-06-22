# 记忆透视台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为龙虾 Agent(claude-sdk)工作台新增「记忆」tab,把 agent 的 4 层记忆 + system prompt 拼装解剖 + 工具清单摊开给用户看(教学/理解向)。

**Architecture:** 后端新增聚合接口 `GET /api/settings/memory-preview`,复用现有 `build_global/skill/habit_prompt_for_agent` + `_DEFAULT_SYSTEM_PROMPT` + amap MCP 段,返回分段(字符数/预览/来源)+ 工具清单 + 习惯/知识列表 + 全局提示词状态;前端新增 `MemoryPanel.tsx` + `agentRuntimeApi.getMemoryPreview`,TabsWorkspace 接线「记忆」tab(后端 metadata `tabs` 同步追加)。会话窗口部分从 `agentRuntimeStore` 读,不入接口。

**Tech Stack:** Python FastAPI + SQLAlchemy(MySQL)、React 18 + TypeScript + Zustand、Vitest + Testing Library、pytest + TestClient。

---

## File Structure

- **Create** `backend/memory_preview.py` — 聚合 helper `build_memory_preview_response(agent_id, cwd)`,复用各 `build_*_prompt_for_agent`,查 `insight_items` 按 kind,返回分段/工具/习惯/知识/全局状态。单一职责:把"agent 脑子里装了什么"聚合成一个响应。
- **Modify** `backend/runtime/claude_sdk_agent.py` — ① 把 `_build_options` 内 amap 段文本提取为模块常量 `_AMAP_SYSTEM_PROMPT_SUFFIX`(_build_options 改引用常量,行为不变);② metadata `workspace.tabs` 追加 `"记忆"`。
- **Modify** `backend/routers/settings.py` — 新增 `GET /memory-preview` 端点,调用 `build_memory_preview_response("claude-sdk", cwd)`。
- **Create** `backend/tests/test_memory_preview.py` — 覆盖 5 段结构、工具清单、globalPrompt、habits/knowledge 列表。
- **Modify** `backend/tests/test_agents_api.py` — 断言 claude-sdk metadata `tabs` 含 `"记忆"`。
- **Modify** `src/services/agentRuntimeApi.ts` — 新增 `MemorySegment` / `MemoryInsight` / `MemoryPreviewResponse` 类型 + `getMemoryPreview(cwd)` 顶层 async 函数(照 `getSkillSettings` 模式)。
- **Create** `src/components/agentRuntime/MemoryPanel.tsx` — 5 区块面板:拼装解剖 / 工具清单 / 会话历史(当前任务+历史窗口)/ 习惯可写 / 知识只读。复用 SkillPanel/McpPanel 暖白卡片样式。
- **Modify** `src/components/agentRuntime/TabsWorkspace.tsx` — import MemoryPanel + 渲染分支 `{active === '记忆' && <MemoryPanel cwd={workspaceCwd} />}`。
- **Modify** `src/components/agentRuntime/TabsWorkspace.test.tsx` — beforeEach 的 mock tabs 加 `"记忆"`;新增「点记忆 tab 渲染 MemoryPanel」用例。

---

### Task 1: 后端 memory-preview 接口 + amap 段常量提取

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`
- Create: `backend/memory_preview.py`
- Modify: `backend/routers/settings.py`
- Test: `backend/tests/test_memory_preview.py`

- [ ] **Step 1: 写失败测试 `test_memory_preview.py`**

创建 `backend/tests/test_memory_preview.py`:

```python
def test_memory_preview_returns_five_segments_and_tools(tmp_path, monkeypatch):
    import global_prompt_settings as gp
    monkeypatch.setattr(gp, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "g.json")
    gp.save_global_prompt_settings({"enabled": True, "prompt": "全局规则"})

    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        resp = client.get("/api/settings/memory-preview")
        assert resp.status_code == 200
        data = resp.json()
        keys = [s["key"] for s in data["segments"]]
        assert keys == ["global", "task", "skill", "habit", "mcp"]
        assert data["totalChars"] == sum(s["chars"] for s in data["segments"])
        assert "Read" in data["tools"]["system"]
        assert isinstance(data["habits"], list)
        assert isinstance(data["knowledge"], list)
        assert data["globalPrompt"]["enabled"] is True
        for s in data["segments"]:
            assert {"key", "name", "enabled", "chars", "source", "preview"} <= set(s.keys())
        global_seg = next(s for s in data["segments"] if s["key"] == "global")
        assert "全局规则" in global_seg["preview"]
        assert global_seg["enabled"] is True
        task_seg = next(s for s in data["segments"] if s["key"] == "task")
        assert "coding 助手" in task_seg["preview"]


def test_memory_preview_lists_habits_and_knowledge(tmp_path, monkeypatch):
    import uuid
    import global_prompt_settings as gp
    monkeypatch.setattr(gp, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "g.json")
    from database import SessionLocal, create_tables
    from models import InsightItemModel

    create_tables()
    hid, kid = str(uuid.uuid4()), str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.merge(InsightItemModel(id=hid, kind="habit", title="偏好A", description="d", status="accepted", enabled_for_prompt=True))
        db.merge(InsightItemModel(id=kid, kind="knowledge", title="知识B", description="d", status="accepted", enabled_for_prompt=False))
        db.commit()
    finally:
        db.close()

    from fastapi.testclient import TestClient
    from main import app

    try:
        with TestClient(app) as client:
            data = client.get("/api/settings/memory-preview").json()
            assert any(h["title"] == "偏好A" and h["enabledForPrompt"] is True for h in data["habits"])
            assert any(k["title"] == "知识B" for k in data["knowledge"])
    finally:
        db = SessionLocal()
        try:
            for rid in (hid, kid):
                row = db.get(InsightItemModel, rid)
                if row:
                    db.delete(row)
            db.commit()
        finally:
            db.close()
```

- [ ] **Step 2: 跑测试确认 RED**

Run:
```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_memory_preview.py -q
```
Expected: FAIL — `/api/settings/memory-preview` 404(端点未实现),或 `build_memory_preview_response` 不存在。

- [ ] **Step 3: 提取 `_AMAP_SYSTEM_PROMPT_SUFFIX` 常量**

在 `backend/runtime/claude_sdk_agent.py` 模块顶部,`_DEFAULT_SYSTEM_PROMPT` 定义(约 line 50)之后,追加:

```python
_AMAP_SYSTEM_PROMPT_SUFFIX = (
    "\n你还接入了高德地图工具(mcp__amap-maps__*):"
    "地理编码/逆地理编码、POI 关键词与周边搜索、"
    "路线规划(步行/驾车/公交/骑行)、距离测量、天气、IP 定位等。"
)
```

然后在 `_build_options` 方法内,把内联拼装的 amap 段替换为常量引用。定位 `_build_options` 内这段(约 line 112-118):

```python
    if _AMAP_SERVER_NAME in mcp_servers:
        allowed_tools.append(f"mcp__{_AMAP_SERVER_NAME}__*")
        system_prompt += (
            "\n你还接入了高德地图工具(mcp__amap-maps__*):"
            "地理编码/逆地理编码、POI 关键词与周边搜索、"
            "路线规划(步行/驾车/公交/骑行)、距离测量、天气、IP 定位等。"
        )
```

替换为:

```python
    if _AMAP_SERVER_NAME in mcp_servers:
        allowed_tools.append(f"mcp__{_AMAP_SERVER_NAME}__*")
        system_prompt += _AMAP_SYSTEM_PROMPT_SUFFIX
```

> 若 `old_string` 不精确匹配(空格/标点差异),先 Read `backend/runtime/claude_sdk_agent.py` 取 line 107-130 实际文本再替换,保持文本内容一字不改,仅改成引用常量。

- [ ] **Step 4: 实现 `backend/memory_preview.py`**

创建 `backend/memory_preview.py`:

```python
from __future__ import annotations

from database import SessionLocal
from global_prompt_settings import build_global_prompt_for_agent, load_global_prompt_settings
from habit_prompt_settings import build_habit_prompt_for_agent
import models
from runtime.claude_sdk_agent import (
    _ALLOWED_TOOLS,
    _AMAP_SERVER_NAME,
    _AMAP_SYSTEM_PROMPT_SUFFIX,
    _DEFAULT_SYSTEM_PROMPT,
    _build_mcp_servers,
)
from skill_settings import build_skill_prompt_for_agent

_PREVIEW_LIMIT = 200

SUPPORTED_MEMORY_PREVIEW_AGENT_IDS = {"claude-sdk"}


def _segment(key: str, name: str, text: str, source: str, enabled: bool = True) -> dict:
    return {
        "key": key,
        "name": name,
        "enabled": enabled,
        "chars": len(text),
        "source": source,
        "preview": text[:_PREVIEW_LIMIT],
    }


def _insight_to_out(item) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "description": item.description,
        "sourceSessionIds": item.source_session_ids or [],
        "status": item.status,
        "enabledForPrompt": item.enabled_for_prompt,
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "updatedAt": item.updated_at.isoformat() if item.updated_at else None,
    }


def _list_insights(kind: str) -> list:
    db = SessionLocal()
    try:
        rows = (
            db.query(models.InsightItemModel)
            .filter(models.InsightItemModel.kind == kind)
            .order_by(models.InsightItemModel.updated_at.desc())
            .all()
        )
        return [_insight_to_out(r) for r in rows]
    finally:
        db.close()


def build_memory_preview_response(agent_id: str, cwd: str | None = None) -> dict:
    if agent_id not in SUPPORTED_MEMORY_PREVIEW_AGENT_IDS:
        raise ValueError(f"memory preview not supported for agent: {agent_id}")

    global_text = build_global_prompt_for_agent(agent_id)
    task_text = _DEFAULT_SYSTEM_PROMPT
    skill_text = build_skill_prompt_for_agent(agent_id, cwd)
    habit_text = build_habit_prompt_for_agent(agent_id)

    mcp_servers = _build_mcp_servers()
    amap_enabled = _AMAP_SERVER_NAME in mcp_servers
    mcp_text = _AMAP_SYSTEM_PROMPT_SUFFIX if amap_enabled else ""

    segments = [
        _segment("global", "全局系统提示词", global_text, "global_prompt_settings · app_settings.global_prompt", enabled=bool(global_text)),
        _segment("task", "任务段", task_text, "task.system 或 _DEFAULT_SYSTEM_PROMPT(当前会话未设 task.system → 默认)"),
        _segment("skill", "技能", skill_text, "build_skill_prompt_for_agent", enabled=bool(skill_text)),
        _segment("habit", "习惯偏好", habit_text, "build_habit_prompt_for_agent", enabled=bool(habit_text)),
        _segment("mcp", "MCP 提示", mcp_text, "claude_sdk_agent.py:114-118(amap 启用时拼入)", enabled=amap_enabled),
    ]

    tools_mcp = [f"mcp__{_AMAP_SERVER_NAME}__*"] if amap_enabled else []
    gp = load_global_prompt_settings()

    return {
        "segments": segments,
        "totalChars": sum(s["chars"] for s in segments),
        "tools": {"system": list(_ALLOWED_TOOLS), "mcp": tools_mcp},
        "habits": _list_insights("habit"),
        "knowledge": _list_insights("knowledge"),
        "globalPrompt": {"enabled": bool(gp.get("enabled")), "chars": len(gp.get("prompt") or "")},
    }
```

- [ ] **Step 5: 加 `GET /memory-preview` 端点**

在 `backend/routers/settings.py`,顶部 import 块追加(memory_preview 是 backend 根模块,直接 import):

```python
from memory_preview import build_memory_preview_response
```

在文件末尾(`update_global_prompt_settings` 之后)追加:

```python
@router.get("/memory-preview")
def get_memory_preview(cwd: str | None = Query(default=None)) -> dict:
    try:
        return build_memory_preview_response("claude-sdk", cwd)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
```

- [ ] **Step 6: 跑测试确认 GREEN**

Run:
```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_memory_preview.py -q
```
Expected: 2 passed。

- [ ] **Step 7: 全后端回归(amap 提取未破坏 claude-sdk agent)**

Run:
```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py tests/test_global_prompt_settings.py tests/test_skill_settings.py tests/test_habit_prompt_settings.py tests/test_insights.py tests/test_agents_api.py -q
```
Expected: 全 passed(amap 常量提取行为不变;agents_api 此时 tabs 尚未含"记忆",Task 2 再改)。

- [ ] **Step 8: 提交**

```bash
git add backend/memory_preview.py backend/runtime/claude_sdk_agent.py backend/routers/settings.py backend/tests/test_memory_preview.py
git commit -m "feat(backend): 记忆透视台预览接口"
```

---

### Task 2: 后端 claude-sdk metadata tabs 注册「记忆」

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py:103`(metadata `workspace.tabs`)
- Test: `backend/tests/test_agents_api.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_agents_api.py` 找到验证 claude-sdk workspace tabs 的用例(若无,新增一个)。追加断言:

```python
def test_claude_sdk_metadata_includes_memory_tab():
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        agents = client.get("/api/agents").json()
        lobster = next(a for a in agents if a["id"] == "claude-sdk")
        assert "记忆" in lobster["workspace"]["tabs"]
```

> 若已有用例遍历 tabs,直接在该用例补 `assert "记忆" in tabs` 即可,不必新建函数。先 Read `test_agents_api.py` 确认现有结构。

- [ ] **Step 2: 跑测试确认 RED**

Run:
```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py -q
```
Expected: FAIL — `"记忆" not in tabs`。

- [ ] **Step 3: metadata tabs 追加「记忆」**

在 `backend/runtime/claude_sdk_agent.py` 约 line 103,metadata 的 `workspace` 字段:

```python
workspace={"type": "tabs", "tabs": ["对话", "文件", "Skill", "MCP"]},
```

改为:

```python
workspace={"type": "tabs", "tabs": ["对话", "文件", "Skill", "MCP", "记忆"]},
```

- [ ] **Step 4: 跑测试确认 GREEN**

Run:
```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py -q
```
Expected: passed。

- [ ] **Step 5: 提交**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_agents_api.py
git commit -m "feat(backend): 龙虾 Agent 工作台注册记忆 tab"
```

---

### Task 3: 前端 getMemoryPreview + MemoryPanel + TabsWorkspace 接线

**Files:**
- Modify: `src/services/agentRuntimeApi.ts`
- Create: `src/components/agentRuntime/MemoryPanel.tsx`
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`
- Test: `src/components/agentRuntime/TabsWorkspace.test.tsx`

- [ ] **Step 1: 写失败测试**

打开 `src/components/agentRuntime/TabsWorkspace.test.tsx`。在 `beforeEach` 的 `useAgentRuntimeStore.setState({...})` 里,把 `tabs: ['对话', '文件', 'Skill', 'MCP']` 改为 `tabs: ['对话', '文件', 'Skill', 'MCP', '记忆']`。

在 mock 块(`vi.mock('../../services/agentRuntimeApi')` 之下、`beforeEach` 内)追加 `getMemoryPreview` 的 mock 解析(与 `getSkillSettings` 并列):

```typescript
    vi.mocked(api.getMemoryPreview).mockResolvedValue({
      segments: [
        { key: 'global', name: '全局系统提示词', enabled: true, chars: 100, source: 'global_prompt_settings', preview: '全局规则预览...' },
        { key: 'task', name: '任务段', enabled: true, chars: 75, source: 'task.system 或默认', preview: '你是一个运行在 context-lab 沙箱目录里的 coding 助手...' },
        { key: 'skill', name: '技能', enabled: false, chars: 0, source: 'build_skill_prompt_for_agent', preview: '' },
        { key: 'habit', name: '习惯偏好', enabled: false, chars: 0, source: 'build_habit_prompt_for_agent', preview: '' },
        { key: 'mcp', name: 'MCP 提示', enabled: false, chars: 0, source: 'claude_sdk_agent.py', preview: '' },
      ],
      totalChars: 175,
      tools: { system: ['Read', 'Glob', 'Grep', 'Bash', 'Edit', 'WebSearch'], mcp: [] },
      habits: [],
      knowledge: [],
      globalPrompt: { enabled: true, chars: 100 },
    });
```

在 `describe` 块末尾追加新用例:

```typescript
  it('renders memory panel when clicking 记忆 tab', async () => {
    render(<TabsWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '记忆' }));

    expect(await screen.findByText('system prompt 拼装解剖')).toBeInTheDocument();
    expect(screen.getByText('全局系统提示词')).toBeInTheDocument();
    expect(screen.getByText(/全局规则预览/)).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(api.getMemoryPreview).toHaveBeenCalledWith('/workspace/project');
  });
```

- [ ] **Step 2: 跑测试确认 RED**

Run:
```bash
npm run test:run -- src/components/agentRuntime/TabsWorkspace.test.tsx
```
Expected: FAIL — `getMemoryPreview` 不是 `api` 的导出(mock 报错)或找不到「记忆」按钮 / 「system prompt 拼装解剖」。

- [ ] **Step 3: 加 `getMemoryPreview` + 类型**

在 `src/services/agentRuntimeApi.ts`,靠近 `getSkillSettings` 定义处,追加类型与函数:

```typescript
export interface MemorySegment {
  key: string;
  name: string;
  enabled: boolean;
  chars: number;
  source: string;
  preview: string;
}

export interface MemoryInsight {
  id: string;
  kind: string;
  title: string;
  description: string;
  sourceSessionIds: string[];
  status: string;
  enabledForPrompt: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MemoryPreviewResponse {
  segments: MemorySegment[];
  totalChars: number;
  tools: { system: string[]; mcp: string[] };
  habits: MemoryInsight[];
  knowledge: MemoryInsight[];
  globalPrompt: { enabled: boolean; chars: number };
}

export async function getMemoryPreview(cwd?: string | null): Promise<MemoryPreviewResponse> {
  const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
  const resp = await fetch(`/api/settings/memory-preview${query}`);
  if (!resp.ok) throw new Error(`getMemoryPreview failed: ${resp.status}`);
  return resp.json();
}
```

- [ ] **Step 4: 实现 `MemoryPanel.tsx`**

创建 `src/components/agentRuntime/MemoryPanel.tsx`:

```tsx
import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { getMemoryPreview, type MemoryPreviewResponse, type MemorySegment } from '../../services/agentRuntimeApi';
import { dbApi } from '../../services/dbApi';

const cardStyle: React.CSSProperties = {
  border: '1px solid #D6CFC4',
  borderRadius: 14,
  background: '#FFFDF9',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1A1A1A',
  borderBottom: '1px solid #D6CFC4',
  paddingBottom: 6,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
};

const emptyStyle: React.CSSProperties = {
  color: '#8A8177',
  fontSize: 13,
  padding: '4px 2px',
  lineHeight: 1.7,
};

const noteStyle: React.CSSProperties = { color: '#8A8177', fontSize: 11, lineHeight: 1.5 };

const previewStyle: React.CSSProperties = {
  margin: 0,
  padding: 10,
  maxHeight: 150,
  overflow: 'auto',
  borderRadius: 10,
  background: '#F5F1EB',
  color: '#1A1A1A',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  lineHeight: 1.55,
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 999,
  background: '#F5F1EB',
  border: '1px solid #D6CFC4',
  color: '#1A1A1A',
};

const chipMcpStyle: React.CSSProperties = {
  ...chipStyle,
  background: '#EFF6FF',
  borderColor: '#93C5FD',
  color: '#1D4ED8',
};

function badgeStyle(on: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 999,
    marginLeft: 6,
    verticalAlign: 'middle',
    background: on ? '#DCFCE7' : '#F5F1EB',
    color: on ? '#15803D' : '#8A8177',
  };
}

function SegmentCard({ seg, total }: { seg: MemorySegment; total: number }) {
  const pct = total > 0 ? Math.round((seg.chars / total) * 100) : 0;
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {seg.name}
          <span style={badgeStyle(seg.enabled)}>{seg.enabled ? '启用' : '空'}</span>
        </span>
        <span style={{ color: '#8A8177', fontSize: 11, whiteSpace: 'nowrap' }}>{seg.chars} 字符 · {pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: '#ECE7DE', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: seg.chars > 0 ? '#2563EB' : '#D6CFC4' }} />
      </div>
      {seg.preview && <pre style={previewStyle}>{seg.preview}</pre>}
      <div style={noteStyle}>{seg.source}</div>
    </div>
  );
}

const MemoryPanel: React.FC<{ cwd: string | null }> = ({ cwd }) => {
  const [data, setData] = React.useState<MemoryPreviewResponse | null>(null);
  const [error, setError] = React.useState('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const workspaceMessages = useAgentRuntimeStore(s => s.workspaceMessages);
  const oldest = useAgentRuntimeStore(s => s.workspaceOldestSeq);
  const newest = useAgentRuntimeStore(s => s.workspaceNewestSeq);
  const hasMoreAfter = useAgentRuntimeStore(s => s.workspaceHasMoreAfter);

  React.useEffect(() => {
    let cancelled = false;
    setError('');
    getMemoryPreview(cwd)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('记忆透视台加载失败'); });
    return () => { cancelled = true; };
  }, [cwd]);

  const latestUser = React.useMemo(() => {
    for (let i = workspaceMessages.length - 1; i >= 0; i--) {
      if (workspaceMessages[i].role === 'user') return workspaceMessages[i];
    }
    return null;
  }, [workspaceMessages]);

  const toggleHabit = async (id: string, enabled: boolean) => {
    if (!data) return;
    setSavingId(id);
    try {
      await dbApi.updateInsight(id, { enabledForPrompt: !enabled });
      setData({ ...data, habits: data.habits.map(h => h.id === id ? { ...h, enabledForPrompt: !enabled } : h) });
      setError('');
    } catch {
      setError('习惯开关保存失败');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#F5F1EB', minWidth: 0 }}>
      <div style={{ marginBottom: 12, color: '#4A4A4A', fontSize: 13, lineHeight: 1.65 }}>
        把龙虾 Agent 脑子里装了什么摊开给你看:实际拼进 system prompt 的分段 + 独立工具 + 会话历史 + 存而未用的记忆。
      </div>
      {error && <div style={{ marginBottom: 12, color: '#B91C1C', fontSize: 13 }}>{error}</div>}
      {!data && !error && <div style={{ color: '#8A8177', fontSize: 13 }}>加载中...</div>}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <section>
            <div style={sectionTitleStyle}>
              <span>system prompt 拼装解剖</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>总计 {data.totalChars} 字符 · 全局→任务→技能→习惯→MCP</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.segments.map(seg => <SegmentCard key={seg.key} seg={seg} total={data.totalChars} />)}
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>工具清单</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>独立 tools 参数 · 占 context window · 不在 system 文本</span>
            </div>
            <div style={{ ...cardStyle, marginTop: 8 }}>
              <div style={noteStyle}>系统工具(_ALLOWED_TOOLS,{data.tools.system.length} 个)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.tools.system.map(t => <span key={t} style={chipStyle}>{t}</span>)}
              </div>
              {data.tools.mcp.length > 0 && (
                <React.Fragment>
                  <div style={{ ...noteStyle, marginTop: 10 }}>MCP 工具(amap 启用时)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.tools.mcp.map(t => <span key={t} style={chipMcpStyle}>{t}</span>)}
                  </div>
                </React.Fragment>
              )}
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>会话历史 · 窗口加载</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>绑定当前工作区会话</span>
            </div>
            <div style={{ ...cardStyle, borderLeft: '3px solid #2563EB', marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>当前任务 · 用户最新请求</span>
                <span style={{ color: '#8A8177', fontSize: 11 }}>messages[-1]</span>
              </div>
              <pre style={previewStyle}>{latestUser ? latestUser.content : '(当前窗口暂无用户消息)'}</pre>
              <div style={noteStyle}>用户这次要 agent 做什么。与任务段(系统级指令:agent 怎么做事)配对——两者一起决定 agent 本轮行为。</div>
            </div>
            <div style={{ ...cardStyle, marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>历史窗口 · 其余来回</span>
                <span style={{ color: '#8A8177', fontSize: 11 }}>workspaceMessages</span>
              </div>
              <pre style={previewStyle}>{`已加载窗口:${workspaceMessages.length} 条消息(seq ${oldest ?? '-'} → ${newest ?? '-'})
更早消息:${hasMoreAfter ? '有更多' : '无更多'}
压缩状态:运行时触发(RQ-076),不删不改 MySQL 原始消息`}</pre>
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>习惯偏好 · 可写</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>可开关 enabled_for_prompt</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.habits.length === 0 && <div style={emptyStyle}>暂无已采纳的习惯偏好。在历史页洞察模块 accept 后,可在此开关是否注入 system prompt。</div>}
              {data.habits.map(h => (
                <div key={h.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{h.title}</strong>
                      <div style={{ color: '#4A4A4A', fontSize: 13 }}>{h.description}</div>
                    </div>
                    <button
                      type="button"
                      disabled={savingId === h.id}
                      onClick={() => toggleHabit(h.id, h.enabledForPrompt)}
                      style={{
                        border: '1px solid #2563EB',
                        borderRadius: 999,
                        background: h.enabledForPrompt ? '#2563EB' : '#FFFDF9',
                        color: h.enabledForPrompt ? '#fff' : '#2563EB',
                        padding: '7px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {h.enabledForPrompt ? '已注入' : '未注入'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>知识沉淀 · 只读</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>预留给 RAG · 当前不注入</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.knowledge.length === 0 && <div style={emptyStyle}>暂无知识沉淀。kind=knowledge 当前只存不用,等 RAG(RQ-10)接入再做检索注入。</div>}
              {data.knowledge.map(k => (
                <div key={k.id} style={cardStyle}>
                  <strong style={{ fontSize: 13 }}>{k.title}</strong>
                  <div style={{ color: '#4A4A4A', fontSize: 13 }}>{k.description}</div>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}
    </div>
  );
};

export default MemoryPanel;
```

- [ ] **Step 5: TabsWorkspace 接线**

在 `src/components/agentRuntime/TabsWorkspace.tsx`:

顶部 import 块追加(与 `SkillPanel` / `McpPanel` import 并列):

```tsx
import MemoryPanel from './MemoryPanel';
```

在渲染分支(`{active === 'MCP' && <McpPanel />}` 之后)追加:

```tsx
  {active === '记忆' && <MemoryPanel cwd={workspaceCwd} />}
```

- [ ] **Step 6: 跑测试确认 GREEN**

Run:
```bash
npm run test:run -- src/components/agentRuntime/TabsWorkspace.test.tsx
```
Expected: 全 passed,含新增 `renders memory panel when clicking 记忆 tab`。

- [ ] **Step 7: typecheck + build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: typecheck 无错;build 通过(保留既有 chunk size warning 可接受)。

- [ ] **Step 8: 提交**

```bash
git add src/services/agentRuntimeApi.ts src/components/agentRuntime/MemoryPanel.tsx src/components/agentRuntime/TabsWorkspace.tsx src/components/agentRuntime/TabsWorkspace.test.tsx
git commit -m "feat(runtime): 记忆透视台前端面板"
```

---

## Self-Review

- **Spec coverage**:
  - 后端聚合接口 + 复用 build_* → Task 1。
  - system prompt 5 段(全局/任务/技能/习惯/MCP)+ 字符数/占比/预览/来源 → Task 1 `build_memory_preview_response` + Task 3 `SegmentCard`。
  - 工具清单(系统 6 + MCP)独立区域,标注"独立 tools 参数"→ Task 1 `tools` + Task 3 工具清单 section。
  - 会话历史「当前任务」(messages[-1])单独高亮 + 「历史窗口」→ Task 3 会话历史 section(`latestUser` memo + store 字段)。
  - 习惯可写(enabled_for_prompt 开关,调 `PATCH /api/db/insights`)→ Task 3 `toggleHabit` + `dbApi.updateInsight`。
  - 知识只读 → Task 3 知识沉淀 section。
  - TabsWorkspace 接线 + 后端 metadata tabs → Task 2 + Task 3 Step 5。
  - 数据真实(全局/洞察 MySQL、技能/工具代码常量、会话 store)→ Task 1 复用 build_* + `_list_insights`;Task 3 store。
  - 全覆盖。

- **Placeholder scan**:无 TBD/TODO;所有代码块完整;amap 常量提取给了精确 old/new(附"不匹配则 Read 实际文本"兜底,因基于 Explore 报告)。

- **Type consistency**:
  - 后端 `_segment` 返回字段(`key/name/enabled/chars/source/preview`)与前端 `MemorySegment` 一致。
  - `_insight_to_out` 字段(`id/kind/title/description/sourceSessionIds/status/enabledForPrompt/createdAt/updatedAt`)与前端 `MemoryInsight` 一致;与现有 `_to_out`(routers/insights.py)字段一致(dbApi.updateInsight 返回的 PersistedInsightItem 结构相同,`toggleHabit` 局部 map 兼容)。
  - `build_memory_preview_response` 顶层字段(`segments/totalChars/tools/habits/knowledge/globalPrompt`)与前端 `MemoryPreviewResponse` 一致。
  - `getMemoryPreview` 签名 `(cwd?)` 与 `getSkillSettings` 模式一致;测试 `toHaveBeenCalledWith('/workspace/project')` 对应 cwd 透传。
  - store 字段名(`workspaceMessages/workspaceOldestSeq/workspaceNewestSeq/workspaceHasMoreAfter`)与 Explore 报告一致。
  - ChatMessage `{role, content, seq?}` 与 `latestUser.content` 访问一致。

---

## 执行后验收(浏览器,人工)

1. 启动前后端(`npm run dev` + `cd backend && .venv/Scripts/python.exe run_server.py`)。
2. 打开龙虾 Agent 工作台,点「记忆」tab,确认 5 区块渲染:拼装解剖(5 段带占比条)/ 工具清单 / 会话历史(当前任务高亮 + 历史窗口)/ 习惯可写 / 知识只读。
3. 全局段显示实查的 CLAUDE.md 内容;习惯/知识两层显示"暂无"(实查空)。
4. 若有已采纳习惯,点开关切换"已注入/未注入",刷新后状态保持。
5. 会话历史「当前任务」显示最新 user message;对话后切回「记忆」tab,当前任务更新。
