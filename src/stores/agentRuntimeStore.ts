import { create } from 'zustand';
import { listAgents, runAgent, type AgentInfo, type AgentEvent } from '../services/agentRuntimeApi';
import { toDisplayEvent, aggregateObservability, type DisplayEvent, type ObservabilityData } from '../services/eventAdapter';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentWorkspaceSnapshot {
  messages: ChatMessage[];
  observability: ObservabilityData;
}

interface AgentRuntimeState {
  agents: AgentInfo[];
  currentAgentId: string | null;
  isLoadingAgents: boolean;
  // 各 agent 的工作台快照(切换时存当前 + 加载目标,实现 per-agent 对话保持)
  workspaceByAgent: Record<string, AgentWorkspaceSnapshot>;
  // 当前 agent 工作台(workspaceByAgent[currentAgentId] 的实时视图)
  workspaceMessages: ChatMessage[];
  workspaceStreaming: string;
  workspaceEvents: DisplayEvent[];
  workspaceObservability: ObservabilityData;
  workspaceRunning: boolean;
  // 助手对话(独立)
  assistantMessages: ChatMessage[];
  assistantStreaming: string;
  assistantEvents: DisplayEvent[];
  assistantObservability: ObservabilityData;
  assistantRunning: boolean;

  loadAgents: () => Promise<void>;
  selectAgent: (id: string) => void;
  runWorkspace: (input: string) => Promise<void>;
  runAssistant: (input: string) => Promise<void>;
  resetWorkspace: () => void;
}

const EMPTY_OBS: ObservabilityData = { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null };

export const useAgentRuntimeStore = create<AgentRuntimeState>((set, get) => ({
  agents: [],
  currentAgentId: null,
  isLoadingAgents: false,
  workspaceByAgent: {},
  workspaceMessages: [],
  workspaceStreaming: '',
  workspaceEvents: [],
  workspaceObservability: EMPTY_OBS,
  workspaceRunning: false,
  assistantMessages: [],
  assistantStreaming: '',
  assistantEvents: [],
  assistantObservability: EMPTY_OBS,
  assistantRunning: false,

  loadAgents: async () => {
    set({ isLoadingAgents: true });
    try {
      const agents = await listAgents();
      set({ agents, isLoadingAgents: false, currentAgentId: get().currentAgentId || agents[0]?.id || null });
    } catch (e) {
      console.error('loadAgents failed:', e);
      set({ isLoadingAgents: false });
    }
  },

  selectAgent: (id) => {
    const oldId = get().currentAgentId;
    if (oldId === id) return;
    const byAgent = { ...get().workspaceByAgent };
    if (oldId) {
      byAgent[oldId] = { messages: get().workspaceMessages, observability: get().workspaceObservability };
    }
    const restored = byAgent[id];
    set({
      currentAgentId: id,
      workspaceByAgent: byAgent,
      workspaceMessages: restored?.messages || [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: restored?.observability || EMPTY_OBS,
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
        const msgs = [...get().workspaceMessages, { role: 'assistant', content: full }];
        const byAgent = { ...get().workspaceByAgent };
        byAgent[agentId] = { messages: msgs, observability: get().workspaceObservability };
        set({ workspaceMessages: msgs, workspaceStreaming: '', workspaceRunning: false, workspaceByAgent: byAgent });
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
    const id = get().currentAgentId;
    const byAgent = { ...get().workspaceByAgent };
    if (id) delete byAgent[id];
    set({ workspaceMessages: [], workspaceStreaming: '', workspaceEvents: [], workspaceObservability: EMPTY_OBS, workspaceRunning: false, workspaceByAgent: byAgent });
  },
}));
