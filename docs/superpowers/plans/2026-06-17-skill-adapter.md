# Skill Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Claude Code 风格 skill 作为 prompt 增强能力，对 `assistant` / `research` / `claude-sdk` 生效，而不是只绑定 Claude SDK Agent。

**Architecture:** 新增后端 `skill_settings.py` 发现白名单 skill、保存关联设置、生成 agent 专属 skill prompt；`BaseAgent` 和 `ClaudeSdkAgent` 在 system prompt 中追加 skill prompt；`SettingsModal` 新增 Skill tab 做显式启用和 agent 关联。

**Tech Stack:** Python FastAPI backend, pytest, React SettingsModal, Vitest, TypeScript。

---

### Task 1: 后端 Skill settings 与发现能力

**Files:**
- Create: `backend/skill_settings.py`
- Create: `backend/tests/test_skill_settings.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_skill_settings.py`，覆盖 skill 发现、frontmatter 解析、设置过滤和 prompt 拼接：

```python
from pathlib import Path


def test_discover_skills_reads_allowed_markdown(monkeypatch, tmp_path):
    import skill_settings as mod
    root = tmp_path / "skills"
    skill_dir = root / "brainstorming"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("""---
name: brainstorming
description: 帮助澄清需求
---

# Brainstorming

先确认问题定义。
""", encoding="utf-8")
    monkeypatch.setattr(mod, "SKILL_DIRS", [root])

    skills = mod.discover_skills()

    assert [s["id"] for s in skills] == ["brainstorming"]
    assert skills[0]["name"] == "brainstorming"
    assert skills[0]["description"] == "帮助澄清需求"
    assert skills[0]["truncated"] is False


def test_save_skill_settings_filters_unknowns(monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    monkeypatch.setattr(mod, "discover_skills", lambda: [{"id": "brainstorming", "name": "brainstorming", "description": "", "content": "x", "source": "", "truncated": False}])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})

    saved = mod.save_skill_settings({
        "skills": {
            "brainstorming": {"enabled": True, "agentIds": ["assistant", "echo", "unknown"], "secret": "leak"},
            "unknown-skill": {"enabled": True, "agentIds": ["assistant"]},
        }
    })

    assert saved == {"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}}


def test_build_skill_prompt_for_agent(monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    monkeypatch.setattr(mod, "discover_skills", lambda: [{
        "id": "brainstorming",
        "name": "brainstorming",
        "description": "帮助澄清需求",
        "content": "# Brainstorming\n先确认问题定义。",
        "source": "test",
        "truncated": False,
    }])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})
    mod.save_skill_settings({"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}})

    prompt = mod.build_skill_prompt_for_agent("assistant")

    assert "[启用的 Skill: brainstorming]" in prompt
    assert "先确认问题定义" in prompt
    assert mod.build_skill_prompt_for_agent("research") == ""
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_skill_settings.py -q
```

Expected: FAIL，`skill_settings` 模块不存在。

- [ ] **Step 3: 最小实现**

创建 `backend/skill_settings.py`，包含：

