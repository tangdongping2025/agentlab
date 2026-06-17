# MCP 设置系统 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加平台级 MCP 设置系统 v1：密钥只读 env、非敏感配置可保存、AMap MCP 可诊断/启停/关联 SDK agent，并在设置页展示支持范围。

**Architecture:** 后端新增 `mcp_settings` 服务和 `/api/settings/mcp` router，配置保存到 gitignored 的 `backend/mcp-settings.local.json`。`ClaudeSdkAgent` 读取该配置决定是否注入 AMap MCP；前端 SettingsModal 通过新 API 展示与保存配置。

**Tech Stack:** FastAPI + Pydantic + pytest；React 18 + TypeScript + Vite。

---

## Files

- Create: `backend/mcp_settings.py`
- Create: `backend/routers/settings.py`
- Create: `backend/tests/test_mcp_settings.py`
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `backend/tests/test_claude_sdk_agent.py`
- Modify: `backend/main.py`
- Modify: `.gitignore`
- Modify: `src/services/agentRuntimeApi.ts`
- Modify: `src/components/SettingsModal.tsx`

---

### Task 1: 后端 MCP 设置服务 + API

**Files:**
- Create: `backend/mcp_settings.py`
- Create: `backend/routers/settings.py`
- Create: `backend/tests/test_mcp_settings.py`
- Modify: `backend/main.py`
- Modify: `.gitignore`

- [ ] **Step 1: 先写失败测试**

Create `backend/tests/test_mcp_settings.py`:

```python
from pathlib import Path


def test_default_mcp_settings_when_file_missing(tmp_path, monkeypatch):
    from mcp_settings import load_mcp_settings
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "missing.json")
    settings = load_mcp_settings()
    assert settings["servers"]["amap-maps"]["enabled"] is True
    assert settings["servers"]["amap-maps"]["agentIds"] == ["claude-sdk"]
    assert settings["servers"]["amap-maps"]["launchMode"] == "auto"


def test_save_mcp_settings_filters_unknown_and_secret(tmp_path, monkeypatch):
    from mcp_settings import load_mcp_settings, save_mcp_settings
    path = tmp_path / "mcp-settings.local.json"
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", path)
    save_mcp_settings({
        "servers": {
            "amap-maps": {
                "enabled": False,
                "agentIds": ["claude-sdk", "unknown"],
                "launchMode": "npx",
                "env": {"AMAP_MAPS_API_KEY": "leak"},
                "apiKey": "leak",
            },
            "unknown-server": {"enabled": True},
        }
    })
    saved = load_mcp_settings()
    assert saved == {
        "servers": {
            "amap-maps": {
                "enabled": False,
                "agentIds": ["claude-sdk"],
                "launchMode": "npx",
            }
        }
    }
    assert "leak" not in path.read_text(encoding="utf-8")


def test_mcp_settings_api_roundtrip(client, tmp_path, monkeypatch):
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "mcp-settings.local.json")
    resp = client.get("/api/settings/mcp")
    assert resp.status_code == 200
    body = resp.json()
    assert body["servers"][0]["id"] == "amap-maps"
    assert body["servers"][0]["secretEnv"] == "AMAP_MAPS_API_KEY"
    assert "secretValue" not in body["servers"][0]

    resp = client.post("/api/settings/mcp", json={
        "servers": {
            "amap-maps": {
                "enabled": False,
                "agentIds": ["claude-sdk"],
                "launchMode": "bundled",
                "apiKey": "must-not-save",
            }
        }
    })
    assert resp.status_code == 200
    body = resp.json()
    server = body["servers"][0]
    assert server["enabled"] is False
    assert server["launchMode"] == "bundled"


def test_mcp_diagnose_does_not_leak_secret(client, monkeypatch, tmp_path):
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "mcp-settings.local.json")
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "secret-value")
    resp = client.post("/api/settings/mcp/diagnose")
    assert resp.status_code == 200
    body = resp.json()
    text = str(body)
    assert body["servers"][0]["secretConfigured"] is True
    assert "secret-value" not in text
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_mcp_settings.py -q
```

