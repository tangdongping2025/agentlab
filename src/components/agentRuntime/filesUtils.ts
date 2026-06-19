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

// 判断 cwd 是否在 rootDir 范围内(含 rootDir 自身;支持 / 和 \ 两种分隔符)。
// 注意防前缀误判:rootDir="D:/proj" 时 "D:/projX" 不算在内。
export function isUnderRoot(cwd: string, rootDir: string): boolean {
  if (!cwd || !rootDir) return false;
  if (cwd === rootDir) return true;
  return cwd.startsWith(rootDir + '/') || cwd.startsWith(rootDir + '\\');
}

export function resolveCwdForRoot(
  currentCwd: string,
  rootDir: string,
  memoryCwd: string | null,
): string {
  if (currentCwd && isUnderRoot(currentCwd, rootDir)) return currentCwd;
  if (memoryCwd && isUnderRoot(memoryCwd, rootDir)) return memoryCwd;
  return '';
}

// localStorage key 前缀:避免与其他应用冲突
const CWD_KEY_PREFIX = 'agentlab.cwd:';
const CWD_HIST_KEY_PREFIX = 'agentlab.cwdHistory:';

export function loadCwdMemory(rootDir: string): string | null {
  if (!rootDir) return null;
  return localStorage.getItem(CWD_KEY_PREFIX + rootDir);
}

export function saveCwdMemory(rootDir: string, cwd: string): void {
  if (!rootDir || !cwd) return;
  localStorage.setItem(CWD_KEY_PREFIX + rootDir, cwd);
}

export function loadCwdHistoryMemory(rootDir: string): string[] {
  if (!rootDir) return [];
  const raw = localStorage.getItem(CWD_HIST_KEY_PREFIX + rootDir);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCwdHistoryMemory(rootDir: string, hist: string[]): void {
  if (!rootDir) return;
  localStorage.setItem(CWD_HIST_KEY_PREFIX + rootDir, JSON.stringify(hist));
}
