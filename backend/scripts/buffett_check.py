"""巴菲特式规则体检(不依赖 LLM)。

复用 analyze.analyze_stock 的产出,按阈值 + 预写文案库产出通俗体检结果。
数据盲区(Q7 管理诚信/Q4 定价权深度/护城河类型)诚实标灰/留白,后续 AI 补。

可被 routers/watchlist.py import:
    from buffett_check import buffett_check
    result = buffett_check(analysis_dict)
"""
from datetime import datetime


# === 文案库:每个指标 4 档(绿/黄/红/灰),带 {val} 插值 ===

ROE_COPY = {
    "green_top": "每 100 块本金赚 {val} 块,顶级生意才有的水平 🟢",
    "green":     "每 100 块本金赚 {val} 块,过巴菲特 15% 及格线 🟢",
    "yellow":    "每 100 块本金赚 {val} 块,中规中矩 🟡",
    "red":       "每 100 块本金只赚 {val} 块,回报偏低 🔴",
}

GROSS_MARGIN_COPY = {
    "green":  "毛利率 {val}%(>60%),可能有强护城河 🟢",
    "yellow": "毛利率 {val}%(40-60%),护城河一般 🟡",
    "red":    "毛利率 {val}%(<40%),大宗商品型嫌疑 🔴",
}

NET_MARGIN_COPY = {
    "green_top": "净利率 {val}%(>30%),盈利能力优秀 🟢",
    "green":     "净利率 {val}%(15-30%),良好 🟢",
    "yellow":    "净利率 {val}%(5-15%),一般 🟡",
    "red":       "净利率 {val}%(<5%),薄利 🔴",
}

CASH_RATIO_COPY = {
    "green_top": "赚 100 块利润收回 {val} 块现金(>120%),顶配含金量 🟢",
    "green":     "赚 100 块利润收回 {val} 块现金(90-120%),优秀 🟢",
    "yellow":    "赚 100 块利润收回 {val} 块现金(70-90%),需留意 🟡",
    "red":       "赚 100 块利润只收回 {val} 块现金(<70%),可能是纸面利润 🔴",
}

DEBT_COPY = {
    "green":  "负债率 {val}%,财务稳健{relax}",
    "yellow": "负债率 {val}%,中等{relax}",
    "red":    "负债率 {val}%,杠杆偏高 🔴",
}

DIVIDEND_COPY = {
    "green_top": "股息率 {val}%(>4%),现金回报丰厚 🟢",
    "green":     "股息率 {val}%(2.5-4%),比银行理财高 🟢",
    "yellow":    "股息率 {val}%(1-2.5%),一般 🟡",
    "red":       "股息率 {val}%(<1%),不分红或成长型 🔴",
}

PE_PCT_COPY = {
    "green":  "历史分位 {val}%(<30%),相对自己算便宜 🟢",
    "yellow": "历史分位 {val}%(30-60%),合理区间 🟡",
    "red":    "历史分位 {val}%(>60%),偏贵 🔴",
}


# === 行业模板 ===

INDUSTRY_TEMPLATES = {
    "水电": {
        "keywords": ["水力发电", "水电", "水利"],
        "q1_simple": True,
        "debt_relax": True,  # 重资产高负债是常态
        "risks": ["来水风险(枯水年发电量降)", "电价管制(发改委降价)", "成长见顶(新机组建完)"],
        "summary": "这是一类你买下后不用太操心的稳态生意——资产能用几十年,边际成本接近零,每年像老黄牛一样稳定拉钱。适合长期底仓,但别期望暴利。",
    },
    "白酒": {
        "keywords": ["白酒", "酒类", "葡萄酒"],
        "q1_simple": True,
        "debt_relax": False,
        "risks": ["消费需求周期", "政策风险(消费税/反腐)", "品牌竞争加剧"],
        "summary": "白酒是巴菲特最爱的'收费桥'型生意——品牌力强、毛利率高、存货越放越值钱。关键看品牌护城河能否持续。",
    },
    "软件": {
        "keywords": ["软件", "信息技术", "互联网", "计算机"],
        "q1_simple": False,
        "debt_relax": False,
        "risks": ["技术迭代快", "客户集中度高", "应收账款回款"],
        "summary": "软件生意模式取决于客户粘性和续费率。看ROIC和现金流质量,警惕应收账款增长快于营收。",
    },
    "银行": {
        "keywords": ["银行", "股份制"],
        "q1_simple": True,
        "debt_relax": True,  # 银行天然高杠杆
        "risks": ["坏账风险(经济下行)", "息差收窄", "监管收紧"],
        "summary": "银行是杠杆生意,关键看资产质量(不良率)和成本收入比。巴菲特投银行要求'财务实力本身就是护城河'。",
    },
    "保险": {
        "keywords": ["保险", "寿险", "财险"],
        "q1_simple": True,
        "debt_relax": True,
        "risks": ["承保亏损(灾害/定价错)", "投资端波动", "浮存金成本上升"],
        "summary": "保险看承保纪律和浮存金运用。巴菲特爱保险因为浮存金是'免费杠杆',但要求承保不亏。",
    },
    "消费品": {
        "keywords": ["食品", "饮料", "日化", "零售", "服装", "家电", "消费"],
        "q1_simple": True,
        "debt_relax": False,
        "risks": ["消费降级/升级切换", "渠道变化", "原材料成本"],
        "summary": "消费品靠品牌+渠道。看毛利率稳定性(定价权)和库存周转。长青品牌是优质收费桥。",
    },
}
GENERIC_TEMPLATE = {
    "q1_simple": None,  # 未知
    "debt_relax": False,
    "risks": ["需结合行业判断(行业模板未覆盖)"],
    "summary": "这家的生意模式需要结合行业特性深入判断。先用财务数据看基本面,再定性研究护城河。",
}


