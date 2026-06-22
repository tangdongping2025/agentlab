import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TabsWorkspace from './TabsWorkspace';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import * as api from '../../services/agentRuntimeApi';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/agentRuntimeApi');
vi.mock('../../services/dbApi', () => ({
  dbApi: {
    updateInsight: vi.fn(),
  },
}));

describe('TabsWorkspace Skill tab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(api.getSkillSettings).mockResolvedValue({
      skills: [{
        id: 'repo-skill',
        name: 'repo-skill',
        description: '仓库技能',
        source: '/workspace/.claude/skills/repo-skill/SKILL.md',
        sourceType: 'workspace',
        content: '# Repo Skill\n\n只能手动启用。',
        truncated: false,
        enabled: false,
        agentIds: [],
      }],
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', supportsSkill: true, unsupportedReason: '' }],
    });
    vi.mocked(api.saveSkillSettings).mockResolvedValue({
      skills: [{
        id: 'repo-skill',
        name: 'repo-skill',
        description: '仓库技能',
        source: '/workspace/.claude/skills/repo-skill/SKILL.md',
        sourceType: 'workspace',
        content: '# Repo Skill\n\n只能手动启用。',
        truncated: false,
        enabled: true,
        agentIds: ['claude-sdk'],
      }],
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', supportsSkill: true, unsupportedReason: '' }],
    });
    vi.mocked(api.getMcpSettings).mockResolvedValue({
      servers: [{
        id: 'amap-maps',
        name: '高德地图',
        enabled: true,
        agentIds: ['claude-sdk'],
        launchMode: 'auto',
        secretEnv: 'AMAP_MAPS_API_KEY',
        secretConfigured: true,
        supportedAgentIds: ['assistant', 'claude-sdk', 'research'],
        unsupportedReason: '',
      }],
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', supportsMcp: true, unsupportedReason: '' }],
    });
    vi.mocked(api.diagnoseMcpSettings).mockResolvedValue({
      servers: [{
        id: 'amap-maps',
        enabled: true,
        agentIds: ['claude-sdk'],
        launchMode: 'auto',
        secretEnv: 'AMAP_MAPS_API_KEY',
        secretConfigured: true,
        platform: 'linux',
        nodeAvailable: true,
        npmAvailable: true,
        npxAvailable: true,
        bundledEntry: '/opt/mcp/node_modules/@amap/amap-maps-mcp-server/build/index.js',
        bundledEntryExists: false,
        selectedCommand: 'npx',
        selectedArgs: ['-y', '@amap/amap-maps-mcp-server'],
        error: '',
      }],
    });
    vi.mocked(api.getMemoryPreview).mockResolvedValue({
      segments: [
        { key: 'global', name: '全局系统提示词', enabled: true, chars: 100, source: 'global_prompt_settings', preview: '全局规则预览...' },
        { key: 'task', name: '任务段', enabled: true, chars: 75, source: 'task.system 或默认', preview: '你是一个运行在 context-lab 沙箱目录里的 coding 助手...' },
        { key: 'skill', name: '技能', enabled: false, chars: 0, source: 'build_skill_prompt_for_agent', preview: '' },
        { key: 'habit', name: '习惯偏好', enabled: false, chars: 0, source: 'build_habit_prompt_for_agent', preview: '' },
        { key: 'mcp', name: 'MCP 提示', enabled: false, chars: 0, source: 'claude_sdk_agent.py', preview: '' },
      ],
      totalChars: 175,
      tools: { system: ['Read', 'Glob', 'Grep', 'Bash', 'Edit', 'WebSearch'], mcp: [] },
      habits: [],
      knowledge: [],
      globalPrompt: { enabled: true, chars: 100 },
    });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'tabs', tabs: ['对话', '文件', 'Skill', 'MCP', '记忆'] }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceCwd: '/workspace/project',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
    });
  });

  it('loads workspace skills with cwd and can enable one for lobster agent', async () => {
    render(<TabsWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Skill' }));

    expect(await screen.findByText('repo-skill')).toBeInTheDocument();
    expect(api.getSkillSettings).toHaveBeenCalledWith('/workspace/project');
    expect(screen.getByText('工作目录 Skill（1）')).toBeInTheDocument();
    expect(screen.getByText(/暂无平台 Skill/)).toBeInTheDocument();
    expect(screen.getByText(/# Repo Skill/)).toBeInTheDocument();
    expect(screen.getByText('/workspace/.claude/skills/repo-skill/SKILL.md')).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(screen.getByText(/# Repo Skill/)).toHaveStyle({ overflowWrap: 'anywhere' });

    fireEvent.click(screen.getByRole('button', { name: '启用给龙虾' }));

    await waitFor(() => {
      expect(api.saveSkillSettings).toHaveBeenCalledWith({
        skills: { 'repo-skill': { enabled: true, agentIds: ['claude-sdk'] } },
      }, '/workspace/project');
    });
  });

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

  it('keeps the tab bar usable on narrow screens', () => {
    const { container } = render(<TabsWorkspace />);

    const tabBar = container.querySelector('[data-testid="agent-runtime-tabbar"]') as HTMLElement;
    expect(tabBar).toHaveStyle({ overflowX: 'auto' });
    expect(tabBar).toHaveStyle({ minWidth: '0' });
    expect(tabBar).toHaveClass('mobile-compact-hidden');
    expect(screen.getByRole('button', { name: 'MCP' })).toHaveStyle({ flexShrink: '0' });
  });

  it('loads mcp settings and diagnostics for lobster agent', async () => {
    render(<TabsWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'MCP' }));

    expect(await screen.findByText('高德地图')).toBeInTheDocument();
    expect(api.getMcpSettings).toHaveBeenCalled();
    expect(api.diagnoseMcpSettings).toHaveBeenCalled();
    expect(screen.getByText('已分配给龙虾')).toBeInTheDocument();
    expect(screen.getByText('Secret 已配置')).toBeInTheDocument();
    expect(screen.getByText('launchMode: auto')).toBeInTheDocument();
    expect(screen.getByText('selectedCommand: npx')).toBeInTheDocument();
    expect(screen.getByText(/selectedArgs:/)).toHaveStyle({ overflowWrap: 'anywhere' });

    fireEvent.click(screen.getByRole('button', { name: '刷新诊断' }));

    await waitFor(() => {
      expect(api.diagnoseMcpSettings).toHaveBeenCalledTimes(2);
    });
  });

  it('renders memory panel when clicking 记忆 tab', async () => {
    render(<TabsWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '记忆' }));

    expect(await screen.findByText('system prompt 拼装解剖')).toBeInTheDocument();
    expect(screen.getByText('全局系统提示词')).toBeInTheDocument();
    expect(screen.getByText(/全局规则预览/)).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(api.getMemoryPreview).toHaveBeenCalledWith('/workspace/project');
  });

  it('toggles habit enabled_for_prompt when clicking the habit button', async () => {
    vi.mocked(api.getMemoryPreview).mockResolvedValue({
      segments: [
        { key: 'global', name: '全局系统提示词', enabled: true, chars: 100, source: 'global_prompt_settings', preview: '预览' },
        { key: 'task', name: '任务段', enabled: true, chars: 75, source: '默认', preview: '' },
        { key: 'skill', name: '技能', enabled: false, chars: 0, source: 'skill', preview: '' },
        { key: 'habit', name: '习惯偏好', enabled: false, chars: 0, source: 'habit', preview: '' },
        { key: 'mcp', name: 'MCP 提示', enabled: false, chars: 0, source: 'mcp', preview: '' },
      ],
      totalChars: 175,
      tools: { system: ['Read'], mcp: [] },
      habits: [
        { id: 'h1', kind: 'habit', title: '偏好X', description: '测试习惯', sourceSessionIds: [], status: 'accepted', enabledForPrompt: false, createdAt: null, updatedAt: null },
      ],
      knowledge: [],
      globalPrompt: { enabled: true, chars: 100 },
    });
    vi.mocked(dbApi.updateInsight).mockResolvedValue({} as any);

    render(<TabsWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: '记忆' }));

    const toggleBtn = await screen.findByRole('button', { name: '未注入' });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(dbApi.updateInsight).toHaveBeenCalledWith('h1', { enabledForPrompt: true });
      expect(screen.getByRole('button', { name: '已注入' })).toBeInTheDocument();
    });
  });
});
