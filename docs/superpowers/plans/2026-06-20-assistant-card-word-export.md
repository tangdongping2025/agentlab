# Assistant 卡片 Word 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在每张 assistant 回复卡片上增加 Word 导出能力，把卡片 Markdown 保存到当前工作目录的 `exports/`，用 pandoc 转为 docx，并允许用户下载。

**Architecture:** 前端只负责收集当前卡片 Markdown 与 `workspaceCwd`、展示导出/下载状态；后端负责路径边界校验、生成文件名、写入 Markdown、调用 pandoc 转换 docx。下载复用现有 `/api/db/files/download`，避免新增文件读取机制。

**Tech Stack:** React 18、TypeScript、Vitest、FastAPI、pytest、pandoc、Docker apt runtime dependency。

---

## File Structure

- `backend/routers/files.py`
  - 新增导出请求/响应模型。
  - 新增 `POST /api/db/files/export-docx`。
  - 复用 `_check_under_root()` 校验 `cwd`。
  - 在 `cwd/exports/` 写 `.md`，用 `subprocess.run([...])` 调用 pandoc 生成 `.docx`。
  - pandoc 缺失时返回 500 + `服务器未安装 pandoc`。
  - pandoc 非 0 退出时返回 500 + `Word 导出失败`。

- `backend/tests/test_files.py`
  - 后端 TDD 覆盖成功导出、`cwd` 越界、pandoc 不存在。
  - 用 `monkeypatch` 替换 `subprocess.run`，避免测试依赖本机 pandoc。

- `Dockerfile`
  - runtime apt 包列表增加 `pandoc`。

- `src/services/dbApi.ts`
  - 新增 `ExportDocxResult` 类型。
  - 新增 `dbApi.exportDocx({ cwd, markdown })`。

- `src/services/dbApi.test.ts`
  - 覆盖 `exportDocx` 调用路径、method 和 body。

- `src/components/agentRuntime/MessageBubble.tsx`
  - 新增可选 props：`workspaceCwd?: string`、`onExportDocx?: (markdown: string) => Promise<{ docxPath: string; downloadUrl: string }>`。
  - assistant actions 中新增“导出 Word”。
  - 无 cwd 时显示“请先选择工作目录”。
  - 导出中显示“导出中…”，防重复点击。
  - 导出成功显示“下载 Word”，点击触发浏览器下载。
  - 导出失败显示失败提示。
  - `showActions={false}` 时不显示导出相关按钮。

- `src/components/agentRuntime/MessageBubble.test.tsx`
  - 覆盖导出按钮、无 cwd 提示、成功后下载、`showActions=false` 隐藏导出。

- `src/components/agentRuntime/ChatWorkspace.tsx`
  - 从 `useAgentRuntimeStore` 读取 `workspaceCwd`。
  - 将 `workspaceCwd` 和 `dbApi.exportDocx` 包装函数传给非流式 assistant `MessageBubble`。
  - 流式临时卡片继续 `showActions={false}`，不传导出能力。

- `src/components/agentRuntime/ChatWorkspace.test.tsx`
  - 覆盖 assistant 卡片点击“导出 Word”时使用 store 中的 `workspaceCwd` 和消息内容调用 API。

- `项目执行跟踪矩阵.md`
  - 新增 RQ-073：assistant 卡片 Word 导出。
  - 更新汇总计数和时间线。

---

### Task 1: Backend export-docx API

**Files:**
- Modify: `backend/routers/files.py`
- Test: `backend/tests/test_files.py`

- [ ] **Step 1: Write failing backend success test**

Append this test to `backend/tests/test_files.py`:

