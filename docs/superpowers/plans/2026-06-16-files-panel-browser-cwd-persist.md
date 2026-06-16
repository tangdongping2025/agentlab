# FilesPanel 文件浏览器 + cwd 持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FilesPanel 从只读列表升级为只读文件浏览器(子目录导航 + 文本查看 + docx 下载),workspaceCwd 持久化到 session(per-agent,刷新恢复)。

**Architecture:** 后端 files.py 抽 `_check_under_root` + 加 `read_file`/`download`;Session 加 cwd 字段(model/schema/router)—— **dev/prod 共享 MySQL,本地 ALTER 即同步线上**。前端 dbApi 加 readFile/downloadFile;FilesPanel 加导航/内容视图/下载;store setWorkspaceCwd 落库、selectAgent 恢复 cwd。纯函数(parentDir/isText)抽到 filesUtils.ts 便于测试。

**Tech Stack:** 后端 Python FastAPI + pytest(FileResponse);前端 React + Zustand + vitest

**关键约束(来自 spec `2026-06-16-files-panel-browser-cwd-persist-design.md`):**
- read_file:扩展名白名单 + 1MB 上限 + root 校验
- download:任意文件,root 校验,FileResponse
- cwd 存 session(per-agent),nullable,未设时 agent 用默认 sandbox
- **共享 MySQL**:`context_lab` 库 dev/prod 共享,加 cwd 列本地 ALTER 即影响线上(nullable 不破坏现有数据)

---

### Task 1: 后端 Session 加 cwd 字段(model + schema + router)

**Files:**
- Modify: `backend/models.py`(SessionModel 加 cwd)
- Modify: `backend/schemas.py`(SessionCreate/Update/Out 加 cwd)
- Modify: `backend/routers/sessions.py`(_to_session_out/create/update 处理 cwd)
- Modify: `backend/tests/test_sessions_crud.py`(加 cwd 测试)

- [ ] **Step 1: models.py 加 cwd 字段**

`backend/models.py` 的 `SessionModel`,在 `agent_id` 行后加:

```python
    agent_id = Column(String(64), nullable=True, index=True)
    cwd = Column(String(512), nullable=True)
```

- [ ] **Step 2: schemas.py 三个 schema 加 cwd**

`backend/schemas.py`:
- `SessionCreate` 在 `agentId` 行后加 `cwd: Optional[str] = None`
- `SessionUpdate` 在 `agentId` 行后加 `cwd: Optional[str] = None`
- `SessionOut` 在 `agentId` 行后加 `cwd: Optional[str] = None`

- [ ] **Step 3: 写失败测试 —— cwd create/update/out**

追加到 `backend/tests/test_sessions_crud.py` 末尾:

```python
def test_session_create_with_cwd():
    resp = client.post("/api/db/sessions", json={"id": "s-cwd1", "agentId": "claude-sdk", "cwd": "D:/proj/x"})
    assert resp.status_code == 200
    assert resp.json()["cwd"] == "D:/proj/x"


def test_session_update_cwd():
    client.post("/api/db/sessions", json={"id": "s-cwd2"})
    resp = client.put("/api/db/sessions/s-cwd2", json={"cwd": "D:/proj/y"})
    assert resp.status_code == 200
    assert resp.json()["cwd"] == "D:/proj/y"
    # get 也含 cwd
    assert client.get("/api/db/sessions/s-cwd2").json()["cwd"] == "D:/proj/y"
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py::test_session_create_with_cwd tests/test_sessions_crud.py::test_session_update_cwd -v`
Expected: FAIL —— create/out 未返回 cwd(Step 2 schema 已加但 router _to_session_out/create 未处理)

- [ ] **Step 5: 实现 router 处理 cwd**

`backend/routers/sessions.py`:

`_to_session_out` 的 `SessionOut(...)` 里,在 `agentId=sess.agent_id,` 后加:
```python
        cwd=sess.cwd,
```

`create_session` 的 `models.SessionModel(...)` 里,在 `agent_id=payload.agentId,` 后加:
```python
        cwd=payload.cwd,
```

`update_session` 里,在 `if payload.agentId is not None:` 块后加:
```python
    if payload.cwd is not None:
        sess.cwd = payload.cwd
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py -v`
Expected: PASS(测试库 `context_lab_test` 由 create_tables 新建,含 cwd 列)

