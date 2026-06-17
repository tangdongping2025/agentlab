# 设置数据库化与智能体模型配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 MCP/Skill 设置迁移到 MySQL，并为 Agent Runtime 增加按智能体配置模型端点、模型名和加密 API key 的能力。

**Architecture:** MCP/Skill 复用已有 `app_settings` 表，采用数据库优先、旧 JSON 自动导入、保存只写数据库的模式。模型配置新增独立 settings 模块，通过 `cryptography.fernet` 使用服务器主密钥加密 API key，后端 runtime 读取解析后的 per-agent 配置创建 provider，前端 Settings 新增“模型配置”tab。

**Tech Stack:** Python FastAPI, SQLAlchemy, MySQL JSON, cryptography, pytest, React 18, TypeScript, Vitest, Vite。

---

## 文件结构

- Modify: `backend/config.py` — 增加模型配置加密主密钥环境变量。
- Modify: `backend/mcp_settings.py` — MCP 设置改为 `app_settings` 读写并自动导入旧 JSON。
- Modify: `backend/skill_settings.py` — Skill 设置改为 `app_settings` 读写并自动导入旧 JSON。
- Create: `backend/agent_model_settings.py` — 模型配置 sanitize、加密保存、解密解析、API response。
- Modify: `backend/routers/settings.py` — 新增 `/api/settings/agent-models` GET/POST。
- Modify: `backend/runtime/base_agent.py` — BaseAgent 系智能体使用 per-agent 模型配置。
- Modify: `backend/runtime/claude_sdk_agent.py` — Claude SDK Agent 读取模型配置；能安全传入的字段先接入，限制在响应/文档中说明。
- Modify: `backend/tests/test_mcp_settings.py` — MCP 数据库存储与旧 JSON 导入测试。
- Modify: `backend/tests/test_skill_settings.py` — Skill 数据库存储与旧 JSON 导入测试。
- Create: `backend/tests/test_agent_model_settings.py` — 模型配置加密、API、provider 解析测试。
- Modify: `src/services/agentRuntimeApi.ts` — 新增模型配置类型和 API client。
- Modify: `src/components/SettingsModal.tsx` — 新增“模型配置”tab、加载/编辑/保存 UI。
- Create: `src/components/SettingsModal.test.tsx` — 覆盖模型配置 tab 的加载、保存和 key 不回显。
- Modify: `项目执行跟踪矩阵.md` — 增加 RQ-043。

---

### Task 1: MCP 设置迁移到数据库

**Files:**
- Modify: `backend/tests/test_mcp_settings.py`
- Modify: `backend/mcp_settings.py`

- [ ] **Step 1: Write failing tests**

在 `backend/tests/test_mcp_settings.py` 增加数据库清理 helper 和两个测试：

```python
def clear_mcp_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "mcp_settings")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_save_mcp_settings_writes_app_settings(tmp_path, monkeypatch):
    import mcp_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "mcp-settings.local.json"
    monkeypatch.setattr(mod, "MCP_SETTINGS_PATH", legacy_path)
    clear_mcp_setting()

    saved = mod.save_mcp_settings({"servers": {"amap-maps": {"enabled": False, "agentIds": ["assistant"], "launchMode": "npx"}}})

    assert legacy_path.exists() is False
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "mcp_settings")
        assert row.setting_value == saved
    finally:
        db.close()


def test_load_mcp_settings_imports_legacy_json(tmp_path, monkeypatch):
    import json
    import mcp_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "mcp-settings.local.json"
    legacy_path.write_text(json.dumps({"servers": {"amap-maps": {"enabled": False, "agentIds": ["assistant"], "launchMode": "bundled"}}}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "MCP_SETTINGS_PATH", legacy_path)
    clear_mcp_setting()

    loaded = mod.load_mcp_settings()

    assert loaded["servers"]["amap-maps"]["enabled"] is False
    assert loaded["servers"]["amap-maps"]["agentIds"] == ["assistant"]
    assert loaded["servers"]["amap-maps"]["launchMode"] == "bundled"
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "mcp_settings")
        assert row.setting_value == loaded
    finally:
        db.close()
```

