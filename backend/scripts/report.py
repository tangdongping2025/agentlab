"""投资分析评分 + 报告生成。规则参考，非投资真理。

权重与阈值为可调常量（WEIGHTS / score 内的 bands）。
"""
import sys
from pathlib import Path

WEIGHTS = {'growth': 0.25, 'profit': 0.25, 'value': 0.20, 'trend': 0.15, 'safety': 0.15}
DIM_CN = {'growth': '成长性', 'profit': '盈利质量', 'value': '估值',
          'trend': '趋势', 'safety': '安全'}


def _label(s):
    return '🟢' if s >= 70 else ('🟡' if s >= 40 else '🔴')


def _clip(s):
    return max(0, min(100, s))


def score(a):
    """数字 → 分数 + 标签 + 理由。返回 {dim_scores, dim_labels, dim_reasons, total, verdict}。"""
    scores, reasons = {}, {}

    # === 成长性：mean(rev_cagr_3y%, np_cagr_3y%)，3年CAGR 更稳健 ===
    g = a['growth']
    vals = [x for x in [g.get('rev_cagr_3y'), g.get('np_cagr_3y')] if x is not None]
    gv = sum(vals) / len(vals) if vals else None
    if gv is None:        scores['growth'], reasons['growth'] = 50, '数据缺失'
    elif gv > 20:         scores['growth'], reasons['growth'] = 95, f'均值{gv:.1f}% 高增长'
    elif gv > 15:         scores['growth'], reasons['growth'] = 85, f'均值{gv:.1f}%'
    elif gv > 8:          scores['growth'], reasons['growth'] = 70, f'均值{gv:.1f}%'
    elif gv > 0:          scores['growth'], reasons['growth'] = 50, f'均值{gv:.1f}% 低增长'
    else:                 scores['growth'], reasons['growth'] = 25, f'均值{gv:.1f}% 负增长'

    # === 盈利质量：ROE 主分 + 现金含量/净利率调整 ===
    p = a['profit']
    roe = p.get('roe')
    if roe is None:
        scores['profit'], reasons['profit'] = 50, '数据缺失'
    else:
        s_ = 95 if roe > 15 else 75 if roe > 10 else 55 if roe > 5 else 30
        adj = ''
        cr = p.get('cash_ratio'); nm = p.get('net_margin')
        if cr is not None:
            if cr > 1.2: s_ += 5; adj += ' 现金含量高'
            elif cr < 0.5: s_ -= 10; adj += ' 现金含量低'
        if nm is not None and nm < 5: s_ -= 5; adj += ' 净利率低'
        scores['profit'] = _clip(s_)
        reasons['profit'] = f'ROE {roe:.1f}%{adj}'

    # === 估值（反向）：PE 分位主分 + PEG 调整 ===
    v = a['value']
    pp = v.get('pe_pct')
    if pp is None:
        scores['value'], reasons['value'] = 50, 'PE 数据缺失'
    else:
        s_ = 90 if pp < 0.2 else 70 if pp < 0.4 else 55 if pp < 0.6 else 40 if pp < 0.8 else 25
        adj = ''
        peg = v.get('peg')
        if peg is not None:
            if peg > 3: s_ -= 10; adj += f' PEG{peg:.1f}偏高'
            elif peg < 1: s_ += 5; adj += f' PEG{peg:.1f}合理'
        scores['value'] = _clip(s_)
        reasons['value'] = f'PE分位{pp:.0%}{adj}'

    # === 趋势 ===
    t = a['trend']
    r1y = t.get('ret_1y'); above = t.get('above_ma60')
    if r1y is None:
        scores['trend'], reasons['trend'] = 50, '数据不足'
    elif above:
        scores['trend'] = 90 if r1y > 0.2 else 70
        reasons['trend'] = f'近1年{r1y:+.0%} 站上MA60'
    else:
        scores['trend'] = 45 if r1y > -0.1 else 25
        reasons['trend'] = f'近1年{r1y:+.0%} 跌破MA60'

    # === 安全：就低不就高（风险敏感）===
    sf = a['safety']
    debt = sf.get('debt_ratio'); cur = sf.get('current_ratio'); mdd = sf.get('max_dd')
    s_ = 85; rlist = []
    if debt is not None and debt > 60: s_ = min(s_, 30); rlist.append(f'负债率{debt:.0f}%偏高')
    elif debt is not None and debt > 40: s_ = min(s_, 60)
    if cur is not None and cur < 1: s_ = min(s_, 30); rlist.append(f'流动比率{cur:.1f}偏低')
    elif cur is not None and cur < 1.5: s_ = min(s_, 60)
    if mdd is not None and mdd < -0.6: s_ = min(s_, 30); rlist.append(f'历史回撤{mdd:.0%}深')
    elif mdd is not None and mdd < -0.4: s_ = min(s_, 60)
    scores['safety'] = s_
    reasons['safety'] = '；'.join(rlist) if rlist else '财务稳健'

    total = sum(scores[k] * WEIGHTS[k] for k in WEIGHTS)
    if total >= 70:   verdict = '通过初筛，值得深入研究'
    elif total >= 50: verdict = '中性，信号混杂，观望'
    else:             verdict = '未通过初筛，倾向排除'

    return {
        'dim_scores':  {DIM_CN[k]: round(scores[k]) for k in scores},
        'dim_labels':  {DIM_CN[k]: _label(scores[k]) for k in scores},
        'dim_reasons': {DIM_CN[k]: reasons[k] for k in reasons},
        'total': round(total, 1),
        'verdict': verdict,
    }


