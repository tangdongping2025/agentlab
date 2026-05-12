// src/services/tokenService.ts
import { TokenBreakdown } from '../types';

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