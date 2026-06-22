# Skill 面板按来源分区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 claude-sdk 工作台 Skill tab（SkillPanel）的平铺卡片改成按 `sourceType` 分"平台 / 工作目录"两个区块展示，每区带标题与计数，去掉卡片内冗余的来源标签。

**Architecture:** 纯前端展示层重组，只改 `SkillPanel.tsx`。数据源 `getSkillSettings(cwd)` 与 `toggleSkill` 启用/禁用逻辑不动；按 `skill.sourceType === 'workspace'` 分两组渲染。后端零改。

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library。

---

## File Structure

- Modify `src/components/agentRuntime/SkillPanel.tsx`：把 `settings.skills.map(...)` 平铺改为先按 `sourceType` 拆成 `platformSkills` / `workspaceSkills`，再各自包进带标题的 `<section>`；抽 `renderSkill` 复用单卡片；新增 `sectionTitleStyle` / `emptyStyle` 两个样式常量；删除卡片内"平台/工作目录"小标签 span、删除原"未发现 Skill"与"未选择工作目录"顶部提示（由分区空状态文案取代）。
- Modify `src/components/agentRuntime/TabsWorkspace.test.tsx`：更新现有 `loads workspace skills...` 用例里依赖卡片"工作目录"标签的断言；新增混合 platform + workspace 的分组用例。

---

### Task 1: SkillPanel 按 sourceType 分区

**Files:**
- Modify: `src/components/agentRuntime/TabsWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/SkillPanel.tsx`

- [ ] **Step 1: 更新现有失效断言 + 写新分组测试（RED）**

打开 `src/components/agentRuntime/TabsWorkspace.test.tsx`，定位现有用例 `it('loads workspace skills with cwd and can enable one for lobster agent', ...)` 中的这一行：

```tsx
    expect(screen.getByText('工作目录')).toBeInTheDocument();
```

替换为（断言分区标题 + 平台区空状态）：

```tsx
    expect(screen.getByText('工作目录 Skill（1）')).toBeInTheDocument();
    expect(screen.getByText(/暂无平台 Skill/)).toBeInTheDocument();
```

然后在 `it('loads workspace skills with cwd and can enable one for lobster agent', ...)` 整个用例结束的 `});` 之后，紧接 `describe('TabsWorkspace Skill tab', () => {` 内追加一个新用例：

```tsx
  it('groups mixed platform and workspace skills under separate sections', async () => {
    vi.mocked(api.getSkillSettings).mockResolvedValue({
      skills: [
        { id: 'plat-a', name: 'plat-a', description: '平台A', source: '/app/backend/skills/plat-a/SKILL.md', sourceType: 'platform', content: 'pa', truncated: false, enabled: false, agentIds: [] },
        { id: 'repo-skill', name: 'repo-skill', description: '仓库技能', source: '/workspace/.claude/skills/repo-skill/SKILL.md', sourceType: 'workspace', content: '# Repo Skill', truncated: false, enabled: false, agentIds: [] },
      ],
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', supportsSkill: true, unsupportedReason: '' }],
    });

    render(<TabsWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Skill' }));

    expect(await screen.findByText('平台 Skill（1）')).toBeInTheDocument();
    expect(screen.getByText('工作目录 Skill（1）')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 运行测试确认 RED**

运行：

```bash
npm run test:run -- src/components/agentRuntime/TabsWorkspace.test.tsx
```

预期：新用例 `groups mixed platform and workspace skills...` 失败（找不到 `平台 Skill（1）`），且现有 `loads workspace skills...` 用例失败（`工作目录 Skill（1）` 找不到，因为当前是平铺卡片 + 卡片内"工作目录"小标签）。

- [ ] **Step 3: 重写 SkillPanel.tsx 为分区渲染**

用以下完整内容替换 `src/components/agentRuntime/SkillPanel.tsx`：

```tsx
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
```

- [ ] **Step 4: 运行测试确认 GREEN**

运行：

```bash
npm run test:run -- src/components/agentRuntime/TabsWorkspace.test.tsx
```

预期：全部用例通过，包括新 `groups mixed platform and workspace skills...` 与更新后的 `loads workspace skills...`。

- [ ] **Step 5: 运行 typecheck**

运行：

```bash
npm run typecheck
```

预期：TypeScript 检查通过，无错误。

- [ ] **Step 6: 提交**

运行：

```bash
git add src/components/agentRuntime/SkillPanel.tsx src/components/agentRuntime/TabsWorkspace.test.tsx docs/superpowers/plans/2026-06-22-skill-panel-source-grouping.md
git commit -m "feat(runtime): Skill 面板按来源分区"
```

---

## Self-Review

- **Spec coverage**：spec 验收 1（混合分两组，平台→工作目录顺序）→ 新测试覆盖；2（标题显示数量）→ `工作目录 Skill（1）` / `平台 Skill（1）` 断言；3（空状态文案）→ `/暂无平台 Skill/` 断言 + 实现中三种空状态文案；4（启用按钮不变）→ 现有用例仍断言"启用给龙虾"按钮与 `saveSkillSettings` 调用；5（卡片无来源标签）→ 删除 span，现有用例不再断言卡片"工作目录"标签；6（测试覆盖分组与空状态）→ 新测试 + 更新断言。全覆盖。
- **Placeholder scan**：无 TBD/TODO/省略，所有代码完整。
- **Type consistency**：`renderSkill` 参数类型用 `SkillSettingsResponse['skills'][number]`（复用已 import 类型，无需新增 import）；`sourceType` 字段名与后端 `agentRuntimeApi.ts` 的 `SkillInfo.sourceType: 'platform' | 'workspace'` 一致；`getSkillSettings` / `saveSkillSettings` / `toggleSkill` 签名与现状一致。
