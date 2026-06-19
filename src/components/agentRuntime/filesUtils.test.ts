import { describe, it, expect, beforeEach } from 'vitest';
import {
  parentDir,
  isText,
  isUnderRoot,
  resolveCwdForRoot,
  saveCwdMemory,
  loadCwdMemory,
  saveCwdHistoryMemory,
  loadCwdHistoryMemory,
} from './filesUtils';

describe('parentDir', () => {
  it('strips last path segment (forward slash)', () => {
    expect(parentDir('D:/proj/sub')).toBe('D:/proj');
  });
  it('strips last path segment (backslash)', () => {
    expect(parentDir('D:\\proj\\sub')).toBe('D:\\proj');
  });
  it('returns empty for top-level drive', () => {
    expect(parentDir('D:')).toBe('');
  });
  it('returns empty when no separator', () => {
    expect(parentDir('foo')).toBe('');
  });
});

describe('isText', () => {
  it('true for text extensions', () => {
    expect(isText('a.py')).toBe(true);
    expect(isText('README.md')).toBe(true);
    expect(isText('config.json')).toBe(true);
  });
  it('false for non-text extensions', () => {
    expect(isText('a.docx')).toBe(false);
    expect(isText('a.pdf')).toBe(false);
    expect(isText('a.png')).toBe(false);
  });
  it('case-insensitive', () => {
    expect(isText('A.PY')).toBe(true);
  });
});

describe('isUnderRoot', () => {
  it('rootDir 自身视为在内', () => {
    expect(isUnderRoot('D:/proj', 'D:/proj')).toBe(true);
  });
  it('子路径(/ 风格)在内', () => {
    expect(isUnderRoot('D:/proj/sub', 'D:/proj')).toBe(true);
  });
  it('子路径(\\ 风格)在内', () => {
    expect(isUnderRoot('D:\\proj\\sub', 'D:\\proj')).toBe(true);
  });
  it('不同根不在内', () => {
    expect(isUnderRoot('/workspace/x', 'D:/proj')).toBe(false);
  });
  it('前缀匹配但非子目录:不在内(防 D:/projX 误判)', () => {
    expect(isUnderRoot('D:/projX', 'D:/proj')).toBe(false);
  });
});

describe('resolveCwdForRoot', () => {
  it('当前 cwd 在 rootDir 下:返回当前 cwd', () => {
    expect(resolveCwdForRoot('D:/proj/a', 'D:/proj', 'D:/proj/m')).toBe('D:/proj/a');
  });
  it('当前 cwd 不在 + memory 在:返回 memory', () => {
    expect(resolveCwdForRoot('/workspace/x', 'D:/proj', 'D:/proj/m')).toBe('D:/proj/m');
  });
  it('当前 cwd 不在 + memory 也不在:返回空串', () => {
    expect(resolveCwdForRoot('/workspace/x', 'D:/proj', '/old/m')).toBe('');
  });
  it('当前 cwd 不在 + 无 memory:返回空串', () => {
    expect(resolveCwdForRoot('/workspace/x', 'D:/proj', null)).toBe('');
  });
  it('当前 cwd 为空 + 有 memory:返回 memory', () => {
    expect(resolveCwdForRoot('', 'D:/proj', 'D:/proj/m')).toBe('D:/proj/m');
  });
  it('当前 cwd 为空 + 无 memory:返回空串', () => {
    expect(resolveCwdForRoot('', 'D:/proj', null)).toBe('');
  });
});

describe('cwd memory localStorage 包装', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('saveCwdMemory + loadCwdMemory 往返', () => {
    saveCwdMemory('D:/proj', 'D:/proj/sub');
    expect(loadCwdMemory('D:/proj')).toBe('D:/proj/sub');
  });
  it('loadCwdMemory 不存在返回 null', () => {
    expect(loadCwdMemory('D:/no')).toBeNull();
  });
  it('不同 rootDir 互不干扰', () => {
    saveCwdMemory('D:/proj', 'D:/proj/a');
    saveCwdMemory('/workspace', '/workspace/b');
    expect(loadCwdMemory('D:/proj')).toBe('D:/proj/a');
    expect(loadCwdMemory('/workspace')).toBe('/workspace/b');
  });
  it('saveCwdHistoryMemory + loadCwdHistoryMemory 往返', () => {
    saveCwdHistoryMemory('D:/proj', ['D:/proj/a', 'D:/proj/b']);
    expect(loadCwdHistoryMemory('D:/proj')).toEqual(['D:/proj/a', 'D:/proj/b']);
  });
  it('loadCwdHistoryMemory 不存在返回空数组', () => {
    expect(loadCwdHistoryMemory('D:/no')).toEqual([]);
  });
  it('loadCwdHistoryMemory 损坏 JSON 返回空数组(不抛)', () => {
    localStorage.setItem('agentlab.cwdHistory:D:/proj', 'not-json');
    expect(loadCwdHistoryMemory('D:/proj')).toEqual([]);
  });
});