Expected: FAIL,因为 `mcp_settings`/router 不存在。

- [ ] **Step 3: 实现 `backend/mcp_settings.py`**

Create:

```python
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from runtime.registry import _AGENT_REGISTRY

MCP_SETTINGS_PATH = Path(__file__).resolve().parent / "mcp-settings.local.json"
AMAP_SERVER_ID = "amap-maps"
AMAP_SECRET_ENV = "AMAP_MAPS_API_KEY"
AMAP_PREINSTALLED_ENTRY = "/opt/mcp/node_modules/@amap/amap-maps-mcp-server/build/index.js"
LAUNCH_MODES = {"auto", "npx", "bundled"}
SUPPORTED_MCP_AGENT_IDS = {"claude-sdk"}
DEFAULT_MCP_SETTINGS = {
    "servers": {
        AMAP_SERVER_ID: {
            "enabled": True,
            "agentIds": ["claude-sdk"],
            "launchMode": "auto",
        }
    }
}


def _known_agent_ids() -> set[str]:
    return set(_AGENT_REGISTRY.keys())


def sanitize_mcp_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    raw_servers = (raw or {}).get("servers") or {}
    raw_amap = raw_servers.get(AMAP_SERVER_ID) or {}
    enabled = raw_amap.get("enabled", DEFAULT_MCP_SETTINGS["servers"][AMAP_SERVER_ID]["enabled"])
    launch_mode = raw_amap.get("launchMode", "auto")
    if launch_mode not in LAUNCH_MODES:
        launch_mode = "auto"
    known = _known_agent_ids()
    agent_ids = raw_amap.get("agentIds", ["claude-sdk"])
    if not isinstance(agent_ids, list):
        agent_ids = ["claude-sdk"]
    agent_ids = [a for a in agent_ids if a in known and a in SUPPORTED_MCP_AGENT_IDS]
    if not agent_ids and "claude-sdk" in known:
        agent_ids = ["claude-sdk"]
    return {
        "servers": {
            AMAP_SERVER_ID: {
                "enabled": bool(enabled),
                "agentIds": agent_ids,
                "launchMode": launch_mode,
            }
        }
    }


def load_mcp_settings() -> dict[str, Any]:
    if not MCP_SETTINGS_PATH.exists():
        return sanitize_mcp_settings(DEFAULT_MCP_SETTINGS)
    try:
        return sanitize_mcp_settings(json.loads(MCP_SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return sanitize_mcp_settings(DEFAULT_MCP_SETTINGS)


def save_mcp_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_mcp_settings(raw)
    MCP_SETTINGS_PATH.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    return settings


def select_amap_command(launch_mode: str) -> tuple[str | None, list[str], str | None]:
    preinstalled_exists = os.path.isfile(AMAP_PREINSTALLED_ENTRY)
    if launch_mode == "bundled":
        if not preinstalled_exists:
            return None, [], "bundled entry missing"
        return "node", [AMAP_PREINSTALLED_ENTRY], None
    if launch_mode == "npx":
        if sys.platform == "win32":
            return "cmd", ["/c", "npx", "-y", "@amap/amap-maps-mcp-server"], None
        return "npx", ["-y", "@amap/amap-maps-mcp-server"], None
    if sys.platform != "win32" and preinstalled_exists:
        return "node", [AMAP_PREINSTALLED_ENTRY], None
    if sys.platform == "win32":
        return "cmd", ["/c", "npx", "-y", "@amap/amap-maps-mcp-server"], None
    return "npx", ["-y", "@amap/amap-maps-mcp-server"], None


def build_mcp_settings_response() -> dict[str, Any]:
    settings = load_mcp_settings()
    cfg = settings["servers"][AMAP_SERVER_ID]
    agents = [
        {
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsMcp": agent_id in SUPPORTED_MCP_AGENT_IDS,
            "unsupportedReason": "当前仅 Claude SDK Agent 支持 MCP 注入" if agent_id not in SUPPORTED_MCP_AGENT_IDS else "",
        }
        for agent_id, cls in _AGENT_REGISTRY.items()
    ]
    return {
        "servers": [{
            "id": AMAP_SERVER_ID,
            "name": "高德地图",
            "enabled": cfg["enabled"],
            "agentIds": cfg["agentIds"],
            "launchMode": cfg["launchMode"],
            "secretEnv": AMAP_SECRET_ENV,
            "secretConfigured": bool(os.environ.get(AMAP_SECRET_ENV, "").strip()),
            "supportedAgentIds": sorted(SUPPORTED_MCP_AGENT_IDS),
            "unsupportedReason": "当前仅 Claude SDK Agent 支持 MCP 注入",
        }],
        "agents": agents,
    }


def diagnose_mcp_settings() -> dict[str, Any]:
    settings = load_mcp_settings()
    cfg = settings["servers"][AMAP_SERVER_ID]
    command, args, error = select_amap_command(cfg["launchMode"])
    return {
        "servers": [{
            "id": AMAP_SERVER_ID,
            "enabled": cfg["enabled"],
            "agentIds": cfg["agentIds"],
            "launchMode": cfg["launchMode"],
            "secretEnv": AMAP_SECRET_ENV,
            "secretConfigured": bool(os.environ.get(AMAP_SECRET_ENV, "").strip()),
            "platform": sys.platform,
            "nodeAvailable": shutil.which("node") is not None,
            "npmAvailable": shutil.which("npm") is not None,
            "npxAvailable": shutil.which("npx") is not None,
            "bundledEntry": AMAP_PREINSTALLED_ENTRY,
            "bundledEntryExists": os.path.isfile(AMAP_PREINSTALLED_ENTRY),
            "selectedCommand": command or "",
            "selectedArgs": args,
            "error": error or "",
        }]
    }
```

