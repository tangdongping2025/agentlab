import { describe, it, expect } from 'vitest';
import { parentDir } from './filesUtils';

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
