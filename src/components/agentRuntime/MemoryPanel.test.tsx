import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MemoryPanel from './MemoryPanel';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('MemoryPanel segment editing', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/settings/memory-preview')) {
        return jsonResponse({
          segments: [
            { key: 'global', name: '全局系统提示词', enabled: true, chars: 10, source: 'global_prompt_settings', preview: '旧全局' },
            { key: 'task', name: '任务段', enabled: true, chars: 20, source: '默认', preview: '旧任务' },
          ],
          totalChars: 30,
          tools: { system: [], mcp: [] },
          habits: [],
          knowledge: [],
          globalPrompt: { enabled: false, chars: 0 },
        });
      }
      if (url === '/api/settings/global-prompt' && init?.method === 'POST') return jsonResponse({ enabled: true, prompt: '新全局', agents: [] });
      if (url === '/api/settings/global-prompt') return jsonResponse({ enabled: true, prompt: '旧全局全文', agents: [] });
      if (url === '/api/settings/task-system' && init?.method === 'POST') return jsonResponse({ enabled: true, content: '新任务', defaultPreview: '默认', agents: [] });
      if (url === '/api/settings/task-system') return jsonResponse({ enabled: true, content: '旧任务全文', defaultPreview: '默认', agents: [] });
      return jsonResponse({});
    });
  });

  it('edits global segment inline and saves', async () => {
    render(<MemoryPanel cwd="/workspace" />);
    const editBtns = await screen.findAllByText('编辑');
    fireEvent.click(editBtns[0]);
    const textarea = await screen.findByDisplayValue('旧全局全文');
    fireEvent.change(textarea, { target: { value: '新全局' } });
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(c => String(c[0]) === '/api/settings/global-prompt' && (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({ enabled: true, prompt: '新全局' });
    });
  });

  it('edits task segment and resets to default (enabled=false, content kept)', async () => {
    render(<MemoryPanel cwd="/workspace" />);
    const editBtns = await screen.findAllByText('编辑');
    fireEvent.click(editBtns[1]);
    await screen.findByDisplayValue('旧任务全文');
    fireEvent.click(screen.getByText('恢复默认(关启用,保留内容)'));
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(c => String(c[0]) === '/api/settings/task-system' && (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({ enabled: false, content: '旧任务全文' });
    });
  });
});
