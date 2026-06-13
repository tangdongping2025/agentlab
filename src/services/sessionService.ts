import type { Session } from '../types/index';
import { dbApi } from './dbApi';

// create 需带 id（前端生成，保证乐观更新与 PUT 一致）
type SessionPartial = Omit<Session, 'messages' | 'createdAt' | 'updatedAt'>;

// sessionService 现在是 DB 的薄封装；store 负责乐观更新内存。
export class SessionService {
  async getAll(): Promise<Session[]> {
    return dbApi.listSessions();
  }
  async getById(id: string): Promise<Session | null> {
    try {
      return await dbApi.getSession(id);
    } catch {
      return null;
    }
  }
  async create(partial: SessionPartial): Promise<Session> {
    return dbApi.createSession(partial as Record<string, unknown>);
  }
  async update(id: string, partial: Partial<Session>): Promise<Session | null> {
    try {
      return await dbApi.updateSession(id, partial as Record<string, unknown>);
    } catch (e) {
      console.error('sessionService.update failed:', e);
      return null;
    }
  }
  async delete(id: string): Promise<void> {
    await dbApi.deleteSession(id);
  }
  async deleteAll(): Promise<void> {
    await dbApi.deleteAllSessions();
  }
}

export const sessionService = new SessionService();
