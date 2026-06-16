import { create } from 'zustand';
import { listAgents, runAgent, type AgentInfo, type AgentEvent } from '../services/agentRuntimeApi';
import { toDisplayEvent, aggregateObservability, type DisplayEvent, type ObservabilityData } from '../services/eventAdapter';
import { dbApi } from '../services/dbApi';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentRuntimeState {
  agents: AgentInfo[];
  currentAgentId: string | null;
  isLoadingAgents: boolean;
  // 当前 agent 工作台的 session id(持久化到 MySQL 用)
  workspaceSessionId: string | null;
  // 当前 agent 工作台(从 session 加载的实时视图)
  workspaceMessages: ChatMessage[];
  workspaceStreaming: string;
  workspaceEvents: DisplayEvent[];
  workspaceObservability: ObservabilityData;
  workspaceRunning: boolean;
  // 当前 agent 工作目录(tabs 型 agent 透传给后端 cwd)
  workspaceCwd: string | null;
  // 助手对话(独立)
  assistantMessages: ChatMessage[];
  assistantStreaming: string;
  assistantEvents: DisplayEvent[];
  assistantObservability: ObservabilityData;
  assistantRunning: boolean;

  loadAgents: () => Promise<void>;
  selectAgent: (id: string) => Promise<void>;
  runWorkspace: (input: string) => Promise<void>;
  runAssistant: (input: string) => Promise<void>;
  resetWorkspace: () => void;
  setWorkspaceCwd: (cwd: string | null) => void;
}

const EMPTY_OBS: ObservabilityData = { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null };

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
  workspaceCwd: null,
  assistantMessages: [],
  assistantStreaming: '',
  assistantEvents: [],
  assistantObservability: EMPTY_OBS,
  assistantRunning: false,

  loadAgents: async () => {
    set({ isLoadingAgents: true });
    try {
      const agents = await listAgents();
      const oldId = get().currentAgentId;
      const newId = oldId || agents[0]?.id || null;
      set({ agents, isLoadingAgents: false, currentAgentId: newId });
      // 若首次设置了 currentAgentId(初始化默认选第一个 agent),加载其 session
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
    if (oldId === id) return;
    // 加载(或创建)目标 agent 的累积 session
    let session: any = null;
    try {
      const res = await dbApi.querySessions({ agent: id, size: 1 });
      if (res.items[0]) session = await dbApi.getSession(res.items[0].id);
    } catch (e) { console.error('querySessions for agent failed', e); }
    if (!session) {
      const agent = get().agents.find(a => a.id === id);
      try {
        session = await dbApi.createSession({ agentId: id, name: agent?.name || id });
      } catch (e) { console.error('createSession failed', e); session = { id: '', messages: [] }; }
    }
    set({
      currentAgentId: id,
      workspaceSessionId: session?.id || null,
      workspaceMessages: (session?.messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
    });
  },

  runWorkspace: async (input) => {
    const agentId = get().currentAgentId;
    if (!agentId || get().workspaceRunning) return;
    const messages = [...get().workspaceMessages, { role: 'user' as const, content: input }];
    const rawEvents: AgentEvent[] = [];
    set({ workspaceMessages: messages, workspaceStreaming: '', workspaceEvents: [], workspaceObservability: EMPTY_OBS, workspaceRunning: true });
    await runAgent(
      agentId,
      messages.map(m => ({ role: m.role, content: m.content })),
      get().workspaceCwd,
      (ev) => {
        rawEvents.push(ev);
        if (ev.type === 'text') {
          set({ workspaceStreaming: get().workspaceStreaming + (ev.data.text || '') });
        } else {
          const de = toDisplayEvent(ev);
          if (de) set({ workspaceEvents: [...get().workspaceEvents, de] });
        }
        set({ workspaceObservability: aggregateObservability(rawEvents) });
      },
      () => {
        const full = get().workspaceStreaming;
        const msgs = [...get().workspaceMessages, { role: 'assistant' as const, content: full }];
        set({ workspaceMessages: msgs, workspaceStreaming: '', workspaceRunning: false });
        // 异步落库(乐观更新已同步内存)
        const sid = get().workspaceSessionId;
        if (sid) {
          dbApi.updateSession(sid, { messages: msgs.map(m => ({ role: m.role, content: m.content })) }).catch(e => console.error('persist failed', e));
        }
      },
      (err) => {
        set({
          workspaceMessages: [...get().workspaceMessages, { role: 'assistant', content: `[错误] ${err}` }],
          workspaceStreaming: '',
          workspaceRunning: false,
        });
      },
    );
  },

  runAssistant: async (input) => {
    if (get().assistantRunning) return;
    const messages = [...get().assistantMessages, { role: 'user' as const, content: input }];
    const rawEvents: AgentEvent[] = [];
    set({ assistantMessages: messages, assistantStreaming: '', assistantEvents: [], assistantObservability: EMPTY_OBS, assistantRunning: true });
    await runAgent(
      'assistant',
      messages.map(m => ({ role: m.role, content: m.content })),
      null,
      (ev) => {
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
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: get().assistantStreaming }],
          assistantStreaming: '',
          assistantRunning: false,
        });
      },
      (err) => {
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: `[错误] ${err}` }],
          assistantStreaming: '',
          assistantRunning: false,
        });
      },
    );
  },

  resetWorkspace: () => {
    const sid = get().workspaceSessionId;
    set({ workspaceMessages: [], workspaceStreaming: '', workspaceEvents: [], workspaceObservability: EMPTY_OBS, workspaceRunning: false });
    if (sid) {
      dbApi.updateSession(sid, { messages: [] }).catch(e => console.error('reset persist failed', e));
    }
  },

  setWorkspaceCwd: (cwd) => set({ workspaceCwd: cwd }),
}));
