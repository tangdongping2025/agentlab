# Agent 运行取消(被动取消方案)

## 问题

新通道 `/api/agents/{id}/run`(SSE)目前没有取消机制:`ChatWorkspace` / `AssistantSidebar` 在 running 时只是禁用发送按钮,无法中断。前端关闭页面后,后端 `asyncio.create_task(_runner())` 仍会跑完整个 LLM 调用 + 工具循环,资源泄漏。

旧通道(`agentService.ts` 直连 LLM)已经有完整取消(`AbortController` + `aborted` 双标志),不动。

## 目标

新通道用户能点"停止"中断运行中的请求:LLM 流被切断,工具循环不再继续下一轮,后端 task 被 cancel,SSE 连接干净关闭。

## 方案:被动取消(client abort → server CancelledError)

利用 Starlette `StreamingResponse` 在客户端断连时向 generator 抛 `CancelledError` 的特性,链路如下:

```
[UI 停止按钮] click
  → store.cancelWorkspace()
  → AbortController.abort()
  → fetch 被中断 / reader.cancel()
  → 后端 SSE generator 收到 CancelledError(在 yield 处)
  → finally 里 task.cancel() + await(允许 1s 清理)
  → agent.run 内的 await 点抛 CancelledError → 自然冒泡
  → _runner 把 CancelledError 当正常退出,不 emit_error
```

## 不做

- 不新增 `POST /cancel` 端点(跨 tab / 软中断暂不需要)
- 不引入 task 注册表
- 不改旧通道(`agentService.ts`)

## SDK agent 子进程

`claude_sdk_agent.py` 用 SDK 的 `query()` async generator。`task.cancel()` 让 `async for message in query(...)` 在下一个 await 抛 `CancelledError`,SDK 内部用 `__aexit__` 清理子进程。如果验证发现子进程残留,再加显式 `process.terminate()` 兜底。

## 验收

1. ChatWorkspace 发送消息 → running 时按钮变"停止" → 点停止 → 流文本停止 → 按钮回到"发送" → 部分 streaming 落库为 assistant 消息
2. AssistantSidebar 同样
3. 后端日志无 unhandled CancelledError、无 emit_error("CancelledError: ...")
4. 取消后 5 秒,后端无残留 LLM 请求(用 `tasks.all_tasks()` 检查或日志观察)
5. SDK agent 取消后 `tasklist | grep claude` 子进程消失(Windows)/ `pgrep claude` 无残留(Linux)
