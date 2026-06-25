def test_tushare_skill_discoverable():
    """tushare-data skill 搬到 backend/skills 后能被 discover_skills 扫到。"""
    from skill_settings import discover_skills

    skills = discover_skills()
    ids = [s.get("id") for s in skills]
    assert "tushare-data" in ids
