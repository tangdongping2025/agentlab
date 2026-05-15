// src/utils/formatters.ts
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

export function formatTokenCount(num: number): string {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0';
  }

  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }

  return num.toString();
}
