import { describe, it, expect } from 'vitest';
import { parentDir, isText } from './filesUtils';

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
