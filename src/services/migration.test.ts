import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateIfPending, backendReachable } from './migration';
import { dbApi } from './dbApi';

describe('migration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('backendReachable returns false when health throws', async () => {
    vi.spyOn(dbApi, 'health').mockRejectedValue(new Error('conn refused'));
    expect(await backendReachable()).toBe(false);
  });

  it('backendReachable returns true when health ok', async () => {
    vi.spyOn(dbApi, 'health').mockResolvedValue({ status: 'ok' });
    expect(await backendReachable()).toBe(true);
  });

  it('does nothing when no localStorage sessions', async () => {
    const onDone = vi.fn();
    vi.spyOn(dbApi, 'health').mockResolvedValue({ status: 'ok' });
    await migrateIfPending(onDone);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('skips when backend unreachable', async () => {
    localStorage.setItem('context-lab.sessions', JSON.stringify([{ id: 's1' }]));
    vi.spyOn(dbApi, 'health').mockRejectedValue(new Error('no backend'));
    const migrateSpy = vi.spyOn(dbApi, 'migrate');
    await migrateIfPending();
    expect(migrateSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('context-lab.sessions')).not.toBeNull(); // 未清
  });

  it('migrates and clears localStorage on confirm', async () => {
    localStorage.setItem('context-lab.sessions', JSON.stringify([{ id: 's1' }]));
    vi.spyOn(dbApi, 'health').mockResolvedValue({ status: 'ok' });
    vi.spyOn(dbApi, 'migrate').mockResolvedValue({ imported: 1, skipped: 0 });
    vi.stubGlobal('confirm', () => true);
    const onDone = vi.fn();
    await migrateIfPending(onDone);
    expect(localStorage.getItem('context-lab.sessions')).toBeNull();
    expect(localStorage.getItem('context-lab.migrated')).toBe('1');
    expect(onDone).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does not clear when user declines confirm', async () => {
    localStorage.setItem('context-lab.sessions', JSON.stringify([{ id: 's1' }]));
    vi.spyOn(dbApi, 'health').mockResolvedValue({ status: 'ok' });
    vi.stubGlobal('confirm', () => false);
    await migrateIfPending();
    expect(localStorage.getItem('context-lab.sessions')).not.toBeNull();
    expect(localStorage.getItem('context-lab.migrated')).toBe('1'); // 标记已处理，不再问
    vi.unstubAllGlobals();
  });

  it('does not re-migrate when flag already set', async () => {
    localStorage.setItem('context-lab.migrated', '1');
    localStorage.setItem('context-lab.sessions', JSON.stringify([{ id: 's1' }]));
    vi.spyOn(dbApi, 'health').mockResolvedValue({ status: 'ok' });
    const migrateSpy = vi.spyOn(dbApi, 'migrate');
    await migrateIfPending();
    expect(migrateSpy).not.toHaveBeenCalled();
  });
});