```python
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from runtime.registry import _AGENT_REGISTRY

SKILL_SETTINGS_PATH = Path(__file__).resolve().parent / "skill-settings.local.json"
SKILL_DIRS = [
    Path(__file__).resolve().parent / "skills",
    Path(__file__).resolve().parent.parent / ".claude" / "skills",
]
SKILL_FILENAMES = ("SKILL.md", "skill.md", "README.md")
SUPPORTED_SKILL_AGENT_IDS = {"assistant", "research", "claude-sdk"}
MAX_SKILL_CHARS = 12000


def _known_agent_ids() -> set[str]:
    return set(_AGENT_REGISTRY.keys())


def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    match = re.match(r"^---\n(.*?)\n---\n?", text, re.DOTALL)
    if not match:
        return {}, text
    meta = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip().strip('"\'')
    return meta, text[match.end():]


def discover_skills() -> list[dict[str, Any]]:
    skills = []
    seen = set()
    for root in SKILL_DIRS:
        if not root.exists() or not root.is_dir():
            continue
        for child in sorted(p for p in root.iterdir() if p.is_dir()):
            if child.name in seen:
                continue
            md = next((child / name for name in SKILL_FILENAMES if (child / name).is_file()), None)
            if not md:
                continue
            raw = md.read_text(encoding="utf-8", errors="ignore")
            meta, body = _parse_frontmatter(raw)
            truncated = len(body) > MAX_SKILL_CHARS
            if truncated:
                body = body[:MAX_SKILL_CHARS]
            skill_id = child.name
            seen.add(skill_id)
            skills.append({
                "id": skill_id,
                "name": meta.get("name") or skill_id,
                "description": meta.get("description") or "",
                "content": body.strip(),
                "source": str(md),
                "truncated": truncated,
            })
    return skills


def sanitize_skill_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    discovered = {s["id"] for s in discover_skills()}
    known_agents = _known_agent_ids()
    raw_skills = (raw or {}).get("skills") or {}
    result = {}
    for skill_id, cfg in raw_skills.items():
        if skill_id not in discovered or not isinstance(cfg, dict):
            continue
        agent_ids = cfg.get("agentIds", [])
        if not isinstance(agent_ids, list):
            agent_ids = []
        filtered = [a for a in agent_ids if a in known_agents and a in SUPPORTED_SKILL_AGENT_IDS]
        result[skill_id] = {
            "enabled": bool(cfg.get("enabled", False)),
            "agentIds": filtered,
        }
    return {"skills": result}


def load_skill_settings() -> dict[str, Any]:
    if not SKILL_SETTINGS_PATH.exists():
        return {"skills": {}}
    try:
        return sanitize_skill_settings(json.loads(SKILL_SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return {"skills": {}}


def save_skill_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_skill_settings(raw)
    SKILL_SETTINGS_PATH.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    return settings


def build_skill_prompt_for_agent(agent_id: str) -> str:
    settings = load_skill_settings()
    skills = {s["id"]: s for s in discover_skills()}
    chunks = []
    for skill_id in sorted(settings["skills"]):
        cfg = settings["skills"][skill_id]
        if not cfg.get("enabled") or agent_id not in cfg.get("agentIds", []):
            continue
        skill = skills.get(skill_id)
        if not skill:
            continue
        chunks.append(f"\n[启用的 Skill: {skill['name']}]\n{skill['content']}\n[/Skill]\n")
    return "".join(chunks)
```

- [ ] **Step 4: 运行测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_skill_settings.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/skill_settings.py backend/tests/test_skill_settings.py
git commit -m "feat(settings): 添加 Skill Adapter 设置"
```

---

### Task 2: Skill settings API

**Files:**
- Modify: `backend/main.py` 或现有 settings router 文件
- Modify: `backend/tests/test_skill_settings.py`
- Modify: `src/services/agentRuntimeApi.ts`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_skill_settings.py` 增加：

```python
def test_skill_settings_api_roundtrip(client, monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    monkeypatch.setattr(mod, "discover_skills", lambda: [{
        "id": "brainstorming",
        "name": "brainstorming",
        "description": "帮助澄清需求",
        "content": "secret content should not be returned",
        "source": "test/SKILL.md",
        "truncated": False,
    }])

    resp = client.get("/api/settings/skills")
    assert resp.status_code == 200
    body = resp.json()
    assert body["skills"][0]["id"] == "brainstorming"
    assert body["skills"][0]["description"] == "帮助澄清需求"
    assert "content" not in body["skills"][0]
    assert any(a["id"] == "assistant" and a["supportsSkill"] for a in body["agents"])

    resp = client.post("/api/settings/skills", json={
        "skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant", "echo"]}}
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["skills"][0]["agentIds"] == ["assistant"]
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_skill_settings.py::test_skill_settings_api_roundtrip -q
```

Expected: FAIL，接口不存在。

- [ ] **Step 3: 最小实现**

在后端挂载：

```python
from skill_settings import build_skill_settings_response, save_skill_settings

@app.get("/api/settings/skills")
def get_skill_settings():
    return build_skill_settings_response()

@app.post("/api/settings/skills")
def post_skill_settings(payload: dict):
    save_skill_settings(payload)
    return build_skill_settings_response()
```

同时在 `backend/skill_settings.py` 增加：

```python
def build_skill_settings_response() -> dict[str, Any]:
    settings = load_skill_settings()
    skills = []
    for skill in discover_skills():
        cfg = settings["skills"].get(skill["id"], {"enabled": False, "agentIds": []})
        skills.append({
            "id": skill["id"],
            "name": skill["name"],
            "description": skill["description"],
            "source": skill["source"],
            "truncated": skill["truncated"],
            "enabled": cfg["enabled"],
            "agentIds": cfg["agentIds"],
        })
    agents = [
        {
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsSkill": agent_id in SUPPORTED_SKILL_AGENT_IDS,
            "unsupportedReason": "非 LLM 推理型智能体暂不支持 skill 注入" if agent_id not in SUPPORTED_SKILL_AGENT_IDS else "",
        }
        for agent_id, cls in _AGENT_REGISTRY.items()
    ]
    return {"skills": skills, "agents": agents}
```

