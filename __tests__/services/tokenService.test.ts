// __tests__/services/tokenService.test.ts
import { TokenService } from '../../src/services/tokenService';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService();
  });

  test('should calculate token count for simple text', () => {
    const text = 'Hello, world!';
    const tokens = tokenService.calculate(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test('should calculate token breakdown', () => {
    const systemPrompt = 'System prompt';
    const userInput = 'User input';
    const history = 'History messages';

    const breakdown = tokenService.breakdown(systemPrompt, userInput, history);

    expect(breakdown.system).toBeDefined();
    expect(breakdown.user).toBeDefined();
    expect(breakdown.history).toBeDefined();
    expect(breakdown.total).toBe(
      breakdown.system + breakdown.user + breakdown.history
    );
  });

  test('should return 0 for empty string', () => {
    const tokens = tokenService.calculate('');
    expect(tokens).toBe(0);
  });

  test('should handle long text', () => {
    const longText = 'Test'.repeat(1000);
    const tokens = tokenService.calculate(longText);
    expect(tokens).toBeGreaterThan(0);
  });
});