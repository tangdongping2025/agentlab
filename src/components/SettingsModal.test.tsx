import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SettingsModal from './SettingsModal';

const fetchMock = vi.fn();
let skillSettingsResponse: unknown;
let globalPromptResponse: unknown;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('SettingsModal tabs', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    skillSettingsResponse = {
      skills: [],
      agents: [
        { id: 'echo', name: 'Echo', supportsSkill: false, unsupportedReason: '非 LLM 推理型智能体暂不支持 skill 注入' },
        { id: 'assistant', name: '项目助手', supportsSkill: true, unsupportedReason: '' },
        { id: 'research', name: '研究助手', supportsSkill: true, unsupportedReason: '' },
        { id: 'claude-sdk', name: 'Claude SDK Agent', supportsSkill: true, unsupportedReason: '' },
      ],
    };
    globalPromptResponse = {
      enabled: false,
      prompt: '',
      agents: [
        { id: 'echo', name: 'Echo', supportsGlobalPrompt: false, unsupportedReason: '非 LLM 推理型智能体暂不支持全局提示词注入' },
        { id: 'assistant', name: '项目助手', supportsGlobalPrompt: true, unsupportedReason: '' },
        { id: 'research', name: '研究助手', supportsGlobalPrompt: true, unsupportedReason: '' },
        { id: 'claude-sdk', name: 'Claude SDK Agent', supportsGlobalPrompt: true, unsupportedReason: '' },
      ],
    };
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/db/files/root' || url === '/api/db/root-dir') return jsonResponse({ root_dir: '/workspace' });
      if (url === '/api/settings/mcp') return jsonResponse({
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
      if (url === '/api/settings/skills') return jsonResponse(skillSettingsResponse);
      if (url === '/api/settings/global-prompt') return jsonResponse(globalPromptResponse);
      if (url === '/api/settings/agent-models' && init?.method === 'POST') {
        return jsonResponse({
          encryptionConfigured: true,
          agents: [
            { id: 'assistant', name: '项目助手', supportsModelConfig: true, baseUrl: 'https://example.com/api', model: 'demo', apiKeyConfigured: true, unsupportedReason: '' },
            { id: 'echo', name: 'Echo', supportsModelConfig: false, baseUrl: '', model: '', apiKeyConfigured: false, unsupportedReason: '非 LLM 推理型智能体暂不支持模型配置' },
          ],
        });
      }
      if (url === '/api/settings/agent-models') return jsonResponse({
        encryptionConfigured: true,
        agents: [
          { id: 'assistant', name: '项目助手', supportsModelConfig: true, baseUrl: '', model: '', apiKeyConfigured: true, unsupportedReason: '' },
          { id: 'echo', name: 'Echo', supportsModelConfig: false, baseUrl: '', model: '', apiKeyConfigured: false, unsupportedReason: '非 LLM 推理型智能体暂不支持模型配置' },
        ],
      });
      return jsonResponse({});
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
    skillSettingsResponse = {
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
    };

    render(<SettingsModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByText('Skill'));

    expect(await screen.findByText('brainstorming')).toBeInTheDocument();
    expect(screen.getByText('帮助澄清需求')).toBeInTheDocument();
    expect(screen.getByText('项目助手 (assistant)')).toBeInTheDocument();
    expect(screen.getByText('研究助手 (research)')).toBeInTheDocument();
    expect(screen.getByText('Claude SDK Agent (claude-sdk)')).toBeInTheDocument();
    expect(screen.getByText('Echo')).toBeInTheDocument();
  });

  it('shows global prompt tab with supported agents', async () => {
    globalPromptResponse = {
      enabled: true,
      prompt: '所有智能体都要先说明假设',
      agents: [
        { id: 'echo', name: 'Echo', supportsGlobalPrompt: false, unsupportedReason: '非 LLM 推理型智能体暂不支持全局提示词注入' },
        { id: 'assistant', name: '项目助手', supportsGlobalPrompt: true, unsupportedReason: '' },
        { id: 'research', name: '研究助手', supportsGlobalPrompt: true, unsupportedReason: '' },
        { id: 'claude-sdk', name: 'Claude SDK Agent', supportsGlobalPrompt: true, unsupportedReason: '' },
      ],
    };

    render(<SettingsModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByText('全局提示词'));

    expect(await screen.findByDisplayValue('所有智能体都要先说明假设')).toBeInTheDocument();
    expect(screen.getByText('关联支持全局提示词的智能体')).toBeInTheDocument();
    expect(screen.getByText('项目助手 (assistant)')).toBeInTheDocument();
    expect(screen.getByText('研究助手 (research)')).toBeInTheDocument();
    expect(screen.getByText('Claude SDK Agent (claude-sdk)')).toBeInTheDocument();
    expect(screen.getByText('Echo')).toBeInTheDocument();
  });

  it('saves model config without rendering the api key back', async () => {
    render(<SettingsModal isOpen onClose={() => {}} />);

    fireEvent.click(await screen.findByText('模型配置'));
    expect(await screen.findByText('项目助手')).toBeInTheDocument();
    expect(screen.getByText('已配置')).toBeInTheDocument();
    expect(screen.getByText('非 LLM 推理型智能体暂不支持模型配置')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('留空回退后端默认 Base URL'), { target: { value: 'https://example.com/api' } });
    fireEvent.change(screen.getByPlaceholderText('留空回退后端默认模型'), { target: { value: 'demo' } });
    fireEvent.change(screen.getByPlaceholderText('留空表示不修改已保存 key'), { target: { value: 'secret-key' } });
    fireEvent.click(screen.getByText('保存模型配置'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/settings/agent-models', expect.objectContaining({ method: 'POST' })));
    expect(screen.queryByDisplayValue('secret-key')).not.toBeInTheDocument();
  });
});