在 `src/services/agentRuntimeApi.ts` 增加类型和 API client：

```ts
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  source: string;
  truncated: boolean;
  enabled: boolean;
  agentIds: string[];
}

export interface SkillAgentSupport {
  id: string;
  name: string;
  supportsSkill: boolean;
  unsupportedReason: string;
}

export interface SkillSettingsResponse {
  skills: SkillInfo[];
  agents: SkillAgentSupport[];
}

export async function getSkillSettings(): Promise<SkillSettingsResponse> {
  const resp = await fetch('/api/settings/skills');
  if (!resp.ok) throw new Error(`getSkillSettings failed: ${resp.status}`);
  return resp.json();
}

export async function saveSkillSettings(payload: { skills: Record<string, { enabled: boolean; agentIds: string[] }> }): Promise<SkillSettingsResponse> {
  const resp = await fetch('/api/settings/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`saveSkillSettings failed: ${resp.status}`);
  return resp.json();
}
```

- [ ] **Step 4: 运行测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_skill_settings.py -q
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/skill_settings.py backend/tests/test_skill_settings.py src/services/agentRuntimeApi.ts
git commit -m "feat(settings): 添加 Skill 设置 API"
```

---

### Task 3: Agent runtime 注入 Skill prompt

**Files:**
- Modify: `backend/runtime/base_agent.py`
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `backend/tests/test_base_agent.py`
- Modify: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_base_agent.py` 增加：

```python
async def test_base_agent_appends_skill_prompt(monkeypatch):
    from runtime.base_agent import BaseAgent
    from runtime.agent import AgentMetadata, AgentTask
    from runtime.events import EventEmitter
    from infra.llm.base import StreamEvent, EventType as LLMEventType
    from unittest.mock import patch

    monkeypatch.setattr("runtime.base_agent.build_skill_prompt_for_agent", lambda agent_id: "\n[启用的 Skill: test]\n规则 A\n[/Skill]\n")

    class TestAgent(BaseAgent):
        metadata = AgentMetadata(id="assistant", name="Assistant", description="", workspace={"type": "chat"}, capabilities=[])
        tool_names = []
        system_prompt = "基础提示"

    seen = {}

    async def fake_stream(messages, **kw):
        seen["system"] = kw.get("system")
        yield StreamEvent(type=LLMEventType.TEXT, text="ok")
        yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 1, "output_tokens": 1})

    agent = TestAgent()
    emit = EventEmitter()
    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    assert "基础提示" in seen["system"]
    assert "规则 A" in seen["system"]
```

在 `backend/tests/test_claude_sdk_agent.py` 增加：

```python
def test_claude_sdk_agent_appends_skill_prompt(monkeypatch):
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.agent import AgentTask

    monkeypatch.setattr("runtime.claude_sdk_agent._build_mcp_servers", lambda: {})
    monkeypatch.setattr("runtime.claude_sdk_agent.build_skill_prompt_for_agent", lambda agent_id: "\n[启用的 Skill: test]\n规则 B\n[/Skill]\n")

    options = ClaudeSdkAgent()._build_options(AgentTask(messages=[{"role": "user", "content": "hi"}]))

    assert "规则 B" in options.system_prompt
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_base_agent.py::test_base_agent_appends_skill_prompt backend/tests/test_claude_sdk_agent.py::test_claude_sdk_agent_appends_skill_prompt -q
```

Expected: FAIL，模块未导入或 system prompt 未追加。

- [ ] **Step 3: 最小实现**

在 `backend/runtime/base_agent.py` 增加：

```python
from skill_settings import build_skill_prompt_for_agent
```

并在 stream 前构造：

```python
system_prompt = (self.system_prompt or "") + build_skill_prompt_for_agent(self.metadata.id)
```

传给 provider：

```python
system=system_prompt or None
```

在 `backend/runtime/claude_sdk_agent.py` 增加：

```python
from skill_settings import build_skill_prompt_for_agent
```

并在 `_build_options()` 中：

```python
system_prompt = (task.system or _DEFAULT_SYSTEM_PROMPT) + build_skill_prompt_for_agent("claude-sdk")
```

- [ ] **Step 4: 运行测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_base_agent.py backend/tests/test_claude_sdk_agent.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/base_agent.py backend/runtime/claude_sdk_agent.py backend/tests/test_base_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(agent-runtime): 注入 Skill prompt"
```

---

### Task 4: SettingsModal 增加 Skill tab

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/SettingsModal.test.tsx`
- Modify: `src/services/agentRuntimeApi.ts`

- [ ] **Step 1: 写失败测试**

