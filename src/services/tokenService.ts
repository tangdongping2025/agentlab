// src/services/tokenService.ts
// 直接定义类型
interface TokenBreakdown {
  system: number;
  user: number;
  history: number;
  total: number;
}

export class TokenService {
  calculate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  breakdown(system: string, user: string, history: string): TokenBreakdown {
    const systemTokens = this.calculate(system);
    const userTokens = this.calculate(user);
    const historyTokens = this.calculate(history);

    return {
      system: systemTokens,
      user: userTokens,
      history: historyTokens,
      total: systemTokens + userTokens + historyTokens
    };
  }
}