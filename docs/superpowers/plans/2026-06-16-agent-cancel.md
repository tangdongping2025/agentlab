# Plan: Agent 运行取消(被动取消)

参见 spec: `docs/superpowers/specs/2026-06-16-agent-cancel-design.md`

## Task 1: 后端 — executor 返回 task,SSE generator 在 finally 里 cancel

**文件**:`backend/runtime/executor.py`、`backend/routers/agents.py`

- `run_agent`:返回 `(emitter, task)` 元组(或在 emitter 上挂 `task` 属性)。
- `_runner`:把 `CancelledError` 单独 except,只 print 日志、不 `emit_error`(emit_error 会再写两条 queue 又抛错);其它异常照旧 emit_error。
- `routers/agents.py` `event_stream`:`try / finally` 包住 async for,`finally` 里 `if not task.done(): task.cancel()` + `await asyncio.wait([task], timeout=2.0)`。

**测试**:`backend/tests/test_agent_runtime.py` 加用例:启一个 emit 慢循环的 fake agent,消费两个事件后客户端断开,断言 task 在 2s 内变 `done`。

## Task 2: 前端 API — runAgent 接受可选 AbortSignal

**文件**:`src/services/agentRuntimeApi.ts`

- `runAgent` 新增可选第 7 参 `signal?: AbortSignal`。
- `fetch` 透传 `signal`。
- 主循环里增加 `if (signal?.aborted) { reader.cancel(); break; }` 检查(其实 fetch abort 后 reader.read() 会抛,但额外检查更干净)。
- `catch` 里如果 `e.name === 'AbortError'`,走 `onError('cancelled')` 让上层识别 — 或直接 return 不调任何回调,由上层用 store 的取消方法收尾(选后者,简单)。

## Task 3: 前端 store — 暴露 cancelWorkspace / cancelAssistant

**文件**:`src/stores/agentRuntimeStore.ts`

- state 加两个非响应字段:`workspaceAbortController?: AbortController`、`assistantAbortController?: AbortController`(放 `set` 里也行,Zustand 不在乎是不是 plain data)。
- `runWorkspace`:`new AbortController()` → 存进 state → 透传给 `runAgent`。
- 新增 `cancelWorkspace`:取出 controller `abort()`;立即把当前 `workspaceStreaming` 落成 assistant 消息(尾部加 ` [已取消]` 标记)、清 streaming、`workspaceRunning=false`、异步落库。
- `runAssistant` / `cancelAssistant` 同样处理。
- 在 `runAgent` 的 `onError` 里要识别 abort:如果 `workspaceRunning === false`(已经被 cancel 提前置 false),不再追加 `[错误]` 消息。

## Task 4: 前端 UI — ChatWorkspace + AssistantSidebar 的停止按钮

**文件**:`src/components/agentRuntime/ChatWorkspace.tsx`、`src/components/agentRuntime/AssistantSidebar.tsx`

- 发送按钮在 `running` 时变成"停止",点击调对应 cancel 方法,样式区分(红色/灰色)。

## Task 5: 验证 SDK agent 子进程清理

启 backend → ChatWorkspace 切到 `claude-sdk` agent → 发"列出当前目录文件"等会触发工具的请求 → `tasklist | findstr claude` 看子进程 PID → 点停止 → 5 秒后再看 PID 是否消失。

如果 SDK 不清理,在 `claude_sdk_agent.py` 的 `try / except / finally` 里加 `except asyncio.CancelledError: ...; finally: ...` 处理(具体看 SDK 暴露的 API,可能要持有 query 上下文管理器引用)。

## 提交策略

每个 Task 独立 commit。Task 5 如果发现子进程残留,单独再起一个 fix commit。