- [ ] **Step 7: ALTER 共享库 context_lab.sessions 加 cwd 列**

> ⚠️ **共享 MySQL**:dev/prod 共享 `context_lab` 库,此 ALTER 即同步线上。cwd nullable 不破坏现有数据。执行前知悉。

先检查是否已有(幂等):
```bash
docker exec my-mysql mysql -uroot -p123456 context_lab -e "SHOW COLUMNS FROM sessions LIKE 'cwd';"
```
若输出为空(无 cwd 列),执行:
```bash
docker exec my-mysql mysql -uroot -p123456 context_lab -e "ALTER TABLE sessions ADD COLUMN cwd VARCHAR(512) NULL;"
```
再查确认有 cwd 列。

- [ ] **Step 8: Commit**

```bash
git add backend/models.py backend/schemas.py backend/routers/sessions.py backend/tests/test_sessions_crud.py
git commit -m "feat(files-browser): session 加 cwd 字段(model/schema/router)"
```

---

### Task 2: 后端 read_file + download API(files.py)

**Files:**
- Modify: `backend/routers/files.py`(抽 _check_under_root + read_file + download)
- Modify: `backend/tests/test_files.py`(加 read/download 测试)

- [ ] **Step 1: 写失败测试 —— read_file + download**

追加到 `backend/tests/test_files.py` 末尾:

```python
def test_read_file_text_within_root(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.py").write_text("print('hi')", encoding="utf-8")
    resp = client.get("/api/db/files/read", params={"path": str(tmp_path / "a.py")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "a.py"
    assert body["content"] == "print('hi')"


def test_read_file_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    resp = client.get("/api/db/files/read", params={"path": r"C:\Windows\win.ini"})
    assert resp.status_code == 403


def test_read_file_non_text_rejected(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.docx").write_bytes(b"PK\x03\x04")
    resp = client.get("/api/db/files/read", params={"path": str(tmp_path / "a.docx")})
    assert resp.status_code == 400


def test_read_file_too_large_rejected(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "big.txt").write_bytes(b"x" * (1024 * 1024 + 1))
    resp = client.get("/api/db/files/read", params={"path": str(tmp_path / "big.txt")})
    assert resp.status_code == 400


def test_download_file_within_root(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.docx").write_bytes(b"PK\x03\x04DOCX")
    resp = client.get("/api/db/files/download", params={"path": str(tmp_path / "a.docx")})
    assert resp.status_code == 200
    assert "a.docx" in resp.headers.get("content-disposition", "")


def test_download_file_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    resp = client.get("/api/db/files/download", params={"path": r"C:\Windows\win.ini"})
    assert resp.status_code == 403
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -v`
Expected: FAIL —— /api/db/files/read 和 /download 端点不存在(404)

- [ ] **Step 3: 实现 files.py(抽 _check_under_root + read_file + download)**

整个 `backend/routers/files.py` 替换为:

```python
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import settings

router = APIRouter(prefix="/api/db/files", tags=["files"])

_TEXT_EXTS = {
    ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".json",
    ".yml", ".yaml", ".xml", ".html", ".css", ".csv", ".log", ".sh",
    ".ini", ".conf", ".toml", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".sql",
}
_MAX_READ_BYTES = 1024 * 1024  # 1MB


def _check_under_root(target_str: str) -> Path:
    root = Path(settings.root_dir).resolve()
    try:
        target = Path(target_str).resolve()
        target.relative_to(root)  # 不在 root 下 → ValueError
    except (ValueError, OSError):
        raise HTTPException(status_code=403, detail="path must be under root_dir")
    return target


@router.get("")
def list_files(dir: str):
    target = _check_under_root(dir)
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="not a directory")
    items = []
    for entry in os.scandir(target):
        st = entry.stat()
        items.append({
            "name": entry.name,
            "mtime": int(st.st_mtime),
            "size": st.st_size,
            "is_dir": entry.is_dir(),
        })
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return items


@router.get("/read")
def read_file(path: str):
    target = _check_under_root(path)
    if not target.is_file():
        raise HTTPException(status_code=400, detail="not a file")
    if target.suffix.lower() not in _TEXT_EXTS:
        raise HTTPException(status_code=400, detail="file type not supported for preview")
    size = target.stat().st_size
    if size > _MAX_READ_BYTES:
        raise HTTPException(status_code=400, detail="file too large (>1MB)")
    content = target.read_text(encoding="utf-8", errors="replace")
    return {"name": target.name, "size": size, "content": content}


@router.get("/download")
def download_file(path: str):
    target = _check_under_root(path)
    if not target.is_file():
        raise HTTPException(status_code=400, detail="not a file")
    return FileResponse(str(target), filename=target.name)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -v`
