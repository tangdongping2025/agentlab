// src/utils/formatters.ts
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

export function formatTokenCount(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
}