```python
def test_export_docx_writes_markdown_and_returns_download_url(tmp_path, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    cwd = tmp_path / "project"
    cwd.mkdir()

    def fake_run(cmd, check, capture_output, text):
        assert cmd[0] == "pandoc"
        assert cmd[1] == str(cwd / "exports" / "assistant-card-20260620-094500.md")
        assert cmd[2] == "-o"
        assert cmd[3] == str(cwd / "exports" / "assistant-card-20260620-094500.docx")
        assert check is False
        assert capture_output is True
        assert text is True
        (cwd / "exports" / "assistant-card-20260620-094500.docx").write_bytes(b"PK\x03\x04DOCX")

        class Result:
            returncode = 0
            stderr = ""

        return Result()

    monkeypatch.setattr("routers.files.datetime", type("FixedDatetime", (), {
        "now": staticmethod(lambda: type("FixedNow", (), {"strftime": lambda self, fmt: "20260620-094500"})())
    }))
    monkeypatch.setattr("routers.files.subprocess.run", fake_run)

    resp = client.post("/api/db/files/export-docx", json={
        "cwd": str(cwd),
        "markdown": "| 维度 | 说明 |\n|---|---|\n| A | B |",
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body["mdPath"] == str(cwd / "exports" / "assistant-card-20260620-094500.md")
    assert body["docxPath"] == str(cwd / "exports" / "assistant-card-20260620-094500.docx")
    assert body["downloadUrl"].startswith("/api/db/files/download?path=")
    assert (cwd / "exports" / "assistant-card-20260620-094500.md").read_text(encoding="utf-8") == "| 维度 | 说明 |\n|---|---|\n| A | B |"
```

- [ ] **Step 2: Run backend success test to verify RED**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py::test_export_docx_writes_markdown_and_returns_download_url -q
```

Expected: FAIL with 404 for `/api/db/files/export-docx` or missing implementation.

- [ ] **Step 3: Add backend implementation**

Modify `backend/routers/files.py` imports near the top:

```python
import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Literal
from urllib.parse import quote
```

If `json`, `Path`, `Literal` already exist, keep one import only.

Add these models near existing request/response models:

```python
class ExportDocxRequest(BaseModel):
    cwd: str
    markdown: str


class ExportDocxResponse(BaseModel):
    mdPath: str
    docxPath: str
    downloadUrl: str