def _match_industry(name: str) -> str:
    """根据行业名匹配模板 key,未匹配返回 'generic'。"""
    if not name:
        return "generic"
    for key, tpl in INDUSTRY_TEMPLATES.items():
        if any(kw in name for kw in tpl["keywords"]):
            return key
    return "generic"


def _pick(copy: dict, light: str, val) -> str:
    """选对应档位文案并插值。"""
    return copy[light].format(val=val)


def _light_roe(v):
    if v is None:
        return "gray", "ROE 数据缺失"
    if v >= 20:
        return "green", _pick(ROE_COPY, "green_top", round(v, 1))
    if v >= 15:
        return "green", _pick(ROE_COPY, "green", round(v, 1))
    if v >= 10:
        return "yellow", _pick(ROE_COPY, "yellow", round(v, 1))
    return "red", _pick(ROE_COPY, "red", round(v, 1))


def _light_gross_margin(v):
    if v is None:
        return "gray", "毛利率数据缺失"
    if v >= 60:
        return "green", _pick(GROSS_MARGIN_COPY, "green", round(v, 1))
    if v >= 40:
        return "yellow", _pick(GROSS_MARGIN_COPY, "yellow", round(v, 1))
    return "red", _pick(GROSS_MARGIN_COPY, "red", round(v, 1))


def _light_net_margin(v):
    if v is None:
        return "gray", "净利率数据缺失"
    if v >= 30:
        return "green", _pick(NET_MARGIN_COPY, "green_top", round(v, 1))
    if v >= 15:
        return "green", _pick(NET_MARGIN_COPY, "green", round(v, 1))
    if v >= 5:
        return "yellow", _pick(NET_MARGIN_COPY, "yellow", round(v, 1))
    return "red", _pick(NET_MARGIN_COPY, "red", round(v, 1))


def _light_cash_ratio(v):
    if v is None:
        return "gray", "现金含量数据缺失"
    if v >= 1.2:
        return "green", _pick(CASH_RATIO_COPY, "green_top", round(v * 100, 1))
    if v >= 0.9:
        return "green", _pick(CASH_RATIO_COPY, "green", round(v * 100, 1))
    if v >= 0.7:
        return "yellow", _pick(CASH_RATIO_COPY, "yellow", round(v * 100, 1))
    return "red", _pick(CASH_RATIO_COPY, "red", round(v * 100, 1))


def _light_debt(v, relax=False):
    """relax=True 时重资产行业(水电/银行/保险)放宽阈值。"""
    if v is None:
        return "gray", "负债率数据缺失"
    threshold_yellow = 70 if relax else 50
    threshold_red = 80 if relax else 70
    relax_note = "(重资产行业放宽标准)" if relax else ""
    val = round(v, 1)
    if v < threshold_yellow:
        return "green", DEBT_COPY["green"].format(val=val, relax=relax_note)
    if v < threshold_red:
        return "yellow", DEBT_COPY["yellow"].format(val=val, relax=relax_note)
    return "red", DEBT_COPY["red"].format(val=val)


