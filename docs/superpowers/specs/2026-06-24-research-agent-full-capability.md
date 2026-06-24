# 研究助手 agent 移植龙虾能力

> 2026-06-24。龙虾(claude-sdk)有文件/命令/skill/mcp/记忆能力但 TTFT 10s(CLI 冷启动);研究助手(BaseAgent)TTFT 0s 但只有 anysearch。把龙虾能力移植到研究助手,得到「快版全能 agent」。

## 背景

实测同 LLM(glm-4.7 智谱)下:research(BaseAgent 直连)TTFT **0s** vs claude-sdk(CLI)**10.3s**,差距纯来自 CLI 冷启动。BaseAgent 已有 skill/mcp/工具循环骨架(`base_agent.py` 已调 `build_skill_prompt`+`get_mcp_tools_for_agent`),只缺文件工具的 Python 实现。

## 目标

研究助手获得(= 快版龙虾):
- 工具:Read/Glob/Grep/Edit/Bash/WebSearch(`runtime/tools/` Python 实现)
- workspace tabs:[对话, 文件, Skill, MCP, 记忆](同龙虾)
- 保留 anysearch + 联网搜索能力

## 范围(A~G 已确认)

- **A 工具**:Read/Glob/Grep/Edit/Bash/WebSearch 全补
- **B workspace**:tabs 同龙虾
- **C Bash**:超时 30s + cwd 锁定 ROOT_DIR(/workspace),命令本身不限制(容器隔离)
- **D Edit**:照抄 Claude Code 语义(file_path/old_string/new_string/replace_all,old_string 不唯一报错)
- **E research 定位**:id=`research` 不变,name/prompt 改全能调性(搜索+文件+命令)
- **F anysearch**:保留
- **G 龙虾**:保留共存(用于对比)

## 非目标

- 不改龙虾(claude-sdk agent)
- 前端基本不动(workspace tabs 是通用的)
- 不做多 key/provider 切换

## 约束

- 文件工具在容器内 /workspace 操作(受 ROOT_DIR 约束)
- Bash 超时 30s,输出截断(防超大);危险命令不拦截(容器隔离,用户自担)
- LLM 配置已与龙虾一致(glm-4.7 智谱),对比基线公平
