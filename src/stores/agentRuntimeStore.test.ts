import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/agentRuntimeApi', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
  ]),
  runAgent: vi.fn(),
}));
vi.mock('../services/eventAdapter', () => ({
  toDisplayEvent: vi.fn(() => null),
  aggregateObservability: vi.fn(() => ({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null })),
}));

vi.mock('../services/dbApi', () => ({
  dbApi: {
    querySessions: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    getSession: vi.fn(),
  },
}));

import { useAgentRuntimeStore } from './agentRuntimeStore';
import { dbApi } from '../services/dbApi';

// 便于断言的别名
const querySessions = dbApi.querySessions as unknown as ReturnType<typeof vi.fn>;
const createSession = dbApi.createSession as unknown as ReturnType<typeof vi.fn>;
const updateSession = dbApi.updateSession as unknown as ReturnType<typeof vi.fn>;
const getSession = dbApi.getSession as unknown as ReturnType<typeof vi.fn>;

describe('agentRuntimeStore persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 每个测试前重置 store 状态,避免跨测试污染
    useAgentRuntimeStore.setState({
      agents: [],
      currentAgentId: null,
      workspaceSessionId: null,
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
      workspaceRunning: false,
    });
  });

  it('selectAgent loads existing session by agent_id', async () => {
    querySessions.mockResolvedValue({
      items: [{ id: 'sess-echo', agentId: 'echo' }],
      total: 1, page: 1, size: 20,
    });
    // getSession 返回带 messages 的完整 session
    getSession.mockResolvedValue({ id: 'sess-echo', messages: [
      { role: 'user', content: '旧问题' },
      { role: 'assistant', content: '旧回答' },
    ] });
    useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });
    await useAgentRuntimeStore.getState().selectAgent('echo');
    expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ agent: 'echo' }));
    expect(useAgentRuntimeStore.getState().workspaceMessages.map(m => m.content)).toEqual(['旧问题', '旧回答']);
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('sess-echo');
  });

  it('selectAgent creates session when none exists', async () => {
    querySessions.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    createSession.mockResolvedValue({ id: 'new-echo', agentId: 'echo', messages: [] });
    useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });
    await useAgentRuntimeStore.getState().selectAgent('echo');
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'echo' }));
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('new-echo');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
  });

  it('runWorkspace passes workspaceCwd to runAgent', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, onEvent: any, onDone: any) => {
      onDone();
    });
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'echo',
      workspaceSessionId: 's1',
      workspaceCwd: 'D:/proj',
      workspaceMessages: [],
    });
    await useAgentRuntimeStore.getState().runWorkspace('hi');
    expect(runAgent).toHaveBeenCalledWith('echo', expect.any(Array), 'D:/proj', expect.any(Function), expect.any(Function), expect.any(Function));
  });

  it('runAssistant passes null cwd to runAgent (no arg-shift)', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, onEvent: any, onDone: any) => {
      onDone();
    });
    useAgentRuntimeStore.setState({ assistantMessages: [], assistantRunning: false });
    await useAgentRuntimeStore.getState().runAssistant('hi');
    expect(runAgent).toHaveBeenCalledWith('assistant', expect.any(Array), null, expect.any(Function), expect.any(Function), expect.any(Function));
  });
});
