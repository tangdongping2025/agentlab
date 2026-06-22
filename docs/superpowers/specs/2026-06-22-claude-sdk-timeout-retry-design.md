# claude-sdk 主路径超时 + 重试 + 前端通知 设计

> **日期**:2026-06-22
> **范围**:后端 `backend/runtime/claude_sdk_agent.py` 的 `run` 方法(query 调用)+ 前端 `src/services/eventAdapter.ts`(action 渲染分支)
> **关联**:RQ 现状排查"LLM 调用有无重试/超时"的结论 —— claude-sdk 主路径此前无显式超时、无重试

## 1. 背景与目标

当前 claude-sdk 主路径(`ClaudeSdkAgent.run`)直接 `async for message in query(prompt, options)`,外层只有一个 `try/except` 打印异常并 `emit_error`。问题:

- **无超时**:query() 是流式 agent loop,底层是 claude_agent_sdk 的 CLI 子进程。一旦内网代理(glm-5.2,经 `ANTHROPIC_BASE_URL`)卡死,`run` 会无限挂住,SSE 永不结束,前端一直转圈。
- **无重试**:启动阶段的连接抖动/瞬时失败,一次就 `emit_error`,用户需手动重发。

**目标**:给 query 调用加无活动超时 + 启动阶段重试,并在重试时通过现有 SSE action 事件实时通知前端。

## 2. 范围

- **改**:`claude_sdk_agent.py`(run 方法包装循环)、`eventAdapter.ts`(action 新分支)
- **不改**:`EventEmitter` / `EventType`(ACTION 复用)、前端 `AgentEvent` 类型(action 已在)、`ark.py`(assistant/research 路径,本次不动)、前端 `agentService.ts` 的 STREAM_TIMEOUT(旧路径)

## 3. 设计

### 3.1 架构:三层包装

把现有 `async for message in query(...)`(:227)展开成"带无活动超时的迭代 + 启动阶段重试"的包装循环:

```
for attempt in range(MAX_ATTEMPTS):          # 重试层(仅启动阶段)
    started = False
    aiter = query(prompt, options)
    try:
        while True:                          # 无活动超时层
            msg = await asyncio.wait_for(aiter.__anext__(), timeout=STALL_TIMEOUT)
            started = True                   # 首个 message 到达 → 锁定不重试
            处理 msg(原 emit 逻辑不变,ResultMessage → emit_done 后 return)
        return                               # 正常结束(generator 耗尽)
    except StopAsyncIteration:
        return                               # generator 正常结束
    except Exception as e:
        if started or attempt >= MAX_ATTEMPTS - 1:
            await emit.emit_error(...)       # 已产出 或 尝试用尽 → 不重试
            return
        # 启动阶段失败 → 重试
        await aiter.aclose()                 # 释放可能的 CLI 子进程
        backoff = BACKOFF_SECONDS[attempt]
        await emit.emit(EventType.ACTION, action="retry", attempt=attempt + 2,
                        maxAttempts=MAX_ATTEMPTS, reason=..., nextRetryIn=backoff)
        await asyncio.sleep(backoff)
        continue
```

### 3.2 参数(模块常量)

| 常量 | 值 | 含义 |
|---|---|---|
| `STALL_TIMEOUT` | `60` 秒 | 流式期间连续无任何 message 即判卡死(每次收到 message 重置计时) |
| `MAX_ATTEMPTS` | `3` | **总尝试上限**(初始 + 2 次重试) |
| `BACKOFF_SECONDS` | `(1, 2)` | 指数退避,对应 attempt 0、1 失败后的等待 |

**尝试序列**:第1次(attempt 0)→ 失败 sleep 1s → 第2次(attempt 1)→ 失败 sleep 2s → 第3次(attempt 2)→ 失败 emit_error。

### 3.3 无活动超时

- 把 `async for` 手动展开为 `while True + asyncio.wait_for(aiter.__anext__(), STALL_TIMEOUT)`
- `asyncio.wait_for` 超时抛 `asyncio.TimeoutError`(被外层 `except Exception` 捕获)
- 每次成功拿到 message,计时自动重置(超时是针对单次 anext 的)
- 长输出不受影响:只要持续有 text_delta / 事件产出,就不会触发
- 测试用例通过模块常量注入小 `STALL_TIMEOUT`(如 0.5s),避免测试慢

**实现注意(plan 阶段定方案)**:`asyncio.wait_for(aiter.__anext__(), timeout)` 有两个坑:(1) generator 耗尽时 `__anext__()` 抛 `StopAsyncIteration`,它是 `Exception` 子类,必须在外层 `except` 里**先于** `except Exception` 捕获,否则正常结束被误判为失败触发重试;(2) `wait_for` 包裹 async generator 的 anext 在某些 Python 版本对 StopAsyncIteration 传播有边角问题。plan 阶段选定稳妥包装方式 —— 候选:`task = asyncio.create_task(anext(aiter)); done, pending = await asyncio.wait({task}, timeout=STALL_TIMEOUT); if not done: task.cancel(); raise Timeout` 或引入 `async-timeout` 库的 context manager(需评估是否加依赖)。

### 3.4 重试边界:仅启动阶段

