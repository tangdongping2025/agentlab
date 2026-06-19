import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { useAgentRuntimeStore } from './stores/agentRuntimeStore';

vi.mock('./services/migration', () => ({
  migrateIfPending: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./services/sessionService', () => ({
  sessionService: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

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
  const modelBadge = screen.getByText('Claude 3.5 Sonnet');

  expect(shell.style.background).toBe('rgb(245, 241, 235)');
  expect(header.style.background).toBe('rgb(245, 241, 235)');
  expect(header.style.borderBottom).toContain('rgb(214, 207, 196)');
  expect(title.style.color).toBe('rgb(26, 26, 26)');
  expect(modelBadge.style.background).toBe('rgb(255, 255, 255)');
  expect(modelBadge.style.border).toContain('rgb(214, 207, 196)');
});

test('does not render legacy chat and scene entry points by default', () => {
  render(<App />);

  expect(screen.queryByTitle('上下文实验台(老界面)')).not.toBeInTheDocument();
  expect(screen.queryByText(/场景/)).not.toBeInTheDocument();
});

test('resumes a history session into agent runtime workspace', () => {
  render(<App />);

  fireEvent.click(screen.getByTitle('历史会话'));
  expect(screen.getByText('History Page')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Mock Resume Session'));

  const state = useAgentRuntimeStore.getState();
  expect(state.currentAgentId).toBe('research');
  expect(state.workspaceSessionId).toBe('history-session');
  expect(state.workspaceMessages).toEqual([{ role: 'user', content: 'hello' }]);
  expect(screen.getByText('Agent Runtime View')).toBeInTheDocument();
});
