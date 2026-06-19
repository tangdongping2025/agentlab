import { describe, expect, it } from 'vitest';
import { deriveSessionTasks } from './sessionTasks';

describe('deriveSessionTasks', () => {
  it('creates tasks from user messages with explicit action intent', () => {
    const tasks = deriveSessionTasks([
      { role: 'user', content: '帮我实现会话内任务浮层目录' },
      { role: 'assistant', content: '好的' },
      { role: 'user', content: '修改默认工作台状态栏信息' },
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
        title: '修改默认工作台状态栏信息',
      },
    ]);
  });

  it('does not create tasks from normal questions or assistant messages', () => {
    const tasks = deriveSessionTasks([
      { role: 'user', content: '这个功能是什么意思？' },
      { role: 'assistant', content: '解释一下' },
      { role: 'user', content: '今天状态怎么样' },
    ]);

    expect(tasks).toEqual([]);
  });

  it('uses the first line as title and truncates long titles', () => {
    const tasks = deriveSessionTasks([
      {
        role: 'user',
        content: '优化这个特别特别特别特别特别特别特别特别特别特别长的聊天窗口定位体验\n第二行细节',
      },
    ]);

    expect(tasks[0].title).toBe('优化这个特别特别特别特别特别特别特别特别特别特别长的聊天窗口定位体验…');
  });
});
