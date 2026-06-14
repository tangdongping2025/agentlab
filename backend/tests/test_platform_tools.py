import json


async def test_list_agents_returns_json():
    import agents  # 触发注册
    from runtime.tools.platform import ListAgentsTool
    t = ListAgentsTool()
    r = await t.execute()
    data = json.loads(r)
    assert isinstance(data, list)
    ids = [a["id"] for a in data]
    assert "echo" in ids


async def test_switch_agent_returns_action_directive():
    from runtime.tools.platform import SwitchAgentTool
    t = SwitchAgentTool()
    r = await t.execute(agent_id="echo")
    data = json.loads(r)
    assert data["_action"] == "switch_agent"
    assert data["agent_id"] == "echo"
