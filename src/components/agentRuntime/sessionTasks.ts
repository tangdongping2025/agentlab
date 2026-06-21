export interface ChatMessageLike {
  role: 'user' | 'assistant';
  content: string;
  seq?: number;
}

export interface SessionTask {
  id: string;
  messageIndex: number;
  taskNumber: number;
  title: string;
}

const MAX_TASK_TITLE_LENGTH = 36;

function createTaskTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0].trim();
  if (firstLine.length <= MAX_TASK_TITLE_LENGTH) return firstLine;
  return `${firstLine.slice(0, MAX_TASK_TITLE_LENGTH)}…`;
}

export function deriveSessionTasks(messages: ChatMessageLike[]): SessionTask[] {
  const tasks: SessionTask[] = [];

  messages.forEach((message, messageIndex) => {
    if (message.role !== 'user') return;

    tasks.push({
      id: `task-${messageIndex}`,
      messageIndex,
      taskNumber: tasks.length + 1,
      title: createTaskTitle(message.content),
    });
  });

  return tasks;
}
