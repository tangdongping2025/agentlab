// 清洗发给 LLM 的消息列表：过滤空内容 + 合并连续同角色
// 根因：agentService 在无文本回复（仅 thinking / 被中断）时会 push 空内容消息，
// LLM API（Anthropic 兼容）拒绝空内容消息（400 "all messages must have non-empty content"）。

export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: any;
}

export interface RoleMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export function isEmptyContent(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length === 0;
  if (Array.isArray(content)) {
    if (content.length === 0) return true;
    // 所有块都是空文本 → 视为空；image/tool_use/tool_result 等块算有内容
    return content.every(b => {
      if (b == null || typeof b !== 'object') return true;
      if (b.type === 'text') return !(typeof b.text === 'string' && b.text.trim());
      return false;
    });
  }
  return false;
}

function mergeContent(a: RoleMessage['content'], b: RoleMessage['content']): RoleMessage['content'] {
  if (typeof a === 'string' && typeof b === 'string') return a + '\n' + b;
  // 混合类型（字符串 + 数组）：序列化拼接，保证不丢信息
  const aStr = typeof a === 'string' ? a : JSON.stringify(a);
  const bStr = typeof b === 'string' ? b : JSON.stringify(b);
  return aStr + '\n' + bStr;
}

export function sanitizeMessagesForApi(messages: RoleMessage[]): RoleMessage[] {
  // 1. 过滤空内容消息
  const nonEmpty = messages.filter(m => !isEmptyContent(m.content));
  // 2. 合并连续同角色，保证 user/assistant 交替（Anthropic 兼容 API 要求交替）
  const result: RoleMessage[] = [];
  for (const m of nonEmpty) {
    const last = result[result.length - 1];
    if (last && last.role === m.role) {
      last.content = mergeContent(last.content, m.content);
    } else {
      result.push({ role: m.role, content: m.content });
    }
  }
  return result;
}
