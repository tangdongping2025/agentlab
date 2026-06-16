// 取父目录:剥最后一段路径(支持 / 和 \);无分隔符(顶层/无路径)返回空串
export function parentDir(p: string): string {
  const m = p.replace(/[\\/][^\\/]+$/, '');
  return m === p ? '' : m;
}

const TEXT_EXTS = ['.md', '.txt', '.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.yml', '.yaml', '.xml', '.html', '.css', '.csv', '.log', '.sh', '.ini', '.conf', '.toml', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.sql'];

// 文本文件判断(扩展名白名单,大小写不敏感)
export function isText(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXTS.some(ext => lower.endsWith(ext));
}
