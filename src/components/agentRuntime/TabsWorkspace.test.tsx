import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TabsWorkspace from './TabsWorkspace';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import * as api from '../../services/agentRuntimeApi';

vi.mock('../../services/agentRuntimeApi');

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
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'tabs', tabs: ['对话', '文件', 'Skill', 'MCP'] }, capabilities: [] }],
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
    expect(screen.getByText('工作目录')).toBeInTheDocument();
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
});
