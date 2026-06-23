# Agent 错误体验加固设计

> 日期:2026-06-23
> 范围:agent 运行错误(claude-sdk / assistant / 其他 BaseAgent)从后端到前端的端到端透传与分类呈现
> 关联:RQ-082(claude-sdk 超时重试)之后,代理 502/503 错误暴露出错误信息笼统的问题

## 1. 背景与问题

2026-06-22 起 claude-sdk agent 在生产遇代理 502,2026-06-23 复测确认代理 `10.199.5.25:8080` 持续返回 503 `No available accounts`(账号池耗尽,外部运营问题,非 Context Lab 代码)。代理本身 Context Lab 无法修,但**错误呈现**有问题:用户在前端看到的是笼统的"服务端 error / HTTP 503",拿不到具体原因,无法判断是服务方挂了还是自己的请求/代码有问题。

### 诊断结论(已验证)

错误链路:`agent.run → executor._runner → emit_error → SSE ERROR 事件 → 前端 onError → store → UI`。

- **SSE 流内错误已透明**:`executor.py:27-28`、`claude_sdk_agent.py:355-358`、`base_agent.py:219-220` 都自包 try/except,异常转 `emit_error(具体串)` → SSE `ERROR` 事件 → 前端 `event.data.error` 透传具体串。这条路径不笼统。
- **笼统只在"建立阶段",主犯一处**:`src/services/agentRuntimeApi.ts:300-303` 的 `if (!resp.ok) { onError(`HTTP ${resp.status}`) }`——后端返回非 200 时只读 status,**丢弃整个 `resp.body`**(后端 FastAPI 500 的 detail / 代理 502-503 错误体全丢)。
- 从犯:`src/stores/agentRuntimeStore.ts:76-78` `formatWorkspaceError` 套固定前缀"智能体执行失败。可以重试"(但"技术详情:"后透传了 err——若 err 来自主犯,详情也只是"HTTP 503")。
- assistant 路径 `agentRuntimeStore.ts:461` `[错误] ${err}` 透传,同样受主犯牵连。

## 2. 目标

1. 错误发生时,前端拿到**具体的错误信息**(后端 detail / 代理错误体 / 异常类名与消息),而非笼统的"HTTP 5xx"。
2. 按 category 分类,给**友好的主提示文案**,让用户能区分"AI 服务方不可用"/"网络问题"/"请求问题"/"智能体内部出错"。
3. 技术详情**可折叠查看**(默认收起),兼顾日常可用与可诊断性。
4. workspace(claude-sdk 等 tabs 型 agent)与 assistant 两个入口**统一**错误呈现。

## 3. 非目标

- **不修代理 502/503 根因**(外部账号池,Context Lab 无法修)。
- **不改重试策略**(claude-sdk 已有 `MAX_ATTEMPTS=3` 超时重试,本轮不动)。
- 不做错误埋点/监控/告警(YAGNI)。
- 不改老界面 view='chat' 的错误路径(已弃用)。

## 4. 方案概述(方案 3:分类友好)

后端在 `emit_error` 时带上 `category`,前端按 category 渲染主提示 + 折叠技术详情。后端分类比前端准(后端拿得到异常对象/状态码,前端只有 HTTP status + 串)。

## 5. 错误分类(4 类)

| category | 触发条件 | 主提示文案 |
|---|---|---|
| `service_unavailable` | HTTP 5xx;或错误串含 `502/503/504/No available accounts/Upstream access/forbidden/account/api_error` | AI 服务暂时不可用,请稍后重试 |
| `network` | 连接/超时异常(`httpx.ConnectError`/`httpx.TimeoutException`/`asyncio.TimeoutError`/`ConnectionError`);前端 fetch 失败/超时/DNS(非 AbortError) | 网络连接失败,请检查网络后重试 |
| `bad_request` | HTTP 4xx | 请求无法处理(鉴权或格式问题) |
| `internal` | 其他未分类(Python 异常类名等) | 智能体内部出错 |

## 6. 数据结构变化

### 6.1 后端 `emit_error`
`runtime/events.py`:
```python
async def emit_error(self, error: str, category: str = "internal") -> None:
    await self._queue.put(AgentEvent(type=EventType.ERROR, data={"error": error, "category": category}))
    await self._queue.put(None)
```
SSE `ERROR` 事件 data 从 `{error}` → `{error, category}`。

### 6.2 后端分类 helper
新增 `runtime/error_categories.py`:
```python
def classify(cause) -> str: ...  # 异常对象/状态码/错误串 → 4 类之一
```
规则按第 5 节表。各 agent 在 emit_error 调用点 `emit_error(msg, classify(cause))`。