```

Add this endpoint below `download_file`:

```python
@router.post("/export-docx", response_model=ExportDocxResponse)
def export_docx(payload: ExportDocxRequest):
    cwd = _check_under_root(payload.cwd)
    if not cwd.is_dir():
        raise HTTPException(status_code=400, detail="cwd must be a directory")

    if shutil.which("pandoc") is None:
        raise HTTPException(status_code=500, detail="服务器未安装 pandoc")

    export_dir = cwd / "exports"
    export_dir.mkdir(exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    md_path = export_dir / f"assistant-card-{stamp}.md"
    docx_path = export_dir / f"assistant-card-{stamp}.docx"

    md_path.write_text(payload.markdown, encoding="utf-8")

    result = subprocess.run(
        ["pandoc", str(md_path), "-o", str(docx_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail="Word 导出失败")

    return ExportDocxResponse(
        mdPath=str(md_path),
        docxPath=str(docx_path),
        downloadUrl=f"/api/db/files/download?path={quote(str(docx_path))}",
    )
```

- [ ] **Step 4: Run backend success test to verify GREEN**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py::test_export_docx_writes_markdown_and_returns_download_url -q
```

Expected: PASS.

- [ ] **Step 5: Write failing backend security and dependency tests**

Append these tests to `backend/tests/test_files.py`:

```python
def test_export_docx_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "root_dir", str(tmp_path))

    resp = client.post("/api/db/files/export-docx", json={
        "cwd": r"C:\Windows",
        "markdown": "content",
    })

    assert resp.status_code == 403


def test_export_docx_reports_missing_pandoc(tmp_path, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    monkeypatch.setattr("routers.files.shutil.which", lambda name: None)

    resp = client.post("/api/db/files/export-docx", json={
        "cwd": str(tmp_path),
        "markdown": "content",
    })

    assert resp.status_code == 500
    assert resp.json()["detail"] == "服务器未安装 pandoc"
```

- [ ] **Step 6: Run backend security and dependency tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py::test_export_docx_outside_root_forbidden tests/test_files.py::test_export_docx_reports_missing_pandoc -q
```

Expected: PASS if Step 3 already handles both. If the missing pandoc test fails because `shutil.which` is not imported or not checked, fix only that path.

- [ ] **Step 7: Run focused backend file tests**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -q
```

Expected: all `test_files.py` tests PASS.

- [ ] **Step 8: Commit backend API task**

Run:

```bash
git add backend/routers/files.py backend/tests/test_files.py
git commit -m "feat(runtime): 支持 assistant 卡片导出 Word"
```

---

### Task 2: Docker pandoc dependency

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Update Docker runtime apt packages**

Modify the runtime apt install line in `Dockerfile` from:

```dockerfile
&& apt-get update && apt-get install -y --no-install-recommends nginx supervisor nodejs npm \
```

to:

```dockerfile
&& apt-get update && apt-get install -y --no-install-recommends nginx supervisor nodejs npm pandoc \
```

- [ ] **Step 2: Verify Dockerfile contains pandoc**

Run:

```bash
git diff -- Dockerfile
```

Expected: diff shows only `pandoc` added to the apt package list.

- [ ] **Step 3: Commit Docker dependency task**

Run:

```bash
git add Dockerfile
git commit -m "build(runtime): 安装 Word 导出依赖 pandoc"
```

---

### Task 3: Frontend dbApi export client

**Files:**
- Modify: `src/services/dbApi.ts`
- Test: `src/services/dbApi.test.ts`

- [ ] **Step 1: Write failing dbApi test**

Add this test inside `describe('dbApi', ...)` in `src/services/dbApi.test.ts`:

```ts
  it('exportDocx POSTs markdown and cwd to export endpoint', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        mdPath: '/repo/exports/assistant-card.md',
        docxPath: '/repo/exports/assistant-card.docx',
        downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fassistant-card.docx',
      }), { status: 200 })
    );

    const result = await dbApi.exportDocx({ cwd: '/repo', markdown: '# 标题' });

    expect(mock).toHaveBeenCalledWith('/api/db/files/export-docx', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', markdown: '# 标题' }),
    }));
    expect(result.docxPath).toBe('/repo/exports/assistant-card.docx');
  });
```

- [ ] **Step 2: Run dbApi test to verify RED**

Run:

```bash
npm run test -- src/services/dbApi.test.ts -t "exportDocx POSTs markdown and cwd to export endpoint"
```

Expected: FAIL because `dbApi.exportDocx` is not a function.

- [ ] **Step 3: Add dbApi type and method**

In `src/services/dbApi.ts`, add near workspace/file types:

```ts
export interface ExportDocxResult {
  mdPath: string;
  docxPath: string;
  downloadUrl: string;
}
```

Add this method near existing file methods:

```ts
  exportDocx: (payload: { cwd: string; markdown: string }) =>
    req<ExportDocxResult>('/files/export-docx', { method: 'POST', body: JSON.stringify(payload) }),
```

- [ ] **Step 4: Run dbApi test to verify GREEN**

Run:

```bash
npm run test -- src/services/dbApi.test.ts -t "exportDocx POSTs markdown and cwd to export endpoint"
```

Expected: PASS.

- [ ] **Step 5: Commit dbApi task**

Run:

```bash
git add src/services/dbApi.ts src/services/dbApi.test.ts
git commit -m "feat(runtime): 增加 Word 导出 API 客户端"
```

---

### Task 4: MessageBubble Word export UI

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Test: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Write failing export button and no-cwd tests**

Add these tests to `src/components/agentRuntime/MessageBubble.test.tsx` before the regenerate test:

```ts
  it('assistant message exports markdown as Word when workspace cwd exists', async () => {
    const onExportDocx = vi.fn().mockResolvedValue({
      docxPath: '/repo/exports/assistant-card.docx',
      downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fassistant-card.docx',
    });

    render(
      <MessageBubble
        role="assistant"
        content="# 标题"
        workspaceCwd="/repo"
        onExportDocx={onExportDocx}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    await waitFor(() => {
      expect(onExportDocx).toHaveBeenCalledWith('# 标题');
    });
    expect(await screen.findByRole('button', { name: '下载 Word' })).toBeInTheDocument();
  });

  it('assistant message asks user to select cwd before exporting Word', async () => {
    const onExportDocx = vi.fn();

    render(<MessageBubble role="assistant" content="reply" onExportDocx={onExportDocx} />);

    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    expect(onExportDocx).not.toHaveBeenCalled();
    expect(screen.getByText('请先选择工作目录')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run MessageBubble tests to verify RED**

Run:

```bash
npm run test -- src/components/agentRuntime/MessageBubble.test.tsx -t "Word"
```

Expected: FAIL because `workspaceCwd` / `onExportDocx` props and “导出 Word” button do not exist.

- [ ] **Step 3: Extend MessageBubble props and state**

Modify `src/components/agentRuntime/MessageBubble.tsx` props:

```ts
interface ExportDocxResult {
  docxPath: string;
  downloadUrl: string;
}

interface Props {
  role: 'user' | 'assistant';
  content: string;
  onRegenerate?: () => void;
  showActions?: boolean;
  workspaceCwd?: string;
  onExportDocx?: (markdown: string) => Promise<ExportDocxResult>;
}
```

Change component signature:

```ts
const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate, showActions = true, workspaceCwd, onExportDocx }) => {
```

Add state after existing state declarations:

```ts
  const [exportingWord, setExportingWord] = useState(false);
  const [exportedWord, setExportedWord] = useState<ExportDocxResult | null>(null);
  const [exportMessage, setExportMessage] = useState('');
```

- [ ] **Step 4: Add export and download handlers**

Add these functions before `toggleSpeech`:

```ts
  const exportWord = async () => {
    if (!onExportDocx) return;
    if (!workspaceCwd) {
      setExportMessage('请先选择工作目录');
      return;
    }
    if (exportingWord) return;

    setExportingWord(true);
    setExportMessage('');
    try {
      const result = await onExportDocx(content);
      setExportedWord(result);
    } catch {
      setExportMessage('Word 导出失败');
    } finally {
      setExportingWord(false);
    }
  };

  const downloadWord = () => {
    if (!exportedWord) return;
    const a = document.createElement('a');
    a.href = exportedWord.downloadUrl;
    a.download = exportedWord.docxPath.split(/[\\/]/).pop() || 'assistant-card.docx';
    a.click();
  };
```

- [ ] **Step 5: Render export controls**

In assistant actions after the speech button block and before regenerate, add:

```tsx
              {onExportDocx && (
                exportedWord ? (
                  <button onClick={downloadWord} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>下载 Word</button>
                ) : (
                  <button onClick={exportWord} disabled={exportingWord} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: exportingWord ? 'default' : 'pointer', padding: 0 }}>{exportingWord ? '导出中…' : '导出 Word'}</button>
                )
              )}
              {exportMessage && <span style={{ fontSize: 11, color: 'var(--accent-red)' }}>{exportMessage}</span>}
