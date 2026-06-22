import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { getMemoryPreview, type MemoryPreviewResponse, type MemorySegment } from '../../services/agentRuntimeApi';
import { dbApi } from '../../services/dbApi';

const cardStyle: React.CSSProperties = {
  border: '1px solid #D6CFC4',
  borderRadius: 14,
  background: '#FFFDF9',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1A1A1A',
  borderBottom: '1px solid #D6CFC4',
  paddingBottom: 6,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
};

const emptyStyle: React.CSSProperties = {
  color: '#8A8177',
  fontSize: 13,
  padding: '4px 2px',
  lineHeight: 1.7,
};

const noteStyle: React.CSSProperties = { color: '#8A8177', fontSize: 11, lineHeight: 1.5 };

const previewStyle: React.CSSProperties = {
  margin: 0,
  padding: 10,
  maxHeight: 150,
  overflow: 'auto',
  borderRadius: 10,
  background: '#F5F1EB',
  color: '#1A1A1A',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  lineHeight: 1.55,
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 999,
  background: '#F5F1EB',
  border: '1px solid #D6CFC4',
  color: '#1A1A1A',
};

const chipMcpStyle: React.CSSProperties = {
  ...chipStyle,
  background: '#EFF6FF',
  borderColor: '#93C5FD',
  color: '#1D4ED8',
};

function badgeStyle(on: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 999,
    marginLeft: 6,
    verticalAlign: 'middle',
    background: on ? '#DCFCE7' : '#F5F1EB',
    color: on ? '#15803D' : '#8A8177',
  };
}

function SegmentCard({ seg, total }: { seg: MemorySegment; total: number }) {
  const pct = total > 0 ? Math.round((seg.chars / total) * 100) : 0;
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {seg.name}
          <span style={badgeStyle(seg.enabled)}>{seg.enabled ? '启用' : '空'}</span>
        </span>
        <span style={{ color: '#8A8177', fontSize: 11, whiteSpace: 'nowrap' }}>{seg.chars} 字符 · {pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: '#ECE7DE', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: seg.chars > 0 ? '#2563EB' : '#D6CFC4' }} />
      </div>
      {seg.preview && <pre style={previewStyle}>{seg.preview}</pre>}
      <div style={noteStyle}>{seg.source}</div>
    </div>
  );
}

