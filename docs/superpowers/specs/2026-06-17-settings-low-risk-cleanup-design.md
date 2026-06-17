# 设置页低风险整理设计

## 背景

右上角设置仍服务旧版 `ChatInteraction`，但当前项目主线是 Agent Runtime。现有设置里的 API Base URL、上下文窗口大小容易让用户误以为会影响 Agent Runtime 或运行时代理目标。

## 目标

第一步只做低风险整理：不改变后端、不改变真实运行时行为，只让设置页表达更准确，并补一个当前最需要的工作目录记忆清理入口。

## 设计

1. 设置页增加「系统信息」tab：只读展示当前前端地址、后端 rootDir、Agent Runtime API 状态，以及当前 rootDir 对应的 cwd/cwdHistory localStorage key 是否存在。
2. 原「上下文」「API」改成明确的「旧版 Chat」语境，提示这些设置只影响旧版聊天实验，不影响 Agent Runtime。
3. `contextSize` 增加说明：当前用于旧版 Chat 的显示/保存，不是 Agent Runtime 的真实模型窗口。
4. `apiBaseUrl` 增加说明：dev 下真实代理目标由启动时环境变量/Vite proxy 决定，运行时修改不一定改变代理目标。
5. 增加「清除当前 rootDir 工作目录记忆」按钮：删除 `agentlab.cwd:${rootDir}` 和 `agentlab.cwdHistory:${rootDir}`，不碰 MySQL session，不碰后端。

## 不做

- 不新增后端设置 API。
- 不改 Agent Runtime 运行参数。
- 不设计 MCP 设置界面。
- 不删除旧版 Chat 设置。
- 不改数据库 schema。

## 验收

- 设置弹窗可打开，默认看到系统信息。
- rootDir 加载成功时能显示当前 rootDir 和 cwd 记忆状态。
- 清理按钮只删除当前 rootDir 对应的 cwd/cwdHistory localStorage key。
- 旧版 Chat 设置仍可修改并保存到原 store。
