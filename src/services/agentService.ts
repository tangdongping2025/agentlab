// src/services/agentService.ts
// 直接使用 Anthropic API 而不是 SDK，因为 SDK 不支持浏览器环境

import type { StrategyEffect, ContextStrategy, FileAttachment } from '../types/index';
import { truncateResult, MAX_TOOL_RESULT_SIZE, MAX_API_REQUEST_BODY_SIZE } from '../utils/truncator';

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
  onToolResultReady: (toolName: string, result: any) => void;
  onAgentResponse: (text: string, tokenUsage: { input: number; output: number }, toolsUsed: string[], apiCallCount: number) => void;
  onStreamToken: (text: string) => void;
  onStreamEnd: () => void;
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
  private _lastStrategyEffect: StrategyEffect | null = null;
  private _summaryCache: Map<string, string> = new Map();
  private abortController: AbortController | null = null;
  private aborted = false;

  abort(): void {
    this.aborted = true;
    this.abortController?.abort();
  }

  getLastStrategyEffect(): StrategyEffect | null {
    return this._lastStrategyEffect;
  }

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
    reasoning: string
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
      reasoning: string
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
    'anysearch': {
      name: 'anysearch',
      description: `联网搜索工具，支持通用网页搜索和23个垂直领域搜索。

通用搜索：直接传入 query 即可，如 "今日AI新闻"、"量子计算最新进展"。
垂直搜索：需指定 domain 和 sub_domain，query 按对应格式构造。

垂直领域列表：
- finance.us_stock: 美股行情，输入股票代码(如AAPL)或公司名
- finance.cn_stock: A股行情，输入6位代码(如600519)或公司名，需设zone=cn
- finance.forex: 外汇行情，输入货币对(如EUR_USD)
- finance.news: 金融新闻，输入关键词
- code.general: 代码搜索，输入自然语言描述
- academic.doi: DOI论文查询，输入DOI号
- academic.paper: 论文搜索，输入关键词
- security.cve: CVE漏洞查询，输入CVE编号
- legal.case_law: 法律判例，输入关键词
- tech.general: 科技资讯，输入关键词
- education.general: 教育资源，输入关键词
- health.general: 健康医疗，输入关键词
- business.general: 商业资讯，输入关键词
- 其他领域: fashion/travel/home/ecommerce/gaming/film/music/ip/religion/geo/environment/energy/ugc，输入关键词

content_types可选值: web,news,code,doc,academic,data,image,video,audio
freshness可选值: day,week,month,year`,
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          domain: { type: 'string', description: '垂直领域代码，如 finance、code、academic' },
          sub_domain: { type: 'string', description: '子领域路由键，如 finance.cn_stock、code.general' },
          zone: { type: 'string', enum: ['cn', 'intl'], description: '区域: cn=中国, intl=国际' },
          content_types: { type: 'string', description: '内容类型过滤，逗号分隔: web,news,code,doc,academic,data,image,video,audio' },
          max_results: { type: 'number', description: '最大结果数，1-100，默认10' },
          freshness: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: '时间过滤' },
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    'anysearch-extract': {
      name: 'anysearch-extract',
      description: '提取指定URL网页的全文内容，返回Markdown格式。适用于需要获取搜索结果中某个链接的完整内容时使用。截断上限50000字符。',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页URL' }
        },
        required: ['url'],
        additionalProperties: false
      }
    }
  };

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private static readonly TOOL_TIMEOUT = 15_000; // 工具调用超时 15 秒
  private static readonly API_TIMEOUT = 30_000;  // API 调用超时 30 秒
  private static readonly STREAM_TIMEOUT = 60_000;

  // 工具执行：调用 AnySearch 代理获取搜索数据
  private async executeTool(toolName: string, params: any, signal?: AbortSignal): Promise<string> {
    console.log(`Executing tool: ${toolName} with params:`, params);

    const endpointMap: Record<string, string> = {
      'anysearch': 'search',
      'anysearch-extract': 'extract',
    };

    const endpoint = endpointMap[toolName];
    if (!endpoint) {
      return JSON.stringify({ error: 'Unknown tool', tool: toolName });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AgentService.TOOL_TIMEOUT);
    const onExternalAbort = () => controller.abort();

    try {
      // If external signal already aborted, return immediately
      if (signal?.aborted) {
        clearTimeout(timer);
        return JSON.stringify({ error: '搜索请求已取消' });
      }

      // When external signal aborts, also abort internal request
      signal?.addEventListener('abort', onExternalAbort, { once: true });

      const response = await fetch(`/api/anysearch/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);

      const data = await response.json();

      if (!response.ok || data.error) {
        return JSON.stringify({ error: data.error || `HTTP ${response.status}` });
      }

      if (data.content && Array.isArray(data.content)) {
        const texts = data.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text);
        return texts.join('\n');
      }

      return JSON.stringify(data);
    } catch (err: any) {
      signal?.removeEventListener('abort', onExternalAbort);
      clearTimeout(timer);
      console.error(`Tool execution error: ${toolName}`, err);
      if (err.name === 'AbortError') {
        if (this.aborted) {
          return JSON.stringify({ error: '搜索请求已取消' });
        }
        return JSON.stringify({ error: '搜索请求超时，请稍后重试' });
      }
      return JSON.stringify({ error: '搜索服务暂时不可用，请稍后重试' });
    }
  }

  private async *parseSSEStream(response: Response): AsyncGenerator<{ event: string; data: any }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '' && currentEvent && currentData) {
            try {
              yield { event: currentEvent, data: JSON.parse(currentData) };
            } catch {
              // skip malformed JSON
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } finally {
      reader.releaseLock();
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
    this._summaryCache.clear();
    this._lastStrategyEffect = null;
  }

  // 获取对话历史（简化格式）
  getHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.conversationHistory.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : '[结构化内容]'
    }));
  }

  // 文件类型判断辅助函数
  private isTextFile(file: FileAttachment): boolean {
    const textExtensions = ['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.css', '.js', '.ts', '.xml', '.yaml', '.yml'];
    const contentType = file.type.toLowerCase();
    return contentType.startsWith('text/') ||
           textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  }

  // 发送消息 - 支持工具调用的完整实现
  async sendMessage(
    message: string,
    systemPrompt: string,
    tools?: string[],
    contextStrategy: string = 'full',
    files?: FileAttachment[]
  ): Promise<string> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('Agent Service not initialized. Please configure your Claude API key in the .env file.');
    }

    try {
      this.abortController = new AbortController();
      this.aborted = false;

      // 处理空文本但有文件的情况
      let messageContent = message;
      if (!message.trim() && files && files.length > 0) {
        const mainFile = files[0];
        messageContent = `我上传了一个文件：${mainFile.name}。请帮我分析或处理这个文件的内容。`;
      }

      // 处理文件内容
      if (files && files.length > 0) {
        for (const file of files) {
          if (this.isTextFile(file)) {
            const fileText = file.content || '';
            let contentToSend = fileText;

            // 截断过长内容
            const MAX_CONTENT_LENGTH = 10000;
            if (contentToSend.length > MAX_CONTENT_LENGTH) {
              contentToSend = contentToSend.slice(0, MAX_CONTENT_LENGTH) + '...\n\n[文件内容过长，已截断]';
            }

            messageContent += `\n\n以下是文件 "${file.name}" 的内容：\n${contentToSend}`;
          } else {
            messageContent += `\n\n已上传文件 "${file.name}"（${(file.size / 1024).toFixed(1)} KB）`;
          }
        }
      }

      // 添加用户消息到历史
      if (files && files.length > 0) {
        // 检查是否有图片文件
        const hasImageFile = files.some(file => file.type.startsWith('image/'));

        if (hasImageFile) {
          // 构建包含文件的多部分消息
          const contentBlocks: Array<{ type: 'text' | 'image', text?: string, source?: { type: string, media_type: string, data: string } }> = [
            { type: 'text', text: messageContent }
          ];

          for (const file of files) {
            if (file.type.startsWith('image/')) {
              // 处理图片文件
              const base64Data = file.url.split(',')[1]; // 从 url 中获取 base64
              contentBlocks.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: file.type,
                  data: base64Data
                }
              });
            }
          }

          this.conversationHistory.push({ role: 'user', content: contentBlocks as any });
        } else {
          // 只有文本文件，直接发送文本
          this.conversationHistory.push({ role: 'user', content: messageContent });
        }
      } else {
        // 纯文本消息
        this.conversationHistory.push({ role: 'user', content: messageContent });
      }

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
      const maxLoops = 3;
      const toolsUsedInSession: string[] = [];
      const consecutiveFailures: Map<string, number> = new Map();
      let totalUsage = { input_tokens: 0, output_tokens: 0 };
      let lastStreamedText = '';

      while (shouldContinue && loopCount < maxLoops) {
        if (this.aborted) {
          finalResponse = '已取消';
          break;
        }
        loopCount++;
        this.apiCallCount++;

        // Apply strategy and get effect for visualization
        const strategyEffect = await this.applyStrategy(this.conversationHistory, contextStrategy as ContextStrategy);
        let messagesToSend: ClaudeMessage[];

        if (strategyEffect.triggered && contextStrategy === 'none') {
          messagesToSend = [this.conversationHistory[this.conversationHistory.length - 1]];
        } else if (strategyEffect.triggered && contextStrategy === 'sliding') {
          messagesToSend = this.getSlidingWindowMessages();
        } else if (strategyEffect.triggered && contextStrategy === 'summary') {
          if (strategyEffect.degraded) {
            messagesToSend = this.conversationHistory.slice(-4);
          } else {
            const summaryBlock: ClaudeMessage = {
              role: 'assistant',
              content: `[对话摘要] ${strategyEffect.summaryContent}`,
            };
            const recentMessages = this.conversationHistory.slice(-4);
            messagesToSend = [summaryBlock, ...recentMessages];
          }
        } else {
          messagesToSend = [...this.conversationHistory];
        }

        // Store effect for external access
        this._lastStrategyEffect = strategyEffect;

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

        (request as any).stream = true;

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

        const apiTimer = setTimeout(() => this.abortController?.abort(), AgentService.STREAM_TIMEOUT);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: requestBody,
          signal: this.abortController!.signal,
        });
        clearTimeout(apiTimer);

        if (!response.ok) {
          const errorBody = await response.text();
          if (this.timelineCallbacks) {
            this.timelineCallbacks.onApiResponseReceived(response.status, 0, { input: 0, output: 0 }, 'error', errorBody);
          }
          throw new Error(`API request failed: ${response.status} - ${errorBody}`);
        }

        // 流式解析
        const contentBlocks: Array<{ type: string; id?: string; name?: string; text?: string; inputJson?: string }> = [];
        let fullText = '';
        lastStreamedText = '';
        let usage = { input_tokens: 0, output_tokens: 0 };
        let stopReason = '';

        for await (const { event, data } of this.parseSSEStream(response)) {
          if (this.aborted) break;

          switch (event) {
            case 'message_start': {
              usage = data.message?.usage || usage;
              break;
            }
            case 'content_block_start': {
              const block = data.content_block;
              if (block.type === 'text') {
                contentBlocks.push({ type: 'text', text: '' });
              } else if (block.type === 'tool_use') {
                contentBlocks.push({ type: 'tool_use', id: block.id, name: block.name, inputJson: '' });
              }
              break;
            }
            case 'content_block_delta': {
              const delta = data.delta;
              const blockIdx = data.index;
              if (delta.type === 'text_delta' && contentBlocks[blockIdx]?.type === 'text') {
                contentBlocks[blockIdx].text += delta.text;
                fullText += delta.text;
                if (this.timelineCallbacks) {
                  this.timelineCallbacks.onStreamToken(delta.text);
                }
              } else if (delta.type === 'input_json_delta' && contentBlocks[blockIdx]?.type === 'tool_use') {
                contentBlocks[blockIdx].inputJson += delta.partial_json;
              }
              break;
            }
            case 'content_block_stop': {
              break;
            }
            case 'message_delta': {
              if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
              if (data.usage) {
                usage.output_tokens = data.usage.output_tokens || usage.output_tokens;
              }
              break;
            }
            case 'message_stop': {
              break;
            }
          }
        }

        // 流式中断检查
        if (this.aborted) {
          lastStreamedText = fullText;
          this.timelineCallbacks?.onStreamEnd();
          return fullText || '已取消';
        }

        lastStreamedText = fullText;

        // 累加 usage
        totalUsage.input_tokens += usage.input_tokens;
        totalUsage.output_tokens += usage.output_tokens;

        // 记录 API 响应
        const duration = Date.now() - startTime;
        const hasToolUse = contentBlocks.some(b => b.type === 'tool_use');

        if (this.timelineCallbacks) {
          this.timelineCallbacks.onApiResponseReceived(
            response.status,
            duration,
            usage,
            hasToolUse ? 'tool_call' : 'final_response',
            JSON.stringify({ content: contentBlocks, usage })
          );
        }

        if (this.addApiResponse && apiInteractionId) {
          const summaryResponse = JSON.stringify({
            content: contentBlocks.map(b => ({
              type: b.type,
              ...(b.type === 'text' ? { text: b.text?.slice(0, 200) } : {}),
              ...(b.type === 'tool_use' ? { name: b.name } : {}),
            })),
            usage
          });
          this.addApiResponse(apiInteractionId, response.status, {}, summaryResponse, duration);
        }

        if (hasToolUse && this.useTools) {
          const assistantContent: Array<any> = [];
          const toolResults: Array<any> = [];
          let forceExit = false;

          for (const block of contentBlocks) {
            if (block.type === 'text') {
              assistantContent.push({ type: 'text', text: block.text });
            } else if (block.type === 'tool_use') {
              let toolInput = {};
              try {
                const rawInput = block.inputJson || '{}';
                console.log(`[tool_use] name=${block.name}, inputJson="${rawInput}"`);
                toolInput = JSON.parse(rawInput);
              } catch { /* malformed JSON */ }
              assistantContent.push({ type: 'tool_use', id: block.id, name: block.name, input: toolInput });

              const toolName = block.name!;
              const toolParams = toolInput;
              const tool = this.toolDefinitions[toolName];
              const toolDescription = tool?.description || '';
              const reasoning = '根据用户查询，我需要调用工具获取最新信息';

              if (this.timelineCallbacks) {
                this.timelineCallbacks.onToolCallDetected(toolName, toolDescription, toolParams, reasoning);
              }

              const toolResult = await this.executeTool(toolName, toolParams, this.abortController?.signal);

              const isError = typeof toolResult === 'string' && toolResult.includes('"error"');

              // 连续失败安全阀
              if (isError) {
                const count = (consecutiveFailures.get(toolName) || 0) + 1;
                consecutiveFailures.set(toolName, count);
                if (count >= 2) {
                  forceExit = true;
                }
              } else {
                consecutiveFailures.delete(toolName);
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: typeof toolResult === 'string'
                  ? truncateResult(toolResult, MAX_TOOL_RESULT_SIZE)
                  : truncateResult(JSON.stringify(toolResult), MAX_TOOL_RESULT_SIZE),
                is_error: isError
              });

              if (!toolsUsedInSession.includes(toolName)) {
                toolsUsedInSession.push(toolName);
              }

              if (this.timelineCallbacks) {
                this.timelineCallbacks.onToolResultReady(toolName, toolResult);
              }

              if (this.recordToolInteraction) {
                const userQuery = this.conversationHistory.find(m => m.role === 'user')?.content as string || '';
                const recentHistory = this.conversationHistory.slice(-4).map(m =>
                  `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200)}`
                );
                const callContext = {
                  systemPrompt: (systemPrompt || '').slice(0, 200),
                  userQuery: typeof userQuery === 'string' ? userQuery.slice(0, 200) : '',
                  recentHistory,
                };
                this.recordToolInteraction('tool-call', toolName, toolDescription, toolParams, callContext, toolResult, reasoning);
              }
            }
          }

          this.conversationHistory.push({ role: 'assistant', content: assistantContent });
          this.conversationHistory.push({ role: 'user', content: toolResults });

          if (forceExit) {
            const failedTools = [...consecutiveFailures.entries()].filter(([, c]) => c >= 2).map(([n]) => n);
            finalResponse = fullText || `工具 ${failedTools.join('、')} 连续调用失败，请稍后重试`;
            shouldContinue = false;
          } else {
            shouldContinue = true;
            continue;
          }
        } else {
          this.conversationHistory.push({
            role: 'assistant',
            content: contentBlocks.filter(b => b.type === 'text').map(b => ({ type: 'text', text: b.text }))
          });

          finalResponse = fullText;
          shouldContinue = false;
        }
      }

      if (this.timelineCallbacks) {
        this.timelineCallbacks.onStreamEnd();
        this.timelineCallbacks.onAgentResponse(
          finalResponse,
          totalUsage,
          toolsUsedInSession,
          this.apiCallCount
        );
      }

      return finalResponse;
    } catch (error) {
      if (this.aborted) {
        this.timelineCallbacks?.onStreamEnd();
        return lastStreamedText || finalResponse || '已取消';
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        return '请求超时，请稍后重试';
      }
      console.error('Error sending message to Anthropic API:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Could not connect to Anthropic API. Please check your internet connection.');
      }
      throw new Error(`Failed to send message: ${(error as Error).message}`);
    } finally {
      this.abortController = null;
      this.aborted = false;
    }
  }

  // 获取滑动窗口消息（保留最近的对话）
  private getSlidingWindowMessages(): ClaudeMessage[] {
    // 滑动窗口策略：最多保留 10 条消息
    const maxMessages = 10;
    const start = Math.max(0, this.conversationHistory.length - maxMessages);
    return this.conversationHistory.slice(start);
  }

  private getStrategyLabel(strategy: ContextStrategy): string {
    const labels: Record<ContextStrategy, string> = {
      sliding: '滑动窗口',
      full: '完整记忆',
      summary: '摘要记忆',
      none: '无记忆',
    };
    return labels[strategy];
  }

  private extractMessageText(msg: ClaudeMessage): string {
    if (typeof msg.content === 'string') return msg.content;
    return msg.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('\n');
  }

  private async generateSummary(messages: ClaudeMessage[]): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${this.extractMessageText(m)}`)
      .join('\n');

    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 256,
        messages: [{ role: 'user', content: `请用 2-3 句话总结以下对话的关键信息：\n\n${conversationText}` }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`摘要 API 调用失败: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return data.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');
  }

  async applyStrategy(
    messages: ClaudeMessage[],
    strategy: ContextStrategy
  ): Promise<StrategyEffect> {
    const beforeMessages = messages.map(m => ({
      role: m.role,
      content: this.extractMessageText(m),
    }));

    const beforeTokenCount = messages.reduce(
      (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
    );

    // full: no filtering
    if (strategy === 'full') {
      return {
        strategy: 'full',
        triggered: false,
        beforeMessages,
        afterMessages: beforeMessages,
        removedMessages: [],
        beforeTokenCount,
        afterTokenCount: beforeTokenCount,
      };
    }

    // none: only the last user message
    if (strategy === 'none') {
      if (messages.length <= 1) {
        return {
          strategy: 'none',
          triggered: false,
          beforeMessages,
          afterMessages: beforeMessages,
          removedMessages: [],
          beforeTokenCount,
          afterTokenCount: beforeTokenCount,
        };
      }
      const lastMsg = messages[messages.length - 1];
      const afterMessages = [{ role: lastMsg.role, content: this.extractMessageText(lastMsg) }];
      const afterTokenCount = this.estimateTokens(this.extractMessageText(lastMsg));
      return {
        strategy: 'none',
        triggered: true,
        beforeMessages,
        afterMessages,
        removedMessages: beforeMessages.slice(0, -1).map(m => {
          const text = this.extractMessageText(m);
          return { role: m.role as 'user' | 'assistant', content: text.length > 100 ? text.slice(0, 100) + '...' : text };
        }),
        beforeTokenCount,
        afterTokenCount,
      };
    }

    // sliding: keep last N messages
    if (strategy === 'sliding') {
      const maxMessages = 10;
      if (messages.length <= maxMessages) {
        return {
          strategy: 'sliding',
          triggered: false,
          beforeMessages,
          afterMessages: beforeMessages,
          removedMessages: [],
          beforeTokenCount,
          afterTokenCount: beforeTokenCount,
        };
      }
      const kept = messages.slice(-maxMessages);
      const removed = messages.slice(0, messages.length - maxMessages);
      const afterMessages = kept.map(m => ({ role: m.role, content: this.extractMessageText(m) }));
      const afterTokenCount = kept.reduce(
        (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
      );
      return {
        strategy: 'sliding',
        triggered: true,
        beforeMessages,
        afterMessages,
        removedMessages: removed.map(m => {
          const text = this.extractMessageText(m);
          return { role: m.role, content: text.length > 100 ? text.slice(0, 100) + '...' : text };
        }),
        beforeTokenCount,
        afterTokenCount,
      };
    }

    // summary: summarize old messages, keep recent ones
    if (strategy === 'summary') {
      const recentCount = 4;
      const threshold = 6;
      if (messages.length <= threshold) {
        return {
          strategy: 'summary',
          triggered: false,
          beforeMessages,
          afterMessages: beforeMessages,
          removedMessages: [],
          beforeTokenCount,
          afterTokenCount: beforeTokenCount,
        };
      }

      const oldMessages = messages.slice(0, messages.length - recentCount);
      const recentMessages = messages.slice(-recentCount);
      const summarySourceCount = oldMessages.length;
      const summarySourceTokens = oldMessages.reduce(
        (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
      );

      try {
        // Check cache first
        const cacheKey = oldMessages.map((m, i) => `${i}:${this.extractMessageText(m).slice(0, 50)}`).join('|');
        let summary = this._summaryCache.get(cacheKey) || '';
        let summaryDuration: number | undefined;
        if (!summary) {
          const startTime = Date.now();
          summary = await this.generateSummary(oldMessages);
          summaryDuration = Date.now() - startTime;
          this._summaryCache.set(cacheKey, summary);
        }

        const summaryMsg = { role: 'assistant' as const, content: `[对话摘要] ${summary}` };
        const afterMessages = [summaryMsg, ...recentMessages.map(m => ({ role: m.role, content: this.extractMessageText(m) }))];
        const afterTokenCount = afterMessages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
        return {
          strategy: 'summary',
          triggered: true,
          beforeMessages,
          afterMessages,
          removedMessages: oldMessages.map(m => {
            const text = this.extractMessageText(m);
            return { role: m.role, content: text.length > 100 ? text.slice(0, 100) + '...' : text };
          }),
          summaryContent: summary,
          beforeTokenCount,
          afterTokenCount,
          summaryDuration,
          summarySourceCount,
          summarySourceTokens,
        };
      } catch (error) {
        // Degrade to sliding behavior
        const kept = messages.slice(-recentCount);
        const removed = messages.slice(0, messages.length - recentCount);
        const afterMessages = kept.map(m => ({ role: m.role, content: this.extractMessageText(m) }));
        const afterTokenCount = kept.reduce(
          (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
        );
        return {
          strategy: 'summary',
          triggered: true,
          beforeMessages,
          afterMessages,
          removedMessages: removed.map(m => {
            const text = this.extractMessageText(m);
            return { role: m.role, content: text.length > 100 ? text.slice(0, 100) + '...' : text };
          }),
          beforeTokenCount,
          afterTokenCount,
          degraded: true,
          degradeReason: (error as Error).message || '摘要生成失败',
          summarySourceCount,
          summarySourceTokens,
        };
      }
    }

    // Fallback (should not reach)
    return {
      strategy,
      triggered: false,
      beforeMessages,
      afterMessages: beforeMessages,
      removedMessages: [],
      beforeTokenCount,
      afterTokenCount: beforeTokenCount,
    };
  }

  // 断开连接（清理资源）
  async disconnect(): Promise<void> {
    this.conversationHistory = [];
    this.apiKey = null;
    this.isInitialized = false;
    this.timelineCallbacks = null;
    this.addApiRequest = undefined;
    this.addApiResponse = undefined;
    this.recordToolInteraction = undefined;
    this.abortController = null;
    this.aborted = false;
  }
}

// 创建单例实例
export const agentService = new AgentService();