def _light_pe_pct(v):
    if v is None:
        return "gray", "PE 分位数据缺失"
    if v < 0.30:
        return "green", _pick(PE_PCT_COPY, "green", round(v * 100))
    if v < 0.60:
        return "yellow", _pick(PE_PCT_COPY, "yellow", round(v * 100))
    return "red", _pick(PE_PCT_COPY, "red", round(v * 100))


def _light_dividend(v):
    if v is None:
        return "gray", "股息率数据缺失"
    if v >= 4:
        return "green", _pick(DIVIDEND_COPY, "green_top", round(v, 2))
    if v >= 2.5:
        return "green", _pick(DIVIDEND_COPY, "green", round(v, 2))
    if v >= 1:
        return "yellow", _pick(DIVIDEND_COPY, "yellow", round(v, 2))
    return "red", _pick(DIVIDEND_COPY, "red", round(v, 2))


def _list_years(list_date_str):
    """从 '20031118' 算上市年数。"""
    try:
        d = datetime.strptime(str(list_date_str), "%Y%m%d")
        return (datetime.now() - d).days / 365.25
    except Exception:
        return None


def _eight_questions(a, ind_key):
    """巴菲特 8 问自动判定。返回 list[8]。"""
    tpl = INDUSTRY_TEMPLATES.get(ind_key, GENERIC_TEMPLATE)
    profit = a.get("profit", {}) or {}
    safety = a.get("safety", {}) or {}
    value = a.get("value", {}) or {}
    basic = a.get("basic", {}) or {}

    # Q1 看得懂吗(行业简单度)
    if tpl["q1_simple"] is True:
        q1 = ("green", f"{basic.get('industry', '该行业')}业务模式简单,一句话能讲清")
    elif tpl["q1_simple"] is False:
        q1 = ("yellow", f"{basic.get('industry', '该行业')}业务较复杂,需确认自己看得懂")
    else:
        q1 = ("gray", "未匹配行业模板,需自己判断是否看得懂")

    # Q2 10 年后还在不在
    years = _list_years(basic.get("list_date"))
    if years is None:
        q2 = ("gray", "上市时间数据缺失")
    elif years >= 10 and ind_key in ("水电", "白酒", "银行", "保险", "消费品"):
        q2 = ("green", f"已上市 {years:.0f} 年,行业成熟稳定,10 年后大概率还在")
    elif years >= 10:
        q2 = ("yellow", f"已上市 {years:.0f} 年,但行业是否受颠覆需判断")
    else:
        q2 = ("yellow", f"上市仅 {years:.0f} 年,存续性待验证")

    # Q3 别人能复制吗(护城河信号:毛利率)
    gm = profit.get("gross_margin")
    if gm is None:
        q3 = ("gray", "毛利率数据缺失,无法判断护城河")
    elif gm >= 60:
        q3 = ("green", f"毛利率 {gm:.0f}%(>60%),可能有强护城河(类型需 AI 定性)")
    elif gm >= 40:
        q3 = ("yellow", f"毛利率 {gm:.0f}%,护城河一般")
    else:
        q3 = ("red", f"毛利率仅 {gm:.0f}%(<40%),大宗商品型嫌疑,无明显护城河")

    # Q4 能涨价吗(定价权,数据有限)
    q4 = ("gray", "定价权需看多年毛利率趋势 + 提价事件,数据不足(深度需 AI)")

    # Q5 利润真假(现金含量)
    q5 = list(_light_cash_ratio(profit.get("cash_ratio")))

    # Q6 负债安全
    q6 = list(_light_debt(safety.get("debt_ratio"), relax=tpl["debt_relax"]))

    # Q7 管理诚信(固定盲区)
    q7 = ("gray", "数据看不出来,需人工看公告/审计意见/管理层履历")

    # Q8 价格划算
    q8 = list(_light_pe_pct(value.get("pe_pct")))

    dims = ["看得懂吗", "10 年后还在吗", "别人能复制吗", "能涨价吗",
            "利润是真金白银吗", "欠债扛得住吗", "管理层诚实吗", "价格划算吗"]
    lights = [q1, q2, q3, q4, q5, q6, q7, q8]
    return [{"n": i + 1, "dimension": dims[i], "light": lights[i][0], "explain": lights[i][1]}
            for i in range(8)]


