import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SettingsModal from './SettingsModal';
import { dbApi } from '../services/dbApi';
import { getMcpSettings } from '../services/agentRuntimeApi';

vi.mock('../services/dbApi');
vi.mock('../services/agentRuntimeApi', async () => {
  const actual = await vi.importActual<typeof import('../services/agentRuntimeApi')>('../services/agentRuntimeApi');
  return {
    ...actual,
    getMcpSettings: vi.fn(),
    saveMcpSettings: vi.fn(),
    diagnoseMcpSettings: vi.fn(),
  };
});

const mockedFetchRootDir = vi.mocked(dbApi.fetchRootDir);
const mockedGetMcpSettings = vi.mocked(getMcpSettings);

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
});
