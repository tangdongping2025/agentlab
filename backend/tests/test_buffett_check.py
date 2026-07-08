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
        "fina_annual": [
            {"end_date": "20211231", "grossprofit_margin": 89.0, "roic": 28.0},
            {"end_date": "20221231", "grossprofit_margin": 90.0, "roic": 29.0},
            {"end_date": "20231231", "grossprofit_margin": 91.0, "roic": 30.0},
            {"end_date": "20241231", "grossprofit_margin": 91.0, "roic": 31.0},
            {"end_date": "20251231", "grossprofit_margin": 91.2, "roic": 31.5},
        ],
        "audit_result": "标准无保留意见",
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

    # Q7 管理诚信(RQ-092 起看审计意见,茅台样例标准无保留 → green)
    assert r["eight_questions"][6]["light"] == "green"
    # Q4 定价权(RQ-092 起看多年毛利率,茅台样例上升 → green)
    assert r["eight_questions"][3]["light"] == "green"


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


# === RQ-092 盲区规则化测试 ===

def test_pricing_power_trend():
    from scripts.buffett_check import _light_pricing_power
    # 毛利率上升 → green
    up = [{"grossprofit_margin": 60.0}, {"grossprofit_margin": 62.0}, {"grossprofit_margin": 65.0}]
    assert _light_pricing_power(up)[0] == "green"
    # 大降(>5pp) → red
    down = [{"grossprofit_margin": 70.0}, {"grossprofit_margin": 64.0}, {"grossprofit_margin": 63.0}]
    assert _light_pricing_power(down)[0] == "red"
    # 缓降(<5pp) → yellow
    slight = [{"grossprofit_margin": 50.0}, {"grossprofit_margin": 48.0}, {"grossprofit_margin": 47.0}]
    assert _light_pricing_power(slight)[0] == "yellow"
    # 数据不足 → gray
    assert _light_pricing_power([{"grossprofit_margin": 50.0}])[0] == "gray"


def test_audit_opinion_mapping():
    from scripts.buffett_check import _light_audit
    assert _light_audit("标准无保留意见")[0] == "green"
    assert _light_audit("带强调事项段的无保留意见")[0] == "yellow"
    assert _light_audit("保留意见")[0] == "yellow"
    assert _light_audit("无法表示意见")[0] == "red"
    assert _light_audit("否定意见")[0] == "red"
    assert _light_audit(None)[0] == "gray"


def test_moat_strength_roic_trend():
    from scripts.buffett_check import _moat_strength_from_roic
    # 高 ROIC 且不降 → 强
    strong = [{"roic": 28}, {"roic": 29}, {"roic": 30}, {"roic": 31}, {"roic": 31.5}]
    s, t = _moat_strength_from_roic(strong)
    assert "强" in s
    # 低 ROIC → 弱
    weak = [{"roic": 5}, {"roic": 4}, {"roic": 4.5}]
    s, t = _moat_strength_from_roic(weak)
    assert "弱" in s
    # 数据不足
    s, t = _moat_strength_from_roic([{"roic": 10}])
    assert "不足" in s


def test_eight_questions_q4_q7_no_longer_fixed_gray():
    """茅台样例(Q4 数据上升 / Q7 标准无保留)→ 不再固定灰"""
    r = buffett_check(_analysis())
    q4 = r["eight_questions"][3]
    q7 = r["eight_questions"][6]
    assert q4["light"] != "gray"  # 有多年毛利率数据,应判绿
    assert q4["light"] == "green"
    assert q7["light"] == "green"  # 标准无保留意见
