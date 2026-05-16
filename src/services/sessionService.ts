import type { Session } from '../types/index';

const STORAGE_KEY = 'context-lab.sessions';

export class SessionService {
  getAll(): Session[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const sessions: Session[] = JSON.parse(raw);
      return sessions.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  getById(id: string): Session | null {
    return this.getAll().find(s => s.id === id) || null;
  }

  save(session: Session): void {
    const sessions = this.getAll().filter(s => s.id !== session.id);
    sessions.unshift(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  delete(id: string): void {
    const sessions = this.getAll().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  create(partial: Omit<Session, 'id' | 'messages' | 'createdAt' | 'updatedAt'>): Session {
    const now = new Date().toISOString();
    const session: Session = {
      ...partial,
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.save(session);
    return session;
  }

  update(id: string, partial: Partial<Session>): Session | null {
    const session = this.getById(id);
    if (!session) return null;
    const updated = { ...session, ...partial, updatedAt: new Date().toISOString() };
    this.save(updated);
    return updated;
  }
}

export const sessionService = new SessionService();
