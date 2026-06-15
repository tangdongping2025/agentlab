import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import TokenAllocation from './TokenAllocation';

const tokenService = new TokenService();

export default function TokenAllocationWrapper() {
  const { systemPrompt, lastUserInput, conversationHistory, apiInteractions, contextSize } = useAppStore();
  const systemTokens = tokenService.calculate(systemPrompt);
  const userTokens = tokenService.calculate(lastUserInput);
  const historyTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0);
  const apiTokens = apiInteractions.reduce((sum, api) => sum + tokenService.calculate(api.request.body) + (api.response ? tokenService.calculate(api.response.body) : 0), 0);
  const input = systemTokens + userTokens + historyTokens + apiTokens;
  return <TokenAllocation data={{ input, output: 0, contextSize }} />;
}
