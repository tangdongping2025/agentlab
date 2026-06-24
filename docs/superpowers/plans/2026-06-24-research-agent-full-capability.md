# 实现计划:研究助手移植龙虾能力

## Task 1: 文件读取工具 Read/Glob/Grep(TDD)

- `runtime/tools/file_read.py`:三个工具类
  - Read(file_path, offset?, limit?) → 文件内容(截断 1MB)
  - Glob(pattern, path?) → 匹配文件列表
  - Grep(pattern, path?, include?) → 匹配行+行号
- 路径约束:相对 ROOT_DIR,禁止 `..` 越狱
- `tests/test_tools_file_read.py`:读文件/offset-limit/不存在/Glob 匹配/Grep 内容/越狱拒绝

## Task 2: 文件编辑工具 Edit(TDD)

- `runtime/tools/file_edit.py`:Edit(file_path, old_string, new_string, replace_all?)
  - 照抄 Claude Code:old_string 必须唯一(否则报错提示),replace_all=True 替换全部
  - 文件不存在/old_string 未找到 → 报错信息
- `tests/test_tools_file_edit.py`:替换/replace_all/不唯一报错/未找到/新建文件(new_string 可空)

## Task 3: 命令工具 Bash(TDD)

- `runtime/tools/bash.py`:Bash(command, timeout?=30)
  - subprocess, cwd=ROOT_DIR, timeout 超时杀进程
  - 输出 stdout+stderr 合并,截断(防超大)
- `tests/test_tools_bash.py`:执行 echo/超时/输出捕获/工作目录

## Task 4: WebSearch 工具(TDD)

- `runtime/tools/websearch.py`:WebSearch(query),复用 anysearch 逻辑
- `tests/test_tools_websearch.py`:query 必填/调 anysearch

## Task 5: research_agent 配置 + workspace tabs(TDD)

- `research_agent.py`:
  - tool_names = ["anysearch", "Read", "Glob", "Grep", "Edit", "Bash", "WebSearch"]
  - workspace = {"type": "tabs", "tabs": ["对话", "文件", "Skill", "MCP", "记忆"]}
  - system_prompt 扩展:你是全能助手,可搜索/读写文件/执行命令
- `tests/test_research_agent.py`:metadata.workspace.tabs、tool_names、工具已注册

## Task 6: 端到端验证 + 部署

- `backend pytest` 全过
- 本地 docker 验证 research:读 /workspace 文件、执行命令、搜索
- 重建镜像部署 ECS + 本地
- commit + push