```

If `--accent-red` is not defined in CSS, use `#B42318`.

- [ ] **Step 6: Run MessageBubble Word tests to verify GREEN**

Run:

```bash
npm run test -- src/components/agentRuntime/MessageBubble.test.tsx -t "Word"
```

Expected: PASS.

- [ ] **Step 7: Write and run showActions hidden regression test**

Add this test to `MessageBubble.test.tsx`:

```ts
  it('assistant message hides Word export action when showActions is false', () => {
    render(
      <MessageBubble
        role="assistant"
        content="reply"
        showActions={false}
        workspaceCwd="/repo"
        onExportDocx={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '导出 Word' })).not.toBeInTheDocument();
  });
```

Run:

```bash
npm run test -- src/components/agentRuntime/MessageBubble.test.tsx -t "hides Word export action"
```

Expected: PASS.

- [ ] **Step 8: Run all MessageBubble tests**

Run:

```bash
npm run test -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: all MessageBubble tests PASS.

- [ ] **Step 9: Commit MessageBubble UI task**

Run:

```bash
git add src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(runtime): 在 assistant 卡片增加 Word 导出入口"
```

---

### Task 5: ChatWorkspace wiring

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] **Step 1: Write failing ChatWorkspace integration test**

Add this test to `src/components/agentRuntime/ChatWorkspace.test.tsx`:

```ts
  it('passes workspace cwd and assistant markdown to Word export API', async () => {
    vi.mocked(dbApi.exportDocx).mockResolvedValue({
      mdPath: 'D:/repo/exports/assistant-card.md',
      docxPath: 'D:/repo/exports/assistant-card.docx',
      downloadUrl: '/api/db/files/download?path=D%3A%2Frepo%2Fexports%2Fassistant-card.docx',
    });
    useAgentRuntimeStore.setState({
      workspaceCwd: 'D:/repo',
      workspaceMessages: [{ role: 'assistant', content: '# 导出内容' }],
      workspaceStreaming: '',
      workspaceRunning: false,
    });

    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    await vi.waitFor(() => {
      expect(dbApi.exportDocx).toHaveBeenCalledWith({ cwd: 'D:/repo', markdown: '# 导出内容' });
    });
  });
```

- [ ] **Step 2: Run ChatWorkspace test to verify RED**

Run:

```bash
npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx -t "passes workspace cwd"
```

Expected: FAIL because `ChatWorkspace` does not pass export props to `MessageBubble` yet.

- [ ] **Step 3: Wire workspaceCwd and dbApi.exportDocx into MessageBubble**

In `src/components/agentRuntime/ChatWorkspace.tsx`, ensure `dbApi` is imported:

```ts
import { dbApi } from '../../services/dbApi';
```

Read `workspaceCwd` from the store in the existing selector/destructure block. If the component currently uses direct store state destructuring, add:

```ts
  const workspaceCwd = useAgentRuntimeStore(state => state.workspaceCwd);
