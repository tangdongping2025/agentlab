import React, { useState, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { dbApi } from '../../services/dbApi';
import { parentDir, isText, isUnderRoot, loadCwdMemory, saveCwdMemory, loadCwdHistoryMemory, saveCwdHistoryMemory, resolveCwdForRoot } from './filesUtils';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-primary)', flex: 1,
};

type FileItem = { name: string; mtime: number; size: number; is_dir: boolean };

const FilesPanel: React.FC = () => {
  const { workspaceCwd, workspaceCwdHistory, setWorkspaceCwd, setWorkspaceCwdHistory } = useAgentRuntimeStore();
  const [input, setInput] = useState(workspaceCwd || '');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<{ name: string; content: string } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');
  const [rootDir, setRootDir] = useState('');

  // 获取当前环境 root_dir，用于校验 cwd 有效性
  useEffect(() => {
    dbApi.fetchRootDir().then(r => setRootDir(r.root_dir)).catch(() => {});
  }, []);

  // rootDir 变化(切环境 / 首次加载)→ 恢复该环境历史,覆盖内存中的旧环境历史
  useEffect(() => {
    if (!rootDir) return;
    setWorkspaceCwdHistory(loadCwdHistoryMemory(rootDir));
  }, [rootDir]);

  // 任意路径变化(switchDir/enterChild/goUp/历史下拉)统一写入 localStorage 当前环境记忆
  useEffect(() => {
    if (!rootDir || !workspaceCwd) return;
    if (!isUnderRoot(workspaceCwd, rootDir)) return; // 跨环境过渡态不写
    saveCwdMemory(rootDir, workspaceCwd);
  }, [workspaceCwd, rootDir]);

  useEffect(() => {
    if (!rootDir) return;
    saveCwdHistoryMemory(rootDir, workspaceCwdHistory);
  }, [workspaceCwdHistory, rootDir]);

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
    if (!rootDir) return; // rootDir 未加载完，不做决策
    // 当前 cwd 在 rootDir 下 → 沿用;否则取 localStorage 记忆,失效则兜底 rootDir
    if (workspaceCwd && isUnderRoot(workspaceCwd, rootDir)) {
      setError('');
      setInput(workspaceCwd);
      load(workspaceCwd);
      return;
    }
    const memory = loadCwdMemory(rootDir);
    const next = resolveCwdForRoot(workspaceCwd || '', rootDir, memory);
    setError('');
    setWorkspaceCwd(next);
    // setWorkspaceCwd 触发 state 变化,会再次进入本 useEffect 走 isUnderRoot 分支
  }, [workspaceCwd, rootDir]);

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

  const fmtTime = (t: number) => new Date(t * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtSize = (s: number) => s < 1024 ? `${s} B` : s < 1024 * 1024 ? `${(s / 1024).toFixed(1)} KB` : `${(s / 1024 / 1024).toFixed(1)} MB`;

  const upDisabled = !workspaceCwd || !parentDir(workspaceCwd) || parentDir(workspaceCwd) === workspaceCwd;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inputStyle} placeholder={rootDir ? `工作目录(必须在 ${rootDir} 下)` : '工作目录'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && switchDir()} />
        <button onClick={switchDir} style={{ padding: '6px 14px', borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>切换</button>
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
      </div>
      {workspaceCwd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <button onClick={goUp} disabled={upDisabled} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: upDisabled ? 'not-allowed' : 'pointer', opacity: upDisabled ? 0.5 : 1 }}>↑ 上级</button>
          <span style={{ wordBreak: 'break-all' }}>{workspaceCwd}</span>
        </div>
      )}
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
              style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, cursor: 'pointer' }}
            >
              <span style={{ color: f.is_dir ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{f.is_dir ? '📁 ' : '📄 '}{f.name}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{fmtTime(f.mtime)} · {f.is_dir ? '-' : fmtSize(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilesPanel;
