import { create } from 'zustand';
import { listAgents, runAgent, type AgentInfo, type AgentEvent, type AgentError } from '../services/agentRuntimeApi';
import { toDisplayEvent, aggregateObservability, type DisplayEvent, type ObservabilityData } from '../services/eventAdapter';
import { dbApi, type MessageIndexItem, type SessionMessageInput } from '../services/dbApi';

const LAST_AGENT_KEY = 'lastAgentId';
function rememberLastAgent(id: string | null) {
  if (!id) return;
  try { localStorage.setItem(LAST_AGENT_KEY, id); } catch { /* 隐私模式等,忽略 */ }
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  seq?: number;
  error?: AgentError;
  events?: DisplayEvent[];
}

interface WorkspaceResetToken {
  agentId: string | null;
  sessionId: string | null;
  messages: ChatMessage[];
}

interface AgentRuntimeState {
  agents: AgentInfo[];
  currentAgentId: string | null;
  isLoadingAgents: boolean;
  // 当前 agent 工作台的 session id(持久化到 MySQL 用)
  workspaceSessionId: string | null;
  // 当前 agent 工作台(消息窗口)
  workspaceMessages: ChatMessage[];
  workspaceStreaming: string;
  workspaceEvents: DisplayEvent[];
  workspaceObservability: ObservabilityData;
  workspaceRunning: boolean;
  workspaceAbortController: AbortController | null;
  workspaceResetToken: WorkspaceResetToken | null;
  // 消息窗口分页状态
  workspaceOldestSeq: number | null;
  workspaceNewestSeq: number | null;
  workspaceHasMoreBefore: boolean;
  workspaceHasMoreAfter: boolean;
  workspaceLoadingOlder: boolean;
  workspaceLoadOlderError: string | null;
  workspaceIsAtLatest: boolean;
  workspaceHasNewerNotice: boolean;
  workspaceTaskIndex: MessageIndexItem[];
  // 当前 agent 工作目录(tabs 型 agent 透传给后端 cwd)
  workspaceCwd: string | null;
  // 工作目录历史(切换时追加去重,限 10;从 localStorage 恢复,FilesPanel 负责)
  workspaceCwdHistory: string[];
  // 助手对话(独立)
  assistantMessages: ChatMessage[];
  assistantStreaming: string;
  assistantEvents: DisplayEvent[];
  assistantObservability: ObservabilityData;
  assistantRunning: boolean;
  assistantAbortController: AbortController | null;

  loadAgents: () => Promise<void>;
  selectAgent: (id: string) => Promise<void>;
  resumeWorkspaceSession: (session: { id: string; agentId?: string | null; messages?: Array<{ role: string; content?: string }> }) => void;
  loadOlderWorkspaceMessages: () => Promise<void>;
  jumpWorkspaceToLatest: () => Promise<void>;
  jumpWorkspaceToMessageSeq: (seq: number) => Promise<void>;
  runWorkspace: (input: string) => Promise<void>;
  runAssistant: (input: string) => Promise<void>;
  cancelWorkspace: () => void;
  cancelAssistant: () => void;
  resetWorkspace: () => Promise<void>;
  setWorkspaceCwd: (cwd: string) => void;
  setWorkspaceCwdHistory: (hist: string[]) => void;
  regenerateLast: () => Promise<void>;
}

const EMPTY_OBS: ObservabilityData = { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null };
const WORKSPACE_WINDOW_LIMIT = 12;
let workspaceSelectionVersion = 0;
let workspaceWindowVersion = 0;
let workspacePendingSelectionId: string | null = null;

function toWorkspaceMessages(messages: Array<{ role: string; content?: string; seq?: number }>): ChatMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content || '', seq: m.seq }));
}

function emptyWindowState() {
  return {
    workspaceOldestSeq: null,
    workspaceNewestSeq: null,
    workspaceHasMoreBefore: false,
    workspaceHasMoreAfter: false,
    workspaceLoadingOlder: false,
    workspaceLoadOlderError: null,
    workspaceIsAtLatest: true,
    workspaceHasNewerNotice: false,
    workspaceTaskIndex: [],
  };
}

