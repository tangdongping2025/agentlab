import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SessionTaskNavigator from './SessionTaskNavigator';

describe('SessionTaskNavigator', () => {
  it('shows task count and derived task titles', () => {
    render(
      <SessionTaskNavigator
        messages={[
          { role: 'user', content: '帮我实现任务目录' },
          { role: 'assistant', content: '好的' },
          { role: 'user', content: '普通问题是什么？' },
          { role: 'user', content: '优化聊天定位体验' },
        ]}
        activeMessageIndex={null}
        onJumpToMessage={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '任务 2' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '任务 2' }));

    expect(screen.getByText('帮我实现任务目录')).toBeInTheDocument();
    expect(screen.getByText('优化聊天定位体验')).toBeInTheDocument();
    expect(screen.queryByText('普通问题是什么？')).not.toBeInTheDocument();
    expect(screen.getByText('第 1 条用户任务')).toBeInTheDocument();
    expect(screen.getByText('第 2 条用户任务')).toBeInTheDocument();
  });

  it('shows an empty state when there are no explicit tasks', () => {
    render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '这是什么？' }]}
        activeMessageIndex={null}
        onJumpToMessage={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '任务 0' }));

    expect(screen.getByText('本会话暂无明确任务')).toBeInTheDocument();
  });

  it('calls onJumpToMessage when clicking a task item', () => {
    const onJumpToMessage = vi.fn();

    render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '修改聊天窗口' }]}
        activeMessageIndex={null}
        onJumpToMessage={onJumpToMessage}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '任务 1' }));
    fireEvent.click(screen.getByRole('button', { name: /修改聊天窗口/ }));

    expect(onJumpToMessage).toHaveBeenCalledWith(0);
  });

  it('uses warm floating panel styles', () => {
    const { container } = render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '新增任务目录' }]}
        activeMessageIndex={0}
        onJumpToMessage={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '任务 1' }));

    const panel = container.querySelector('[data-testid="session-task-panel"]') as HTMLElement;
    const item = screen.getByRole('button', { name: /新增任务目录/ }) as HTMLElement;

    expect(panel.style.background).toBe('rgb(237, 232, 223)');
    expect(item.style.background).toBe('rgb(255, 255, 255)');
    expect(item.style.border).toContain('rgb(37, 99, 235)');
  });
});