def _moat_signal(a):
    gm = (a.get("profit") or {}).get("gross_margin")
    if gm is None:
        return {"signal": "毛利率数据缺失", "type": "需 AI 定性", "strength": "数据不足", "trend": "数据不足"}
    if gm >= 60:
        strength = "中-强(基于毛利水平)"
    elif gm >= 40:
        strength = "中等"
    else:
        strength = "弱"
    return {
        "signal": f"毛利率 {gm:.1f}%" + ("(>60%,可能有护城河)" if gm >= 60 else ("(40-60%,护城河一般)" if gm >= 40 else "(<40%,大宗商品型嫌疑)")),
        "type": "需 AI 定性(资源/品牌/成本/网络/切换/规模)",
        "strength": strength,
        "trend": "需看多年毛利率趋势判断 widen/narrow",
    }


def _financials(a):
    p = a.get("profit") or {}
    s = a.get("safety") or {}
    v = a.get("value") or {}
    q = a.get("quotes") or {}
    items = []
    # ROE
    light, explain = _light_roe(p.get("roe"))
    items.append({"metric": "ROE(净资产收益率)", "value": p.get("roe"), "light": light, "explain": explain})
    # 毛利率
    light, explain = _light_gross_margin(p.get("gross_margin"))
    items.append({"metric": "毛利率", "value": p.get("gross_margin"), "light": light, "explain": explain})
    # 净利率
    light, explain = _light_net_margin(p.get("net_margin"))
    items.append({"metric": "净利率", "value": p.get("net_margin"), "light": light, "explain": explain})
    # 现金含量
    light, explain = _light_cash_ratio(p.get("cash_ratio"))
    items.append({"metric": "现金含量(经营现金流/净利润)", "value": p.get("cash_ratio"), "light": light, "explain": explain})
    # 负债率
    light, explain = _light_debt(s.get("debt_ratio"))
    items.append({"metric": "负债率", "value": s.get("debt_ratio"), "light": light, "explain": explain})
    # 股息率
    light, explain = _light_dividend(q.get("dv_ttm"))
    items.append({"metric": "股息率", "value": q.get("dv_ttm"), "light": light, "explain": explain})
    return items


def _valuation(a):
    v = a.get("value") or {}
    light, explain = _light_pe_pct(v.get("pe_pct"))
    pe_now = v.get("pe_now")
    pe_pct = v.get("pe_pct")
    # 安全边际判断
    if pe_pct is not None and pe_pct < 0.30:
        mos = "相对历史低位,有一定安全边际"
    elif pe_pct is not None and pe_pct < 0.60:
        mos = "合理区间,无明显折扣"
    elif pe_pct is not None:
        mos = "偏贵,安全边际不足"
    else:
        mos = "数据不足"
    return {
        "pe": pe_now,
        "pe_pct": pe_pct,
        "explain": explain,
        "margin_of_safety": mos,
    }


def _verdict(counts):
    """根据红绿灯统计给结论。"""
    g = counts["green"]
    if g >= 6 and counts["red"] == 0:
        return "通过初筛,值得深入研究"
    if g >= 4 and counts["red"] <= 1:
        return "基本通过,部分维度需深入"
    if counts["red"] >= 3:
        return "多盏红灯,谨慎"
    return "信号混杂,需更多研究"


def buffett_check(analysis: dict) -> dict:
    """巴菲特式规则体检主函数。analysis = analyze_stock() 的返回。"""
    basic = analysis.get("basic", {}) or {}
    ind_key = _match_industry(basic.get("industry", ""))
    tpl = INDUSTRY_TEMPLATES.get(ind_key, GENERIC_TEMPLATE)

    eight = _eight_questions(analysis, ind_key)
    counts = {"green": 0, "yellow": 0, "red": 0, "gray": 0}
    for q in eight:
        counts[q["light"]] = counts.get(q["light"], 0) + 1

    verdict = _verdict(counts)
    one_liners = {
        "通过初筛,值得深入研究": "基本面不错,值得纳入观察池",
        "基本通过,部分维度需深入": "大方向可以,几个点要查清",
        "多盏红灯,谨慎": "多处亮红灯,建议规避或深挖原因",
        "信号混杂,需更多研究": "好坏了各半,别急着下结论",
    }

    return {
        "conclusion": {
            "verdict": verdict,
            "one_liner": one_liners.get(verdict, ""),
            "counts": counts,
        },
        "eight_questions": eight,
        "moat": _moat_signal(analysis),
        "financials": _financials(analysis),
        "valuation": _valuation(analysis),
        "risks": tpl["risks"],
        "summary": tpl["summary"],
        "industry_matched": ind_key,
    }


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from analyze import analyze_stock
    code = sys.argv[1] if len(sys.argv) > 1 else "600900.SH"
    import json
    print(json.dumps(buffett_check(analyze_stock(code)), ensure_ascii=False, indent=2))
