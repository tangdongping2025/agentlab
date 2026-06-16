import React, { useState, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { dbApi } from '../../services/dbApi';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-primary)', flex: 1,
};

const FilesPanel: React.FC = () => {
  const { workspaceCwd, setWorkspaceCwd } = useAgentRuntimeStore();
  const [input, setInput] = useState(workspaceCwd || '');
  const [files, setFiles] = useState<Array<{ name: string; mtime: number; size: number; is_dir: boolean }>>([]);
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

  useEffect(() => { if (workspaceCwd) load(workspaceCwd); }, []);

  const switchDir = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!window.confirm(`将切换工作目录到:\n${trimmed}\n\nagent 的 Read/Edit/Bash 都将在此目录操作,确认?`)) return;
    setWorkspaceCwd(trimmed);
    load(trimmed);
  };

  const fmtTime = (t: number) => new Date(t * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtSize = (s: number) => s < 1024 ? `${s} B` : s < 1024 * 1024 ? `${(s / 1024).toFixed(1)} KB` : `${(s / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inputStyle} placeholder="工作目录(必须在根目录 D:\我的个人区间\Projects 下)" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && switchDir()} />
        <button onClick={switchDir} style={{ padding: '6px 14px', borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>切换</button>
      </div>
      {error && <div style={{ color: 'var(--accent-violet)', fontSize: 12 }}>{error}</div>}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        {loading && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>加载中…</div>}
        {!loading && files.length === 0 && !error && <div style={{ padding: 16, color: 'var(--text-tertiary)' }}>空目录(先切换到有效工作目录)</div>}
        {files.map(f => (
          <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
            <span style={{ color: f.is_dir ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{f.is_dir ? '📁 ' : '📄 '}{f.name}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{fmtTime(f.mtime)} · {f.is_dir ? '-' : fmtSize(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilesPanel;