### 6.3 后端 SSE 路由建立前错误
`routers/agents.py` 的 `run_agent_endpoint` 加 try/except:建立前异常(如 `create_agent` 抛、`run_agent` 罕见抛)返 `JSONResponse({"detail": 具体消息, "category": classify(e)}, status_code=500)`(替代裸 500)。

### 6.4 前端 `onError` 签名
`agentRuntimeApi.ts` 的 `runAgent` 的 `onError` 从 `(err: string)` 改为:
```ts
onError: (err: { category: ErrorCategory; message: string; detail: string }) => void
```
`ErrorCategory = 'service_unavailable' | 'network' | 'bad_request' | 'internal'`。

### 6.5 前端归一化
`agentRuntimeApi.ts` 内新增 `normalizeError(...)`,汇聚三个来源:
- `!resp.ok`:读 `resp.json()` 取 `{detail, category}`(后端建立前错误);无 category 时从 status fallback 推断。
- SSE `ERROR` 事件:取 `event.data.category`(后端流内带);无则从 `event.data.error` 串 fallback。
- fetch 失败/stream 异常:`{category:'network'}`(AbortError 静默退出不变)。

前端 fallback 推断**镜像第 5 节规则**(HTTP status + 错误串关键字),保证后端未带 category(如旧客户端、或建立前 5xx 经 nginx 透传丢体)时仍能正确分类。

## 7. 各文件改动清单

### 后端
- `runtime/error_categories.py`(新增):`classify(cause) -> str` + 4 类常量。
- `runtime/events.py`:`emit_error` 加 `category` 参数。
- `runtime/executor.py:28`:`emit_error(msg, classify(e))`。
- `runtime/claude_sdk_agent.py`:所有 emit_error 点带 category——`:184` 重试耗尽 / `:235` assistant error / `:358` run 兜底,cause 是 SDK 抛的异常,`classify(异常)` 命中 502/503 → `service_unavailable`、超时/连接 → `network`,否则 `internal`;`:247` result `is_error` 是业务结果错误(非传输错误)→ `internal`。
- `runtime/base_agent.py:179`(stream ERROR)、`:220`(run 兜底)带 category。
- `routers/agents.py:40-62`:`run_agent_endpoint` try/except 返 `{detail, category}` JSON。

### 前端
- `src/services/agentRuntimeApi.ts`:`ErrorCategory` 类型;`normalizeError`;`runAgent` 的 `onError` 改对象签名;`!resp.ok` 读 body。
- `src/stores/agentRuntimeStore.ts`:workspace 与 assistant 的 onError 收对象;移除 `formatWorkspaceError`(改为按 category 取文案 + detail)。
- `src/components`(新增或复用):`ErrorBubble`——主提示(category 文案,醒目色)+「查看技术详情」折叠 detail 原文。workspace 与 assistant 共用。

## 8. 文案表(主提示)

见第 5 节表。技术详情折叠区显示 `detail` 原文(后端透传的具体异常/错误体)。

## 9. 测试计划

### 后端 pytest(`backend/tests/`)
- `test_error_categories.py`(新增):`classify` 各输入 → 正确 category(503 串→service_unavailable;ConnectError→network;4xx→bad_request;其他→internal)。
- `test_agents_api.py` 增:SSE 建立前异常 → 响应带 `detail` + `category` 的 JSON 500。
- `test_claude_sdk_agent.py` / `test_base_agent_strategy.py` 增:emit_error 带 category(SSE ERROR data 含 category)。

### 前端 vitest(`src/`)
- `normalizeError` 单测:三来源各 category + fallback。
- `ErrorBubble` 渲染:主提示正确、折叠/展开详情。
- store:workspace + assistant onError 存对象(回归 `runWorkspace`/`runAssistant`)。

## 10. 风险与兼容

- **SSE ERROR data 加字段**:前端读 `event.data.category` 时对旧值 fallback(无 category → 前端推断),前后端不完全同步也能跑。
- **`onError` 签名变对象**:仅 `agentRuntimeStore.ts` 两处调用,影响面可控。
- **分类误判**:关键字匹配可能漏判(如新错误措辞);`internal` 兜底,不会崩溃,只是文案不够精确。后续可调 `classify` 规则。
- **代理 503 持续**:本设计不解决代理可用性,只让错误透明分类;代理恢复前 claude-sdk 仍跑不通,但用户能清楚看到"AI 服务暂时不可用"而非"HTTP 503"。