- [ ] **Step 4: 实现 router 并挂载**

Create `backend/routers/settings.py`:

```python
from __future__ import annotations

from fastapi import APIRouter

from mcp_settings import build_mcp_settings_response, diagnose_mcp_settings, save_mcp_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/mcp")
def get_mcp_settings() -> dict:
    return build_mcp_settings_response()


@router.post("/mcp")
def update_mcp_settings(payload: dict) -> dict:
    save_mcp_settings(payload)
    return build_mcp_settings_response()


@router.post("/mcp/diagnose")
def diagnose_mcp() -> dict:
    return diagnose_mcp_settings()
```

Modify `backend/main.py`:

```python
from routers import sessions, migrate, files, settings
...
app.include_router(settings.router)
```

Modify `.gitignore` add:

```gitignore
backend/mcp-settings.local.json
```

- [ ] **Step 5: 跑后端测试**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_mcp_settings.py -q
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add .gitignore backend/mcp_settings.py backend/routers/settings.py backend/tests/test_mcp_settings.py backend/main.py
git commit -m "feat(settings): 添加 MCP 非敏感配置与诊断 API"
```

---

### Task 2: Claude SDK Agent 读取 MCP 设置

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: 先写失败测试**

Append to `backend/tests/test_claude_sdk_agent.py`:

```python

def test_amap_mcp_skipped_when_disabled(monkeypatch):
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr("runtime.claude_sdk_agent.load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": False, "agentIds": ["claude-sdk"], "launchMode": "auto"}}
    })
    from runtime.claude_sdk_agent import _build_mcp_servers
    assert "amap-maps" not in _build_mcp_servers()


def test_amap_mcp_skipped_when_agent_not_selected(monkeypatch):
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr("runtime.claude_sdk_agent.load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": [], "launchMode": "auto"}}
    })
    from runtime.claude_sdk_agent import _build_mcp_servers
    assert "amap-maps" not in _build_mcp_servers()


