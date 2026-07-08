"""buffett_check 单测。不真调 tushare,直接喂 mock analysis dict。"""
from scripts.buffett_check import buffett_check, _match_industry


def _analysis(**overrides):
    """默认茅台样例数据,可用 overrides 覆盖局部字段。"""
    base = {
        "basic": {"name": "贵州茅台", "industry": "白酒", "market": "主板", "list_date": "20010827"},
        "panel": None,
        "growth": {"rev_cagr_3y": 18.5, "np_cagr_3y": 15.2, "np_yoy": 22.3},
        "profit": {"roe": 30.0, "gross_margin": 91.0, "net_margin": 50.0, "cash_ratio": 1.2},
        "value": {"pe_now": 25.0, "pe_pct": 0.50, "peg": 1.1},
        "trend": {"ret_1y": 0.15, "above_ma60": True},
        "safety": {"debt_ratio": 25.0, "current_ratio": 3.5, "max_dd": -0.3},
        "quotes": {"close": 1500, "pe_ttm": 25, "pb": 8, "total_mv": 1.8e12, "dv_ttm": 2.0},
    }
    base.update(overrides)
    return base


def test_buffett_check_returns_full_structure():
    r = buffett_check(_analysis())
    # 顶层字段齐全
    for key in ("conclusion", "eight_questions", "moat", "financials", "valuation", "risks", "summary"):
        assert key in r, f"缺字段 {key}"
    # 8 问齐全
    assert len(r["eight_questions"]) == 8
    for q in r["eight_questions"]:
        assert set(q.keys()) == {"n", "dimension", "light", "explain"}
        assert q["light"] in ("green", "yellow", "red", "gray")
    # conclusion.counts 四档齐全
    assert set(r["conclusion"]["counts"].keys()) == {"green", "yellow", "red", "gray"}
    # financials 6 个指标
    assert len(r["financials"]) == 6
    # 茅台匹配白酒模板
    assert r["industry_matched"] == "白酒"


def test_eight_questions_lights_by_thresholds():
    # 高 ROE + 高现金含量 → Q5 green
    a = _analysis(profit={"roe": 30, "gross_margin": 91, "net_margin": 50, "cash_ratio": 1.5})
    r = buffett_check(a)
    q5 = r["eight_questions"][4]  # 利润真假
    assert q5["light"] == "green"
    q1 = r["eight_questions"][0]  # 白酒简单业务
    assert q1["light"] == "green"
    q3 = r["eight_questions"][2]  # 毛利率 91% 护城河
    assert q3["light"] == "green"

    # 低现金含量 → Q5 red
    a = _analysis(profit={"roe": 5, "gross_margin": 30, "net_margin": 3, "cash_ratio": 0.5})
    r = buffett_check(a)
    assert r["eight_questions"][4]["light"] == "red"

    # Q7 管理诚信恒为灰
    assert r["eight_questions"][6]["light"] == "gray"
    # Q4 定价权恒为灰
    assert r["eight_questions"][3]["light"] == "gray"


def test_industry_template_match():
    assert _match_industry("水力发电") == "水电"
    assert _match_industry("白酒制造") == "白酒"
    assert _match_industry("软件开发") == "软件"
    assert _match_industry("股份制银行") == "银行"
    assert _match_industry("一个不存在的行业") == "generic"


def test_valuation_margin_of_safety():
    # pe_pct 低位 → 有安全边际
    r = buffett_check(_analysis(value={"pe_now": 15, "pe_pct": 0.20, "peg": 1}))
    assert "安全边际" in r["valuation"]["margin_of_safety"]
    # pe_pct 高位 → 不足
    r = buffett_check(_analysis(value={"pe_now": 60, "pe_pct": 0.85, "peg": 3}))
    assert "不足" in r["valuation"]["margin_of_safety"]


def test_verdict_by_counts():
    # 全绿(白酒茅台样例,只 Q4/Q7 灰)→ 通过初筛
    r = buffett_check(_analysis())
    assert "通过" in r["conclusion"]["verdict"] or "基本" in r["conclusion"]["verdict"]
