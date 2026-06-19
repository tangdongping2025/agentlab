import { describe, expect, it } from 'vitest';
import { deriveSessionTasks } from './sessionTasks';

describe('deriveSessionTasks', () => {
  it('creates tasks from every user message', () => {
    const tasks = deriveSessionTasks([
      { role: 'user', content: '帮我实现会话内任务浮层目录' },
      { role: 'assistant', content: '好的' },
      { role: 'user', content: '这个功能是什么意思？' },
      { role: 'user', content: '可以使用 python 编一个五子棋游戏吗' },
    ]);

    expect(tasks).toEqual([
      {
        id: 'task-0',
        messageIndex: 0,
        taskNumber: 1,
        title: '帮我实现会话内任务浮层目录',
      },
      {
        id: 'task-2',
        messageIndex: 2,
        taskNumber: 2,
        title: '这个功能是什么意思？',
      },
      {
        id: 'task-3',
        messageIndex: 3,
        taskNumber: 3,
        title: '可以使用 python 编一个五子棋游戏吗',
      },
    ]);
  });

  it('does not create tasks from assistant messages', () => {
    const tasks = deriveSessionTasks([
      { role: 'assistant', content: '解释一下' },
    ]);

    expect(tasks).toEqual([]);
  });

  it('uses the trimmed first line as title for messages with leading blank lines', () => {
    const tasks = deriveSessionTasks([
      {
        role: 'user',
        content: '\n帮我实现任务导航',
      },
    ]);

    expect(tasks[0].title).toBe('帮我实现任务导航');
  });

  it('uses the first line as title without adding ellipsis for short multiline messages', () => {
    const tasks = deriveSessionTasks([
      {
        role: 'user',
        content: '优化聊天窗口定位体验\n第二行细节',
      },
    ]);

    expect(tasks[0].title).toBe('优化聊天窗口定位体验');
  });

  it('truncates overlong first-line titles and appends ellipsis', () => {
    const tasks = deriveSessionTasks([
      {
        role: 'user',
        content: '优化这个特别特别特别特别特别特别特别特别特别特别长的聊天窗口定位体验并继续补充更多需求',
      },
    ]);

    expect(tasks[0].title).toBe('优化这个特别特别特别特别特别特别特别特别特别特别长的聊天窗口定位体验并继…');
  });
});