const MemoryPanel: React.FC<{ cwd: string | null }> = ({ cwd }) => {
  const [data, setData] = React.useState<MemoryPreviewResponse | null>(null);
  const [error, setError] = React.useState('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const workspaceMessages = useAgentRuntimeStore(s => s.workspaceMessages);
  const oldest = useAgentRuntimeStore(s => s.workspaceOldestSeq);
  const newest = useAgentRuntimeStore(s => s.workspaceNewestSeq);
  const hasMoreAfter = useAgentRuntimeStore(s => s.workspaceHasMoreAfter);

  React.useEffect(() => {
    let cancelled = false;
    setError('');
    getMemoryPreview(cwd)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('记忆透视台加载失败'); });
    return () => { cancelled = true; };
  }, [cwd]);

  const latestUser = React.useMemo(() => {
    for (let i = workspaceMessages.length - 1; i >= 0; i--) {
      if (workspaceMessages[i].role === 'user') return workspaceMessages[i];
    }
    return null;
  }, [workspaceMessages]);

  const toggleHabit = async (id: string, enabled: boolean) => {
    if (!data) return;
    setSavingId(id);
    try {
      await dbApi.updateInsight(id, { enabledForPrompt: !enabled });
      setData({ ...data, habits: data.habits.map(h => h.id === id ? { ...h, enabledForPrompt: !enabled } : h) });
      setError('');
    } catch {
      setError('习惯开关保存失败');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#F5F1EB', minWidth: 0 }}>
      <div style={{ marginBottom: 12, color: '#4A4A4A', fontSize: 13, lineHeight: 1.65 }}>
        把龙虾 Agent 脑子里装了什么摊开给你看:实际拼进 system prompt 的分段 + 独立工具 + 会话历史 + 存而未用的记忆。
      </div>
      {error && <div style={{ marginBottom: 12, color: '#B91C1C', fontSize: 13 }}>{error}</div>}
      {!data && !error && <div style={{ color: '#8A8177', fontSize: 13 }}>加载中...</div>}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <section>
            <div style={sectionTitleStyle}>
              <span>system prompt 拼装解剖</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>总计 {data.totalChars} 字符 · 全局→任务→技能→习惯→MCP</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.segments.map(seg => <SegmentCard key={seg.key} seg={seg} total={data.totalChars} />)}
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>工具清单</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>独立 tools 参数 · 占 context window · 不在 system 文本</span>
            </div>
            <div style={{ ...cardStyle, marginTop: 8 }}>
              <div style={noteStyle}>系统工具(_ALLOWED_TOOLS,{data.tools.system.length} 个)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.tools.system.map(t => <span key={t} style={chipStyle}>{t}</span>)}
              </div>
              {data.tools.mcp.length > 0 && (
                <React.Fragment>
                  <div style={{ ...noteStyle, marginTop: 10 }}>MCP 工具(amap 启用时)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.tools.mcp.map(t => <span key={t} style={chipMcpStyle}>{t}</span>)}
                  </div>
                </React.Fragment>
              )}
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>会话历史 · 窗口加载</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>绑定当前工作区会话</span>
            </div>
            <div style={{ ...cardStyle, borderLeft: '3px solid #2563EB', marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>当前任务 · 用户最新请求</span>
                <span style={{ color: '#8A8177', fontSize: 11 }}>messages[-1]</span>
              </div>
              <pre style={previewStyle}>{latestUser ? latestUser.content : '(当前窗口暂无用户消息)'}</pre>
              <div style={noteStyle}>用户这次要 agent 做什么。与任务段(系统级指令:agent 怎么做事)配对——两者一起决定 agent 本轮行为。</div>
            </div>
            <div style={{ ...cardStyle, marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>历史窗口 · 其余来回</span>
                <span style={{ color: '#8A8177', fontSize: 11 }}>workspaceMessages</span>
              </div>
              <pre style={previewStyle}>{`已加载窗口:${workspaceMessages.length} 条消息(seq ${oldest ?? '-'} → ${newest ?? '-'})
更早消息:${hasMoreAfter ? '有更多' : '无更多'}
压缩状态:运行时触发(RQ-076),不删不改 MySQL 原始消息`}</pre>
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>习惯偏好 · 可写</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>可开关 enabled_for_prompt</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.habits.length === 0 && <div style={emptyStyle}>暂无已采纳的习惯偏好。在历史页洞察模块 accept 后,可在此开关是否注入 system prompt。</div>}
              {data.habits.map(h => (
                <div key={h.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{h.title}</strong>
                      <div style={{ color: '#4A4A4A', fontSize: 13 }}>{h.description}</div>
                    </div>
                    <button
                      type="button"
                      disabled={savingId === h.id}
                      onClick={() => toggleHabit(h.id, h.enabledForPrompt)}
                      style={{
                        border: '1px solid #2563EB',
                        borderRadius: 999,
                        background: h.enabledForPrompt ? '#2563EB' : '#FFFDF9',
                        color: h.enabledForPrompt ? '#fff' : '#2563EB',
                        padding: '7px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {h.enabledForPrompt ? '已注入' : '未注入'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div style={sectionTitleStyle}>
              <span>知识沉淀 · 只读</span>
              <span style={{ color: '#8A8177', fontSize: 11, fontWeight: 400 }}>预留给 RAG · 当前不注入</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {data.knowledge.length === 0 && <div style={emptyStyle}>暂无知识沉淀。kind=knowledge 当前只存不用,等 RAG(RQ-10)接入再做检索注入。</div>}
              {data.knowledge.map(k => (
                <div key={k.id} style={cardStyle}>
                  <strong style={{ fontSize: 13 }}>{k.title}</strong>
                  <div style={{ color: '#4A4A4A', fontSize: 13 }}>{k.description}</div>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}
    </div>
  );
};

export default MemoryPanel;
