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
import { listAgents, runAgent } from '../services/agentRuntimeApi';
import { aggregateObservability, toDisplayEvent } from '../services/eventAdapter';
import { dbApi } from '../services/dbApi';

// 便于断言的别名
const listAgentsMock = listAgents as unknown as ReturnType<typeof vi.fn>;
const runAgentMock = runAgent as unknown as ReturnType<typeof vi.fn>;
const toDisplayEventMock = toDisplayEvent as unknown as ReturnType<typeof vi.fn>;
const aggregateObservabilityMock = aggregateObservability as unknown as ReturnType<typeof vi.fn>;
const querySessions = dbApi.querySessions as unknown as ReturnType<typeof vi.fn>;
const createSession = dbApi.createSession as unknown as ReturnType<typeof vi.fn>;
const updateSession = dbApi.updateSession as unknown as ReturnType<typeof vi.fn>;
const getSession = dbApi.getSession as unknown as ReturnType<typeof vi.fn>;

describe('agentRuntimeStore persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listAgentsMock.mockResolvedValue([
      { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
    ]);
    runAgentMock.mockResolvedValue(undefined);
    toDisplayEventMock.mockReturnValue(null);
    aggregateObservabilityMock.mockReturnValue({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null });
    querySessions.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    createSession.mockResolvedValue({ id: 'default-session', messages: [] });
    updateSession.mockResolvedValue({});
    getSession.mockResolvedValue({ id: 'default-session', messages: [] });
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
      workspaceAbortController: null,
      workspaceResetToken: null,
    });
  });

  it('loadAgents selects the default agent and loads its workspace session on first load', async () => {
    listAgentsMock.mockResolvedValue([
      { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
    ]);
    querySessions.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    createSession.mockResolvedValue({ id: 'default-echo-session', agentId: 'echo', messages: [] });

    await useAgentRuntimeStore.getState().loadAgents();

    expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ agent: 'echo' }));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'echo', name: 'Echo' }));
    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('echo');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('default-echo-session');
  });

  it('defaults to claude-sdk agent when available', async () => {
    listAgentsMock.mockResolvedValue([
      { id: 'assistant', name: '项目助手', description: '', workspace: { type: 'chat' }, capabilities: [] },
      { id: 'claude-sdk', name: '龙虾 Agent', description: '', workspace: { type: 'chat' }, capabilities: [] },
    ]);
    querySessions.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    createSession.mockResolvedValue({ id: 'claude-sdk-session', agentId: 'claude-sdk', messages: [] });

    await useAgentRuntimeStore.getState().loadAgents();

    expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ agent: 'claude-sdk' }));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'claude-sdk', name: '龙虾 Agent' }));
    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('claude-sdk');
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

  it('does not let pending selectAgent overwrite a resumed workspace session', async () => {
    let resolveQuerySessions: (result: any) => void = () => {};
    querySessions.mockImplementation(() => new Promise(resolve => { resolveQuerySessions = resolve; }));
    getSession.mockResolvedValue({
      id: 'echo-session',
      agentId: 'echo',
      messages: [{ role: 'user', content: 'echo question' }],
    });
    useAgentRuntimeStore.setState({
      agents: [
        { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
        { id: 'research', name: 'Research', description: '', workspace: { type: 'chat' }, capabilities: [] },
      ],
      currentAgentId: null,
      workspaceSessionId: null,
      workspaceMessages: [],
    });

    const selectPromise = useAgentRuntimeStore.getState().selectAgent('echo');
    useAgentRuntimeStore.getState().resumeWorkspaceSession({
      id: 'history-session',
      agentId: 'research',
      messages: [{ role: 'user', content: 'hello' }],
    });
    resolveQuerySessions({ items: [{ id: 'echo-session', agentId: 'echo' }], total: 1, page: 1, size: 20 });
    await selectPromise;

    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('research');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('history-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('does not create a stale session when pending selectAgent is invalidated before createSession', async () => {
    let resolveQuerySessions: (result: any) => void = () => {};
    querySessions.mockImplementation(() => new Promise(resolve => { resolveQuerySessions = resolve; }));
    createSession.mockResolvedValue({ id: 'stale-echo-session', agentId: 'echo', messages: [] });
    useAgentRuntimeStore.setState({
      agents: [
        { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
        { id: 'research', name: 'Research', description: '', workspace: { type: 'chat' }, capabilities: [] },
      ],
      currentAgentId: null,
      workspaceSessionId: null,
      workspaceMessages: [],
    });

    const selectPromise = useAgentRuntimeStore.getState().selectAgent('echo');
    useAgentRuntimeStore.getState().resumeWorkspaceSession({
      id: 'history-session',
      agentId: 'research',
      messages: [{ role: 'user', content: 'hello' }],
    });
    resolveQuerySessions({ items: [], total: 0, page: 1, size: 20 });
    await selectPromise;

    expect(createSession).not.toHaveBeenCalled();
    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('research');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('history-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('selecting the current agent invalidates a pending different agent selection without reloading current workspace', async () => {
    let resolveQuerySessions: (result: any) => void = () => {};
    querySessions.mockImplementation(() => new Promise(resolve => { resolveQuerySessions = resolve; }));
    getSession.mockResolvedValue({
      id: 'session-b',
      agentId: 'agent-b',
      messages: [{ role: 'user', content: 'B question' }],
    });
    const currentMessages = [{ role: 'user' as const, content: 'A question' }];
    useAgentRuntimeStore.setState({
      agents: [
        { id: 'agent-a', name: 'Agent A', description: '', workspace: { type: 'chat' }, capabilities: [] },
        { id: 'agent-b', name: 'Agent B', description: '', workspace: { type: 'chat' }, capabilities: [] },
      ],
      currentAgentId: 'agent-a',
      workspaceSessionId: 'session-a',
      workspaceMessages: currentMessages,
    });

    const selectBPromise = useAgentRuntimeStore.getState().selectAgent('agent-b');
    await useAgentRuntimeStore.getState().selectAgent('agent-a');
    resolveQuerySessions({ items: [{ id: 'session-b', agentId: 'agent-b' }], total: 1, page: 1, size: 20 });
    await selectBPromise;

    expect(querySessions).toHaveBeenCalledTimes(1);
    expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ agent: 'agent-b' }));
    expect(createSession).not.toHaveBeenCalled();
    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('agent-a');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('session-a');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toBe(currentMessages);
  });

  it('passes workspace session id to runAgent', async () => {
    useAgentRuntimeStore.setState({
      currentAgentId: 'claude-sdk',
      workspaceSessionId: 'session-xyz',
      workspaceMessages: [],
      workspaceCwd: 'D:/repo',
    });

    await useAgentRuntimeStore.getState().runWorkspace('hello');

    expect(runAgentMock).toHaveBeenCalledWith(
      'claude-sdk',
      [{ role: 'user', content: 'hello' }],
      'D:/repo',
      'session-xyz',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it('switching agents aborts and invalidates the previous running workspace callbacks', async () => {
    let oldOnEvent: (event: any) => void = () => {};
    let oldOnDone: () => void = () => {};
    let resolveOldRun: () => void = () => {};
    let oldSignal: AbortSignal | undefined;
    runAgentMock.mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, onEvent: any, onDone: any, _onError: any, signal: AbortSignal) => {
      oldOnEvent = onEvent;
      oldOnDone = onDone;
      oldSignal = signal;
      await new Promise<void>(resolve => { resolveOldRun = resolve; });
    });
    querySessions.mockResolvedValue({ items: [{ id: 'session-b', agentId: 'agent-b' }], total: 1, page: 1, size: 20 });
    getSession.mockResolvedValue({
      id: 'session-b',
      agentId: 'agent-b',
      messages: [{ role: 'user', content: 'B question' }],
    });
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [
        { id: 'agent-a', name: 'Agent A', description: '', workspace: { type: 'chat' }, capabilities: [] },
        { id: 'agent-b', name: 'Agent B', description: '', workspace: { type: 'chat' }, capabilities: [] },
      ],
      currentAgentId: 'agent-a',
      workspaceSessionId: 'session-a',
      workspaceMessages: [],
    });

    const oldRunPromise = useAgentRuntimeStore.getState().runWorkspace('A question');
    await Promise.resolve();
    await useAgentRuntimeStore.getState().selectAgent('agent-b');
    oldOnEvent({ type: 'text', data: { text: 'A answer' } });
    oldOnDone();
    resolveOldRun();
    await oldRunPromise;

    expect(oldSignal?.aborted).toBe(true);
    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('agent-b');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('session-b');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'B question' }]);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('');
    expect(updateSession).not.toHaveBeenCalledWith('session-b', expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ content: 'A answer' })]),
    }));
  });

  it('creates a new session when resetting workspace conversation', async () => {
    createSession.mockResolvedValue({
      id: 'new-research-session',
      name: '研究助手',
      agentId: 'research',
      messages: [],
    });
    const controller = new AbortController();
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [{ role: 'user', content: 'old question' }],
      workspaceStreaming: 'partial answer',
      workspaceEvents: [{ id: 'evt-1', type: 'text', title: 'text', description: 'partial answer' } as any],
      workspaceObservability: { steps: [{ id: 'step-1' }], tokenUsage: { input: 10, output: 20 }, strategyEffect: 'better' } as any,
      workspaceRunning: true,
      workspaceAbortController: controller,
    });

    await useAgentRuntimeStore.getState().resetWorkspace();

    expect(controller.signal.aborted).toBe(true);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      name: '研究助手',
      agentId: 'research',
      messages: [],
    }));
    expect(updateSession).not.toHaveBeenCalledWith('old-research-session', { messages: [] });
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('new-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('');
    expect(useAgentRuntimeStore.getState().workspaceEvents).toEqual([]);
    expect(useAgentRuntimeStore.getState().workspaceObservability).toEqual({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null });
    expect(useAgentRuntimeStore.getState().workspaceRunning).toBe(false);
    expect(useAgentRuntimeStore.getState().workspaceAbortController).toBeNull();
  });

  it('keeps session messages but clears runtime state when reset session creation fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const controller = new AbortController();
    createSession.mockRejectedValue(new Error('create failed'));
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [{ role: 'user', content: 'old question' }],
      workspaceStreaming: 'partial answer',
      workspaceEvents: [{ id: 'evt-1', type: 'text', title: 'text', description: 'partial answer' } as any],
      workspaceObservability: { steps: [{ id: 'step-1' }], tokenUsage: { input: 10, output: 20 }, strategyEffect: 'better' } as any,
      workspaceRunning: true,
      workspaceAbortController: controller,
    });

    await useAgentRuntimeStore.getState().resetWorkspace();

    expect(controller.signal.aborted).toBe(true);
    expect(updateSession).not.toHaveBeenCalledWith('old-research-session', { messages: [] });
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('old-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'old question' }]);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('');
    expect(useAgentRuntimeStore.getState().workspaceEvents).toEqual([]);
    expect(useAgentRuntimeStore.getState().workspaceObservability).toEqual({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null });
    expect(useAgentRuntimeStore.getState().workspaceRunning).toBe(false);
    expect(useAgentRuntimeStore.getState().workspaceAbortController).toBeNull();
    errorSpy.mockRestore();
  });

  it('does not overwrite current agent workspace when reset session creation resolves after agent switch', async () => {
    let resolveCreateSession: (session: any) => void = () => {};
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    useAgentRuntimeStore.setState({
      agents: [
        { id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] },
        { id: 'writer', name: '写作助手', description: '', workspace: { type: 'chat' }, capabilities: [] },
      ],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [{ role: 'user', content: 'research question' }],
    });

    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    useAgentRuntimeStore.setState({
      currentAgentId: 'writer',
      workspaceSessionId: 'writer-session',
      workspaceMessages: [{ role: 'user', content: 'writer question' }],
      workspaceStreaming: 'writer streaming',
      workspaceRunning: true,
    });
    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;

    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('writer');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('writer-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'writer question' }]);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('writer streaming');
    expect(useAgentRuntimeStore.getState().workspaceRunning).toBe(true);
  });

  it('does not overwrite same agent workspace when reset resolves after messages change', async () => {
    let resolveCreateSession: (session: any) => void = () => {};
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    const messagesAtStart = [{ role: 'user' as const, content: 'old question' }];
    const changedMessages = [...messagesAtStart, { role: 'assistant' as const, content: 'new answer' }];
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: messagesAtStart,
    });

    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    useAgentRuntimeStore.setState({
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: changedMessages,
      workspaceStreaming: 'new streaming',
      workspaceRunning: true,
    });
    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;

    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('research');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('old-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toBe(changedMessages);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('new streaming');
    expect(useAgentRuntimeStore.getState().workspaceRunning).toBe(true);
  });

  it('does not overwrite same agent workspace when reset resolves after session changes', async () => {
    let resolveCreateSession: (session: any) => void = () => {};
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    const messagesAtStart = [{ role: 'user' as const, content: 'old question' }];
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: messagesAtStart,
    });

    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    useAgentRuntimeStore.setState({
      currentAgentId: 'research',
      workspaceSessionId: 'another-research-session',
      workspaceMessages: messagesAtStart,
      workspaceStreaming: 'another streaming',
      workspaceRunning: true,
    });
    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;

    expect(useAgentRuntimeStore.getState().currentAgentId).toBe('research');
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('another-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toBe(messagesAtStart);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('another streaming');
    expect(useAgentRuntimeStore.getState().workspaceRunning).toBe(true);
  });

  it.each(['done', 'error'] as const)('ignores late old run %s while reset session creation is pending', async (mode) => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let onDone: () => void = () => {};
    let onError: (err: string) => void = () => {};
    let resolveRunAgent: () => void = () => {};
    let resolveCreateSession: (session: any) => void = () => {};
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, _onEvent: any, done: any, error: any) => {
      onDone = done;
      onError = error;
      await new Promise<void>(resolve => { resolveRunAgent = resolve; });
    });
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [],
      workspaceStreaming: 'old partial',
    });

    const runPromise = useAgentRuntimeStore.getState().runWorkspace('old question');
    await Promise.resolve();
    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    if (mode === 'done') onDone();
    else onError('old error');
    resolveRunAgent();
    await runPromise;
    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;

    expect(updateSession).not.toHaveBeenCalledWith('old-research-session', expect.anything());
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('new-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
  });

  it('does not clear current workspace when reset session creation rejects after workspace changes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectCreateSession: (error: Error) => void = () => {};
    createSession.mockImplementation(() => new Promise((_resolve, reject) => { rejectCreateSession = reject; }));
    const messagesAtStart = [{ role: 'user' as const, content: 'old question' }];
    const currentMessages = [{ role: 'user' as const, content: 'new question' }];
    const currentController = new AbortController();
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: messagesAtStart,
    });

    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    useAgentRuntimeStore.setState({
      currentAgentId: 'research',
      workspaceSessionId: 'current-research-session',
      workspaceMessages: currentMessages,
      workspaceStreaming: 'current streaming',
      workspaceEvents: [{ id: 'current-event' } as any],
      workspaceObservability: { steps: [{ id: 'current-step' }], tokenUsage: { input: 3, output: 5 }, strategyEffect: 'current' } as any,
      workspaceRunning: true,
      workspaceAbortController: currentController,
    });
    rejectCreateSession(new Error('create failed late'));
    await resetPromise;

    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('current-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toBe(currentMessages);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('current streaming');
    expect(useAgentRuntimeStore.getState().workspaceEvents).toEqual([{ id: 'current-event' }]);
    expect(useAgentRuntimeStore.getState().workspaceObservability).toEqual({ steps: [{ id: 'current-step' }], tokenUsage: { input: 3, output: 5 }, strategyEffect: 'current' });
    expect(useAgentRuntimeStore.getState().workspaceRunning).toBe(true);
    expect(useAgentRuntimeStore.getState().workspaceAbortController).toBe(currentController);
    errorSpy.mockRestore();
  });

  it.each(['event', 'done', 'error'] as const)('ignores stale old run %s after a newer run starts during pending reset', async (mode) => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let oldOnEvent: (event: any) => void = () => {};
    let oldOnDone: () => void = () => {};
    let oldOnError: (err: string) => void = () => {};
    let resolveOldRun: () => void = () => {};
    let resolveCreateSession: (session: any) => void = () => {};
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, onEvent: any, onDone: any, onError: any) => {
      oldOnEvent = onEvent;
      oldOnDone = onDone;
      oldOnError = onError;
      await new Promise<void>(resolve => { resolveOldRun = resolve; });
    });
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [],
    });

    const oldRunPromise = useAgentRuntimeStore.getState().runWorkspace('old question');
    await Promise.resolve();
    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    const currentController = new AbortController();
    useAgentRuntimeStore.setState({
      workspaceSessionId: 'current-session',
      workspaceMessages: [{ role: 'user', content: 'current question' }],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
      workspaceRunning: true,
      workspaceAbortController: currentController,
    });

    if (mode === 'event') oldOnEvent({ type: 'text', data: { text: 'old text' } });
    else if (mode === 'done') oldOnDone();
    else oldOnError('old error');
    resolveOldRun();
    await oldRunPromise;
    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;

    expect(updateSession).not.toHaveBeenCalledWith('old-research-session', expect.anything());
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('current-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'current question' }]);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('');
    expect(useAgentRuntimeStore.getState().workspaceEvents).toEqual([]);
    expect(useAgentRuntimeStore.getState().workspaceRunning).toBe(true);
    expect(useAgentRuntimeStore.getState().workspaceAbortController).toBe(currentController);
  });

  it('blocks runWorkspace while reset session creation is pending', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let resolveCreateSession: (session: any) => void = () => {};
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [{ role: 'user', content: 'old question' }],
    });

    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    await useAgentRuntimeStore.getState().runWorkspace('new question');
    expect(runAgent).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalledWith('old-research-session', expect.anything());
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('old-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'old question' }]);

    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;

    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('new-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
  });

  it('does not let stale reset pending block runWorkspace after agent switch', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let resolveCreateSession: (session: any) => void = () => {};
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, _onEvent: any, onDone: any) => { onDone(); });
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [
        { id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] },
        { id: 'writer', name: '写作助手', description: '', workspace: { type: 'chat' }, capabilities: [] },
      ],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [{ role: 'user', content: 'research question' }],
    });

    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    useAgentRuntimeStore.setState({
      currentAgentId: 'writer',
      workspaceSessionId: 'writer-session',
      workspaceMessages: [],
    });
    await useAgentRuntimeStore.getState().runWorkspace('writer question');

    expect(runAgent).toHaveBeenCalledWith('writer', expect.any(Array), null, 'writer-session', expect.any(Function), expect.any(Function), expect.any(Function), expect.any(AbortSignal));
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('writer-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages.map(m => m.content)).toEqual(['writer question', '']);

    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('writer-session');
  });

  it('does not let stale reset pending block runWorkspace after same agent workspace changes', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let resolveCreateSession: (session: any) => void = () => {};
    createSession.mockImplementation(() => new Promise(resolve => { resolveCreateSession = resolve; }));
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, _onEvent: any, onDone: any) => { onDone(); });
    updateSession.mockResolvedValue({});
    const changedMessages = [{ role: 'user' as const, content: 'new visible message' }];
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [{ role: 'user', content: 'old question' }],
    });

    const resetPromise = useAgentRuntimeStore.getState().resetWorkspace();
    useAgentRuntimeStore.setState({
      currentAgentId: 'research',
      workspaceSessionId: 'changed-research-session',
      workspaceMessages: changedMessages,
    });
    await useAgentRuntimeStore.getState().runWorkspace('new question');

    expect(runAgent).toHaveBeenCalledWith('research', expect.any(Array), null, 'changed-research-session', expect.any(Function), expect.any(Function), expect.any(Function), expect.any(AbortSignal));
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('changed-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages.map(m => m.content)).toEqual(['new visible message', 'new question', '']);

    resolveCreateSession({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetPromise;
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('changed-research-session');
  });

  it('does not let stale reset A release pending reset B', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let resolveA: (session: any) => void = () => {};
    let resolveB: (session: any) => void = () => {};
    createSession
      .mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveB = resolve; }));
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [{ role: 'user', content: 'old question' }],
    });

    const resetA = useAgentRuntimeStore.getState().resetWorkspace();
    const resetB = useAgentRuntimeStore.getState().resetWorkspace();
    resolveA({ id: 'reset-a-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetA;
    await useAgentRuntimeStore.getState().runWorkspace('should be blocked by reset B');

    expect(runAgent).not.toHaveBeenCalled();
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('old-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([{ role: 'user', content: 'old question' }]);

    resolveB({ id: 'reset-b-session', name: '研究助手', agentId: 'research', messages: [] });
    await resetB;
    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('reset-b-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
  });

  it('ignores late old run event after reset success creates empty session', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let oldOnEvent: (event: any) => void = () => {};
    let resolveOldRun: () => void = () => {};
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, onEvent: any) => {
      oldOnEvent = onEvent;
      await new Promise<void>(resolve => { resolveOldRun = resolve; });
    });
    createSession.mockResolvedValue({ id: 'new-research-session', name: '研究助手', agentId: 'research', messages: [] });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'research',
      workspaceSessionId: 'old-research-session',
      workspaceMessages: [],
    });

    const oldRunPromise = useAgentRuntimeStore.getState().runWorkspace('old question');
    await Promise.resolve();
    await useAgentRuntimeStore.getState().resetWorkspace();
    oldOnEvent({ type: 'text', data: { text: 'late old text' } });
    resolveOldRun();
    await oldRunPromise;

    expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('new-research-session');
    expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
    expect(useAgentRuntimeStore.getState().workspaceStreaming).toBe('');
    expect(useAgentRuntimeStore.getState().workspaceEvents).toEqual([]);
    expect(useAgentRuntimeStore.getState().workspaceObservability).toEqual({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null });
  });

  it('resumes an existing agent session into the workspace', () => {
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    useAgentRuntimeStore.setState({
      currentAgentId: 'old-agent',
      workspaceSessionId: 'old-session',
      workspaceMessages: [{ role: 'user', content: 'old message' }],
      workspaceStreaming: 'partial answer',
      workspaceEvents: [{ id: 'evt-1', type: 'text', title: 'text', description: 'partial answer' } as any],
      workspaceObservability: { steps: [{ id: 'step-1' }], tokenUsage: { input: 10, output: 20 }, strategyEffect: 'better' } as any,
      workspaceRunning: true,
      workspaceAbortController: controller,
      workspaceResetToken: { agentId: 'old-agent', sessionId: 'old-session', messages: [] },
      workspaceCwd: 'D:/proj',
      workspaceCwdHistory: ['D:/proj', 'D:/other'],
    });

    useAgentRuntimeStore.getState().resumeWorkspaceSession({
      id: 'history-session',
      agentId: 'history-agent',
      messages: [
        { role: 'system', content: 'ignored' },
        { role: 'user', content: 'old question' },
        { role: 'assistant' },
        { role: 'tool', content: 'ignored' },
      ],
    });

    const state = useAgentRuntimeStore.getState();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(controller.signal.aborted).toBe(true);
    expect(state.currentAgentId).toBe('history-agent');
    expect(state.workspaceSessionId).toBe('history-session');
    expect(state.workspaceMessages).toEqual([
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: '' },
    ]);
    expect(state.workspaceStreaming).toBe('');
    expect(state.workspaceEvents).toEqual([]);
    expect(state.workspaceObservability).toEqual({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null });
    expect(state.workspaceRunning).toBe(false);
    expect(state.workspaceAbortController).toBeNull();
    expect(state.workspaceResetToken).toBeNull();
    expect(state.workspaceCwd).toBeNull();
    expect(state.workspaceCwdHistory).toEqual([]);
  });

  it('persists future workspace messages to the resumed session', async () => {
    runAgentMock.mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, onEvent: any, onDone: any) => {
      onEvent({ type: 'text', data: { text: 'new answer' } });
      onDone();
    });
    updateSession.mockResolvedValue({});

    useAgentRuntimeStore.getState().resumeWorkspaceSession({
      id: 'history-session',
      agentId: 'history-agent',
      messages: [{ role: 'user', content: 'old question' }, { role: 'assistant', content: 'old answer' }],
    });
    await useAgentRuntimeStore.getState().runWorkspace('follow up');

    expect(updateSession).toHaveBeenCalledWith('history-session', {
      messages: [
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'follow up' },
        { role: 'assistant', content: 'new answer' },
      ],
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('runWorkspace passes workspaceCwd to runAgent', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, onEvent: any, onDone: any) => {
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
    expect(runAgent).toHaveBeenCalledWith('echo', expect.any(Array), 'D:/proj', 's1', expect.any(Function), expect.any(Function), expect.any(Function), expect.any(AbortSignal));
  });

  it('shows a productized workspace error message with technical details', async () => {
    runAgentMock.mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, _onEvent: any, _onDone: any, onError: any) => {
      onError('TypeError: connection refused');
    });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceSessionId: 's1',
      workspaceMessages: [],
    });

    await useAgentRuntimeStore.getState().runWorkspace('hi');

    const errorMessage = useAgentRuntimeStore.getState().workspaceMessages.at(-1)?.content || '';
    expect(errorMessage).toContain('智能体执行失败');
    expect(errorMessage).toContain('可以重试，或稍后刷新页面再试。');
    expect(errorMessage).toContain('技术详情：TypeError: connection refused');
    expect(errorMessage).not.toBe('[错误] TypeError: connection refused');
  });

  it('runAssistant passes null cwd to runAgent (no arg-shift)', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, onEvent: any, onDone: any) => {
      onDone();
    });
    useAgentRuntimeStore.setState({ assistantMessages: [], assistantRunning: false });
    await useAgentRuntimeStore.getState().runAssistant('hi');
    expect(runAgent).toHaveBeenCalledWith('assistant', expect.any(Array), null, null, expect.any(Function), expect.any(Function), expect.any(Function), expect.any(AbortSignal));
  });

  it('setWorkspaceCwd 不再持久化 cwd 到 session(改用 localStorage,在 FilesPanel 里写)', async () => {
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({ workspaceSessionId: 's1', workspaceCwdHistory: [] });
    useAgentRuntimeStore.getState().setWorkspaceCwd('D:/proj');
    expect(useAgentRuntimeStore.getState().workspaceCwd).toBe('D:/proj');
    expect(useAgentRuntimeStore.getState().workspaceCwdHistory).toEqual(['D:/proj']);
    expect(updateSession).not.toHaveBeenCalledWith('s1', expect.objectContaining({ cwd: expect.anything() }));
    expect(updateSession).not.toHaveBeenCalledWith('s1', expect.objectContaining({ cwdHistory: expect.anything() }));
  });

  it('selectAgent 不再从 session 恢复 cwd(由 FilesPanel 从 localStorage 恢复)', async () => {
    querySessions.mockResolvedValue({ items: [{ id: 'sess-echo', agentId: 'echo' }], total: 1, page: 1, size: 20 });
    getSession.mockResolvedValue({ id: 'sess-echo', cwd: 'D:/restored', cwdHistory: ['D:/restored'], messages: [] });
    useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });
    await useAgentRuntimeStore.getState().selectAgent('echo');
    expect(useAgentRuntimeStore.getState().workspaceCwd).toBeNull();
    expect(useAgentRuntimeStore.getState().workspaceCwdHistory).toEqual([]);
  });

  it('setWorkspaceCwdHistory 直接覆盖 history(用于从 localStorage 恢复)', () => {
    useAgentRuntimeStore.setState({ workspaceCwdHistory: ['old'] });
    useAgentRuntimeStore.getState().setWorkspaceCwdHistory(['a', 'b', 'c']);
    expect(useAgentRuntimeStore.getState().workspaceCwdHistory).toEqual(['a', 'b', 'c']);
  });

  it('cancelWorkspace aborts controller, persists partial streaming with [已取消] tag', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    let receivedSignal: AbortSignal | undefined;
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, _onEvent: any, _onDone: any, _onError: any, signal: AbortSignal) => {
      receivedSignal = signal;
      // 模拟流到一半
      useAgentRuntimeStore.setState({ workspaceStreaming: '部分内容' });
      // 不调 onDone,等 cancel
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    });
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'echo',
      workspaceSessionId: 's1',
      workspaceMessages: [],
    });
    const runPromise = useAgentRuntimeStore.getState().runWorkspace('hi');
    // 让 mock 跑起来设置 streaming
    await new Promise(r => setTimeout(r, 0));
    useAgentRuntimeStore.getState().cancelWorkspace();
    await runPromise;
    const state = useAgentRuntimeStore.getState();
    expect(receivedSignal?.aborted).toBe(true);
    expect(state.workspaceRunning).toBe(false);
    expect(state.workspaceAbortController).toBeNull();
    expect(state.workspaceMessages.at(-1)?.content).toContain('[已取消]');
    expect(state.workspaceMessages.at(-1)?.content).toContain('部分内容');
  });

  it('regenerateLast drops last assistant + re-sends last user', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _sessionId: any, _onEvent: any, onDone: any) => { onDone(); });
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'echo',
      workspaceSessionId: 's1',
      workspaceCwdHistory: [],
      workspaceMessages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
      ],
    });
    await useAgentRuntimeStore.getState().regenerateLast();
    const call = (runAgent as any).mock.calls[0];
    expect(call[1].map((m: any) => m.content)).toEqual(['q1', 'a1', 'q2']);
  });
});