同时在依赖空配置的旧测试开头调用 `clear_mcp_setting()`，避免数据库状态串扰。

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_settings.py -q
```

Expected: FAIL，因为当前实现仍写旧 JSON。

- [ ] **Step 3: Implement database-backed MCP settings**

在 `backend/mcp_settings.py` 中引入：

```python
from database import SessionLocal
from models import AppSettingModel

MCP_SETTING_KEY = "mcp_settings"
```

新增 helper：

```python
def _load_legacy_mcp_settings() -> dict[str, Any]:
    if not MCP_SETTINGS_PATH.exists():
        return sanitize_mcp_settings(DEFAULT_MCP_SETTINGS)
    try:
        return sanitize_mcp_settings(json.loads(MCP_SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return sanitize_mcp_settings(DEFAULT_MCP_SETTINGS)


def _upsert_mcp_settings(settings: dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, MCP_SETTING_KEY)
        if row:
            row.setting_value = settings
        else:
            db.add(AppSettingModel(setting_key=MCP_SETTING_KEY, setting_value=settings))
        db.commit()
    finally:
        db.close()
```

替换 `load_mcp_settings()`：

```python
def load_mcp_settings() -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, MCP_SETTING_KEY)
        if row:
            return sanitize_mcp_settings(row.setting_value)
    finally:
        db.close()

    legacy = _load_legacy_mcp_settings()
    if MCP_SETTINGS_PATH.exists():
        _upsert_mcp_settings(legacy)
    return legacy
```

替换 `save_mcp_settings()`：

```python
def save_mcp_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_mcp_settings(raw)
    _upsert_mcp_settings(settings)
    return settings
```

- [ ] **Step 4: Run focused MCP tests**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_settings.py -q
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/mcp_settings.py backend/tests/test_mcp_settings.py
git commit -m "feat(settings): MCP 设置存储到数据库"
```

---

### Task 2: Skill 设置迁移到数据库

**Files:**
- Modify: `backend/tests/test_skill_settings.py`
- Modify: `backend/skill_settings.py`

- [ ] **Step 1: Write failing tests**

在 `backend/tests/test_skill_settings.py` 增加：

```python
def clear_skill_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "skill_settings")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_save_skill_settings_writes_app_settings(monkeypatch, tmp_path):
    import skill_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "skill-settings.local.json"
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", legacy_path)
    monkeypatch.setattr(mod, "discover_skills", lambda: [{"id": "brainstorming", "name": "brainstorming", "description": "", "content": "x", "source": "", "truncated": False}])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})
    clear_skill_setting()

    saved = mod.save_skill_settings({"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}})

    assert legacy_path.exists() is False
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "skill_settings")
        assert row.setting_value == saved
    finally:
        db.close()


def test_load_skill_settings_imports_legacy_json(monkeypatch, tmp_path):
    import json
    import skill_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "skill-settings.local.json"
    legacy_path.write_text(json.dumps({"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", legacy_path)
    monkeypatch.setattr(mod, "discover_skills", lambda: [{"id": "brainstorming", "name": "brainstorming", "description": "", "content": "x", "source": "", "truncated": False}])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})
    clear_skill_setting()

    loaded = mod.load_skill_settings()

    assert loaded == {"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}}
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "skill_settings")
        assert row.setting_value == loaded
    finally:
        db.close()
```

旧测试中凡是依赖空配置的测试，先调用 `clear_skill_setting()`。

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_skill_settings.py -q
```

Expected: FAIL，因为当前实现仍写旧 JSON。

- [ ] **Step 3: Implement database-backed Skill settings**

在 `backend/skill_settings.py` 中引入：

```python
from database import SessionLocal
from models import AppSettingModel

SKILL_SETTING_KEY = "skill_settings"
```

新增 helper：

```python
def _load_legacy_skill_settings() -> dict[str, Any]:
    if not SKILL_SETTINGS_PATH.exists():
        return {"skills": {}}
    try:
        return sanitize_skill_settings(json.loads(SKILL_SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return {"skills": {}}


def _upsert_skill_settings(settings: dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, SKILL_SETTING_KEY)
        if row:
            row.setting_value = settings
        else:
            db.add(AppSettingModel(setting_key=SKILL_SETTING_KEY, setting_value=settings))
        db.commit()
    finally:
        db.close()
```

替换 `load_skill_settings()` 和 `save_skill_settings()`，结构与 MCP 一致：数据库优先，旧 JSON 存在时导入，保存只写数据库。

- [ ] **Step 4: Run focused Skill tests**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_skill_settings.py -q
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/skill_settings.py backend/tests/test_skill_settings.py
git commit -m "feat(settings): Skill 设置存储到数据库"
```

---

### Task 3: 后端模型配置与 API key 加密存储

**Files:**
- Modify: `backend/config.py`
- Create: `backend/agent_model_settings.py`
- Modify: `backend/routers/settings.py`
- Create: `backend/tests/test_agent_model_settings.py`

- [ ] **Step 1: Write failing tests**

创建 `backend/tests/test_agent_model_settings.py`：

```python
import pytest


def clear_agent_model_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "agent_model_settings")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_save_agent_model_settings_encrypts_api_key(monkeypatch):
    import agent_model_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    monkeypatch.setattr(mod.settings, "model_config_master_key", "test-master-key")
    clear_agent_model_setting()

    saved = mod.save_agent_model_settings({"agents": {"assistant": {"baseUrl": "https://example.com/api", "model": "demo", "apiKey": "secret-key"}}})

    assistant = next(a for a in saved["agents"] if a["id"] == "assistant")
    assert assistant["baseUrl"] == "https://example.com/api"
    assert assistant["model"] == "demo"
    assert assistant["apiKeyConfigured"] is True
    assert "secret-key" not in str(saved)

    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "agent_model_settings")
        assert "secret-key" not in str(row.setting_value)
        assert row.setting_value["agents"]["assistant"]["apiKeyEncrypted"]
    finally:
        db.close()

    resolved = mod.resolve_model_config_for_agent("assistant")
    assert resolved.api_key == "secret-key"
    assert resolved.base_url == "https://example.com/api"
    assert resolved.model == "demo"


def test_save_agent_model_settings_rejects_api_key_without_master_key(monkeypatch):
    import agent_model_settings as mod

    monkeypatch.setattr(mod.settings, "model_config_master_key", "")
    clear_agent_model_setting()

    with pytest.raises(mod.ModelConfigSecretError):
        mod.save_agent_model_settings({"agents": {"assistant": {"apiKey": "secret-key"}}})


def test_agent_model_settings_api_does_not_return_plain_key(client, monkeypatch):
    import agent_model_settings as mod

    monkeypatch.setattr(mod.settings, "model_config_master_key", "test-master-key")
    clear_agent_model_setting()

    resp = client.post("/api/settings/agent-models", json={"agents": {"assistant": {"baseUrl": "https://example.com/api", "model": "demo", "apiKey": "secret-key"}}})

    assert resp.status_code == 200
    body = resp.json()
    assert "secret-key" not in str(body)
    assistant = next(a for a in body["agents"] if a["id"] == "assistant")
    assert assistant["apiKeyConfigured"] is True


def test_resolve_model_config_falls_back_to_env(monkeypatch):
    import agent_model_settings as mod

    clear_agent_model_setting()
    monkeypatch.setattr(mod.settings, "llm_api_key", "env-key")
    monkeypatch.setattr(mod.settings, "llm_base_url", "https://env.example/api")
    monkeypatch.setattr(mod.settings, "llm_model", "env-model")

    resolved = mod.resolve_model_config_for_agent("assistant")

    assert resolved.api_key == "env-key"
    assert resolved.base_url == "https://env.example/api"
    assert resolved.model == "env-model"
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_agent_model_settings.py -q
```

Expected: FAIL because `agent_model_settings` module is missing.

- [ ] **Step 3: Add config and model settings module**

在 `backend/config.py` 增加：

```python
model_config_master_key: str = ""
```

创建 `backend/agent_model_settings.py`，包含：

- `AGENT_MODEL_SETTING_KEY = "agent_model_settings"`
- `SUPPORTED_MODEL_CONFIG_AGENT_IDS = {"assistant", "research", "claude-sdk"}`
- `ModelConfigSecretError(Exception)`
- `ResolvedModelConfig` dataclass，字段 `api_key`、`base_url`、`model`
- `_get_fernet()`：用 `hashlib.sha256(settings.model_config_master_key.encode()).digest()` 派生 32 字节 key，再 `base64.urlsafe_b64encode` 交给 `Fernet`
- `_encrypt_api_key()` / `_decrypt_api_key()`
- `sanitize_agent_model_settings(raw, previous=None)`：过滤未知 agent，trim `baseUrl/model`，处理 `apiKey` 的保留/清除/加密
- `load_agent_model_settings()`：读取 DB，返回 sanitized 结构
- `save_agent_model_settings(raw)`：upsert DB，返回 response
- `build_agent_model_settings_response()`：返回 agents 列表和 `encryptionConfigured`
- `resolve_model_config_for_agent(agent_id)`：DB 值优先，空字段回退 `settings.llm_*`

`sanitize_agent_model_settings` 对 `apiKey` 规则：

```python
if "apiKey" not in cfg:
    keep previous apiKeyEncrypted
elif cfg["apiKey"] == "":
    remove apiKeyEncrypted
elif settings.model_config_master_key.strip():
    encrypt and store apiKeyEncrypted
else:
    raise ModelConfigSecretError("MODEL_CONFIG_MASTER_KEY is required to save API key")
```

- [ ] **Step 4: Add API routes**

在 `backend/routers/settings.py` 引入：

```python
from fastapi import HTTPException
from agent_model_settings import build_agent_model_settings_response, save_agent_model_settings, ModelConfigSecretError
```

新增：

```python
@router.get("/agent-models")
def get_agent_model_settings() -> dict:
    return build_agent_model_settings_response()


@router.post("/agent-models")
def update_agent_model_settings(payload: dict) -> dict:
    try:
        return save_agent_model_settings(payload)
    except ModelConfigSecretError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_agent_model_settings.py -q
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add backend/config.py backend/agent_model_settings.py backend/routers/settings.py backend/tests/test_agent_model_settings.py
git commit -m "feat(settings): 添加智能体模型配置"
```

---

### Task 4: Runtime 接入 per-agent 模型配置

**Files:**
- Modify: `backend/runtime/base_agent.py`
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `backend/tests/test_agent_model_settings.py`

- [ ] **Step 1: Write failing runtime tests**

在 `backend/tests/test_agent_model_settings.py` 增加：

```python
def test_base_agent_uses_agent_model_config(monkeypatch):
    import agent_model_settings as mod
    import runtime.base_agent as base_agent
    from runtime.assistant_agent import AssistantAgent

    monkeypatch.setattr(mod.settings, "model_config_master_key", "test-master-key")
    clear_agent_model_setting()
    mod.save_agent_model_settings({"agents": {"assistant": {"baseUrl": "https://agent.example/api", "model": "agent-model", "apiKey": "agent-key"}}})

    captured = {}

    class FakeProvider:
        def __init__(self, api_key: str, base_url: str, default_model: str):
            captured["api_key"] = api_key
            captured["base_url"] = base_url
            captured["default_model"] = default_model

    monkeypatch.setattr(base_agent, "ArkProvider", FakeProvider)

    AssistantAgent()

    assert captured == {
        "api_key": "agent-key",
        "base_url": "https://agent.example/api",
        "default_model": "agent-model",
    }
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_agent_model_settings.py::test_base_agent_uses_agent_model_config -q
```

Expected: FAIL，因为 `BaseAgent` 仍直接读环境变量。

- [ ] **Step 3: Update BaseAgent provider creation**

在 `backend/runtime/base_agent.py` 引入：

```python
from agent_model_settings import resolve_model_config_for_agent
```

替换 `__init__` 中 provider 创建：

```python
model_config = resolve_model_config_for_agent(self.metadata.id)
self._provider = ArkProvider(
    api_key=model_config.api_key,
    base_url=model_config.base_url,
    default_model=model_config.model,
)
```

- [ ] **Step 4: Claude SDK Agent limited integration**

在 `backend/runtime/claude_sdk_agent.py` 引入 `resolve_model_config_for_agent`，并在 `_build_options` 中解析 `claude-sdk` 配置。

如果当前 `ClaudeAgentOptions` 支持 `model` 字段，则传入非空 `model_config.model`；如果不支持，不传。不要伪造 `base_url/api_key` 生效。保存能力已由 settings API 提供，runtime 中无法安全接入的字段保持回退给 SDK/CLI 环境。

- [ ] **Step 5: Run tests**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_agent_model_settings.py backend/tests/test_global_prompt_settings.py -q
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add backend/runtime/base_agent.py backend/runtime/claude_sdk_agent.py backend/tests/test_agent_model_settings.py
git commit -m "feat(agent-runtime): 按智能体读取模型配置"
```

---

### Task 5: 前端 Settings 新增模型配置 tab

**Files:**
- Modify: `src/services/agentRuntimeApi.ts`
- Modify: `src/components/SettingsModal.tsx`
- Create: `src/components/SettingsModal.test.tsx`

- [ ] **Step 1: Add failing frontend test**

创建 `src/components/SettingsModal.test.tsx`：

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsModal from './SettingsModal';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/db/root-dir') return Promise.resolve(new Response(JSON.stringify({ root_dir: 'D:/Projects' }), { status: 200 }));
    if (url === '/api/settings/mcp') return Promise.resolve(new Response(JSON.stringify({ servers: [], agents: [] }), { status: 200 }));
    if (url === '/api/settings/skills') return Promise.resolve(new Response(JSON.stringify({ skills: [], agents: [] }), { status: 200 }));
    if (url === '/api/settings/global-prompt') return Promise.resolve(new Response(JSON.stringify({ enabled: false, prompt: '', agents: [] }), { status: 200 }));
    if (url === '/api/settings/agent-models' && !init) {
      return Promise.resolve(new Response(JSON.stringify({ encryptionConfigured: true, agents: [{ id: 'assistant', name: '项目助手', supportsModelConfig: true, baseUrl: '', model: '', apiKeyConfigured: true, unsupportedReason: '' }] }), { status: 200 }));
    }
    if (url === '/api/settings/agent-models' && init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ encryptionConfigured: true, agents: [{ id: 'assistant', name: '项目助手', supportsModelConfig: true, baseUrl: 'https://example.com/api', model: 'demo', apiKeyConfigured: true, unsupportedReason: '' }] }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
});

describe('SettingsModal agent model settings', () => {
  it('saves model config without rendering the api key back', async () => {
    render(<SettingsModal isOpen onClose={() => {}} />);

    fireEvent.click(await screen.findByText('模型配置'));
    fireEvent.change(await screen.findByPlaceholderText('留空回退后端默认 Base URL'), { target: { value: 'https://example.com/api' } });
    fireEvent.change(await screen.findByPlaceholderText('留空回退后端默认模型'), { target: { value: 'demo' } });
    fireEvent.change(await screen.findByPlaceholderText('留空表示不修改已保存 key'), { target: { value: 'secret-key' } });
    fireEvent.click(screen.getByText('保存模型配置'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/settings/agent-models', expect.objectContaining({ method: 'POST' })));
    expect(screen.queryByDisplayValue('secret-key')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run frontend test to verify failure**

Run:

```bash
npm run test -- src/components/SettingsModal.test.tsx --run
```

Expected: FAIL because the tab/client is missing.

- [ ] **Step 3: Add API client types**

在 `src/services/agentRuntimeApi.ts` 增加：

```ts
export interface AgentModelConfigInfo {
  id: string;
  name: string;
  supportsModelConfig: boolean;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  unsupportedReason: string;
}

export interface AgentModelSettingsResponse {
  encryptionConfigured: boolean;
  agents: AgentModelConfigInfo[];
}

export async function getAgentModelSettings(): Promise<AgentModelSettingsResponse> { ... }
export async function saveAgentModelSettings(payload: { agents: Record<string, { baseUrl: string; model: string; apiKey?: string }> }): Promise<AgentModelSettingsResponse> { ... }
```

- [ ] **Step 4: Add SettingsModal model tab**

在 `tabs` 增加：

```ts
{ id: 'agentModels', label: '模型配置', icon: 'LLM' }
```

新增 state：

```ts
const [agentModelSettings, setAgentModelSettings] = React.useState<AgentModelSettingsResponse | null>(null);
const [agentModelDraft, setAgentModelDraft] = React.useState<AgentModelSettingsResponse | null>(null);
const [agentModelKeys, setAgentModelKeys] = React.useState<Record<string, string>>({});
const [agentModelError, setAgentModelError] = React.useState('');
const [agentModelSaved, setAgentModelSaved] = React.useState(false);
```

打开 modal 时加载 `getAgentModelSettings()`。保存时构造 payload：

```ts
agents: Object.fromEntries(agentModelDraft.agents.filter(a => a.supportsModelConfig).map(agent => [agent.id, {
  baseUrl: agent.baseUrl,
  model: agent.model,
  ...(agentModelKeys[agent.id] !== undefined ? { apiKey: agentModelKeys[agent.id] } : {}),
}]))
```

保存成功后：

```ts
setAgentModelKeys({});
setAgentModelSettings(data);
setAgentModelDraft(cloneAgentModelSettings(data));
```

UI 要显示：

- `baseUrl` input placeholder `留空回退后端默认 Base URL`
- `model` input placeholder `留空回退后端默认模型`
- API key password input placeholder `留空表示不修改已保存 key`
- `apiKeyConfigured ? '已配置' : '未配置'`
- 主密钥未配置时提示不能保存新 key，但仍可保存 baseUrl/model
- “清除 key”按钮将该 agent 的 `agentModelKeys[agent.id]` 设为空字符串

- [ ] **Step 5: Run frontend test**

Run:

```bash
npm run test -- src/components/SettingsModal.test.tsx --run
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/services/agentRuntimeApi.ts src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx
git commit -m "feat(settings): 新增智能体模型配置页"
```

---

### Task 6: 回归验证与跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run backend settings tests**

Run:

```bash
MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_settings.py backend/tests/test_skill_settings.py backend/tests/test_agent_model_settings.py backend/tests/test_global_prompt_settings.py -q
```

Expected: PASS。

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm run test -- src/components/SettingsModal.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx --run
```

Expected: PASS。

- [ ] **Step 3: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: PASS；build 可能保留既有 chunk size warning。

- [ ] **Step 4: Smoke API manually**

Run with test DB or local DB as appropriate:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab MODEL_CONFIG_MASTER_KEY=test-master-key backend/.venv/Scripts/python.exe backend/run_server.py
```

Then verify:

- `GET /api/settings/mcp` returns 200.
- `GET /api/settings/skills` returns 200.
- `GET /api/settings/agent-models` returns 200 and no plaintext key.
- `POST /api/settings/agent-models` with API key returns 200 when master key exists.
- Same POST returns 400 when master key is absent and API key is non-empty.

- [ ] **Step 5: Browser verification**

Start frontend:

```bash
npm run dev -- --host 127.0.0.1
```

In Settings:

- MCP/Skill settings reload after backend restart.
- “模型配置”tab loads.
- Editing assistant baseUrl/model and saving shows success.
- Entering API key and saving clears the input, only shows “已配置”。
- Clearing key changes status to “未配置”。

- [ ] **Step 6: Update tracking matrix**

Add RQ-043:

```markdown
| RQ-043 | 设置数据库化与智能体模型配置 | [`2026-06-17-settings-db-and-agent-model-config-design.md`](docs/superpowers/specs/2026-06-17-settings-db-and-agent-model-config-design.md) | [`2026-06-17-settings-db-and-agent-model-config.md`](docs/superpowers/plans/2026-06-17-settings-db-and-agent-model-config.md) | ✅ | ✅ 已完成 |
```

- [ ] **Step 7: Commit tracking matrix**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录设置数据库化与模型配置"
```
