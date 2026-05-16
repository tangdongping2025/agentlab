// src/services/agentService.ts
// 直接使用 Anthropic API 而不是 SDK，因为 SDK 不支持浏览器环境

interface Message {
  role: 'user' | 'assistant';
  content: string | Array<any>; // 支持多内容类型
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'tool_use' | 'tool_result'; [key: string]: any }>;
}

interface ClaudeTool {
  name: string;
  description: string;
  input_schema: any;
}

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: ClaudeMessage[];
  temperature?: number;
  tools?: ClaudeTool[];
  tool_choice?: 'auto' | 'none' | { type: 'tool' | 'function'; function?: { name: string }; tool?: { name: string } };
}

interface ClaudeResponse {
  content: Array<{ type: 'text' | 'tool_use'; [key: string]: any }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason?: string;
}

interface TimelineCallbacks {
  onUserInput: (text: string, tokenCount: number, conversationTurns: number) => void;
  onApiRequestStart: (url: string, model: string, contextBreakdown: { section: string; tokenCount: number; percentage: number }[], requestBody: string) => void;
  onApiResponseReceived: (statusCode: number, duration: number, tokenUsage: { input: number; output: number }, responseType: 'tool_call' | 'final_response' | 'error', responseBody: string) => void;
  onToolCallDetected: (toolName: string, toolDescription: string, parameters: Record<string, any>, reasoning: string) => void;
  onToolResultReady: (toolName: string, result: any, reorganizedContext: string) => void;
  onAgentResponse: (text: string, tokenUsage: { input: number; output: number }, toolsUsed: string[], apiCallCount: number) => void;
}

export class AgentService {
  private apiKey: string | null = null;
  private baseURL: string = 'https://api.anthropic.com';
  private model: string = 'claude-3-5-sonnet-20240620';
  private maxTokens: number = 4096;
  private conversationHistory: ClaudeMessage[] = [];
  private isInitialized = false;
  private useTools = true; // 启用工具调用功能
  private timelineCallbacks: TimelineCallbacks | null = null;
  private apiCallCount = 0;

  // API记录方法（可选）
  private addApiRequest?: (url: string, headers: Record<string, string>, body: string) => string;
  private addApiResponse?: (id: string, status: number, headers: Record<string, string>, body: string, duration: number) => void;

  // 工具调用详细信息记录方法
  private recordToolInteraction?: (
    stepId: string,
    toolName: string,
    toolDescription: string,
    parameters: any,
    callContext: any,
    toolOutput: any,
    reasoning: string,
    reorganizedContext: string
  ) => void;

  // 注入API记录方法
  setApiRecordingMethods(addApiRequest?: (url: string, headers: Record<string, string>, body: string) => string,
                       addApiResponse?: (id: string, status: number, headers: Record<string, string>, body: string, duration: number) => void) {
    this.addApiRequest = addApiRequest;
    this.addApiResponse = addApiResponse;
  }

  // 设置工具记录方法
  setToolRecordingMethods(
    recordToolInteraction?: (
      stepId: string,
      toolName: string,
      toolDescription: string,
      parameters: any,
      callContext: any,
      toolOutput: any,
      reasoning: string,
      reorganizedContext: string
    ) => void
  ) {
    this.recordToolInteraction = recordToolInteraction;
  }

  setTimelineCallbacks(callbacks: TimelineCallbacks) {
    this.timelineCallbacks = callbacks;
  }

  // 设置工具开关（用于调试）
  setUseTools(enabled: boolean) {
    this.useTools = enabled;
    console.log(`Tool usage ${enabled ? 'enabled' : 'disabled'}`);
  }