def test_amap_mcp_bundled_mode_missing_entry_skips(monkeypatch):
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr("runtime.claude_sdk_agent.load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": ["claude-sdk"], "launchMode": "bundled"}}
    })
    monkeypatch.setattr("os.path.isfile", lambda p: False)
    from runtime.claude_sdk_agent import _build_mcp_servers
    assert "amap-maps" not in _build_mcp_servers()
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -q
```

Expected: FAIL，因为 `claude_sdk_agent.load_mcp_settings` 不存在且 `_build_mcp_servers` 未读配置。

- [ ] **Step 3: 改 `claude_sdk_agent.py`**

Add import:

```python
from mcp_settings import AMAP_PREINSTALLED_ENTRY, AMAP_SERVER_ID, load_mcp_settings, select_amap_command
```

Replace constants usage:

```python
_AMAP_SERVER_NAME = AMAP_SERVER_ID
_AMAP_PREINSTALLED_ENTRY = AMAP_PREINSTALLED_ENTRY
```

Update `_build_mcp_servers()`:

```python
def _build_mcp_servers() -> dict:
    settings = load_mcp_settings()
    amap_cfg = settings["servers"].get(_AMAP_SERVER_NAME, {})
    if not amap_cfg.get("enabled", True):
        return {}
    if "claude-sdk" not in amap_cfg.get("agentIds", []):
        return {}
    amap_key = os.environ.get("AMAP_MAPS_API_KEY", "").strip()
    if not amap_key:
        return {}
    command, args, error = select_amap_command(amap_cfg.get("launchMode", "auto"))
    if error or not command:
        return {}
    return {
        _AMAP_SERVER_NAME: {
            "command": command,
            "args": args,
            "env": {"AMAP_MAPS_API_KEY": amap_key},
        }
    }
```

Remove direct platform branch duplication if no longer needed.

- [ ] **Step 4: 跑测试**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py tests/test_mcp_settings.py -q
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(agent-runtime): Claude SDK Agent 按 MCP 设置注入 AMap"
```

---

### Task 3: 前端 SettingsModal MCP tab

**Files:**
- Modify: `src/services/agentRuntimeApi.ts`
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: 增加 API client 类型和函数**

Modify `src/services/agentRuntimeApi.ts` add:

```typescript
export interface McpAgentSupport {
  id: string;
  name: string;
  supportsMcp: boolean;
  unsupportedReason: string;
}

export interface McpServerSettings {
  id: string;
  name: string;
  enabled: boolean;
  agentIds: string[];
  launchMode: 'auto' | 'npx' | 'bundled';
  secretEnv: string;
  secretConfigured: boolean;
  supportedAgentIds: string[];
  unsupportedReason: string;
}

export interface McpSettingsResponse {
  servers: McpServerSettings[];
  agents: McpAgentSupport[];
}

export interface McpDiagnosticServer {
  id: string;
  enabled: boolean;
  agentIds: string[];
  launchMode: 'auto' | 'npx' | 'bundled';
  secretEnv: string;
  secretConfigured: boolean;
  platform: string;
  nodeAvailable: boolean;
  npmAvailable: boolean;
  npxAvailable: boolean;
  bundledEntry: string;
  bundledEntryExists: boolean;
  selectedCommand: string;
  selectedArgs: string[];
  error: string;
}

export interface McpDiagnosticResponse {
  servers: McpDiagnosticServer[];
}

export async function getMcpSettings(): Promise<McpSettingsResponse> {
  const resp = await fetch('/api/settings/mcp');
  if (!resp.ok) throw new Error(`getMcpSettings failed: ${resp.status}`);
  return resp.json();
}

export async function saveMcpSettings(payload: { servers: Record<string, { enabled: boolean; agentIds: string[]; launchMode: 'auto' | 'npx' | 'bundled' }> }): Promise<McpSettingsResponse> {
  const resp = await fetch('/api/settings/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`saveMcpSettings failed: ${resp.status}`);
  return resp.json();
}

export async function diagnoseMcpSettings(): Promise<McpDiagnosticResponse> {
  const resp = await fetch('/api/settings/mcp/diagnose', { method: 'POST' });
  if (!resp.ok) throw new Error(`diagnoseMcpSettings failed: ${resp.status}`);
  return resp.json();
}
```