在 `src/components/SettingsModal.test.tsx` 增加：

```tsx
it('shows Skill tab with supported agents', async () => {
  mockedGetSkillSettings.mockResolvedValue({
    skills: [{
      id: 'brainstorming',
      name: 'brainstorming',
      description: '帮助澄清需求',
      source: 'backend/skills/brainstorming/SKILL.md',
      truncated: false,
      enabled: false,
      agentIds: [],
    }],
    agents: [
      { id: 'echo', name: 'Echo', supportsSkill: false, unsupportedReason: '非 LLM 推理型智能体暂不支持 skill 注入' },
      { id: 'assistant', name: '项目助手', supportsSkill: true, unsupportedReason: '' },
      { id: 'research', name: '研究助手', supportsSkill: true, unsupportedReason: '' },
      { id: 'claude-sdk', name: 'Claude SDK Agent', supportsSkill: true, unsupportedReason: '' },
    ],
  });

  render(<SettingsModal isOpen onClose={() => {}} />);
  fireEvent.click(screen.getByText('Skill'));

  expect(await screen.findByText('brainstorming')).toBeInTheDocument();
  expect(screen.getByText('帮助澄清需求')).toBeInTheDocument();
  expect(screen.getByText('项目助手 (assistant)')).toBeInTheDocument();
  expect(screen.getByText('研究助手 (research)')).toBeInTheDocument();
  expect(screen.getByText('Claude SDK Agent (claude-sdk)')).toBeInTheDocument();
  expect(screen.getByText('Echo')).toBeInTheDocument();
});
```

同时 mock `getSkillSettings` / `saveSkillSettings`。

- [ ] **Step 2: 运行失败测试**

Run:

```bash
npm run test -- src/components/SettingsModal.test.tsx --run
```

Expected: FAIL，Skill tab 不存在。

- [ ] **Step 3: 最小实现**

在 `SettingsModal.tsx`：

- tabs 增加 `{ id: 'skill', label: 'Skill', icon: 'SK' }`。
- 增加 `skillSettings` / `skillDraft` / `skillError` / `skillSaved` state。
- `isOpen` 时调用 `getSkillSettings()`。
- 增加 `updateSkill()`、`saveSkills()`。
- 新增 `activeTab === 'skill'` 内容区：
  - notice：Skill 是 prompt 增强，不执行命令。
  - skills 列表：enabled checkbox、name、description、source、truncated 标记。
  - 支持 agent checkbox。
  - 暂不支持 agent InfoRow。

- [ ] **Step 4: 运行测试与类型检查**

Run:

```bash
npm run test -- src/components/SettingsModal.test.tsx --run
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx src/services/agentRuntimeApi.ts
git commit -m "feat(settings): 添加 Skill 设置页"
```

---

### Task 5: 整体验证与跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: 后端回归**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_skill_settings.py backend/tests/test_base_agent.py backend/tests/test_claude_sdk_agent.py backend/tests/test_agents_api.py -q
```

Expected: PASS.

- [ ] **Step 2: 前端回归**

Run:

```bash
npm run test -- src/components/SettingsModal.test.tsx --run
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 3: API smoke**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe - <<'PY'
import sys
sys.path.insert(0, 'backend')
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    resp = client.get('/api/settings/skills')
    resp.raise_for_status()
    body = resp.json()
    agents = {a['id']: a for a in body['agents']}
    assert agents['assistant']['supportsSkill'] is True
    assert agents['research']['supportsSkill'] is True
    assert agents['claude-sdk']['supportsSkill'] is True
    assert agents['echo']['supportsSkill'] is False
    print('skill settings smoke ok')
PY
```

- [ ] **Step 4: 更新跟踪矩阵**

在 `项目执行跟踪矩阵.md` 追加：

```markdown
### 2026-06-17（Skill Adapter）

- 🆕 新增需求：让 Claude Code 风格 skill 作为 prompt 增强，对 assistant / research / claude-sdk 生效
- 📋 规格：`docs/superpowers/specs/2026-06-17-skill-adapter-design.md`
- 📝 计划：`docs/superpowers/plans/2026-06-17-skill-adapter.md`
- 🔄 执行：Skill settings + API；BaseAgent / ClaudeSdkAgent system prompt 注入；SettingsModal Skill tab；整体验证
- ✅ 验证：后端相关测试、SettingsModal 测试、typecheck、build、settings API smoke
- ⚠️ 已知：第一版不执行 skill 命令、不自动匹配 skill、不支持远程 skill 市场
- ✅ 完成：Skill Adapter
```

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录 Skill Adapter"
```
