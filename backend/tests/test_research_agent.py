def test_research_agent_registered():
    import agents
    from runtime.registry import get_agent_class
    assert get_agent_class("research") is not None


def test_research_agent_has_anysearch_tool():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("research")
    assert "anysearch" in agent.tool_names


def test_research_workspace_tabs():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("research")
    assert agent.metadata.workspace["type"] == "tabs"
    tabs = agent.metadata.workspace["tabs"]
    for t in ["对话", "文件", "Skill", "MCP", "记忆"]:
        assert t in tabs, f"缺少 tab: {t}"


def test_research_tool_names_has_file_and_bash():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("research")
    for n in ["anysearch", "Read", "Glob", "Grep", "Edit", "Bash", "WebSearch"]:
        assert n in agent.tool_names, f"缺少工具声明: {n}"


def test_all_tools_registered():
    import agents  # noqa: F401  触发 agent 注册链(含 tools 注册)
    from runtime.tools import get_tool
    for n in ["Read", "Glob", "Grep", "Edit", "Bash", "WebSearch", "anysearch"]:
        assert get_tool(n) is not None, f"工具未注册: {n}"


def test_research_tools_resolved_in_init():
    """BaseAgent.__init__ 能把所有 tool_names 解析为工具实例。"""
    import agents
    from runtime.registry import create_agent
    agent = create_agent("research")
    names = {t.name for t in agent._tools}
    for n in ["Read", "Glob", "Grep", "Edit", "Bash", "WebSearch"]:
        assert n in names, f"工具未解析进 _tools: {n}"


def test_research_system_prompt_has_react_guidance():
    """RQ-8: system_prompt 含 ReAct 引导(调工具前说明思路)。"""
    import agents
    from runtime.registry import create_agent
    agent = create_agent("research")
    prompt = agent.system_prompt
    # ReAct 引导关键词
    assert "思路" in prompt and "调工具前" in prompt, "system_prompt 缺 ReAct 推理引导"

