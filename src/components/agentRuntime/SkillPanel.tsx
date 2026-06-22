import React from 'react';
import { getSkillSettings, saveSkillSettings, type SkillSettingsResponse } from '../../services/agentRuntimeApi';

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

const buttonStyle: React.CSSProperties = {
  border: '1px solid #2563EB',
  borderRadius: 999,
  background: '#2563EB',
  color: '#fff',
  padding: '7px 12px',
  cursor: 'pointer',
  fontSize: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1A1A1A',
  borderBottom: '1px solid #D6CFC4',
  paddingBottom: 6,
};

const emptyStyle: React.CSSProperties = {
  color: '#8A8177',
  fontSize: 13,
  padding: '4px 2px',
};

const SkillPanel: React.FC<{ cwd: string | null }> = ({ cwd }) => {
  const [settings, setSettings] = React.useState<SkillSettingsResponse | null>(null);
  const [error, setError] = React.useState('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setError('');
    getSkillSettings(cwd)
      .then(data => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setError('Skill 加载失败');
      });
    return () => { cancelled = true; };
  }, [cwd]);

  const toggleSkill = async (skillId: string) => {
    if (!settings) return;
    const nextSkills = settings.skills.map(skill => {
      if (skill.id !== skillId) return skill;
      const enabledForLobster = skill.enabled && skill.agentIds.includes('claude-sdk');
      return {
        ...skill,
        enabled: !enabledForLobster,
        agentIds: enabledForLobster ? skill.agentIds.filter(id => id !== 'claude-sdk') : ['claude-sdk', ...skill.agentIds.filter(id => id !== 'claude-sdk')],
      };
    });
    setSavingId(skillId);
    try {
      const data = await saveSkillSettings({
        skills: Object.fromEntries(nextSkills.map(skill => [skill.id, {
          enabled: skill.enabled,
          agentIds: skill.agentIds,
        }]))
      }, cwd);
      setSettings(data);
      setError('');
    } catch {
      setError('Skill 保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const renderSkill = (skill: SkillSettingsResponse['skills'][number]) => {
    const enabledForLobster = skill.enabled && skill.agentIds.includes('claude-sdk');
    return (
      <div key={skill.id} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <strong style={{ color: '#1A1A1A' }}>{skill.name}</strong>
              {skill.truncated && <span style={{ color: '#B45309', fontSize: 11 }}>已截断</span>}
            </div>
            <div style={{ color: '#4A4A4A', fontSize: 13 }}>{skill.description || '无描述'}</div>
          </div>
          <button type="button" onClick={() => toggleSkill(skill.id)} disabled={savingId === skill.id} style={{ ...buttonStyle, opacity: savingId === skill.id ? 0.6 : 1 }}>
            {enabledForLobster ? '取消启用' : '启用给龙虾'}
          </button>
        </div>
        <div style={{ color: '#8A8177', fontSize: 11, wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{skill.source}</div>
        <pre style={{ margin: 0, padding: 10, maxHeight: 160, overflow: 'auto', borderRadius: 10, background: '#F5F1EB', color: '#1A1A1A', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{skill.content}</pre>
      </div>
    );
  };

  const platformSkills = settings?.skills.filter(s => s.sourceType !== 'workspace') ?? [];
  const workspaceSkills = settings?.skills.filter(s => s.sourceType === 'workspace') ?? [];

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#F5F1EB', minWidth: 0 }}>
      <div style={{ marginBottom: 12, color: '#4A4A4A', fontSize: 13 }}>
        这里展示龙虾 Agent 可用的 Skill。工作目录 Skill 只会在你手动启用后注入给龙虾。
      </div>
      {error && <div style={{ marginBottom: 12, color: '#B91C1C', fontSize: 13 }}>{error}</div>}
      {!settings && !error && <div style={{ color: '#8A8177', fontSize: 13 }}>加载中...</div>}
      {settings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section>
            <div style={sectionTitleStyle}>平台 Skill（{platformSkills.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {platformSkills.map(renderSkill)}
              {platformSkills.length === 0 && <div style={emptyStyle}>暂无平台 Skill。可放入 backend/skills 或根 .claude/skills</div>}
            </div>
          </section>
          <section>
            <div style={sectionTitleStyle}>工作目录 Skill（{workspaceSkills.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {workspaceSkills.map(renderSkill)}
              {workspaceSkills.length === 0 && <div style={emptyStyle}>{cwd ? '暂无工作目录 Skill。可在当前工作目录创建 .claude/skills 或 skills 目录' : '未选择工作目录'}</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default SkillPanel;
