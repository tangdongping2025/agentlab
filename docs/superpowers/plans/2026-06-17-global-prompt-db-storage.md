# 全局提示词数据库存储 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全局系统提示词从容器本地 JSON 文件迁移到 MySQL，避免 Docker 容器重建后配置丢失。

**Architecture:** 新增通用 `app_settings` ORM 表，以 `setting_key = "global_prompt"` 保存全局提示词 JSON。`global_prompt_settings.py` 保持原有 API 函数签名，内部改为数据库优先读写，并在数据库为空时从旧 JSON 文件自动导入一次。

**Tech Stack:** Python FastAPI, SQLAlchemy, MySQL JSON, pytest, React/Vite 现有设置页无需改动。

---

## 文件结构

- Modify: `backend/models.py` — 新增 `AppSettingModel`。
- Modify: `backend/global_prompt_settings.py` — 改为读写 `app_settings`，保留旧 JSON 自动导入。
- Modify: `backend/tests/test_global_prompt_settings.py` — 调整测试为数据库存储，新增自动导入覆盖。
- Modify: `项目执行跟踪矩阵.md` — 增加 RQ 与时间线。

---

### Task 1: 新增 app_settings 模型

**Files:**
- Modify: `backend/models.py`
- Test: `backend/tests/test_global_prompt_settings.py`

- [ ] **Step 1: Write the failing test**

在 `backend/tests/test_global_prompt_settings.py` 新增测试，验证 `create_tables()` 后存在 `app_settings` 表，并可保存全局提示词记录。

```python
def test_app_settings_table_stores_global_prompt():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        db.merge(AppSettingModel(setting_key="global_prompt", setting_value={"enabled": True, "prompt": "规则"}))
        db.commit()
        row = db.get(AppSettingModel, "global_prompt")
        assert row.setting_value == {"enabled": True, "prompt": "规则"}
    finally:
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_global_prompt_settings.py::test_app_settings_table_stores_global_prompt -q
```

Expected: FAIL because `AppSettingModel` is missing.

- [ ] **Step 3: Write minimal implementation**

在 `backend/models.py` 增加：

```python
class AppSettingModel(Base):
    __tablename__ = "app_settings"

    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(MySQLJSON, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 4: Run test to verify it passes**

Run 同 Step 2。Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/tests/test_global_prompt_settings.py
git commit -m "feat(settings): 添加 app_settings 配置表"
```

---

### Task 2: 全局提示词改为数据库读写

**Files:**
- Modify: `backend/global_prompt_settings.py`
- Modify: `backend/tests/test_global_prompt_settings.py`

- [ ] **Step 1: Write failing tests**

调整 roundtrip 测试为数据库断言，并新增旧 JSON 自动导入测试：

```python
def test_save_global_prompt_settings_roundtrip(tmp_path, monkeypatch):
    import global_prompt_settings as mod
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "global-prompt-settings.local.json")
    create_tables()

    saved = mod.save_global_prompt_settings({"enabled": True, "prompt": "全局规则"})

    assert saved == {"enabled": True, "prompt": "全局规则"}
    assert mod.load_global_prompt_settings() == saved
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "global_prompt")
        assert row.setting_value == saved
    finally:
        db.close()


def test_load_global_prompt_imports_legacy_json(tmp_path, monkeypatch):
    import json
    import global_prompt_settings as mod
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    settings_path = tmp_path / "global-prompt-settings.local.json"
    settings_path.write_text(json.dumps({"enabled": True, "prompt": "旧规则"}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", settings_path)
    create_tables()

    loaded = mod.load_global_prompt_settings()

    assert loaded == {"enabled": True, "prompt": "旧规则"}
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "global_prompt")
        assert row.setting_value == loaded
    finally:
        db.close()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_global_prompt_settings.py -q
```

Expected: FAIL because implementation still reads/writes JSON.

- [ ] **Step 3: Write implementation**

在 `backend/global_prompt_settings.py`：

- 增加 `SETTING_KEY = "global_prompt"`。
- 使用 `SessionLocal` 和 `AppSettingModel` 读写数据库。
- `load_global_prompt_settings()` 逻辑：数据库有记录则返回；否则读旧 JSON；旧 JSON 有效则保存到数据库并返回；否则返回默认值。
- `save_global_prompt_settings()` 逻辑：sanitize 后 upsert 到数据库。

- [ ] **Step 4: Run tests to verify they pass**

Run 同 Step 2。Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/global_prompt_settings.py backend/tests/test_global_prompt_settings.py
git commit -m "feat(settings): 全局提示词存储到数据库"
```

---

### Task 3: API 与 runtime 回归验证

**Files:**
- Modify: `backend/tests/test_global_prompt_settings.py`

- [ ] **Step 1: Add API compatibility assertions**

确保现有 `test_global_prompt_settings_api_roundtrip` 仍断言：

```python
assert body["enabled"] is True
assert body["prompt"] == "全局规则"
assert agents["assistant"]["supportsGlobalPrompt"] is True
assert agents["echo"]["supportsGlobalPrompt"] is False
```

- [ ] **Step 2: Run backend regression**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_global_prompt_settings.py backend/tests/test_base_agent.py backend/tests/test_claude_sdk_agent.py backend/tests/test_agents_api.py -q
```

Expected: PASS。

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 4: Commit if tests required changes**

```bash
git add backend/tests/test_global_prompt_settings.py
git commit -m "test(settings): 覆盖全局提示词数据库 API"
```

如果没有文件变化，不创建空提交。

---

### Task 4: 跟踪矩阵与最终验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Update tracking matrix**

新增 RQ-041，全局提示词数据库存储，引用本 spec 和 plan，状态为已完成。

- [ ] **Step 2: Run final smoke**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe - <<'PY'
import sys
sys.path.insert(0, 'backend')
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    resp = client.post('/api/settings/global-prompt', json={'enabled': True, 'prompt': '数据库规则'})
    resp.raise_for_status()
    resp = client.get('/api/settings/global-prompt')
    resp.raise_for_status()
    body = resp.json()
    assert body['enabled'] is True
    assert body['prompt'] == '数据库规则'
    print('global prompt db settings smoke ok')
PY
```

Expected: `global prompt db settings smoke ok`。

- [ ] **Step 3: Commit tracking matrix**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录全局提示词数据库存储"
```
