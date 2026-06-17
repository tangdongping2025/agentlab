# 高德 MCP 跨平台启动

## 背景

`backend/runtime/claude_sdk_agent.py` 已注入 amap-maps MCP server,但启动命令是 `cmd /c npx -y @amap/amap-maps-mcp-server` —— 写死 Windows 风格。

线上 `agentlab` 容器(`python:3.12-slim`)无 `cmd` 也无 `node/npx`,所以 8080 上的 SDK agent 无法调用高德工具。

## 需求

1. 代码按 `sys.platform` 区分 MCP 启动命令:
   - Windows → `cmd /c npx -y @amap/amap-maps-mcp-server`(保持现状,不打破本地 dev)
   - 非 Windows → `npx -y @amap/amap-maps-mcp-server`
2. Dockerfile 阶段 3 装 `nodejs npm`(走 apt-get,最简方案,体积可接受)

## 验收

- 单测覆盖两个平台分支
- `docker exec agentlab which npx` 有输出
- 8080 上跑一次 agent,prompt 让它"查北京天气",能看到 `mcp__amap-maps__maps_weather` 调用

## 关联

- 容器重建参数见 memory `agentlab-docker-restart`
- 部署文档 `docs/deploy-mysql.md` 第 31 行(MSYS_NO_PATHCONV)仍适用
