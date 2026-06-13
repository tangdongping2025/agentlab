import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock sessionService（appStore 依赖）
vi.mock('../services/sessionService', () => ({
  sessionService: {
    update: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(null),
  },
}));
// mock agentService（appStore 顶层 import，避免副作用）
vi.mock('./agentService', () => ({
  agentService: {
    clearHistory: vi.fn(),
    isAgentInitialized: () => false,
    initialize: vi.fn(),
    setApiRecordingMethods: vi.fn(),
    setTimelineCallbacks: vi.fn(),
  },
}));

import { useAppStore } from './appStore';
import { sessionService } from '../services/sessionService';

function seedSession(overrides: Partial<any> = {}) {
  return {
    id: 's1', name: '📈 投资助手', sceneId: 'restaurant',
    systemPrompt: '', selectedTools: [], contextStrategy: 'sliding',
    contextSize: 32768, messages: [], createdAt: '', updatedAt: '',
    ...overrides,
  };
}

describe('saveCurrentSession naming from first user message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames session to first user message on first save', () => {
    useAppStore.setState({
      currentSessionId: 's1',
      sessions: [seedSession()],
      conversationHistory: [{ role: 'user', content: '苹果公司的最新财报数据是多少', timestamp: new Date() } as any],
    });
    useAppStore.getState().saveCurrentSession();

    const updated = useAppStore.getState().sessions.find(s => s.id === 's1');
    expect(updated?.name).toBe('苹果公司的最新财报数据是多少');
    expect(sessionService.update).toHaveBeenCalledWith('s1', expect.objectContaining({ name: '苹果公司的最新财报数据是多少' }));
  });

  it('truncates long first message and appends ellipsis', () => {
    const long = '这是一段非常非常非常非常非常非常非常非常非常非常非常非常长的用户消息内容需要被截断掉';
    useAppStore.setState({
      currentSessionId: 's1',
      sessions: [seedSession()],
      conversationHistory: [{ role: 'user', content: long, timestamp: new Date() } as any],
    });
    useAppStore.getState().saveCurrentSession();

    const updated = useAppStore.getState().sessions.find(s => s.id === 's1');
    expect(updated?.name?.endsWith('…')).toBe(true);
    expect((updated?.name?.length || 0) <= 31).toBe(true); // 30 字 + …
  });

  it('does not rename when session already has messages', () => {
    useAppStore.setState({
      currentSessionId: 's1',
      sessions: [seedSession({ name: '已命名会话', messages: [{ role: 'user', content: 'old', timestamp: '' } as any] })],
      conversationHistory: [{ role: 'user', content: '新消息内容', timestamp: new Date() } as any],
    });
    useAppStore.getState().saveCurrentSession();

    const updated = useAppStore.getState().sessions.find(s => s.id === 's1');
    expect(updated?.name).toBe('已命名会话');
    // update 不应带 name（或 name 为 undefined）
    const callArg = (sessionService.update as any).mock.calls[0][1];
    expect(callArg.name).toBeUndefined();
  });

  it('does not rename when first user message is blank/file-only', () => {
    useAppStore.setState({
      currentSessionId: 's1',
      sessions: [seedSession()],
      conversationHistory: [{ role: 'user', content: '   ', timestamp: new Date() } as any],
    });
    useAppStore.getState().saveCurrentSession();

    const updated = useAppStore.getState().sessions.find(s => s.id === 's1');
    expect(updated?.name).toBe('📈 投资助手');
  });

  it('does nothing when no current session', () => {
    useAppStore.setState({ currentSessionId: null, sessions: [], conversationHistory: [] });
    useAppStore.getState().saveCurrentSession();
    expect(sessionService.update).not.toHaveBeenCalled();
  });
});