  // 工具定义 - 与 UI 配置保持一致，符合 Claude API 要求
  private toolDefinitions: Record<string, ClaudeTool> = {
    'xueqiu-search': {
      name: 'xueqiu-search',
      description: '在雪球上搜索股票、基金、投资信息',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' }
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    'xueqiu-quote': {
      name: 'xueqiu-quote',
      description: '获取实时股票行情、涨跌幅、成交量信息',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: '股票代码' }
        },
        required: ['symbol'],
        additionalProperties: false
      }
    },
    'xueqiu-news': {
      name: 'xueqiu-news',
      description: '获取最新财经新闻、公司公告、研报信息',
      input_schema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '新闻分类' }
        },
        required: ['category'],
        additionalProperties: false
      }
    },
    'tradingview-chart': {
      name: 'tradingview-chart',
      description: '查看TradingView图表进行技术分析',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: '股票代码' },
          interval: { type: 'string', description: '时间周期' }
        },
        required: ['symbol'],
        additionalProperties: false
      }
    },
    'akshare-data': {
      name: 'akshare-data',
      description: '使用AkShare获取各种金融市场数据',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: '数据类型' },
          symbol: { type: 'string', description: '股票代码' }
        },
        required: ['type'],
        additionalProperties: false
      }
    },
    'akshare-indicator': {
      name: 'akshare-indicator',
      description: '计算各种技术指标、财务指标',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: '股票代码' },
          indicator: { type: 'string', description: '指标类型' }
        },
        required: ['symbol', 'indicator'],
        additionalProperties: false
      }
    }
  };

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // 模拟工具执行（真实场景需要实际调用外部API）
  private async executeTool(toolName: string, params: any): Promise<string> {
    console.log(`Executing tool: ${toolName} with params:`, params);

    switch (toolName) {
      case 'xueqiu-search':
        const query = params.query || '';
        return JSON.stringify({
          results: [
            { title: `雪球搜索结果: ${query}`, snippet: '贵州茅台：最新股价1800元，市值2.2万亿' },
            { title: '相关股票', snippet: '五粮液、泸州老窖、洋河股份' }
          ],
          source: 'Context Lab Mock Xueqiu Search'
        });
      case 'xueqiu-quote':
        const symbol = params.symbol || 'AAPL';
        return JSON.stringify({
          symbol: symbol,
          price: 1800.50,
          change: '+2.5%',
          volume: '12.5M',
          marketCap: '2.2T',
          high: 1820.00,
          low: 1780.00,
          updateTime: new Date().toLocaleString()
        });
      case 'xueqiu-news':
        const category = params.category || 'all';
        return JSON.stringify({
          category: category,
          news: [
            { title: '茅台发布2024年财报：营收增长15%', time: '2小时前' },
            { title: 'A股市场整体回暖，上证指数突破3000点', time: '5小时前' }
          ],
          source: 'Context Lab Mock News'
        });
      case 'tradingview-chart':
        const tvSymbol = params.symbol || 'AAPL';
        const interval = params.interval || '1d';
        return JSON.stringify({
          symbol: tvSymbol,
          interval: interval,
          chartUrl: `https://www.tradingview.com/chart?symbol=${tvSymbol}`,
          indicators: ['MA20', 'MA60', 'RSI'],
          signal: '买入'
        });
      case 'akshare-data':
        const dataType = params.type || 'stock';
        const akSymbol = params.symbol || '';
        return JSON.stringify({
          type: dataType,
          symbol: akSymbol,
          data: [
            { date: '2024-01-01', open: 1800, close: 1820, high: 1830, low: 1790, volume: 10000000 },
            { date: '2024-01-02', open: 1820, close: 1810, high: 1825, low: 1800, volume: 9500000 }
          ]
        });
      case 'akshare-indicator':
        const indSymbol = params.symbol || 'AAPL';
        const indicator = params.indicator || 'MA';
        return JSON.stringify({
          symbol: indSymbol,
          indicator: indicator,
          value: indicator === 'MA' ? 1850.50 : indicator === 'RSI' ? 65.5 : 2.5,
          signal: indicator === 'RSI' ? '中性' : '看涨',
          calculationTime: new Date().toLocaleString()
        });
      default:
        return JSON.stringify({ error: 'Unknown tool', tool: toolName });
    }
  }

  // 初始化配置
  initialize(config: {
    apiKey: string;
    baseURL?: string;
    model?: string;
    maxTokens?: number;
  }): void {
    try {
      console.log('Initializing Agent Service with Anthropic API...');

      if (!config.apiKey || config.apiKey === 'your_claude_api_key_here') {
        throw new Error('Please configure your Claude API key in the .env file');
      }

      this.apiKey = config.apiKey;
      this.baseURL = config.baseURL || 'https://api.anthropic.com';
      this.model = config.model || 'claude-3-5-sonnet-20240620';
      this.maxTokens = config.maxTokens || 4096;
      this.isInitialized = true;
      this.apiCallCount = 0;

      console.log(`Agent Service initialized successfully:
- Base URL: ${this.baseURL}
- Model: ${this.model}
- Max Tokens: ${this.maxTokens}
- Tools Enabled: ${this.useTools}`);
    } catch (error) {
      console.error('Error initializing Agent Service:', error);
      this.isInitialized = false;
      throw new Error(`Failed to initialize Agent: ${(error as Error).message}`);
    }
  }

  // 检查是否已初始化
  isAgentInitialized(): boolean {
    return this.isInitialized && this.apiKey !== null;
  }

  // 清除对话历史
  clearHistory(): void {
    this.conversationHistory = [];
    this.apiCallCount = 0;
  }

  // 获取对话历史（简化格式）
  getHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.conversationHistory.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : '[结构化内容]'
    }));
  }

  // 发送消息 - 支持工具调用的完整实现
  async sendMessage(
    message: string,
    systemPrompt: string,
    tools?: string[],
    contextStrategy: string = 'full'
  ): Promise<string> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('Agent Service not initialized. Please configure your Claude API key in the .env file.');
    }

    try {
      // 添加用户消息到历史
      this.conversationHistory.push({ role: 'user', content: message });

      // 构建工具列表
      let availableTools: ClaudeTool[] = [];
      if (this.useTools && tools && tools.length > 0) {
        for (const toolId of tools) {
          if (this.toolDefinitions[toolId]) {
            availableTools.push(this.toolDefinitions[toolId]);
          }
        }
      }

      // Callback: user input
      if (this.timelineCallbacks) {
        const userTokenCount = this.estimateTokens(message);
        const turns = this.conversationHistory.filter(m => m.role === 'user').length;
        this.timelineCallbacks.onUserInput(message, userTokenCount, turns);
      }

      // Track API calls for this message
      this.apiCallCount = 0;

      // 执行完整的交互循环
      let finalResponse = '';
      let shouldContinue = true;
      let loopCount = 0;
      const maxLoops = 5;
      const toolsUsedInSession: string[] = [];

      while (shouldContinue && loopCount < maxLoops) {
        loopCount++;
        this.apiCallCount++;

        let messagesToSend: ClaudeMessage[];
        if (contextStrategy === 'sliding') {
          messagesToSend = this.getSlidingWindowMessages();
        } else {
          messagesToSend = [...this.conversationHistory];
        }

        const request: ClaudeRequest = {
          model: this.model,
          max_tokens: this.maxTokens,
          messages: messagesToSend,
          temperature: 0.7
        };

        if (systemPrompt && systemPrompt.trim()) {
          request.system = systemPrompt;
        }

        if (availableTools.length > 0) {
          request.tools = availableTools;
        }

        const url = '/api/anthropic/v1/messages';
        const requestBody = JSON.stringify(request);
        const requestHeaders = {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey ? 'sk-***' : '',
          'anthropic-version': '2023-06-01',
          'User-Agent': 'Context-Lab/1.0.0'
        };

        // Callback: API request start with context breakdown
        if (this.timelineCallbacks) {
          const sysTokens = systemPrompt ? this.estimateTokens(systemPrompt) : 0;
          const histTokens = messagesToSend.reduce((sum, m) =>
            sum + this.estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
          const toolTokens = availableTools.reduce((sum, t) =>
            sum + this.estimateTokens(JSON.stringify(t.input_schema)), 0);
          const totalTokens = sysTokens + histTokens + toolTokens;

          this.timelineCallbacks.onApiRequestStart(
            url,
            this.model,
            [
              { section: '系统提示词', tokenCount: sysTokens, percentage: totalTokens > 0 ? Math.round(sysTokens / totalTokens * 100) : 0 },
              { section: '对话历史', tokenCount: histTokens, percentage: totalTokens > 0 ? Math.round(histTokens / totalTokens * 100) : 0 },
              { section: '工具列表', tokenCount: toolTokens, percentage: totalTokens > 0 ? Math.round(toolTokens / totalTokens * 100) : 0 },
            ],
            requestBody
          );
        }

        // Record API request
        let apiInteractionId: string | null = null;
        if (this.addApiRequest) {
          apiInteractionId = this.addApiRequest(url, requestHeaders, requestBody);
        }

        const startTime = Date.now();

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: requestBody
        });

        const duration = Date.now() - startTime;

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const responseBody = await response.text();

        // Record API response
        if (this.addApiResponse && apiInteractionId) {
          this.addApiResponse(apiInteractionId, response.status, responseHeaders, responseBody, duration);
        }

        if (!response.ok) {
          // Callback: API error response
          if (this.timelineCallbacks) {
            this.timelineCallbacks.onApiResponseReceived(response.status, duration, { input: 0, output: 0 }, 'error', responseBody);
          }
          throw new Error(`API request failed: ${response.status} - ${responseBody}`);
        }

        const data: ClaudeResponse = JSON.parse(responseBody);

        // 检查是否需要工具调用
        const hasToolUse = data.content.some(c => c.type === 'tool_use');

        // Callback: API response received
        if (this.timelineCallbacks) {
          this.timelineCallbacks.onApiResponseReceived(
            response.status,
            duration,
            { input: data.usage.input_tokens, output: data.usage.output_tokens },
            hasToolUse ? 'tool_call' : 'final_response',
            responseBody
          );
        }

        if (hasToolUse && this.useTools) {
          this.conversationHistory.push({
            role: 'assistant',
            content: data.content
          });

          const toolResults: Array<any> = [];

          for (const contentItem of data.content) {
            if (contentItem.type === 'tool_use') {
              const toolName = contentItem.name;
              const toolParams = contentItem.input || {};
              const tool = this.toolDefinitions[toolName];
              const toolDescription = tool?.description || '';
              const reasoning = '根据用户查询，我需要调用工具获取最新信息';

              // Callback: tool call detected
              if (this.timelineCallbacks) {
                this.timelineCallbacks.onToolCallDetected(toolName, toolDescription, toolParams, reasoning);
              }

              const toolResult = await this.executeTool(toolName, toolParams);

              toolResults.push({
                type: 'tool_result',
                tool_use_id: contentItem.id,
                content: toolResult
              });

              if (!toolsUsedInSession.includes(toolName)) {
                toolsUsedInSession.push(toolName);
              }

              // Build reorganized context
              const reorganizedContext = `系统提示词:\n${systemPrompt || ''}\n\n工具结果:\n${JSON.stringify(toolResult, null, 2)}`;

              // Callback: tool result ready
              if (this.timelineCallbacks) {
                this.timelineCallbacks.onToolResultReady(toolName, toolResult, reorganizedContext);
              }

              // Record tool interaction (backward compat)
              if (this.recordToolInteraction) {
                const userQuery = this.conversationHistory.find(m => m.role === 'user')?.content as string || '';
                const callContext = {
                  systemPrompt: systemPrompt || '',
                  userQuery,
                  conversationHistory: this.conversationHistory.slice(0, -1).map(m =>
                    `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
                  ),
                };
                this.recordToolInteraction('tool-call', toolName, toolDescription, toolParams, callContext, toolResult, reasoning, reorganizedContext);
              }
            }
          }

          this.conversationHistory.push({
            role: 'user',
            content: toolResults
          });

          shouldContinue = true;
          continue;
        } else {
          const responseText = data.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');

          this.conversationHistory.push({
            role: 'assistant',
            content: data.content
          });

          // Callback: agent final response
          if (this.timelineCallbacks) {
            this.timelineCallbacks.onAgentResponse(
              responseText,
              { input: data.usage.input_tokens, output: data.usage.output_tokens },
              toolsUsedInSession,
              this.apiCallCount
            );
          }

          finalResponse = responseText;
          shouldContinue = false;
        }
      }

      return finalResponse;
    } catch (error) {
      console.error('Error sending message to Anthropic API:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Could not connect to Anthropic API. Please check your internet connection.');
      }
      throw new Error(`Failed to send message: ${(error as Error).message}`);
    }
  }

  // 获取滑动窗口消息（保留最近的对话）
  private getSlidingWindowMessages(): ClaudeMessage[] {
    // 滑动窗口策略：最多保留 10 条消息
    const maxMessages = 10;
    const start = Math.max(0, this.conversationHistory.length - maxMessages);
    return this.conversationHistory.slice(start);
  }

  // 断开连接（清理资源）
  async disconnect(): Promise<void> {
    this.conversationHistory = [];
    this.apiKey = null;
    this.isInitialized = false;
  }
}

// 创建单例实例
export const agentService = new AgentService();