def generate_report(ts_code, analysis, scored):
    """生成完整 markdown 报告。"""
    b = analysis['basic']
    g = analysis['growth']; p = analysis['profit']; v = analysis['value']
    t = analysis['trend']; sf = analysis['safety']
    last = analysis['panel'].iloc[-1]

    def pct(x):  # 百分数格式
        return f'{x:.1f}%' if x is not None else 'N/A'

    pe_now_str = f"{v['pe_now']:.1f}" if v.get('pe_now') is not None else 'N/A'
    pe_pct_str = f"{v['pe_pct']:.0%}" if v.get('pe_pct') is not None else 'N/A'
    peg_str = f"{v['peg']:.1f}" if v.get('peg') is not None else 'N/A'
    ret1y_str = f"{t['ret_1y']:+.0%}" if t.get('ret_1y') is not None else 'N/A'
    cash_str = f"{p['cash_ratio']:.2f}" if p.get('cash_ratio') is not None else 'N/A'
    mdd_str = f"{sf['max_dd']:.0%}" if sf.get('max_dd') is not None else 'N/A'
    ma_str = '站上' if t.get('above_ma60') else '跌破'

    L = []
    L.append(f"# {b['name']}（{ts_code}）自动分析报告\n")
    L.append(f"**行业**：{b['industry']} ｜ **上市**：{b['list_date']} ｜ "
             f"**现价**：{last['close']:.2f} ｜ **市值**：{last['total_mv']/1e4:.1f}亿\n")
    L.append(f"**PE-TTM**：{pe_now_str} ｜ **PB**：{last['pb']:.2f} ｜ "
             f"**股息率**：{last['dv_ttm']:.2f}%\n")

    L.append("\n## 综合评分\n")
    L.append(f"### 总分 {scored['total']} / 100 → **{scored['verdict']}**\n")
    L.append("\n| 维度 | 分数 | 标签 | 理由 |")
    L.append("|---|---|---|---|")
    for dim in ['成长性', '盈利质量', '估值', '趋势', '安全']:
        L.append(f"| {dim} | {scored['dim_scores'][dim]} | "
                 f"{scored['dim_labels'][dim]} | {scored['dim_reasons'][dim]} |")

    L.append("\n## 各维度明细\n")
    L.append(f"- **成长性**：营收3年CAGR {pct(g.get('rev_cagr_3y'))}，净利3年CAGR {pct(g.get('np_cagr_3y'))}")
    L.append(f"- **盈利质量**：ROE {pct(p.get('roe'))}，毛利率 {pct(p.get('gross_margin'))}，"
             f"净利率 {pct(p.get('net_margin'))}，现金含量 {cash_str}")
    L.append(f"- **估值**：PE分位 {pe_pct_str}，PEG {peg_str}")
    L.append(f"- **趋势**：近1年 {ret1y_str}，{ma_str}MA60")
    L.append(f"- **安全**：负债率 {pct(sf.get('debt_ratio'))}，"
             f"流动比率 {sf['current_ratio']:.2f}，历史最大回撤 {mdd_str}")

    L.append("\n---\n⚠️ 本报告由规则自动生成，**不构成投资建议**。规则参考，非投资真理。"
             " 投资决策需结合定性研究（护城河/管理层/行业）与个人风险承受力。")
    return '\n'.join(L)


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from analyze import analyze_stock
    code = sys.argv[1] if len(sys.argv) > 1 else '603171.SH'
    a = analyze_stock(code)
    s = score(a)
    print(generate_report(code, a, s))
