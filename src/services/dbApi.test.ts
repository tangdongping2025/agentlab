import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbApi } from './dbApi';

describe('dbApi', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('listSessions GETs /api/db/sessions', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 's1' }]), { status: 200 })
    );
    const result = await dbApi.listSessions();
    expect(mock).toHaveBeenCalledWith('/api/db/sessions', expect.objectContaining({ headers: expect.any(Object) }));
    expect(result).toEqual([{ id: 's1' }]);
  });

  it('createSession POSTs', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 's1' }), { status: 200 })
    );
    await dbApi.createSession({ name: 'x' });
    expect(mock).toHaveBeenCalledWith('/api/db/sessions', expect.objectContaining({ method: 'POST' }));
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    await expect(dbApi.listSessions()).rejects.toThrow();
  });

  it('deleteAllSessions tolerates 204', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const r = await dbApi.deleteAllSessions();
    expect(r).toBeNull();
    expect(mock).toHaveBeenCalledWith('/api/db/sessions', expect.objectContaining({ method: 'DELETE' }));
  });

  it('querySessions passes agent param in query string', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, size: 20 }), { status: 200 })
    );
    await dbApi.querySessions({ agent: 'claude-sdk' });
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('agent=claude-sdk'),
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('fetchWorkspaceSettings GETs workspace settings endpoint', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ environment: 'windows', rootDir: 'C:/repo', cwd: 'C:/repo', cwdHistory: ['C:/repo'] }), { status: 200 })
    );

    const result = await dbApi.fetchWorkspaceSettings();

    expect(mock).toHaveBeenCalledWith('/api/db/files/workspace-settings', expect.objectContaining({ headers: expect.any(Object) }));
    expect(result.cwd).toBe('C:/repo');
  });

  it('saveWorkspaceSettings PUTs current cwd and history', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ environment: 'container', rootDir: '/workspace', cwd: '/workspace/repo', cwdHistory: ['/workspace/repo'] }), { status: 200 })
    );

    await dbApi.saveWorkspaceSettings({ cwd: '/workspace/repo', cwdHistory: ['/workspace/repo'] });

    expect(mock).toHaveBeenCalledWith('/api/db/files/workspace-settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ cwd: '/workspace/repo', cwdHistory: ['/workspace/repo'] }),
    }));
  });

  it('exportDocx POSTs markdown and cwd to export endpoint', async () => {
    const mock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        mdPath: '/repo/exports/assistant-card.md',
        docxPath: '/repo/exports/assistant-card.docx',
        downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fassistant-card.docx',
      }), { status: 200 })
    );

    const result = await dbApi.exportDocx({ cwd: '/repo', markdown: '# 标题' });

    expect(mock).toHaveBeenCalledWith('/api/db/files/export-docx', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', markdown: '# 标题' }),
    }));
    expect(result.docxPath).toBe('/repo/exports/assistant-card.docx');
  });
});
