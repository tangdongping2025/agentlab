import type { Session } from '../types/index';
import { dbApi } from './dbApi';

const OLD_KEY = 'context-lab.sessions';
const MIGRATED_FLAG = 'context-lab.migrated';

export async function backendReachable(): Promise<boolean> {
  try {
    await dbApi.health();
    return true;
  } catch {
    return false;
  }
}

export async function migrateIfPending(onDone?: () => void): Promise<void> {
  if (localStorage.getItem(MIGRATED_FLAG)) return;
  const raw = localStorage.getItem(OLD_KEY);
  if (!raw) { localStorage.setItem(MIGRATED_FLAG, '1'); return; }

  if (!(await backendReachable())) return; // 后端没起，跳过，下次再试

  let sessions: Session[] = [];
  try { sessions = JSON.parse(raw); } catch { sessions = []; }
  if (sessions.length === 0) {
    localStorage.setItem(MIGRATED_FLAG, '1');
    localStorage.removeItem(OLD_KEY);
    return;
  }

  const ok = window.confirm(`检测到 ${sessions.length} 条本地会话，是否迁移到数据库？`);
  if (!ok) { localStorage.setItem(MIGRATED_FLAG, '1'); return; }

  try {
    await dbApi.migrate(sessions);
    localStorage.removeItem(OLD_KEY);
    localStorage.setItem(MIGRATED_FLAG, '1');
    onDone?.();
  } catch (e) {
    console.error('migration failed:', e);
    window.alert('迁移失败，稍后重试。');
  }
}
