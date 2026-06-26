def test_invest_agent_registered():
    import agents  # 触发注册
    from runtime.registry import get_agent_class

    agent_cls = get_agent_class("invest")
    assert agent_cls is not None
    assert agent_cls.metadata.name == "龙虾·原生版·投资助手"
    assert agent_cls.max_loops == 15
    assert "tushare" in agent_cls.tool_names
    for name in ("suggest_pin_stock", "pin_stock", "unpin_stock", "list_watchlist"):
        assert name in agent_cls.tool_names, f"{name} 未在 invest tool_names"
    assert agent_cls.metadata.workspace["tabs"] == ["对话", "文件", "Skill", "自选股"]


def test_invest_in_supported_whitelists():
    import skill_settings, global_prompt_settings, habit_prompt_settings, agent_model_settings

    assert "invest" in skill_settings.SUPPORTED_SKILL_AGENT_IDS
    assert "invest" in global_prompt_settings.SUPPORTED_GLOBAL_PROMPT_AGENT_IDS
    assert "invest" in habit_prompt_settings.SUPPORTED_HABIT_PROMPT_AGENT_IDS
    assert "invest" in agent_model_settings.SUPPORTED_MODEL_CONFIG_AGENT_IDS


def test_invest_not_in_mcp_or_memory_or_task():
    """invest 不该出现在这些白名单(原生版不支持 MCP/记忆/任务段)。"""
    import mcp_settings, memory_preview, task_system_settings

    assert "invest" not in mcp_settings.SUPPORTED_MCP_AGENT_IDS
    assert "invest" not in memory_preview.SUPPORTED_MEMORY_PREVIEW_AGENT_IDS
    assert "invest" not in task_system_settings.SUPPORTED_TASK_SYSTEM_AGENT_IDS
