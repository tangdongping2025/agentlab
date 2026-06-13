import { describe, it, expect, vi } from 'vitest';
import { sessionService } from './sessionService';
import { dbApi } from './dbApi';

describe('sessionService', () => {
  it('getAll delegates to dbApi.listSessions', async () => {
    const spy = vi.spyOn(dbApi, 'listSessions').mockResolvedValue([{ id: 's1' } as any]);
    const r = await sessionService.getAll();
    expect(r).toEqual([{ id: 's1' }]);
    expect(spy).toHaveBeenCalled();
  });

  it('getById returns null on error', async () => {
    vi.spyOn(dbApi, 'getSession').mockRejectedValue(new Error('404'));
    const r = await sessionService.getById('nope');
    expect(r).toBeNull();
  });

  it('update returns null on error and logs', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(dbApi, 'updateSession').mockRejectedValue(new Error('500'));
    const r = await sessionService.update('x', { name: 'y' });
    expect(r).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('delete delegates to dbApi.deleteSession', async () => {
    const spy = vi.spyOn(dbApi, 'deleteSession').mockResolvedValue({ deleted: 'x' });
    await sessionService.delete('x');
    expect(spy).toHaveBeenCalledWith('x');
  });
});
