export const MAX_TOOL_RESULT_SIZE = 4096;
export const MAX_DISPLAY_RESULT_SIZE = 2048;

export function truncateResult(text: string, maxSize: number): string {
  if (!text || text.length <= maxSize) return text;
  const half = Math.floor(maxSize / 2) - 20;
  return text.slice(0, half) + `\n...[truncated, ${text.length} chars total]` + text.slice(-half);
}
