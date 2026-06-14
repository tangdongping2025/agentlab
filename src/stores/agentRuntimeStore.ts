import { create } from 'zustand';
import { listAgents, runAgent, type AgentInfo } from '../services/agentRuntimeApi';
import { toDisplayEvent, type DisplayEvent } from '../services/eventAdapter';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentRuntimeState {
  agents: AgentInfo[];
  currentAgentId: string | null;
  isLoadingAgents: boolean;
  // 当前 agent 工作台对话
  workspaceMessages: ChatMessage[];
  workspaceStreaming: string;
  workspaceEvents: DisplayEvent[];
  workspaceRunning: boolean;
  // 助手对话(独立)
  assistantMessages: ChatMessage[];
  assistantStreaming: string;
  assistantEvents: DisplayEvent[];
  assistantRunning: boolean;

  loadAgents: () => Promise<void>;
  selectAgent: (id: string) => void;
  runWorkspace: (input: string) => Promise<void>;
  runAssistant: (input: string) => Promise<void>;
  resetWorkspace: () => void;
}

export const useAgentRuntimeStore = create<AgentRuntimeState>((set, get) => ({
  agents: [],
  currentAgentId: null,
  isLoadingAgents: false,
  workspaceMessages: [],
  workspaceStreaming: '',
  workspaceEvents: [],
  workspaceRunning: false,
  assistantMessages: [],
  assistantStreaming: '',
  assistantEvents: [],
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

  selectAgent: (id) => set({ currentAgentId: id }),

  runWorkspace: async (input) => {
    const agentId = get().currentAgentId;
    if (!agentId || get().workspaceRunning) return;
    const messages = [...get().workspaceMessages, { role: 'user' as const, content: input }];
    set({ workspaceMessages: messages, workspaceStreaming: '', workspaceEvents: [], workspaceRunning: true });
    await runAgent(
      agentId,
      messages.map(m => ({ role: m.role, content: m.content })),
      (ev) => {
        if (ev.type === 'text') {
          set({ workspaceStreaming: get().workspaceStreaming + (ev.data.text || '') });
        } else {
          const de = toDisplayEvent(ev);
          if (de) set({ workspaceEvents: [...get().workspaceEvents, de] });
        }
      },
      () => {
        const full = get().workspaceStreaming;
        set({
          workspaceMessages: [...get().workspaceMessages, { role: 'assistant', content: full }],
          workspaceStreaming: '',
          workspaceRunning: false,
        });
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
    set({ assistantMessages: messages, assistantStreaming: '', assistantEvents: [], assistantRunning: true });
    await runAgent(
      'assistant',
      messages.map(m => ({ role: m.role, content: m.content })),
      (ev) => {
        if (ev.type === 'text') set({ assistantStreaming: get().assistantStreaming + (ev.data.text || '') });
        else {
          const de = toDisplayEvent(ev);
          if (de) set({ assistantEvents: [...get().assistantEvents, de] });
        }
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

  resetWorkspace: () => set({ workspaceMessages: [], workspaceStreaming: '', workspaceEvents: [], workspaceRunning: false }),
}));
