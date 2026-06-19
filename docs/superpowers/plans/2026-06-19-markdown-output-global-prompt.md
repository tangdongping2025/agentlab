# Markdown Output Global Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the user-provided Markdown answer templates as a reusable global system prompt section without changing rendering code.

**Architecture:** Use the existing global prompt settings API as the persistence boundary. Read the current prompt, replace an existing `[Markdown 输出规范]...[/Markdown 输出规范]` block if present, otherwise append the new block, then save the updated prompt with `enabled: true`.

**Tech Stack:** FastAPI settings API, MySQL-backed app settings, Python standard library HTTP client.

---

## File Structure

- Create: `docs/superpowers/specs/2026-06-19-markdown-output-global-prompt-design.md` — design document for the prompt behavior.
- Create: `docs/superpowers/plans/2026-06-19-markdown-output-global-prompt.md` — this implementation plan.
- Modify: `项目执行跟踪矩阵.md` — add RQ tracking row after implementation verification.
- Runtime setting: `/api/settings/global-prompt` — update current global prompt content.

## Task 1: Commit Spec and Plan

**Files:**
- Create: `docs/superpowers/specs/2026-06-19-markdown-output-global-prompt-design.md`
- Create: `docs/superpowers/plans/2026-06-19-markdown-output-global-prompt.md`

- [ ] **Step 1: Commit the spec**

Run:

```bash
git add docs/superpowers/specs/2026-06-19-markdown-output-global-prompt-design.md
git commit -m "docs(spec): Markdown 输出规范全局提示词"
```

Expected: one spec commit is created.

- [ ] **Step 2: Commit the plan**

Run:

```bash
git add docs/superpowers/plans/2026-06-19-markdown-output-global-prompt.md
git commit -m "docs(plan): Markdown 输出规范全局提示词实施计划"
```

Expected: one plan commit is created.

## Task 2: Update Global Prompt Runtime Setting

**Files:**
- Runtime setting: `/api/settings/global-prompt`

- [ ] **Step 1: Read current global prompt through the running backend**

Run:

```bash
python - <<'PY'
import json
import urllib.request

with urllib.request.urlopen('http://127.0.0.1:8000/api/settings/global-prompt') as resp:
    body = json.load(resp)
print({'enabled': body['enabled'], 'prompt_length': len(body['prompt']), 'has_markdown_section': '[Markdown 输出规范]' in body['prompt']})
PY
```

Expected: command prints current enabled state, prompt length, and whether the Markdown section exists.

- [ ] **Step 2: Save the Markdown output section**

Run a Python script that:

1. GETs `/api/settings/global-prompt`.
2. Removes any existing block matching `\n*\[Markdown 输出规范\][\s\S]*?\[/Markdown 输出规范\]\n*`.
3. Appends the approved block from the spec.
4. POSTs `{ "enabled": true, "prompt": updatedPrompt }` to `/api/settings/global-prompt`.

Expected: API returns `enabled: true` and the updated prompt contains one Markdown output section.

- [ ] **Step 3: Verify saved prompt**

Run:

```bash
python - <<'PY'
import json
import urllib.request

with urllib.request.urlopen('http://127.0.0.1:8000/api/settings/global-prompt') as resp:
    body = json.load(resp)
prompt = body['prompt']
print({'enabled': body['enabled'], 'markdown_section_count': prompt.count('[Markdown 输出规范]'), 'has_summary_rule': '不要为了套模板而添加无意义章节' in prompt})
PY
```

Expected: `enabled` is `True`, `markdown_section_count` is `1`, and `has_summary_rule` is `True`.

## Task 3: Tracking Update

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Add RQ tracking row**

Add this row after RQ-052:

```md
| RQ-053 | Markdown 输出规范全局提示词 | [`2026-06-19-markdown-output-global-prompt-design.md`](docs/superpowers/specs/2026-06-19-markdown-output-global-prompt-design.md) | [`2026-06-19-markdown-output-global-prompt.md`](docs/superpowers/plans/2026-06-19-markdown-output-global-prompt.md) | ✅ | 🔍 浏览器验收待确认 |
```

Update summary:

```md
- **总数**：51
- **已完成**：47
- **进行中**：4
```

- [ ] **Step 2: Commit tracking update**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录 Markdown 输出规范全局提示词"
```

Expected: one tracking commit is created.

## Task 4: Browser Verification

**Files:**
- No file changes.

- [ ] **Step 1: Ask a complex comparison question**

Use the running frontend and ask a question that should trigger the comparison template.

Expected: assistant uses headings, a table, and selection advice.

- [ ] **Step 2: Ask a simple confirmation question**

Ask a simple yes/no or short factual question.

Expected: assistant does not force a full template.

## Self-Review

- Spec coverage: existing prompt is preserved, Markdown section is appended/replaced, supported agents use the existing global prompt mechanism, and simple replies are not forced into templates.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: runtime setting key and endpoint match the existing global prompt settings API.
