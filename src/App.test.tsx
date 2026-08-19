import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { useAgentRuntimeStore } from './stores/agentRuntimeStore';
import { dbApi } from './services/dbApi';

vi.mock('./services/migration', () => ({
  migrateIfPending: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./services/sessionService', () => ({
  sessionService: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('./services/dbApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/dbApi')>();
  return {
    dbApi: {
      ...actual.dbApi,
      // resumeWorkspaceSession 现在异步拉消息窗口/任务索引,jsdom 下相对 URL fetch 会失败
      getSessionMessages: vi.fn(),
      getSessionMessageIndex: vi.fn(),
    },
  };
});

vi.mock('./components/agentRuntime/AgentRuntimeView', () => ({
  default: () => <div>Agent Runtime View</div>,
}));

vi.mock('./components/SettingsModal', () => ({
  default: () => null,
}));

vi.mock('./components/HistoryPage', () => ({
  default: ({ onResumeSession }: { onResumeSession?: (session: any) => void }) => (
    <div>
      <div>History Page</div>
      <button
        onClick={() => onResumeSession?.({
          id: 'history-session',
          agentId: 'research',
          messages: [{ role: 'user', content: 'hello' }],
        })}
      >
        Mock Resume Session
      </button>
    </div>
  ),
}));

beforeEach(() => {
  useAgentRuntimeStore.setState({
    currentAgentId: null,
    workspaceSessionId: null,
    workspaceMessages: [],
    workspaceStreaming: '',
    workspaceEvents: [],
    workspaceRunning: false,
    workspaceAbortController: null,
    workspaceResetToken: null,
    workspaceCwd: null,
    workspaceCwdHistory: [],
  });
});

test('renders agent runtime by default', () => {
  render(<App />);

  expect(screen.getByText(/AGENT LAB/)).toBeInTheDocument();
  expect(screen.getByText('Agent Runtime View')).toBeInTheDocument();
});

test('uses warm light app shell and header styles', () => {
  const { container } = render(<App />);

  const shell = container.firstElementChild as HTMLElement;
  const header = container.querySelector('header') as HTMLElement;
  const title = screen.getByText(/AGENT LAB/);

  expect(shell.style.background).toBe('rgb(245, 241, 235)');
  expect(header.style.background).toBe('rgb(245, 241, 235)');
  expect(header.style.borderBottom).toContain('rgb(214, 207, 196)');
  expect(header).toHaveClass('mobile-compact-hidden');
  expect(title.style.color).toBe('rgb(26, 26, 26)');
  expect(screen.queryByText('Claude 3.5 Sonnet')).not.toBeInTheDocument();
  expect(screen.queryByText('32K')).not.toBeInTheDocument();
});

test('does not render legacy chat and scene entry points by default', () => {
  render(<App />);

  expect(screen.queryByTitle('上下文实验台(老界面)')).not.toBeInTheDocument();
  expect(screen.queryByText(/场景/)).not.toBeInTheDocument();
});

test('resumes a history session into agent runtime workspace', async () => {
  vi.mocked(dbApi.getSessionMessages).mockResolvedValue({
    messages: [{ role: 'user', content: 'hello', seq: 1 }],
    hasMoreBefore: false, hasMoreAfter: false, oldestSeq: 1, newestSeq: 1,
  } as Awaited<ReturnType<typeof dbApi.getSessionMessages>>);
  vi.mocked(dbApi.getSessionMessageIndex).mockResolvedValue({ items: [] } as Awaited<ReturnType<typeof dbApi.getSessionMessageIndex>>);

  render(<App />);

  fireEvent.click(screen.getByTitle('历史会话'));
  expect(screen.getByText('History Page')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Mock Resume Session'));

  const state = useAgentRuntimeStore.getState();
  expect(state.currentAgentId).toBe('research');
  expect(state.workspaceSessionId).toBe('history-session');
  // resume 异步拉取消息窗口后 set 新 state,waitFor 内需每次 getState() 取新鲜引用;
  // toWorkspaceMessages 映射为 {role,content,seq},只断言语义字段 role/content
  await waitFor(() => {
    const messages = useAgentRuntimeStore.getState().workspaceMessages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'hello' });
  });
  expect(screen.getByText('Agent Runtime View')).toBeInTheDocument();
});
