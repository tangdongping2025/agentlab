# 实施计划:高德 MCP 跨平台启动

对应 spec: `2026-06-17-amap-mcp-cross-platform-design.md`

## Task 1 - 代码:平台判断 + 单测(TDD)

**红**:在 `backend/tests/` 加 `test_claude_sdk_agent.py`,两个 case:
- `test_amap_command_uses_cmd_on_windows`(monkeypatch sys.platform=win32) → `command=="cmd"`、`args[0]=="/c"`
- `test_amap_command_uses_npx_on_linux`(monkeypatch sys.platform=linux) → `command=="npx"`、`args 不含 /c`

确认 fail。

**绿**:改 `backend/runtime/claude_sdk_agent.py:_build_mcp_servers`,按 `sys.platform == "win32"` 分支构造 command/args。

**提交**:`feat(claude-sdk): amap MCP 按平台区分启动命令`

## Task 2 - Dockerfile 装 nodejs

`Dockerfile` 阶段 3 第 28 行 `apt-get install` 列表追加 `nodejs npm`。无单测(集成验证放到 Task 3)。

**提交**:`build(docker): 镜像装 nodejs/npm 供 amap MCP 用`

## Task 3 - 重建镜像 + 容器 + 端到端验证

1. `docker build -t agentlab:local .`(项目根)
2. `docker rm -f agentlab && MSYS_NO_PATHCONV=1 docker run ...`(沿用 memory `agentlab-docker-restart` 的 env/挂载)
3. 验证:
   - `docker exec agentlab which npx` 非空
   - 浏览器打开 http://localhost:8080,在 SDK agent tab 提问"北京今天天气?",观察工具调用面板出现 `mcp__amap-maps__*`

**无代码 commit。** 验证通过后进 Task 4。

## Task 4 - 跟踪矩阵

在 `项目执行跟踪矩阵.md` 末尾增一段"2026-06-17 高德 MCP 跨平台修复"小节,2-3 行说明。

**提交**:`docs(tracking): 补录高德 MCP 跨平台修复`

## 不做

- 不抽象 MCP server 注册框架(YAGNI,目前只 1 个 amap)
- 不改 ANYSEARCH 那条链路(本次需求外)
- 不动镜像 Node 版本管理(走 debian 仓库默认版本即可,后续按需升)
