import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import HistoryPage from './HistoryPage';
import { dbApi } from '../services/dbApi';

vi.mock('../services/dbApi');
const mockedQuery = vi.mocked(dbApi.querySessions);
const mockedGet = vi.mocked(dbApi.getSession);
const mockedListInsights = vi.mocked(dbApi.listInsights);
const mockedCreateInsight = vi.mocked(dbApi.createInsight);
const mockedDeleteInsight = vi.mocked(dbApi.deleteInsight);
const mockedUpdateInsight = vi.mocked(dbApi.updateInsight);

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    mockedGet.mockResolvedValue({ id: '', messages: [] } as any);
    mockedListInsights.mockResolvedValue({ items: [] });
    mockedCreateInsight.mockResolvedValue({ id: 'i1', kind: 'habit', title: 'x', description: 'x', sourceSessionIds: [], status: 'accepted', enabledForPrompt: false });
    mockedDeleteInsight.mockResolvedValue({ ok: true });
    mockedUpdateInsight.mockResolvedValue({ id: 'i1', kind: 'habit', title: 'x', description: 'x', sourceSessionIds: [], status: 'accepted', enabledForPrompt: true });
  });

  it('renders recovery title, filter inputs, and back button', () => {
    render(<HistoryPage onBack={() => {}} />);
    expect(screen.getByText('历史会话')).toBeInTheDocument();
    expect(screen.getByText('找回上下文并继续工作')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/搜索关键词/)).toBeInTheDocument();
    expect(screen.getByText(/返回对话/)).toBeInTheDocument();
  });

  it('uses warm card shell and active tab styles', () => {
    const { container } = render(<HistoryPage onBack={() => {}} />);
    const shell = container.querySelector('[data-testid="history-page-shell"]') as HTMLElement;
    const activeTab = screen.getByRole('button', { name: '会话恢复' }) as HTMLButtonElement;

    expect(shell.style.background).toBe('rgb(245, 241, 235)');
    expect(activeTab.style.background).toBe('rgb(37, 99, 235)');
    expect(activeTab.style.color).toBe('rgb(255, 255, 255)');
    expect(screen.getByTestId('history-filter-card').style.background).toBe('rgb(255, 253, 249)');
  });

  it('calls onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(<HistoryPage onBack={onBack} />);
    fireEvent.click(screen.getByText(/返回对话/));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows results from query without token UI', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试会话', agentId: 'echo', preview: '你好', totalTokens: 100 }],
      total: 1, page: 1, size: 20,
    });
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText('测试会话')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('最小 token')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('最大 token')).not.toBeInTheDocument();
    expect(screen.queryByText(/tokens/i)).not.toBeInTheDocument();
  });

  it('renders session rows as readable cards with a clear selected state', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试会话', agentId: 'echo', preview: '你好', totalTokens: 100 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({ id: 's1', messages: [] } as any);

    render(<HistoryPage onBack={() => {}} />);
    const card = await screen.findByTestId('history-session-card-s1');

    expect(card.style.background).toBe('rgb(255, 253, 249)');
    expect(card.style.borderRadius).toBe('14px');

    fireEvent.click(card);

    expect(card.style.border).toContain('rgb(37, 99, 235)');
    expect(card.style.background).toBe('rgb(247, 242, 255)');
  });

  it('shows empty state when no results', async () => {
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText(/无匹配会话/)).toBeInTheDocument();
  });

  it('shows message timestamp in session detail', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试会话', agentId: 'echo', preview: 'hello', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 's1',
      messages: [{ role: 'user', content: 'hello', timestamp: '2026-06-18T01:02:00' }],
    } as any);

    render(<HistoryPage onBack={() => {}} />);
    fireEvent.click(await screen.findByText('测试会话'));

    expect(await screen.findByText('2026-06-18 01:02')).toBeInTheDocument();
  });

  it('renders detail messages as chat-style readable cards', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试会话', agentId: 'echo', preview: 'hello', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 's1',
      messages: [
        { role: 'user', content: 'hello', timestamp: '2026-06-18T01:02:00' },
        { role: 'assistant', content: 'world', timestamp: '2026-06-18T01:03:00' },
      ],
    } as any);

    render(<HistoryPage onBack={() => {}} />);
    fireEvent.click(await screen.findByText('测试会话'));

    const userCard = await screen.findByTestId('history-message-user-0');
    const assistantCard = await screen.findByTestId('history-message-assistant-1');

    expect(userCard.style.background).toBe('rgb(239, 246, 255)');
    expect(assistantCard.style.background).toBe('rgb(255, 253, 249)');
    expect(assistantCard.style.borderRadius).toBe('18px');
  });

  it('prioritizes detail reading width over the session list', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试会话', agentId: 'echo', preview: 'hello', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({ id: 's1', messages: [] } as any);

    render(<HistoryPage onBack={() => {}} />);
    fireEvent.click(await screen.findByText('测试会话'));

    const listPane = await screen.findByTestId('history-session-list-pane');
    const detailPane = await screen.findByTestId('history-detail-pane');

    expect(listPane.style.flex).toBe('0 0 360px');
    expect(detailPane.style.flex).toBe('1.4 1 0%');
  });

  it('uses high-contrast readable typography for detail message body', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试会话', agentId: 'echo', preview: 'hello', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 's1',
      messages: [{ role: 'assistant', content: '这是一段需要清晰阅读的历史会话正文。', timestamp: '2026-06-18T01:03:00' }],
    } as any);

    render(<HistoryPage onBack={() => {}} />);
    fireEvent.click(await screen.findByText('测试会话'));

    const body = await screen.findByTestId('history-message-body-0');

    expect(body.style.fontSize).toBe('16px');
    expect(body.style.lineHeight).toBe('1.85');
    expect(body.style.color).toBe('rgb(31, 41, 55)');
    expect(body.style.maxWidth).toBe('860px');
  });

  it('shows a task navigator in session detail and jumps to the selected task', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '长会话', agentId: 'echo', preview: 'hello', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 's1',
      agentId: 'echo',
      messages: [
        { role: 'user', content: '先整理需求背景', timestamp: '2026-06-18T01:02:00' },
        { role: 'assistant', content: '好的', timestamp: '2026-06-18T01:03:00' },
        { role: 'user', content: '再生成实施计划', timestamp: '2026-06-18T01:04:00' },
      ],
    } as any);

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.click(await screen.findByText('长会话'));

    const secondTaskCard = await screen.findByTestId('history-message-user-2');
    const scrollIntoView = vi.fn();
    secondTaskCard.scrollIntoView = scrollIntoView;

    const resumeButton = await screen.findByText('继续这个上下文');
    const taskButton = screen.getByRole('button', { name: '任务 2' });
    expect(resumeButton.compareDocumentPosition(taskButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(taskButton);

    let panel = await screen.findByTestId('session-task-panel');
    expect(within(panel).getByText('先整理需求背景')).toBeInTheDocument();
    fireEvent.click(within(panel).getByText('再生成实施计划').closest('button')!);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(screen.queryByTestId('session-task-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '任务 2' }));
    panel = await screen.findByTestId('session-task-panel');
    expect(within(panel).getByText('再生成实施计划').closest('button')).toHaveAttribute('aria-current', 'true');
  });

  it('calls onResumeSession with selected agent session detail', async () => {
    const onResumeSession = vi.fn();
    const messages = [{ role: 'user', content: '请研究一下' }];
    const detailSession = { id: 's1', name: '研究会话', agentId: 'research', messages, totalTokens: 10 };
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '研究会话', agentId: 'research', preview: '请研究一下', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue(detailSession as any);

    render(<HistoryPage onBack={() => {}} onResumeSession={onResumeSession} />);
    fireEvent.click(await screen.findByText('研究会话'));

    expect(await screen.findByText('会话信息')).toBeInTheDocument();
    expect(screen.getByText(/Session/)).toBeInTheDocument();
    expect(screen.queryByText(/Token：/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('继续这个上下文'));

    expect(onResumeSession).toHaveBeenCalledWith(detailSession);
  });

  it('does not show continue button for sessions without agentId', async () => {
    useAgentRuntimeStore.setState({ agents: [
      { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
    ] });
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '旧会话', preview: 'hello', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 's1',
      messages: [{ role: 'user', content: 'hello' }],
    } as any);

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'echo' } });
    fireEvent.click(await screen.findByText('旧会话'));

    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(screen.queryByText('继续这个上下文')).not.toBeInTheDocument();
  });

  it('queries with keyword when search input changes', async () => {
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    render(<HistoryPage onBack={() => {}} />);
    const input = screen.getByPlaceholderText(/搜索关键词/);
    fireEvent.change(input, { target: { value: '股票' } });
    // 等待 effect 触发的查询
    await screen.findByText(/无匹配会话/);
    expect(mockedQuery).toHaveBeenCalledWith(expect.objectContaining({ q: '股票' }));
  });

  it('shows read-only history insights with source sessions', async () => {
    mockedQuery.mockResolvedValue({
      items: [
        { id: 's1', name: '历史恢复设计', agentId: 'research', preview: '历史恢复 知识库', totalTokens: 100 },
        { id: 's2', name: '知识库素材讨论', agentId: 'research', preview: '计划 验证 知识库', totalTokens: 100 },
      ],
      total: 2, page: 1, size: 20,
    });
    mockedGet.mockImplementation(async (id: string) => ({
      id,
      name: id === 's1' ? '历史恢复设计' : '知识库素材讨论',
      agentId: 'research',
      messages: [
        { role: 'user', content: id === 's1' ? '先做设计和计划，验证历史恢复体验' : '关注知识库素材和 topic 沉淀' },
      ],
    } as any));

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.click(screen.getByText('历史洞察'));

    expect(screen.getByText('分析历史会话')).toBeInTheDocument();
    expect(screen.queryByText('使用习惯候选')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('分析历史会话'));

    expect(await screen.findByText('使用习惯候选')).toBeInTheDocument();
    expect(await screen.findByText('关注主题候选')).toBeInTheDocument();
    expect(screen.getByText('偏好先设计和计划')).toBeInTheDocument();
    expect(screen.getAllByText(/知识库/).length).toBeGreaterThan(0);
    expect(screen.getByText('重新分析')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('历史恢复设计')[0]);

    expect(await screen.findByText('会话信息')).toBeInTheDocument();
    expect(screen.getByText('继续这个上下文')).toBeInTheDocument();
  });

  it('shows an explicit empty result after analyzing history with no candidates', async () => {
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.click(screen.getByText('历史洞察'));
    fireEvent.click(screen.getByText('分析历史会话'));

    expect(await screen.findByText('未分析到候选洞察')).toBeInTheDocument();
  });

  it('accepts and ignores history insight candidates', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '历史恢复设计', agentId: 'research', preview: '历史恢复 知识库', totalTokens: 100 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 's1',
      name: '历史恢复设计',
      agentId: 'research',
      messages: [{ role: 'user', content: '先做设计和计划，验证历史恢复体验' }],
    } as any);

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.click(screen.getByText('历史洞察'));
    fireEvent.click(screen.getByText('分析历史会话'));

    expect(await screen.findByText('偏好先设计和计划')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('采纳为习惯')[0]);

    expect(mockedCreateInsight).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'habit',
      title: '偏好先设计和计划',
      status: 'accepted',
      sourceSessionIds: ['s1'],
    }));

    fireEvent.click(screen.getAllByText('采纳为知识素材')[0]);
    expect(mockedCreateInsight).toHaveBeenCalledWith(expect.objectContaining({ kind: 'knowledge', status: 'accepted' }));

    fireEvent.click(screen.getAllByText('忽略')[0]);
    expect(mockedCreateInsight).toHaveBeenCalledWith(expect.objectContaining({ status: 'ignored' }));
  });

  it('shows deposit library and opens source sessions', async () => {
    mockedListInsights.mockResolvedValue({
      items: [
        { id: 'i1', kind: 'habit', title: '偏好先设计和计划', description: '适合先明确方案再实现。', sourceSessionIds: ['s1'], status: 'accepted', enabledForPrompt: false },
        { id: 'i2', kind: 'knowledge', title: '知识库', description: '可作为后续知识库素材候选。', sourceSessionIds: ['s1'], status: 'accepted', enabledForPrompt: false },
      ],
    });
    mockedGet.mockResolvedValue({ id: 's1', name: '历史恢复设计', agentId: 'research', messages: [{ role: 'user', content: 'hello' }] } as any);

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.click(screen.getByText('沉淀库'));

    expect(await screen.findByText('用户习惯库')).toBeInTheDocument();
    expect(screen.getByText('知识素材池')).toBeInTheDocument();
    expect(screen.getByText('偏好先设计和计划')).toBeInTheDocument();
    expect(screen.getByText('知识库')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('s1')[0]);
    expect(await screen.findByText('会话信息')).toBeInTheDocument();
  });

  it('toggles habit prompt activation in deposit library', async () => {
    mockedListInsights.mockResolvedValue({
      items: [{
        id: 'i1',
        kind: 'habit',
        title: '偏好先设计和计划',
        description: '适合先明确方案再实现。',
        sourceSessionIds: ['s1'],
        status: 'accepted',
        enabledForPrompt: false,
      }],
    });

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.click(screen.getByText('沉淀库'));
    fireEvent.click(await screen.findByLabelText('用于智能体提示词'));

    expect(mockedUpdateInsight).toHaveBeenCalledWith('i1', { enabledForPrompt: true });
  });

  it('shows active status only for enabled habit prompt items', async () => {
    mockedListInsights.mockResolvedValue({
      items: [
        { id: 'i1', kind: 'habit', title: '偏好先设计和计划', description: '适合先明确方案再实现。', sourceSessionIds: ['s1'], status: 'accepted', enabledForPrompt: true },
        { id: 'i2', kind: 'knowledge', title: '知识库', description: '可作为后续知识库素材候选。', sourceSessionIds: ['s1'], status: 'accepted', enabledForPrompt: false },
      ],
    });

    render(<HistoryPage onBack={() => {}} onResumeSession={() => {}} />);
    fireEvent.click(screen.getByText('沉淀库'));

    expect(await screen.findByText('已生效')).toBeInTheDocument();
    expect(screen.getAllByLabelText('用于智能体提示词')).toHaveLength(1);
  });
});