- `started` 标志:收到 query 的**第一个 message** 后置 `True`
- `started=False`(连接/启动期)的异常 → 可重试
- `started=True`(已产出文本/工具调用,有副作用)后的异常 → **直接 emit_error,不重试**(避免重复搜索、重复写文件)
- 无活动超时在 `started=True` 后仍生效(防传输中途卡死),但触发了也只 emit_error 不重试
- `ResultMessage.is_error`(业务错误,非异常,且 message 已到达 → started=True)走原 emit_error 逻辑,**不触发重试**

### 3.5 前端通知:复用 action 事件

重试前 emit 一个 action 事件(payload 结构化):

```python
await emit.emit(
    EventType.ACTION,
    action="retry",
    attempt=attempt + 2,                      # 即将进行的第几次尝试(2 或 3)
    maxAttempts=MAX_ATTEMPTS,                 # 3
    reason=f"{type(e).__name__}: {e}",
    nextRetryIn=backoff,                      # 几秒后重试(1 或 2)
)
await asyncio.sleep(backoff)
```

`attempt` 语义:**即将进行的尝试序号**。attempt 0(第1次)失败 → 下次是第2次 → `attempt=2`;attempt 1(第2次)失败 → 下次是第3次 → `attempt=3`。用户看到"正在重试,第 2/3 次尝试"。

前端 `src/services/eventAdapter.ts:21` 的 `case 'action'`,在 `switch_agent` 分支之后插入:

```ts
if (d.action === 'retry') {
  return {
    type: 'action',
    label: `连接不稳定,正在重试(第 ${d.attempt}/${d.maxAttempts} 次尝试)`,
    detail: `${d.nextRetryIn}s 后重试 · ${d.reason}`,
    ts: Date.now(),
  };
}
```

效果:事件流时间线出现一条重试卡片,用户实时看到进度。够"告诉用户正在发生什么",不引入额外 UI 组件(YAGNI)。

### 3.6 资源清理

- `asyncio.wait_for` 超时会 cancel 内部 `anext()`,但 query generator 底层可能已启动 CLI 子进程 → 重试/超时后显式 `await aiter.aclose()` 释放
- 重试 3 次仍失败 → `emit_error(f"连接失败,已重试 {MAX_ATTEMPTS} 次仍无效: {最后异常}")`

## 4. 数据结构

### action 事件 payload(retry)

| 字段 | 类型 | 说明 |
|---|---|---|
| `action` | `"retry"` | 固定标识 |
| `attempt` | `int` | 即将进行的尝试序号(2 或 3) |
| `maxAttempts` | `int` | 总尝试上限(3) |
| `reason` | `str` | 上次失败的异常摘要(`{异常类型}: {消息}`) |
| `nextRetryIn` | `int` | 退避秒数(1 或 2) |

## 5. 测试策略(后端 pytest)

`monkeypatch` 替换 `claude_sdk_agent.query` 为可控 fake async generator,用真实 `EventEmitter`(或假 queue 收集器)聚合事件。`STALL_TIMEOUT` 测试注入小值。

用例:

1. **启动失败后重试成功**:首次 query 抛连接异常 → emit retry action(attempt=2)→ 第二次 query 正常 emit_done → 断言事件序列含 1 条 retry + done,无 error
2. **无活动超时触发重试**:fake generator `await asyncio.sleep(STALL_TIMEOUT + 0.2)` 才 yield → 触发超时 → 重试 → 第二次立即成功
3. **started=True 后不重试**:fake generator yield 1 条 message 后抛异常 → 直接 emit_error,事件序列无 retry action
4. **重试用尽**:连续 3 次启动失败 → emit_error,事件序列含 2 条 retry(attempt=2,3)+ 1 条 error
5. **正常路径无副作用**:一次成功,事件序列不含任何 retry action(回归保护)
6. **退避时序**:用 `monkeypatch` 替换 `asyncio.sleep` 记录调用,断言退避序列为 (1, 2)

## 6. 不改动的部分

- `EventEmitter` / `EventType`(ACTION 已存在,复用)
- 前端 `AgentEvent` 类型定义(action 已在类型联合中)
- `ark.py`(assistant/research 路径,AsyncAnthropic,本次不动)
- 前端 `agentService.ts` STREAM_TIMEOUT/TOOL_TIMEOUT(旧直调路径)

## 7. 风险与权衡

- **工具副作用**:仅启动阶段重试已规避主要风险(首事件前无工具调用)。理论上首事件可能是 ToolUseBlock(agent 开局就调工具),此时 started=True 已锁定不重试,安全。
- **无活动超时误杀**:60s 阈值对 agent 思考+工具执行链路偏宽松;若 agent 执行长工具(如长搜索)中间有 >60s 无事件的空档可能误杀。现状 anysearch 工具自身有 15s 超时,单次工具不会超过 60s 无事件,风险可控。后续若引入更长耗时的工具,需重评阈值或改为"工具执行期间豁免计时"。
- **CLI 子进程泄漏**:`aclose()` 依赖 claude_agent_sdk generator 正确实现清理。若 SDK 版本不响应 aclose,极端情况可能残留子进程 —— 作为已知限制,后续观察。
- **总尝试 3 次**:与"重试 3 次"的直觉差异已在 design 阶段与用户确认,采用"总共 3 次尝试"。
