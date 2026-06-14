def test_research_agent_registered():
    import agents
    from runtime.registry import get_agent_class
    assert get_agent_class("research") is not None


def test_research_agent_has_anysearch_tool():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("research")
    assert "anysearch" in agent.tool_names
