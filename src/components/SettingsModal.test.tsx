import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsModal from './SettingsModal';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('SettingsModal tabs', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/db/files/root' || url === '/api/db/root-dir') return jsonResponse({ root_dir: '/workspace' });
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

  it('hides MCP/Skill/globalPrompt tabs, keeps system and agentModels', async () => {
    render(<SettingsModal isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByText('MCP')).not.toBeInTheDocument());
    expect(screen.queryByText('Skill')).not.toBeInTheDocument();
    expect(screen.queryByText('全局提示词')).not.toBeInTheDocument();
    expect(screen.getByText('系统信息')).toBeInTheDocument();
    expect(screen.getByText('模型配置')).toBeInTheDocument();
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
