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

    expect(screen.getByRole('button', { name: '任务 3' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '任务 3' }));

    expect(screen.getByText('帮我实现任务目录')).toBeInTheDocument();
    expect(screen.getByText('普通问题是什么？')).toBeInTheDocument();
    expect(screen.getByText('优化聊天定位体验')).toBeInTheDocument();
    expect(screen.getByText('第 1 条用户任务')).toBeInTheDocument();
    expect(screen.getByText('第 2 条用户任务')).toBeInTheDocument();
    expect(screen.getByText('第 3 条用户任务')).toBeInTheDocument();
  });

  it('shows an empty state when there are no user messages', () => {
    render(
      <SessionTaskNavigator
        messages={[{ role: 'assistant', content: '这是一条回复' }]}
        activeMessageIndex={null}
        onJumpToMessage={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '任务 0' }));

    expect(screen.getByText('本会话暂无用户任务')).toBeInTheDocument();
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

  it('collapses the task panel after selecting a task item', () => {
    const onJumpToMessage = vi.fn();

    render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '修改聊天窗口' }]}
        activeMessageIndex={null}
        onJumpToMessage={onJumpToMessage}
      />
    );

    const toggle = screen.getByRole('button', { name: '任务 1' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: /修改聊天窗口/ }));

    expect(onJumpToMessage).toHaveBeenCalledWith(0);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('session-task-panel')).not.toBeInTheDocument();
  });

  it('exposes expanded state, panel linkage, and current task state', () => {
    const { container } = render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '新增任务目录' }]}
        activeMessageIndex={0}
        onJumpToMessage={vi.fn()}
      />
    );

    const toggle = screen.getByRole('button', { name: '任务 1' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'session-task-panel');

    fireEvent.click(toggle);

    const navigator = container.querySelector('[data-testid="session-task-navigator"]') as HTMLElement;
    const panel = container.querySelector('[data-testid="session-task-panel"]') as HTMLElement;
    const item = screen.getByRole('button', { name: /新增任务目录/ }) as HTMLElement;

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(navigator.style.position).toBe('sticky');
    expect(navigator.style.top).toBe('10px');
    expect(panel).toHaveAttribute('id', 'session-task-panel');
    expect(panel.style.width).toBe('208px');
    expect(item).toHaveAttribute('aria-current', 'true');
  });
});