Expected: PASS(原 3 + 新 6 = 9)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/files.py backend/tests/test_files.py
git commit -m "feat(files-browser): read_file(白名单+1MB)+ download(FileResponse)"
```

---

### Task 3: 前端 dbApi.readFile/downloadFile + Session type cwd

**Files:**
- Modify: `src/types/index.ts`(Session 加 cwd?)
- Modify: `src/services/dbApi.ts`(readFile + downloadFile)

- [ ] **Step 1: types/index.ts Session 加 cwd**

`src/types/index.ts` 的 `Session` interface,在 `messages: Message[];` 后加:

```typescript
  messages: Message[];
  cwd?: string;
```

- [ ] **Step 2: dbApi.ts 加 readFile + downloadFile**

`src/services/dbApi.ts` 的 `dbApi` 对象,在 `listFiles` 后加:

```typescript
  readFile: (path: string) =>
    req<{ name: string; size: number; content: string }>(`/files/read?path=${encodeURIComponent(path)}`),
  // download 返回 URL(浏览器 a[href download] 直接拉文件流,不走 req 的 JSON 解析)
  downloadFile: (path: string) =>
    `${BASE}/files/download?path=${encodeURIComponent(path)}`,
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无错

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/dbApi.ts
git commit -m "feat(files-browser): dbApi readFile/downloadFile + Session.cwd 类型"
```

---

### Task 4: store cwd 持久化(setWorkspaceCwd 落库 + selectAgent 恢复)

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`
- Modify: `src/stores/agentRuntimeStore.test.ts`

- [ ] **Step 1: 写失败测试 —— setWorkspaceCwd 落库 + selectAgent 恢复**

追加到 `src/stores/agentRuntimeStore.test.ts` 的 describe 块内(末尾):

```typescript
  it('setWorkspaceCwd persists cwd to session', async () => {
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({ workspaceSessionId: 's1' });
    useAgentRuntimeStore.getState().setWorkspaceCwd('D:/proj');
    expect(useAgentRuntimeStore.getState().workspaceCwd).toBe('D:/proj');
    expect(updateSession).toHaveBeenCalledWith('s1', { cwd: 'D:/proj' });
  });

  it('selectAgent restores workspaceCwd from session', async () => {
    querySessions.mockResolvedValue({ items: [{ id: 'sess-echo', agentId: 'echo' }], total: 1, page: 1, size: 20 });
    getSession.mockResolvedValue({ id: 'sess-echo', cwd: 'D:/restored', messages: [] });
    useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });
    await useAgentRuntimeStore.getState().selectAgent('echo');
    expect(useAgentRuntimeStore.getState().workspaceCwd).toBe('D:/restored');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: FAIL —— setWorkspaceCwd 当前只 set 不落库;selectAgent 不恢复 cwd

- [ ] **Step 3: 实现 setWorkspaceCwd 落库 + selectAgent 恢复**

`src/stores/agentRuntimeStore.ts`:

`setWorkspaceCwd` 改为(set 后 fire-and-forget 落库):

```typescript
  setWorkspaceCwd: (cwd) => {
    set({ workspaceCwd: cwd });
    const sid = get().workspaceSessionId;
    if (sid) {
      dbApi.updateSession(sid, { cwd }).catch(e => console.error('cwd persist failed', e));
    }
  },
```

`selectAgent` 的 `set({...})` 里,在 `workspaceMessages: ...` 行后加 `workspaceCwd: session?.cwd || null,`(完整):

```typescript
    set({
      currentAgentId: id,
      workspaceSessionId: session?.id || null,
      workspaceMessages: (session?.messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      workspaceCwd: session?.cwd || null,
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
    });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(files-browser): store cwd 持久化(落库 + selectAgent 恢复)"
```

---

### Task 5: FilesPanel 子目录导航 + 返回上级

**Files:**
- Create: `src/components/agentRuntime/filesUtils.ts`(parentDir 纯函数)
- Create: `src/components/agentRuntime/filesUtils.test.ts`
- Modify: `src/components/agentRuntime/FilesPanel.tsx`(导航)

- [ ] **Step 1: 写失败测试 —— parentDir 纯函数**

创建 `src/components/agentRuntime/filesUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parentDir } from './filesUtils';

