import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SettingsModal from './SettingsModal';
import { dbApi } from '../services/dbApi';
import { getMcpSettings, getSkillSettings } from '../services/agentRuntimeApi';

vi.mock('../services/dbApi');
vi.mock('../services/agentRuntimeApi', async () => {
  const actual = await vi.importActual<typeof import('../services/agentRuntimeApi')>('../services/agentRuntimeApi');
  return {
    ...actual,
    getMcpSettings: vi.fn(),
    saveMcpSettings: vi.fn(),
    diagnoseMcpSettings: vi.fn(),
    getSkillSettings: vi.fn(),
    saveSkillSettings: vi.fn(),
  };
});

const mockedFetchRootDir = vi.mocked(dbApi.fetchRootDir);
const mockedGetMcpSettings = vi.mocked(getMcpSettings);
const mockedGetSkillSettings = vi.mocked(getSkillSettings);

describe('SettingsModal MCP tab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedFetchRootDir.mockResolvedValue({ root_dir: '/workspace' });
    mockedGetMcpSettings.mockResolvedValue({
      servers: [{
        id: 'amap-maps',
        name: '高德地图',
        enabled: true,
        agentIds: ['claude-sdk'],
        launchMode: 'auto',
        secretEnv: 'AMAP_MAPS_API_KEY',
        secretConfigured: true,
        supportedAgentIds: ['claude-sdk', 'assistant', 'research'],
        unsupportedReason: 'Echo 等非工具循环智能体暂不支持 MCP',
      }],
      agents: [
        { id: 'echo', name: 'Echo', supportsMcp: false, unsupportedReason: '非 LLM tool-use 智能体暂不支持 MCP' },
        { id: 'assistant', name: '项目助手', supportsMcp: true, unsupportedReason: '' },
        { id: 'research', name: '研究助手', supportsMcp: true, unsupportedReason: '' },
        { id: 'claude-sdk', name: 'Claude SDK Agent', supportsMcp: true, unsupportedReason: '' },
      ],
    });
    mockedGetSkillSettings.mockResolvedValue({
      skills: [],
      agents: [
        { id: 'echo', name: 'Echo', supportsSkill: false, unsupportedReason: '非 LLM 推理型智能体暂不支持 skill 注入' },
        { id: 'assistant', name: '项目助手', supportsSkill: true, unsupportedReason: '' },
        { id: 'research', name: '研究助手', supportsSkill: true, unsupportedReason: '' },
        { id: 'claude-sdk', name: 'Claude SDK Agent', supportsSkill: true, unsupportedReason: '' },
      ],
    });
  });

  it('shows assistant and research as MCP-supported agents', async () => {
    render(<SettingsModal isOpen onClose={() => {}} />);

    fireEvent.click(screen.getAllByText('MCP')[0]);
    const supportedSection = await screen.findByText('关联支持 MCP 的智能体');
    const supportedContainer = supportedSection.parentElement!;
    expect(within(supportedContainer).getByText('项目助手 (assistant)')).toBeInTheDocument();
    expect(within(supportedContainer).getByText('研究助手 (research)')).toBeInTheDocument();

    const unsupportedSection = screen.getByText('暂不支持 MCP 的智能体');
    const unsupportedContainer = unsupportedSection.parentElement!;
    expect(within(unsupportedContainer).queryByText('项目助手')).not.toBeInTheDocument();
    expect(within(unsupportedContainer).queryByText('研究助手')).not.toBeInTheDocument();
    expect(screen.queryByText(/当前仅 Claude SDK Agent 支持 MCP 注入/)).not.toBeInTheDocument();
  });

  it('shows Skill tab with supported agents', async () => {
    mockedGetSkillSettings.mockResolvedValue({
      skills: [{
        id: 'brainstorming',
        name: 'brainstorming',
        description: '帮助澄清需求',
        source: 'backend/skills/brainstorming/SKILL.md',
        truncated: false,
        enabled: false,
        agentIds: [],
      }],
      agents: [
        { id: 'echo', name: 'Echo', supportsSkill: false, unsupportedReason: '非 LLM 推理型智能体暂不支持 skill 注入' },
        { id: 'assistant', name: '项目助手', supportsSkill: true, unsupportedReason: '' },
        { id: 'research', name: '研究助手', supportsSkill: true, unsupportedReason: '' },
        { id: 'claude-sdk', name: 'Claude SDK Agent', supportsSkill: true, unsupportedReason: '' },
      ],
    });

    render(<SettingsModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByText('Skill'));

    expect(await screen.findByText('brainstorming')).toBeInTheDocument();
    expect(screen.getByText('帮助澄清需求')).toBeInTheDocument();
    expect(screen.getByText('项目助手 (assistant)')).toBeInTheDocument();
    expect(screen.getByText('研究助手 (research)')).toBeInTheDocument();
    expect(screen.getByText('Claude SDK Agent (claude-sdk)')).toBeInTheDocument();
    expect(screen.getByText('Echo')).toBeInTheDocument();
  });
});