function stateFromMessageWindow(window: {
  messages: Array<{ role: string; content?: string; seq?: number }>;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestSeq: number | null;
  newestSeq: number | null;
}) {
  return {
    workspaceMessages: toWorkspaceMessages(window.messages),
    workspaceOldestSeq: window.oldestSeq,
    workspaceNewestSeq: window.newestSeq,
    workspaceHasMoreBefore: window.hasMoreBefore,
    workspaceHasMoreAfter: window.hasMoreAfter,
  };
}

async function appendWorkspaceMessages(sessionId: string | null, messages: SessionMessageInput[]) {
  if (!sessionId || messages.length === 0) return null;
  try {
    return await dbApi.appendSessionMessages(sessionId, messages);
  } catch (e) {
    console.error('persist failed', e);
    return null;
  }
}

export const useAgentRuntimeStore = create<AgentRuntimeState>((set, get) => ({
  agents: [],
  currentAgentId: null,
  isLoadingAgents: false,
  workspaceSessionId: null,
  workspaceMessages: [],
  workspaceStreaming: '',
  workspaceEvents: [],
  workspaceObservability: EMPTY_OBS,
  workspaceRunning: false,
  workspaceAbortController: null,
  workspaceResetToken: null,
  workspaceOldestSeq: null,
  workspaceNewestSeq: null,
  workspaceHasMoreBefore: false,
  workspaceHasMoreAfter: false,
  workspaceLoadingOlder: false,
  workspaceLoadOlderError: null,
  workspaceIsAtLatest: true,
  workspaceHasNewerNotice: false,
  workspaceTaskIndex: [],
  workspaceCwd: null,
  workspaceCwdHistory: [],
  assistantMessages: [],
  assistantStreaming: '',
  assistantEvents: [],
  assistantObservability: EMPTY_OBS,
  assistantRunning: false,
  assistantAbortController: null,

  loadAgents: async () => {
    set({ isLoadingAgents: true });
    try {
      const agents = await listAgents();
      // 优先用已选的 currentAgentId;其次恢复 localStorage 上次选的(需仍在列表);最后默认
      const oldId = get().currentAgentId;
      let savedId: string | null = null;
      try { savedId = localStorage.getItem(LAST_AGENT_KEY); } catch { /* ignore */ }
      const savedValid = !!(savedId && agents.find(a => a.id === savedId));
      const defaultAgentId = agents.find(agent => agent.id === 'research')?.id || agents[0]?.id || null;
      const newId = oldId || (savedValid ? savedId : null) || defaultAgentId;
      set({ agents, isLoadingAgents: false });
      // 若首次设置了 currentAgentId,加载其 session
      if (newId && newId !== oldId) {
        await get().selectAgent(newId);
      }
    } catch (e) {
      console.error('loadAgents failed:', e);
      set({ isLoadingAgents: false });
    }
  },

  selectAgent: async (id) => {
    const oldId = get().currentAgentId;
    if (oldId === id) {
      if (workspacePendingSelectionId !== id) workspaceSelectionVersion += 1;
      return;
    }
    const selectionVersion = ++workspaceSelectionVersion;
    workspacePendingSelectionId = id;
    get().workspaceAbortController?.abort();
    set({
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
      workspaceAbortController: null,
    });
    workspaceWindowVersion += 1;
    // 加载(或创建)目标 agent 的累积 session
    let session: any = null;
    try {
      const res = await dbApi.querySessions({ agent: id, size: 1 });
      if (res.items[0]) session = res.items[0];
    } catch (e) { console.error('querySessions for agent failed', e); }
    if (!session) {
      if (workspaceSelectionVersion !== selectionVersion) {
        if (workspacePendingSelectionId === id) workspacePendingSelectionId = null;
        return;
      }
      const agent = get().agents.find(a => a.id === id);
      try {
        session = await dbApi.createSession({ agentId: id, name: agent?.name || id });
      } catch (e) { console.error('createSession failed', e); session = { id: '' }; }
    }
    if (workspaceSelectionVersion !== selectionVersion) {
      if (workspacePendingSelectionId === id) workspacePendingSelectionId = null;
      return;
    }
    const sessionId = session?.id || null;
    const windowVersion = ++workspaceWindowVersion;
    set({
      currentAgentId: id,
      workspaceSessionId: sessionId,
      ...emptyWindowState(),
      workspaceMessages: [],
      workspaceCwd: null,
      workspaceCwdHistory: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
    });
    rememberLastAgent(id);
    if (!sessionId) {
      if (workspacePendingSelectionId === id) workspacePendingSelectionId = null;
      return;
    }

    const windowLoad = dbApi.getSessionMessages(sessionId, { limit: WORKSPACE_WINDOW_LIMIT })
      .then((window) => {
        if (workspaceSelectionVersion !== selectionVersion || get().workspaceSessionId !== sessionId || workspaceWindowVersion !== windowVersion) return;
        set({ ...stateFromMessageWindow(window), workspaceIsAtLatest: true, workspaceHasNewerNotice: false });
      })
      .catch(e => console.error('load workspace message window failed', e));
    const indexLoad = dbApi.getSessionMessageIndex(sessionId)
      .then((index) => {
        if (workspaceSelectionVersion !== selectionVersion || get().workspaceSessionId !== sessionId || workspaceWindowVersion !== windowVersion) return;
        set({ workspaceTaskIndex: index.items });
      })
      .catch(e => console.error('load workspace task index failed', e));
    await Promise.allSettled([windowLoad, indexLoad]);
    if (workspacePendingSelectionId === id) workspacePendingSelectionId = null;
  },

  resumeWorkspaceSession: (session) => {
    if (!session.agentId) return;
    const selectionVersion = ++workspaceSelectionVersion;
    const windowVersion = ++workspaceWindowVersion;
    workspacePendingSelectionId = null;
    get().workspaceAbortController?.abort();
    set({
      currentAgentId: session.agentId,
      workspaceSessionId: session.id,
      ...emptyWindowState(),
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceResetToken: null,
      workspaceCwd: null,
      workspaceCwdHistory: [],
    });
    rememberLastAgent(session.agentId);
    dbApi.getSessionMessages(session.id, { limit: WORKSPACE_WINDOW_LIMIT })
      .then((window) => {
        if (workspaceSelectionVersion !== selectionVersion || get().workspaceSessionId !== session.id || workspaceWindowVersion !== windowVersion) return;
        set({ ...stateFromMessageWindow(window), workspaceIsAtLatest: true, workspaceHasNewerNotice: false });
      })
      .catch(e => console.error('load resumed workspace message window failed', e));
    dbApi.getSessionMessageIndex(session.id)
      .then((index) => {
        if (workspaceSelectionVersion !== selectionVersion || get().workspaceSessionId !== session.id || workspaceWindowVersion !== windowVersion) return;
        set({ workspaceTaskIndex: index.items });
      })
      .catch(e => console.error('load resumed workspace task index failed', e));
  },

  loadOlderWorkspaceMessages: async () => {
    const state = get();
    if (!state.workspaceSessionId || !state.workspaceHasMoreBefore || state.workspaceLoadingOlder || state.workspaceOldestSeq === null) return;
    const beforeSeq = state.workspaceOldestSeq;
    const newestSeq = state.workspaceNewestSeq;
    const windowVersion = ++workspaceWindowVersion;
    set({ workspaceLoadingOlder: true, workspaceLoadOlderError: null });
    try {
      const sessionId = state.workspaceSessionId;
      const window = await dbApi.getSessionMessages(sessionId, { beforeSeq, limit: WORKSPACE_WINDOW_LIMIT });
      const current = get();
      if (current.workspaceSessionId !== sessionId || current.workspaceOldestSeq !== beforeSeq || current.workspaceNewestSeq !== newestSeq || workspaceWindowVersion !== windowVersion) {
        if (current.workspaceSessionId === sessionId && current.workspaceLoadingOlder) set({ workspaceLoadingOlder: false });
        return;
      }
      const existing = current.workspaceMessages;
      set({
        workspaceMessages: [...toWorkspaceMessages(window.messages), ...existing],
        workspaceOldestSeq: window.oldestSeq,
        workspaceNewestSeq: existing.at(-1)?.seq ?? window.newestSeq,
        workspaceHasMoreBefore: window.hasMoreBefore,
        workspaceHasMoreAfter: get().workspaceHasMoreAfter || window.hasMoreAfter,
        workspaceLoadingOlder: false,
        workspaceLoadOlderError: null,
      });
    } catch (e) {
      const current = get();
      if (current.workspaceSessionId === state.workspaceSessionId && current.workspaceOldestSeq === beforeSeq && current.workspaceNewestSeq === newestSeq && workspaceWindowVersion === windowVersion) {
        set({ workspaceLoadingOlder: false, workspaceLoadOlderError: String(e) });
      }
    }
  },

  jumpWorkspaceToLatest: async () => {
    const state = get();
    const sessionId = state.workspaceSessionId;
    if (!sessionId) return;
    const oldestSeq = state.workspaceOldestSeq;
    const newestSeq = state.workspaceNewestSeq;
    const windowVersion = ++workspaceWindowVersion;
    const window = await dbApi.getSessionMessages(sessionId, { limit: WORKSPACE_WINDOW_LIMIT });
    const current = get();
    if (current.workspaceSessionId !== sessionId || current.workspaceOldestSeq !== oldestSeq || current.workspaceNewestSeq !== newestSeq || workspaceWindowVersion !== windowVersion) return;
    set({ ...stateFromMessageWindow(window), workspaceIsAtLatest: true, workspaceHasNewerNotice: false });
  },

  jumpWorkspaceToMessageSeq: async (seq) => {
    const state = get();
    const sessionId = state.workspaceSessionId;
    if (!sessionId) return;
    const oldestSeq = state.workspaceOldestSeq;
    const newestSeq = state.workspaceNewestSeq;
    const windowVersion = ++workspaceWindowVersion;
    const window = await dbApi.getSessionMessages(sessionId, { aroundSeq: seq, limit: WORKSPACE_WINDOW_LIMIT });
    const current = get();
    if (current.workspaceSessionId !== sessionId || current.workspaceOldestSeq !== oldestSeq || current.workspaceNewestSeq !== newestSeq || workspaceWindowVersion !== windowVersion) return;
    set({ ...stateFromMessageWindow(window), workspaceIsAtLatest: !window.hasMoreAfter, workspaceHasNewerNotice: window.hasMoreAfter });
  },

  runWorkspace: async (input) => {
    const state = get();
    const agentId = state.currentAgentId;
    const resetToken = state.workspaceResetToken;
    const resetBlocksCurrentWorkspace = resetToken &&
      resetToken.agentId === state.currentAgentId &&
      resetToken.sessionId === state.workspaceSessionId &&
      resetToken.messages === state.workspaceMessages;
    if (!agentId || state.workspaceRunning || resetBlocksCurrentWorkspace) return;
    const sessionIdAtStart = state.workspaceSessionId;
    if (!state.workspaceIsAtLatest) {
      await get().jumpWorkspaceToLatest();
    }
    const runState = get();
    if (runState.currentAgentId !== agentId || runState.workspaceSessionId !== sessionIdAtStart || runState.workspaceRunning) return;
    const userMessage = { role: 'user' as const, content: input };
    const messages = [...runState.workspaceMessages, userMessage];
    const rawEvents: AgentEvent[] = [];
    const controller = new AbortController();
    const isCurrentRun = () => get().workspaceAbortController === controller;
    const runWindowVersion = ++workspaceWindowVersion;
    set({ workspaceMessages: messages, workspaceStreaming: '', workspaceEvents: [], workspaceObservability: EMPTY_OBS, workspaceRunning: true, workspaceAbortController: controller, workspaceIsAtLatest: true, workspaceHasNewerNotice: false });
    await runAgent(
      agentId,
      [{ role: 'user', content: input }],
      get().workspaceCwd,
      get().workspaceSessionId,
      (ev) => {
        if (!isCurrentRun()) return;
        rawEvents.push(ev);
        if (ev.type === 'text') {
          set({ workspaceStreaming: get().workspaceStreaming + (ev.data.text || '') });
        } else {
          let events = get().workspaceEvents;
          let streaming = get().workspaceStreaming;
          // ReAct: tool_call 前的 workspaceStreaming 是推理(Thought),转 thinking event + 清空
          if (ev.type === 'tool_call' && streaming) {
            events = [...events, { type: 'thinking', label: '推理', detail: streaming, ts: Date.now() } as DisplayEvent];
            streaming = '';
          }
          const de = toDisplayEvent(ev);
          if (de) events = [...events, de];
          set({ workspaceStreaming: streaming, workspaceEvents: events });
        }
        set({ workspaceObservability: aggregateObservability(rawEvents) });
      },
      async () => {
        if (!get().workspaceRunning || !isCurrentRun()) return;  // 已被 cancel/reset 或新 run 替代
        const full = get().workspaceStreaming;
        const sessionId = get().workspaceSessionId;
        const _events = get().workspaceEvents;
        const assistantMessage = { role: 'assistant' as const, content: full, ...(_events.length ? { events: [..._events] } : {}) };
        set({ workspaceMessages: [...get().workspaceMessages, assistantMessage], workspaceStreaming: '', workspaceRunning: false, workspaceAbortController: null });
        const persisted = await appendWorkspaceMessages(sessionId, [userMessage, { role: 'assistant' as const, content: full }]);
        if (persisted && get().workspaceSessionId === sessionId && workspaceWindowVersion === runWindowVersion) {
          const saved = toWorkspaceMessages(persisted.messages);
          if (saved.length === 2) {
            const currentMessages = get().workspaceMessages;
            set({
              workspaceMessages: [...currentMessages.slice(0, -2), ...saved.map(s => s.role === 'assistant' && (assistantMessage as ChatMessage).events ? { ...s, events: (assistantMessage as ChatMessage).events } : s)],
              workspaceNewestSeq: persisted.newestSeq,
              workspaceHasMoreAfter: false,
            });
          }
        }
      },
      async (err: AgentError) => {
        if (!get().workspaceRunning || !isCurrentRun()) return;  // 已被 cancel/reset 或新 run 替代,忽略迟到的错误
        const sessionId = get().workspaceSessionId;
        // 内存消息保留 AgentError 对象(ErrorBubble 渲染富展示);落库内容是可读文本兜底(reload 后无 error 对象也能看)
        const assistantMessage = { role: 'assistant' as const, content: '', error: err };
        set({
          workspaceMessages: [...get().workspaceMessages, assistantMessage],
          workspaceStreaming: '',
          workspaceRunning: false,
          workspaceAbortController: null,
        });
        const dbAssistant = { role: 'assistant' as const, content: `${err.message}\n\n[技术详情] ${err.detail}` };
        const persisted = await appendWorkspaceMessages(sessionId, [userMessage, dbAssistant]);
        if (persisted && get().workspaceSessionId === sessionId && workspaceWindowVersion === runWindowVersion) {
          const saved = toWorkspaceMessages(persisted.messages);
          if (saved.length === 2) {
            const currentMessages = get().workspaceMessages;
            // 用 persisted 的 seq 对齐,并回挂内存 error 对象(当前会话 ErrorBubble 仍渲染;reload 后只剩文本)
            const merged = saved.map((m) => (m.role === 'assistant' ? { ...m, error: (currentMessages.at(-1) as ChatMessage | undefined)?.error } : m));
            set({
              workspaceMessages: [...currentMessages.slice(0, -2), ...merged],
              workspaceNewestSeq: persisted.newestSeq,
              workspaceHasMoreAfter: false,
            });
          }
        }
      },
      controller.signal,
    );
  },

  runAssistant: async (input) => {
    if (get().assistantRunning) return;
    const messages = [...get().assistantMessages, { role: 'user' as const, content: input }];
    const rawEvents: AgentEvent[] = [];
    const controller = new AbortController();
    const isCurrentRun = () => get().assistantAbortController === controller;
    set({ assistantMessages: messages, assistantStreaming: '', assistantEvents: [], assistantObservability: EMPTY_OBS, assistantRunning: true, assistantAbortController: controller });
    await runAgent(
      'assistant',
      messages.map(m => ({ role: m.role, content: m.content })),
      null,
      null,
      (ev) => {
        if (!isCurrentRun()) return;
        rawEvents.push(ev);
        if (ev.type === 'text') set({ assistantStreaming: get().assistantStreaming + (ev.data.text || '') });
        else if (ev.type === 'action' && ev.data._action === 'switch_agent') {
          const agentId = ev.data.agent_id;
          if (agentId) get().selectAgent(agentId);
          const de = toDisplayEvent(ev);
          if (de) set({ assistantEvents: [...get().assistantEvents, de] });
        } else {
          const de = toDisplayEvent(ev);
          if (de) set({ assistantEvents: [...get().assistantEvents, de] });
        }
        set({ assistantObservability: aggregateObservability(rawEvents) });
      },
      () => {
        if (!get().assistantRunning || !isCurrentRun()) return;
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: get().assistantStreaming }],
          assistantStreaming: '',
          assistantRunning: false,
          assistantAbortController: null,
        });
      },
      (err: AgentError) => {
        if (!get().assistantRunning || !isCurrentRun()) return;
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: '', error: err }],
          assistantStreaming: '',
          assistantRunning: false,
          assistantAbortController: null,
        });
      },
      controller.signal,
    );
  },

  cancelWorkspace: () => {
    if (!get().workspaceRunning) return;
    const controller = get().workspaceAbortController;
    controller?.abort();
    // 立即落库:把当前 streaming 收成 assistant 消息(若有),尾部加 [已取消]
    const partial = get().workspaceStreaming;
    const tail = partial ? `${partial}\n\n[已取消]` : '[已取消]';
    const assistantMessage = { role: 'assistant' as const, content: tail };
    const currentMessages = get().workspaceMessages;
    const currentUser = currentMessages.at(-1)?.role === 'user' ? currentMessages.at(-1) : null;
    const sessionId = get().workspaceSessionId;
    const cancelWindowVersion = ++workspaceWindowVersion;
    const appendedMessages = currentUser ? [currentUser, assistantMessage] : [assistantMessage];
    set({ workspaceMessages: [...currentMessages, assistantMessage], workspaceStreaming: '', workspaceRunning: false, workspaceAbortController: null });
    appendWorkspaceMessages(sessionId, appendedMessages).then((persisted) => {
      if (!persisted || get().workspaceSessionId !== sessionId || workspaceWindowVersion !== cancelWindowVersion) return;
      const saved = toWorkspaceMessages(persisted.messages);
      if (saved.length !== appendedMessages.length) return;
      const current = get().workspaceMessages;
      set({ workspaceMessages: [...current.slice(0, -saved.length), ...saved], workspaceNewestSeq: persisted.newestSeq, workspaceHasMoreAfter: false });
    });
  },

  cancelAssistant: () => {
    if (!get().assistantRunning) return;
    const controller = get().assistantAbortController;
    controller?.abort();
    const partial = get().assistantStreaming;
    const tail = partial ? `${partial}\n\n[已取消]` : '[已取消]';
    set({
      assistantMessages: [...get().assistantMessages, { role: 'assistant', content: tail }],
      assistantStreaming: '',
      assistantRunning: false,
      assistantAbortController: null,
    });
  },

  resetWorkspace: async () => {
    const stateAtStart = get();
    const agentIdAtStart = stateAtStart.currentAgentId;
    const sessionIdAtStart = stateAtStart.workspaceSessionId;
    const messagesAtStart = stateAtStart.workspaceMessages;
    const controller = stateAtStart.workspaceAbortController;
    const resetToken: WorkspaceResetToken = { agentId: agentIdAtStart, sessionId: sessionIdAtStart, messages: messagesAtStart };
    workspaceWindowVersion += 1;
    controller?.abort();
    set({
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceResetToken: resetToken,
    });

    if (!agentIdAtStart) {
      set({
        workspaceSessionId: null,
        workspaceMessages: [],
        ...emptyWindowState(),
        workspaceResetToken: get().workspaceResetToken === resetToken ? null : get().workspaceResetToken,
      });
      return;
    }

    const agent = stateAtStart.agents.find(a => a.id === agentIdAtStart);
    let session: any = null;
    try {
      session = await dbApi.createSession({ agentId: agentIdAtStart, name: agent?.name || agentIdAtStart, messages: [] });
    } catch (e) {
      console.error('createSession for reset failed', e);
      const currentState = get();
      if (
        currentState.workspaceResetToken !== resetToken ||
        currentState.currentAgentId !== agentIdAtStart ||
        currentState.workspaceSessionId !== sessionIdAtStart ||
        currentState.workspaceMessages !== messagesAtStart
      ) {
        if (currentState.workspaceResetToken === resetToken) set({ workspaceResetToken: null });
        return;
      }
      set({
        workspaceStreaming: '',
        workspaceEvents: [],
        workspaceObservability: EMPTY_OBS,
        workspaceRunning: false,
        workspaceAbortController: null,
        workspaceResetToken: currentState.workspaceResetToken === resetToken ? null : currentState.workspaceResetToken,
      });
      return;
    }

    const currentState = get();
    if (
      currentState.workspaceResetToken !== resetToken ||
      currentState.currentAgentId !== agentIdAtStart ||
      currentState.workspaceSessionId !== sessionIdAtStart ||
      currentState.workspaceMessages !== messagesAtStart
    ) {
      if (currentState.workspaceResetToken === resetToken) set({ workspaceResetToken: null });
      return;
    }

    set({
      workspaceSessionId: session?.id || null,
      workspaceMessages: [],
      ...emptyWindowState(),
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceResetToken: currentState.workspaceResetToken === resetToken ? null : currentState.workspaceResetToken,
    });
  },

  setWorkspaceCwd: (cwd) => {
    // 追加历史(去重,新 cwd 置顶,限 10);持久化由 FilesPanel 写 localStorage 处理
    const hist = [cwd, ...get().workspaceCwdHistory.filter(c => c !== cwd)].slice(0, 10);
    set({ workspaceCwd: cwd, workspaceCwdHistory: hist });
  },
  setWorkspaceCwdHistory: (hist) => {
    set({ workspaceCwdHistory: hist });
  },
  regenerateLast: async () => {
    const msgs = get().workspaceMessages;
    // 去掉最后一条 assistant(若有)
    let trimmed = msgs;
    if (msgs.length && msgs[msgs.length - 1].role === 'assistant') {
      trimmed = msgs.slice(0, -1);
    }
    // 找最后一条 user
    let lastUserIdx = -1;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;
    const lastUser = trimmed[lastUserIdx];
    const lastUserContent = lastUser.content;
    if (get().workspaceSessionId && lastUser.seq !== undefined) {
      await dbApi.deleteSessionMessagesFromSeq(get().workspaceSessionId!, lastUser.seq);
    }
    const nextMessages = trimmed.slice(0, lastUserIdx);
    workspaceWindowVersion += 1;
    set({
      workspaceMessages: nextMessages,
      workspaceNewestSeq: nextMessages.at(-1)?.seq ?? null,
      workspaceHasMoreAfter: false,
      workspaceIsAtLatest: true,
      workspaceHasNewerNotice: false,
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
    });
    await get().runWorkspace(lastUserContent);
  },
}));