import { useAgentRuntimeStore } from '../stores/agentRuntimeStore';

describe('HistoryPage agent filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    mockedGet.mockResolvedValue({ id: '', messages: [] } as any);
    mockedListInsights.mockResolvedValue({ items: [] });
    mockedCreateInsight.mockResolvedValue({ id: 'i1', kind: 'habit', title: 'x', description: 'x', sourceSessionIds: [], status: 'accepted', enabledForPrompt: false });
    mockedDeleteInsight.mockResolvedValue({ ok: true });
    mockedUpdateInsight.mockResolvedValue({ id: 'i1', kind: 'habit', title: 'x', description: 'x', sourceSessionIds: [], status: 'accepted', enabledForPrompt: true });
    // 注入应用库 agent 列表
    useAgentRuntimeStore.setState({ agents: [
      { id: 'claude-sdk', name: 'Claude SDK Agent', description: '', workspace: { type: 'chat' }, capabilities: [] },
      { id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] },
    ] });
  });

  it('renders agent filter dropdown', async () => {
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText(/全部 agent/i)).toBeInTheDocument();
  });

  it('shows agent tag on session item', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试', agentId: 'claude-sdk', preview: 'hi', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText('测试')).toBeInTheDocument();
    expect(screen.getAllByText('Claude SDK Agent').length).toBeGreaterThanOrEqual(1);  // agent 标签(下拉 option 也有同名)
  });
});
