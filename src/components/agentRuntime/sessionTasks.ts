export interface ChatMessageLike {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionTask {
  id: string;
  messageIndex: number;
  taskNumber: number;
  title: string;
}

const ACTION_KEYWORDS = [
  '实现',
  '修改',
  '优化',
  '修复',
  '设计',
  '更新',
  '添加',
  '新增',
  '删除',
  '调整',
  '生成',
  '帮我',
];

const MAX_TASK_TITLE_LENGTH = 36;

function createTaskTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0].trim();
  if (firstLine.length <= MAX_TASK_TITLE_LENGTH) return firstLine;
  return `${firstLine.slice(0, MAX_TASK_TITLE_LENGTH)}…`;
}

function hasActionIntent(content: string): boolean {
  return ACTION_KEYWORDS.some(keyword => content.includes(keyword));
}

export function deriveSessionTasks(messages: ChatMessageLike[]): SessionTask[] {
  const tasks: SessionTask[] = [];

  messages.forEach((message, messageIndex) => {
    if (message.role !== 'user') return;
    if (!hasActionIntent(message.content)) return;

    tasks.push({
      id: `task-${messageIndex}`,
      messageIndex,
      taskNumber: tasks.length + 1,
      title: createTaskTitle(message.content),
    });
  });

  return tasks;
}