describe('parentDir', () => {
  it('strips last path segment (forward slash)', () => {
    expect(parentDir('D:/proj/sub')).toBe('D:/proj');
  });
  it('strips last path segment (backslash)', () => {
    expect(parentDir('D:\\proj\\sub')).toBe('D:\\proj');
  });
  it('returns empty for top-level drive', () => {
    expect(parentDir('D:')).toBe('');
  });
  it('returns empty when no separator', () => {
    expect(parentDir('foo')).toBe('');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/components/agentRuntime/filesUtils.test.ts`
Expected: FAIL —— filesUtils 不存在

- [ ] **Step 3: 创建 filesUtils.ts**

`src/components/agentRuntime/filesUtils.ts`:

```typescript
// 取父目录:剥最后一段路径(支持 / 和 \);到顶层(D: / 无分隔符)返回空串
export function parentDir(p: string): string {
  return p.replace(/[\\/][^\\/]+$/, '');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/components/agentRuntime/filesUtils.test.ts`
Expected: PASS

- [ ] **Step 5: FilesPanel 加导航(子目录点击 + 返回上级 + 路径显示)**

`src/components/agentRuntime/FilesPanel.tsx` 顶部 import 加 parentDir,并改造组件。整个文件替换为:

```typescript
import React, { useState, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { dbApi } from '../../services/dbApi';
import { parentDir } from './filesUtils';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-primary)', flex: 1,
};

type FileItem = { name: string; mtime: number; size: number; is_dir: boolean };

const FilesPanel: React.FC = () => {
  const { workspaceCwd, setWorkspaceCwd } = useAgentRuntimeStore();
  const [input, setInput] = useState(workspaceCwd || '');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async (dir: string) => {
    setLoading(true); setError('');
    try {
      setFiles(await dbApi.listFiles(dir));
    } catch (e: any) {
      setError(e?.message || '加载失败(可能不在根目录下)');
      setFiles([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (workspaceCwd) { setInput(workspaceCwd); load(workspaceCwd); }
  }, [workspaceCwd]);

  const switchDir = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!window.confirm(`将切换工作目录到:\n${trimmed}\n\nagent 的 Read/Edit/Bash 都将在此目录操作,确认?`)) return;
    setWorkspaceCwd(trimmed);
  };

  const enterChild = (name: string) => {
    const child = `${workspaceCwd}/${name}`;
    setWorkspaceCwd(child);
  };

  const goUp = () => {
    const p = parentDir(workspaceCwd || '');
    if (!p || p === workspaceCwd) return;
    setWorkspaceCwd(p);
  };

  const fmtTime = (t: number) => new Date(t * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtSize = (s: number) => s < 1024 ? `${s} B` : s < 1024 * 1024 ? `${(s / 1024).toFixed(1)} KB` : `${(s / 1024 / 1024).toFixed(1)} MB`;

  const upDisabled = !workspaceCwd || !parentDir(workspaceCwd) || parentDir(workspaceCwd) === workspaceCwd;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inputStyle} placeholder="工作目录(必须在根目录 D:\我的个人区间\Projects 下)" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && switchDir()} />
        <button onClick={switchDir} style={{ padding: '6px 14px', borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>切换</button>
      </div>
      {workspaceCwd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <button onClick={goUp} disabled={upDisabled} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: upDisabled ? 'not-allowed' : 'pointer', opacity: upDisabled ? 0.5 : 1 }}>↑ 上级</button>
          <span style={{ wordBreak: 'break-all' }}>{workspaceCwd}</span>
        </div>
      )}
      {error && <div style={{ color: 'var(--accent-violet)', fontSize: 12 }}>{error}</div>}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        {loading && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>加载中…</div>}
        {!loading && files.length === 0 && !error && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>空目录(先切换到有效工作目录)</div>}
        {files.map(f => (
          <div
            key={f.name}
            onClick={() => f.is_dir && enterChild(f.name)}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, cursor: f.is_dir ? 'pointer' : 'default' }}
          >
            <span style={{ color: f.is_dir ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{f.is_dir ? '📁 ' : '📄 '}{f.name}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{fmtTime(f.mtime)} · {f.is_dir ? '-' : fmtSize(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilesPanel;
```

- [ ] **Step 6: typecheck + 跑现有测试不回归**

Run: `npm run typecheck && npm run test:run -- src/components/agentRuntime/filesUtils.test.ts src/stores/agentRuntimeStore.test.ts`
Expected: typecheck 无错 + 测试 PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/agentRuntime/filesUtils.ts src/components/agentRuntime/filesUtils.test.ts src/components/agentRuntime/FilesPanel.tsx
git commit -m "feat(files-browser): FilesPanel 子目录导航 + 返回上级 + parentDir 纯函数"
```

---

### Task 6: FilesPanel 文本查看 + docx 下载

**Files:**
- Modify: `src/components/agentRuntime/filesUtils.ts`(加 isText)
- Modify: `src/components/agentRuntime/filesUtils.test.ts`(加 isText 测试)
- Modify: `src/components/agentRuntime/FilesPanel.tsx`(内容视图 + 下载)

- [ ] **Step 1: 写失败测试 —— isText**

追加到 `src/components/agentRuntime/filesUtils.test.ts`(import 加 isText):

```typescript
import { parentDir, isText } from './filesUtils';

describe('isText', () => {
  it('true for text extensions', () => {
    expect(isText('a.py')).toBe(true);
    expect(isText('README.md')).toBe(true);
    expect(isText('config.json')).toBe(true);
  });
  it('false for non-text extensions', () => {
    expect(isText('a.docx')).toBe(false);
    expect(isText('a.pdf')).toBe(false);
    expect(isText('a.png')).toBe(false);
  });
  it('case-insensitive', () => {
    expect(isText('A.PY')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/components/agentRuntime/filesUtils.test.ts`
Expected: FAIL —— isText 未导出

- [ ] **Step 3: filesUtils.ts 加 isText**

`src/components/agentRuntime/filesUtils.ts` 追加:

```typescript
const TEXT_EXTS = ['.md', '.txt', '.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.yml', '.yaml', '.xml', '.html', '.css', '.csv', '.log', '.sh', '.ini', '.conf', '.toml', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.sql'];

export function isText(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXTS.some(ext => lower.endsWith(ext));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/components/agentRuntime/filesUtils.test.ts`
Expected: PASS

- [ ] **Step 5: FilesPanel 加内容视图 + 下载触发**

`src/components/agentRuntime/FilesPanel.tsx`:
- import 加 `isText`:`import { parentDir, isText } from './filesUtils';`
- import 加 `dbApi.readFile` 已通过 dbApi import(用 dbApi.readFile / dbApi.downloadFile)
- 组件内加状态 + openFile + 内容视图。

在 `const [loading, setLoading] = useState(false);` 后加:

```typescript
  const [viewing, setViewing] = useState<{ name: string; content: string } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');

  const openFile = async (name: string) => {
    const path = `${workspaceCwd}/${name}`;
    if (isText(name)) {
      setViewLoading(true); setViewError(''); setViewing(null);
      try {
        const r = await dbApi.readFile(path);
        setViewing({ name: r.name, content: r.content });
      } catch (e: any) {
        setViewError(e?.message || '读取失败');
      } finally { setViewLoading(false); }
    } else {
      const a = document.createElement('a');
      a.href = dbApi.downloadFile(path);
      a.download = name;
      a.click();
    }
  };
```

文件 row 的 onClick 改(处理目录 + 文件):

```typescript
            onClick={() => f.is_dir ? enterChild(f.name) : openFile(f.name)}
```

在文件列表容器(`{error && ...}` 后,列表 div 前)加内容视图切换。把列表 div 包进 `{!viewing && (...)}`,并在前面加 viewing 块。结构(替换从 `{error && ...}` 到列表结束):

```typescript
      {error && !viewing && <div style={{ color: 'var(--accent-violet)', fontSize: 12 }}>{error}</div>}
      {viewing && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <button onClick={() => { setViewing(null); setViewError(''); }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}>← 返回目录</button>
            <strong style={{ fontSize: 13 }}>{viewing.name}</strong>
          </div>
          {viewLoading && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>加载中…</div>}
          {viewError && <div style={{ color: 'var(--accent-violet)', fontSize: 12 }}>{viewError}</div>}
          <pre style={{ flex: 1, overflow: 'auto', background: 'var(--bg-deep)', padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-primary)' }}>{viewing.content}</pre>
        </div>
      )}
      {!viewing && (
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
          {loading && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>加载中…</div>}
          {!loading && files.length === 0 && !error && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>空目录(先切换到有效工作目录)</div>}
          {files.map(f => (
            <div
              key={f.name}
              onClick={() => f.is_dir ? enterChild(f.name) : openFile(f.name)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, cursor: f.is_dir ? 'pointer' : 'default' }}
            >
              <span style={{ color: f.is_dir ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{f.is_dir ? '📁 ' : '📄 '}{f.name}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{fmtTime(f.mtime)} · {f.is_dir ? '-' : fmtSize(f.size)}</span>
            </div>
          ))}
        </div>
      )}
```

> 完整 FilesPanel.tsx 较长,实现时以 Task 5 的版本为基础做上述增量(加 import isText、加 viewing 状态 + openFile、改 onClick、列表包 `{!viewing}`、加 viewing 块)。

- [ ] **Step 6: typecheck + 测试不回归**

Run: `npm run typecheck && npm run test:run -- src/components/agentRuntime/filesUtils.test.ts`
Expected: typecheck 无错 + 测试 PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/agentRuntime/filesUtils.ts src/components/agentRuntime/filesUtils.test.ts src/components/agentRuntime/FilesPanel.tsx
git commit -m "feat(files-browser): FilesPanel 文本查看(内容视图)+ 非文本下载"
```

---

### Task 7: 后端 AgentTask 加 cwd 字段(修前端 cwd → agent 链路)

**背景**:前端 `runAgent` body 是 `{messages, cwd}`,但后端 `task: AgentTask` 是 dataclass(字段 messages/system/config),pydantic 忽略未知字段 cwd → `task.config` 无 cwd → `_build_options` 永远用 `_SANDBOX_DIR`,前端切 cwd 对 agent 不生效。改 AgentTask 直接接 cwd 字段。

**Files:**
- Modify: `backend/runtime/agent.py`(AgentTask 加 cwd)
- Modify: `backend/runtime/claude_sdk_agent.py`(_build_options 用 task.cwd,替换 Task 2 的 config 读法)
- Modify: `backend/tests/test_claude_sdk_agent.py`(_build_options 测试改 task.cwd)

- [ ] **Step 1: 改测试 —— _build_options 用 task.cwd**

`backend/tests/test_claude_sdk_agent.py` 把 `test_build_options_uses_config_cwd` 改名/改实现为:

```python
def test_build_options_uses_cwd():
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.agent import AgentTask
    agent = ClaudeSdkAgent()
    opts = agent._build_options(AgentTask(messages=[], cwd="/some/path"))
    assert opts.cwd == "/some/path"
```

`test_build_options_default_cwd` 不变(无 cwd → _SANDBOX_DIR)。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_build_options_uses_cwd -v`
Expected: FAIL —— AgentTask 无 cwd 字段(传 cwd= 报错)或 _build_options 还从 config 读

- [ ] **Step 3: agent.py AgentTask 加 cwd**

`backend/runtime/agent.py` 的 `AgentTask`,加字段:

```python
@dataclass
class AgentTask:
    messages: list  # [{"role":"user","content":"..."}]
    system: str | None = None
    config: dict = field(default_factory=dict)
    cwd: str | None = None
```

- [ ] **Step 4: _build_options 用 task.cwd**

`backend/runtime/claude_sdk_agent.py` 的 `_build_options`,把 `cwd=(task.config or {}).get("cwd") or _SANDBOX_DIR,` 改为:

```python
            cwd=task.cwd or _SANDBOX_DIR,
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/runtime/agent.py backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "fix(files-browser): AgentTask 加 cwd 字段(修前端 cwd→agent 链路)"
```

---

### Task 8: cwd 历史(多工作目录选择切换)

**背景**:用户保存多个工作目录后,要能选择切换(而非每次手输/导航)。cwd 历史存 session(per-agent,与 cwd 一致),切换 cwd 时追加(去重,限 10)。

**Files:**
- Modify: `backend/models.py`(SessionModel 加 cwd_history JSON)
- Modify: `backend/schemas.py`(SessionCreate/Update/Out 加 cwdHistory)
- Modify: `backend/routers/sessions.py`(_to_session_out/create/update 处理 cwdHistory)
- Modify: `backend/tests/test_sessions_crud.py`(cwdHistory 测试)
- Modify: `src/types/index.ts`(Session 加 cwdHistory?)
- Modify: `src/stores/agentRuntimeStore.ts`(workspaceCwdHistory + setWorkspaceCwd 追加)
- Modify: `src/components/agentRuntime/FilesPanel.tsx`(历史选择)

- [ ] **Step 1: models.py 加 cwd_history**

`backend/models.py` SessionModel,在 `cwd` 行后加(JSON,仿 selected_tools):

```python
    cwd = Column(String(512), nullable=True)
    cwd_history = Column(MySQLJSON, nullable=False, default=list)
```

- [ ] **Step 2: schemas.py 加 cwdHistory**

`backend/schemas.py`:
- SessionCreate 在 `cwd` 后加:`cwdHistory: list = Field(default_factory=list)`
- SessionUpdate 在 `cwd` 后加:`cwdHistory: Optional[list] = None`
- SessionOut 在 `cwd` 后加:`cwdHistory: list = Field(default_factory=list)`

- [ ] **Step 3: 写失败测试 —— cwdHistory create/update**

追加到 `backend/tests/test_sessions_crud.py`:

```python
def test_session_update_cwd_history():
    client.post("/api/db/sessions", json={"id": "s-hist"})
    resp = client.put("/api/db/sessions/s-hist", json={"cwd": "D:/a", "cwdHistory": ["D:/a"]})
    assert resp.status_code == 200
    assert resp.json()["cwdHistory"] == ["D:/a"]
    # 追加
    resp = client.put("/api/db/sessions/s-hist", json={"cwd": "D:/b", "cwdHistory": ["D:/a", "D:/b"]})
    assert resp.json()["cwdHistory"] == ["D:/a", "D:/b"]
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py::test_session_update_cwd_history -v`
Expected: FAIL —— out 未含 cwdHistory

- [ ] **Step 5: router 处理 cwdHistory**

`backend/routers/sessions.py`:
- `_to_session_out` 的 SessionOut(...) 里,在 `cwd=sess.cwd,` 后加:`cwdHistory=sess.cwd_history or [],`
- `create_session` 的 models.SessionModel(...) 里,在 `cwd=payload.cwd,` 后加:`cwd_history=payload.cwdHistory,`
- `update_session` 里,在 cwd 块后加:
```python
    if payload.cwdHistory is not None:
        sess.cwd_history = payload.cwdHistory
```

- [ ] **Step 6: 跑测试通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_sessions_crud.py -v`
Expected: PASS

- [ ] **Step 7: 共享库 ALTER context_lab.sessions 加 cwd_history 列**

```bash
docker exec my-mysql mysql -uroot -p123456 context_lab -e "SHOW COLUMNS FROM sessions LIKE 'cwd_history';"
```
若空:
```bash
docker exec my-mysql mysql -uroot -p123456 context_lab -e "ALTER TABLE sessions ADD COLUMN cwd_history JSON NOT NULL DEFAULT (JSON_ARRAY());"
```

- [ ] **Step 8: 前端 types + store**

`src/types/index.ts` Session 加(在 cwd? 后):`cwdHistory?: string[];`

`src/stores/agentRuntimeStore.ts`:
- interface 加 `workspaceCwdHistory: string[];`
- state 加 `workspaceCwdHistory: [],`
- `setWorkspaceCwd` 改为追加历史(去重,限 10)并落库:
```typescript
  setWorkspaceCwd: (cwd) => {
    const hist = [cwd, ...get().workspaceCwdHistory.filter(c => c !== cwd)].slice(0, 10);
    set({ workspaceCwd: cwd, workspaceCwdHistory: hist });
    const sid = get().workspaceSessionId;
    if (sid) {
      dbApi.updateSession(sid, { cwd, cwdHistory: hist }).catch(e => console.error('cwd persist failed', e));
    }
  },
```
- `selectAgent` 的 set 加 `workspaceCwdHistory: session?.cwdHistory || [],`

- [ ] **Step 9: FilesPanel 历史选择**

`src/components/agentRuntime/FilesPanel.tsx` 顶部加(切换按钮行旁)历史下拉:

```typescript
  const { workspaceCwd, workspaceCwdHistory, setWorkspaceCwd } = useAgentRuntimeStore();
```

在切换按钮行的 `<button onClick={switchDir}>切换</button>` 后加:

```typescript
        {workspaceCwdHistory.length > 0 && (
          <select
            onChange={e => { if (e.target.value) setWorkspaceCwd(e.target.value); }}
            value=""
            style={{ padding: '6px 8px', fontSize: 13, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-primary)' }}
          >
            <option value="">历史…</option>
            {workspaceCwdHistory.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
```

- [ ] **Step 10: typecheck + 测试不回归**

Run: `npm run typecheck && npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: typecheck 无错 + 测试 PASS

- [ ] **Step 11: Commit**

```bash
git add backend/models.py backend/schemas.py backend/routers/sessions.py backend/tests/test_sessions_crud.py src/types/index.ts src/stores/agentRuntimeStore.ts src/components/agentRuntime/FilesPanel.tsx
git commit -m "feat(files-browser): cwd 历史(session 存 + 前端选择切换)"
```

---

### Task 9: 全测试 + 手动验证 + 跟踪矩阵

**Files:**
- 无新文件(验证 + 跟踪矩阵)

- [ ] **Step 1: 后端全测试**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -v`
Expected: 全 PASS(含 test_files 9 + test_sessions_crud 含 cwd 新增)

- [ ] **Step 2: 前端 typecheck + 关键测试**

Run: `npm run typecheck && npm run test:run -- src/stores/agentRuntimeStore.test.ts src/components/agentRuntime/filesUtils.test.ts src/components/HistoryPage.test.tsx`
Expected: typecheck 无错 + 测试 PASS

- [ ] **Step 3: 手动验证(后端已起 :8000,前端 :5173)**

浏览器 Ctrl+Shift+R 硬刷新后,选 Claude SDK Agent → tab「文件」:
1. 输入 `D:\我的个人区间\Projects\context-lab\backend\sandbox` → 切换 → 确认 → 列出文件
2. 点 📁 子目录(如 scripts)→ 进入下级(列表刷新为子目录内容,顶部路径更新)
3. 点「↑ 上级」→ 返回 sandbox
4. 点 📄 文本文件(如 README.md)→ 跳转内容视图显示文本 + 「返回目录」
5. 点 docx(如 bubble_sort_讲解.docx)→ 触发浏览器下载
6. 刷新浏览器 → 重选 Claude SDK Agent → workspaceCwd 应回到上次设置的(持久化)
7. tab「对话」让 agent「列出当前目录文件」→ agent 在新 cwd 操作

- [ ] **Step 4: 更新跟踪矩阵**

`项目执行跟踪矩阵.md` 末尾加 2026-06-16 条目(FilesPanel 浏览器 + cwd 持久化):7 Task 完成 + 共享库 ALTER cwd 列。

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "chore(files-browser): 跟踪矩阵补录 FilesPanel 浏览器 + cwd 持久化"
```

---

## 验证清单(执行完所有 Task)

- [ ] 后端 pytest 全绿(含 read/download/cwd 新增)
- [ ] 前端 typecheck 无错 + filesUtils/agentRuntimeStore/HistoryPage 测试 PASS
- [ ] 共享库 context_lab.sessions 已加 cwd 列(本地 ALTER 即线上)
- [ ] 手动:子目录导航 + 返回上级 + 文本查看 + docx 下载 + cwd 刷新持久化 + cwd 联动 agent

## 已知风险

1. **共享 MySQL**:ALTER context_lab.sessions 同步线上(nullable 不破坏数据,但属线上 schema 变更)
2. **返回上级到根之外**:parentDir 算到 root 之上时,load 会 403(后端拒绝),前端显示错误提示;在 root 时「↑ 上级」按钮已 disabled 缓解,但 D: 顶层边界靠后端校验兜底
3. **大文本**:1MB 上限;内容视图纯文本 pre 渲染
4. **docx 不解析**:只下载(后端无 python-docx);下载走 FileResponse,已 root 校验