```

When rendering non-streaming assistant messages, change `MessageBubble` usage to include:

```tsx
              workspaceCwd={workspaceCwd}
              onExportDocx={m.role === 'assistant' ? (markdown) => dbApi.exportDocx({ cwd: workspaceCwd, markdown }) : undefined}
```

The resulting call should look like:

```tsx
            <MessageBubble
              role={m.role}
              content={m.content}
              workspaceCwd={workspaceCwd}
              onExportDocx={m.role === 'assistant' ? (markdown) => dbApi.exportDocx({ cwd: workspaceCwd, markdown }) : undefined}
              onRegenerate={m.role === 'assistant' && i === lastIdx && !workspaceRunning ? regenerateLast : undefined}
            />
```

Do not add export props to the streaming `MessageBubble role="assistant" content={workspaceStreaming} showActions={false}`.

- [ ] **Step 4: Run ChatWorkspace integration test to verify GREEN**

Run:

```bash
npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx -t "passes workspace cwd"
```

Expected: PASS.

- [ ] **Step 5: Run focused ChatWorkspace tests**

Run:

```bash
npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: all ChatWorkspace tests PASS.

- [ ] **Step 6: Commit ChatWorkspace wiring task**

Run:

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "feat(runtime): 串联卡片 Word 导出到工作目录"
```

---

### Task 6: Requirement tracking and final verification

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Update tracking matrix**

Add a new row for RQ-073 in `项目执行跟踪矩阵.md` using the surrounding table style:

```markdown
| RQ-073 | Assistant 卡片 Word 导出 | ✅ 已完成 | spec: `docs/superpowers/specs/2026-06-20-assistant-card-word-export-design.md`<br>plan: `docs/superpowers/plans/2026-06-20-assistant-card-word-export.md` | assistant 回复卡片支持导出 Markdown 到 `workspaceCwd/exports/` 并通过 pandoc 转换 docx 下载 |
```

Update any summary counts and 2026-06-20 timeline entry in the same file to include RQ-073.

- [ ] **Step 2: Run backend verification**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -q
```

Expected: all file router tests PASS.

- [ ] **Step 3: Run frontend verification**

Run:

```bash
npm run test -- src/services/dbApi.test.ts src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: targeted frontend tests PASS.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS. If pre-existing unrelated failures appear, capture exact output and do not claim typecheck passes.

- [ ] **Step 5: Run app-level UI verification**

Start backend using the Windows-safe entrypoint:

```bash
cd backend && .venv/Scripts/python.exe run_server.py
```

Start frontend:

```bash
npm run dev
```

Manual verification in Chrome:

1. 打开 Vite 页面。
2. 进入对话工作区。
3. 选择一个工作目录。
4. 找到一张已完成的 assistant 卡片。
5. 点击“导出 Word”。
6. 确认按钮变为“下载 Word”。
7. 确认工作目录下出现 `exports/assistant-card-*.md` 和 `exports/assistant-card-*.docx`。
8. 点击“下载 Word”，确认浏览器下载 docx。
9. 用 Word/WPS/LibreOffice 打开 docx，确认 Markdown 表格显示为表格。
10. 清空/不选择工作目录时点击“导出 Word”，确认显示“请先选择工作目录”。

If Playwright/Chromium is unavailable, ask the user to perform these manual steps and report the result. Do not mark the UI verification complete until the user confirms.

- [ ] **Step 6: Commit tracking matrix**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(runtime): 更新 Word 导出需求跟踪"
```

---

## Final Self-Review Checklist

- [ ] Spec scope covered: assistant-only, single-card manual export, `workspaceCwd/exports/`, `.md` + `.docx`, no custom filename/template, download only.
- [ ] Table support covered by pandoc backend conversion and manual docx verification.
- [ ] Security covered: `cwd` checked under `ROOT_DIR`, filename generated by backend, `subprocess.run([...])` uses argument array and no shell.
- [ ] Missing pandoc covered in backend test and user-facing error.
- [ ] Streaming card remains without actions because `showActions={false}` is unchanged.
- [ ] Existing copy, plain copy, speech, regenerate tests still pass.
- [ ] No unrelated files are staged or committed.