- [ ] **Step 2: SettingsModal import API/types**

```typescript
import { getMcpSettings, saveMcpSettings, diagnoseMcpSettings, type McpSettingsResponse, type McpDiagnosticResponse } from '../services/agentRuntimeApi';
```

- [ ] **Step 3: tabs 加 MCP**

```typescript
{ id: 'mcp', label: 'MCP', icon: 'MCP' }
```

- [ ] **Step 4: SettingsModal 加 MCP state/effect**

```typescript
const [mcpSettings, setMcpSettings] = React.useState<McpSettingsResponse | null>(null);
const [mcpDraft, setMcpDraft] = React.useState<McpSettingsResponse | null>(null);
const [mcpError, setMcpError] = React.useState('');
const [mcpSaved, setMcpSaved] = React.useState(false);
const [mcpDiagnostic, setMcpDiagnostic] = React.useState<McpDiagnosticResponse | null>(null);

React.useEffect(() => {
  if (!isOpen) return;
  getMcpSettings()
    .then(data => {
      setMcpSettings(data);
      setMcpDraft(JSON.parse(JSON.stringify(data)));
      setMcpError('');
      setMcpSaved(false);
    })
    .catch(err => setMcpError(err instanceof Error ? err.message : '加载 MCP 设置失败'));
}, [isOpen]);
```

- [ ] **Step 5: 增加 MCP tab UI**

在内容区加入 `activeTab === 'mcp'` 分支。最小 UI:

- 加 notice:「全局 MCP 设置；当前仅 Claude SDK Agent 支持 MCP 注入」
- 若 `mcpError` 显示错误
- 若 loading 显示加载中
- 展示第一个 server(amap-maps):
  - enabled checkbox
  - secretConfigured 状态
  - launchMode select(auto/npx/bundled)
  - supported agents checkbox(只对 supportsMcp=true 可勾选)
  - unsupported agents 只读列表
  - 保存按钮
  - 运行诊断按钮
- 诊断结果用 InfoRow 展示 selectedCommand/platform/node/npx/bundled/secretConfigured/error

保存 handler:

```typescript
const saveMcp = async () => {
  if (!mcpDraft) return;
  const payload = {
    servers: Object.fromEntries(mcpDraft.servers.map(s => [s.id, {
      enabled: s.enabled,
      agentIds: s.agentIds,
      launchMode: s.launchMode,
    }]))
  };
  const data = await saveMcpSettings(payload);
  setMcpSettings(data);
  setMcpDraft(JSON.parse(JSON.stringify(data)));
  setMcpSaved(true);
};
```

诊断 handler:

```typescript
const runMcpDiagnose = async () => {
  const data = await diagnoseMcpSettings();
  setMcpDiagnostic(data);
};
```

- [ ] **Step 6: typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/services/agentRuntimeApi.ts src/components/SettingsModal.tsx
git commit -m "feat(settings): 添加 MCP 设置与诊断界面"
```

---

### Task 4: 验证与跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: 全量相关测试**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_mcp_settings.py tests/test_claude_sdk_agent.py tests/test_agents_api.py -q
npm run typecheck
npx vitest run src/components/agentRuntime/ src/stores/agentRuntimeStore.test.ts
```

Expected: PASS。

- [ ] **Step 2: 浏览器验证**

Start:

```bash
cd backend && .venv/Scripts/python.exe run_server.py
npm run dev
```

Verify:
- Settings → MCP tab loads.
- AMap secret shows configured/not configured, no secret value.
- Enable/disable can save and refresh persists.
- launchMode can save.
- `claude-sdk` can be selected; unsupported agents are shown as unsupported.
- Diagnose returns platform/node/npx/bundled/selected command.

- [ ] **Step 3: 更新跟踪矩阵**

Append 2026-06-17 MCP 设置系统条目。

- [ ] **Step 4: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录 MCP 设置系统需求"
```
