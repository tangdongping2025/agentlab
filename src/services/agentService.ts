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

export class AgentService {
  private apiKey: string | null = null;
  private baseURL: string = 'https://api.anthropic.com';
  private model: string = 'claude-3-5-sonnet-20240620';
  private maxTokens: number = 4096;
  private conversationHistory: ClaudeMessage[] = [];
  private isInitialized = false;
  private useTools = true; // 启用工具调用功能

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
      console.log('Sending message to Anthropic API:', message);

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

      // 执行完整的交互循环，支持多次工具调用
      let finalResponse = '';
      let shouldContinue = true;
      let loopCount = 0;
      const maxLoops = 5; // 防止无限循环

      while (shouldContinue && loopCount < maxLoops) {
        loopCount++;
        console.log(`Interaction loop ${loopCount}`);

        // 根据上下文策略选择消息
        let messagesToSend: ClaudeMessage[];
        if (contextStrategy === 'sliding') {
          // 滑动窗口策略
          messagesToSend = this.getSlidingWindowMessages();
        } else {
          // 完整记忆策略
          messagesToSend = [...this.conversationHistory];
        }

        // 构建请求
        const request: ClaudeRequest = {
          model: this.model,
          max_tokens: this.maxTokens,
          messages: messagesToSend,
          temperature: 0.7
        };

        // 添加系统提示词
        if (systemPrompt && systemPrompt.trim()) {
          request.system = systemPrompt;
        }

        // 添加工具（如果有）
        if (availableTools.length > 0) {
          request.tools = availableTools;
        }

        console.log('Request payload:', {
          ...request,
          apiKey: '***',
          baseURL: this.baseURL
        });

        const startTime = Date.now();
        const url = `${this.baseURL}/v1/messages`;
        const requestBody = JSON.stringify(request);
        const requestHeaders = {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey ? 'sk-***' : '',
          'anthropic-version': '2023-06-01',
          'User-Agent': 'Context-Lab/1.0.0'
        };

        // 记录请求（如果有方法）
        let apiInteractionId: string | null = null;
        if (this.addApiRequest) {
          apiInteractionId = this.addApiRequest(url, {
            'Content-Type': 'application/json',
            'x-api-key': 'sk-***',
            'anthropic-version': '2023-06-01',
            'User-Agent': 'Context-Lab/1.0.0'
          }, requestBody);
        }

        // 发送请求到 Anthropic API
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'Context-Lab/1.0.0'
          },
          body: requestBody
        });

        const duration = Date.now() - startTime;

        // 获取响应头（简化）
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        // 获取响应体
        const responseBody = await response.text();

        // 记录响应（如果有方法）
        if (this.addApiResponse && apiInteractionId) {
          this.addApiResponse(apiInteractionId, response.status, responseHeaders, responseBody, duration);
        }

        if (!response.ok) {
          console.error('API Error:', response.status, responseBody);
          throw new Error(`API request failed: ${response.status} - ${responseBody}`);
        }

        const data: ClaudeResponse = JSON.parse(responseBody);
        console.log('Received response from Anthropic API:', data);

        // 检查是否需要工具调用
        const hasToolUse = data.content.some(c => c.type === 'tool_use');

        if (hasToolUse && this.useTools) {
          console.log('Tool use requested, executing tools...');

          // 记录大模型决定调用工具的推理（从响应中提取）
          const reasoning = '根据用户查询，我需要调用工具获取最新信息';
          const userQuery = this.conversationHistory.find(m => m.role === 'user')?.content as string || '';

          // 添加助手响应到历史
          this.conversationHistory.push({
            role: 'assistant',
            content: data.content
          });

          // 收集所有工具调用结果
          const toolResults: Array<any> = [];
          let toolName = '';
          let toolDescription = '';
          let toolParams = {};

          for (const contentItem of data.content) {
            if (contentItem.type === 'tool_use') {
              // 执行工具
              toolName = contentItem.name;
              toolParams = contentItem.input || {};

              // 获取工具描述
              const tool = this.toolDefinitions[toolName];
              toolDescription = tool?.description || '';

              const toolResult = await this.executeTool(toolName, toolParams);

              toolResults.push({
                type: 'tool_result',
                tool_use_id: contentItem.id,
                content: toolResult
              });

              // 记录工具调用详情
              if (this.recordToolInteraction) {
                const callContext = {
                  systemPrompt: systemPrompt || '',
                  userQuery,
                  conversationHistory: this.conversationHistory.slice(0, -1).map(m =>
                    `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
                  ),
                };

                // 构造重组后的上下文描述
                const reorganizedContext = `系统提示词:\n${systemPrompt || ''}\n\n对话历史:\n${callContext.conversationHistory.join('\n')}\n\n工具结果:\n${JSON.stringify(toolResult, null, 2)}`;

                this.recordToolInteraction(
                  'tool-call',
                  toolName,
                  toolDescription,
                  toolParams,
                  callContext,
                  toolResult,
                  reasoning,
                  reorganizedContext
                );
              }
            }
          }

          // 添加工具结果到消息历史
          this.conversationHistory.push({
            role: 'user',
            content: toolResults
          });

          // 继续循环
          shouldContinue = true;
          continue;
        } else {
          // 没有工具调用，这是最终响应
          const responseText = data.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');

          // 添加助手响应到历史
          this.conversationHistory.push({
            role: 'assistant',
            content: data.content
          });

          finalResponse = responseText;
          shouldContinue = false;
        }
      }

      return finalResponse;
    } catch (error) {
      console.error('Error sending message to Anthropic API:', error);

      // 如果是网络错误，提供更友好的提示
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