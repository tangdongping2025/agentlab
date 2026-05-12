// __tests__/utils/formatters.test.ts
import { formatNumber, formatTokenCount } from '../../src/utils/formatters';

describe('formatNumber', () => {
  test('should format numbers with thousands separators', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(12345)).toBe('12,345');
    expect(formatNumber(123456)).toBe('123,456');
  });

  test('should handle large numbers', () => {
    expect(formatNumber(1000000)).toBe('1,000,000');
    expect(formatNumber(123456789)).toBe('123,456,789');
  });
});

describe('formatTokenCount', () => {
  test('should format small token counts', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(999)).toBe('999');
  });

  test('should format large token counts', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(10000)).toBe('10.0k');
  });
});
