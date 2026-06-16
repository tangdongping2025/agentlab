// 取父目录:剥最后一段路径(支持 / 和 \);无分隔符(顶层/无路径)返回空串
export function parentDir(p: string): string {
  const m = p.replace(/[\\/][^\\/]+$/, '');
  return m === p ? '' : m;
}
