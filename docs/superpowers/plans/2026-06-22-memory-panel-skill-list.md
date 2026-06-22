# 记忆透视台 skill 段清单展示 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** skill 段预览从"第一个 skill 前 200 字符"改为"启用 skill 清单(名字+字符数+占比)"。

**Architecture:** 后端 `memory_preview.py` 新增 `_skill_breakdown`(拆分每个启用 skill 的字符数)+ `_format_skill_preview`(格式化清单文本),skill 段 preview 改用清单;chars 仍取 `build_skill_prompt_for_agent` 全长。前端零改动。

**Tech Stack:** Python(FastAPI 后端) + pytest。

---

### Task 1: skill 段 preview 改清单

**Files:**
- Modify: `backend/memory_preview.py`
- Test: `backend/tests/test_memory_preview.py`

- [ ] **Step 1: 写失败测试(RED)**

在 `backend/tests/test_memory_preview.py` 末尾追加:

```python
def test_memory_preview_skill_segment_lists_enabled_skills(tmp_path, monkeypatch):
    import global_prompt_settings as gp
    monkeypatch.setattr(gp, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "g.json")
    gp.save_global_prompt_settings({"enabled": True, "prompt": "x"})

    import memory_preview
    monkeypatch.setattr(memory_preview, "_skill_breakdown", lambda aid, cwd: [
        {"id": "buffett", "name": "buffett", "chars": 9831},
        {"id": "skill-creator", "name": "skill-creator", "chars": 12000},
    ])
    monkeypatch.setattr(memory_preview, "build_skill_prompt_for_agent", lambda aid, cwd: "x" * 21831)

    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        data = client.get("/api/settings/memory-preview").json()
        skill_seg = next(s for s in data["segments"] if s["key"] == "skill")
        assert skill_seg["chars"] == 21831
        assert "buffett" in skill_seg["preview"]
        assert "skill-creator" in skill_seg["preview"]
        assert "9831" in skill_seg["preview"]
        assert "45%" in skill_seg["preview"]  # 9831/21831 ≈ 45%
```

- [ ] **Step 2: 跑测试验证失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_memory_preview.py::test_memory_preview_skill_segment_lists_enabled_skills -v`
Expected: FAIL(preview 当前是 `"xxx..."`,不含 "buffett")

- [ ] **Step 3: 实现(GREEN)**

`backend/memory_preview.py`:
- 顶部 import 改:`from skill_settings import build_skill_prompt_for_agent, discover_skills, load_skill_settings`
- 新增函数(放在 `_list_insights` 后):

```python
def _skill_breakdown(agent_id: str, cwd: str | None = None) -> list[dict]:
    """拆分每个启用 skill 的字符数。chars 与 build_skill_prompt_for_agent 的 chunk
    格式 f"\\n[启用的 Skill: {name}]\\n{content}\\n[/Skill]\\n" 严格对齐。"""
    settings = load_skill_settings(cwd)
    skills = {s["id"]: s for s in discover_skills(cwd)}
    items = []
    for skill_id in sorted(settings["skills"]):
        cfg = settings["skills"][skill_id]
        if not cfg.get("enabled") or agent_id not in cfg.get("agentIds", []):
            continue
        skill = skills.get(skill_id)
        if not skill:
            continue
        name = skill["name"]
        chunk_len = len(f"\n[启用的 Skill: {name}]\n") + len(skill["content"]) + len("\n[/Skill]\n")
        items.append({"id": skill_id, "name": name, "chars": chunk_len})
    return items


def _format_skill_preview(items: list[dict], total: int) -> str:
    if not items:
        return "（无启用 skill）"
    lines = []
    for it in items:
        pct = round(it["chars"] * 100 / total) if total else 0
        lines.append(f"{it['name']} · {it['chars']} 字符 · {pct}%")
    return "\n".join(lines)
```

- `build_memory_preview_response` 里 skill 段构造改为:

```python
    skill_text = build_skill_prompt_for_agent(agent_id, cwd)
    skill_items = _skill_breakdown(agent_id, cwd)
    skill_chars = len(skill_text)
    skill_preview = _format_skill_preview(skill_items, skill_chars)
```

segments 里 skill 段改为手动构造(不再用 `_segment` 截断):

```python
        _segment("task", "任务段", task_text, "task.system 或 _DEFAULT_SYSTEM_PROMPT(当前会话未设 task.system → 默认)"),
        {
            "key": "skill",
            "name": "技能",
            "enabled": bool(skill_items),
            "chars": skill_chars,
            "source": "build_skill_prompt_for_agent",
            "preview": skill_preview,
        },
        _segment("habit", "习惯偏好", habit_text, "build_habit_prompt_for_agent", enabled=bool(habit_text)),
```

(删掉原来的 `_segment("skill", "技能", skill_text, ...)` 那行)

- [ ] **Step 4: 跑测试验证通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_memory_preview.py -v`
Expected: 3 个测试全 PASS

- [ ] **Step 5: 跑全量后端测试确认无回归**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -x -q`
Expected: 除已知预先失败的(`test_global_prompt_settings`),其余 PASS

- [ ] **Step 6: commit**

```bash
git add backend/memory_preview.py backend/tests/test_memory_preview.py
git commit -m "fix(memory-preview): skill 段预览改为启用 skill 清单"
```
