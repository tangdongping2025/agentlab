"""股票多维度分析：公司画像 + 5 维度原始数字（不含判断）。

可被 notebook/脚本 import：
    import sys; sys.path.insert(0, 'scripts')
    from analyze import analyze_stock
    a = analyze_stock('603171.SH')

也可命令行跑：
    TUSHARE_TOKEN=xxx python scripts/analyze.py [ts_code]
"""
import os
import sys
import math
from pathlib import Path
import pandas as pd
import tushare as ts

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_loader import build_daily_panel


def _pro():
    token = os.environ.get('TUSHARE_TOKEN')
    if token:
        return ts.pro_api(token)
    return ts.pro_api()   # 无环境变量时读 tushare 缓存 ~/.tushare_token


def analyze_stock(ts_code, start_date='20210101', end_date='20260707', pro=None):
    """返回各维度原始数字 dict（不含判断）。财务 PIT 安全（按 ann_date ffill）。"""
    if pro is None:
        pro = _pro()

    # 公司画像
    basic_raw = pro.stock_basic(ts_code=ts_code)
    if basic_raw is None or basic_raw.empty:
        raise ValueError(f'{ts_code} 未找到，检查代码或已退市')
    b = basic_raw.iloc[0]

    # 日频主表（PIT 安全）
    panel = build_daily_panel(ts_code, start_date, end_date, pro=pro)

    # 财务（年报，按 end_date 升序；去重保留最新 ann_date 版本——同报告期会有多次修订）
    fina = pro.fina_indicator(ts_code=ts_code).sort_values(['end_date', 'ann_date'])
    annual = (fina[fina['end_date'].str.endswith('1231')]
              .drop_duplicates('end_date', keep='last').copy())
    inc = pro.income(ts_code=ts_code,
        fields='end_date,ann_date,total_revenue,n_income_attr_p'
        ).sort_values(['end_date', 'ann_date'])
    annual_inc = (inc[inc['end_date'].str.endswith('1231')]
                  .drop_duplicates('end_date', keep='last'))
    cf = pro.cashflow(ts_code=ts_code,
        fields='end_date,ann_date,n_cashflow_act').sort_values(['end_date', 'ann_date'])
    cf_a = (cf[cf['end_date'].str.endswith('1231')]
            .drop_duplicates('end_date', keep='last'))
    last = annual.iloc[-1] if len(annual) else pd.Series()

    # === 成长性（3年CAGR 更稳健，避免低基数反弹；np_yoy 单独留给 PEG）===
    rev = annual_inc['total_revenue'].dropna()
    nip = annual_inc['n_income_attr_p'].dropna()
    rev_cagr_3y = (rev.iloc[-1] / rev.iloc[-4]) ** (1/3) - 1 if len(rev) >= 4 else None
    np_cagr_3y = (nip.iloc[-1] / nip.iloc[-4]) ** (1/3) - 1 if len(nip) >= 4 else None
    rev_cagr_3y = rev_cagr_3y * 100 if rev_cagr_3y is not None else None
    np_cagr_3y = np_cagr_3y * 100 if np_cagr_3y is not None else None
    np_yoy = last['netprofit_yoy'] if 'netprofit_yoy' in last.index else None

    # === 盈利质量 ===
    roe = last['roe'] if 'roe' in last.index else None
    gross_margin = last['grossprofit_margin'] if 'grossprofit_margin' in last.index else None
    net_margin = last['netprofit_margin'] if 'netprofit_margin' in last.index else None
    ocf = cf_a['n_cashflow_act'].iloc[-1] if len(cf_a) else None
    ni = annual_inc['n_income_attr_p'].iloc[-1] if len(annual_inc) else None
    cash_ratio = (ocf / ni) if (ocf is not None and ni not in (None, 0)) else None

    # === 估值（panel 历史分位）===
    pe_s = panel['pe_ttm'].dropna() if 'pe_ttm' in panel.columns else pd.Series(dtype=float)
    pe_now = pe_s.iloc[-1] if len(pe_s) else None
    pe_pct = (pe_s <= pe_now).mean() if pe_now is not None else None
    peg = (pe_now / np_yoy) if (pe_now and np_yoy and np_yoy > 0) else None

    # === 趋势 ===
    close = panel['close']
    ret_1y = close.iloc[-1] / close.iloc[-252] - 1 if len(close) >= 252 else None
    ma60 = close.rolling(60).mean().iloc[-1]
    above_ma60 = bool(close.iloc[-1] > ma60) if pd.notna(ma60) else False

    # === 安全 ===
    debt_ratio = last['debt_to_assets'] if 'debt_to_assets' in last.index else None
    current_ratio = last['current_ratio'] if 'current_ratio' in last.index else None
    max_dd = float((close / close.cummax() - 1).min())

    # === RQ-097/098 风险指标(多窗口 + 拆解分子分母)===
    rets = close.pct_change().dropna()

    # 最大回撤拆解(全期 peak→trough)
    cummax = close.cummax()
    dd = close / cummax - 1
    max_dd = float(dd.min()) if len(dd) else None
    max_dd_detail = None
    if max_dd is not None and len(close) > 1:
        trough_idx = dd.idxmin()
        peak_idx = close.loc[:trough_idx].idxmax()
        peak_price = float(close.loc[peak_idx])
        # 修复时间:trough 之后首次收盘价 >= peak_price 的日期
        post = close.loc[trough_idx:]
        recovered = post[post >= peak_price]
        if len(recovered):
            recover_idx = recovered.index[0]
            recover_days = int((recover_idx - trough_idx).days)
            recover_date = recover_idx.strftime('%Y-%m-%d')
            recovered_flag = True
        else:
            recover_days = None
            recover_date = None
            recovered_flag = False  # 至今未恢复
        max_dd_detail = {
            'peak_date': peak_idx.strftime('%Y-%m-%d'),
            'peak_price': peak_price,
            'trough_date': trough_idx.strftime('%Y-%m-%d'),
            'trough_price': float(close.loc[trough_idx]),
            'days': int((trough_idx - peak_idx).days),  # 下跌持续(peak→trough)
            'recover_days': recover_days,                 # 修复时间(trough→新高)
            'recover_date': recover_date,
            'recovered': recovered_flag,
        }

    # 多窗口夏普/索提诺(分子=超额收益, 分母=波动/下行波动)
    rf = 0.02
    def _window(r):
        n = len(r)
        if n < 30:
            return None
        ann_ret = r.mean() * 252
        ann_vol = r.std() * math.sqrt(252)
        downside = r[r < 0].std() * math.sqrt(252)
        excess = ann_ret - rf
        return {
            'n_days': n,
            'start': r.index[0].strftime('%Y-%m-%d'),
            'end': r.index[-1].strftime('%Y-%m-%d'),
            'ann_ret': float(ann_ret),       # 年化收益(分子的一部分)
            'rf': rf, 'excess': float(excess),  # 超额收益=分子
            'ann_vol': float(ann_vol),        # 夏普分母
            'downside_vol': float(downside) if pd.notna(downside) else None,  # 索提诺分母
            'sharpe': float(excess / ann_vol) if ann_vol > 0 else None,
            'sortino': float(excess / downside) if downside and downside > 0 else None,
        }
    end_dt = close.index[-1]
    risk_windows = {
        'y1': _window(rets.loc[rets.index >= end_dt - pd.Timedelta(days=365)]),
        'y3': _window(rets.loc[rets.index >= end_dt - pd.Timedelta(days=365 * 3)]),
        'all': _window(rets),
    }

    # 卡玛(全期:年化收益÷最大回撤)
    ann_ret_all = rets.mean() * 252 if len(rets) > 30 else None
    calmar = float(ann_ret_all / abs(max_dd)) if (ann_ret_all is not None and max_dd and max_dd < 0) else None

    # VaR/CVaR(全期)
    var_detail = None
    if len(rets) > 30:
        var_95 = float(rets.quantile(0.05))
        tail = rets[rets <= var_95]
        cvar_95 = float(tail.mean()) if len(tail) else None
        var_detail = {
            'value': var_95, 'cvar': cvar_95,
            'n_days': len(rets), 'tail_n': len(tail),
            'start': rets.index[0].strftime('%Y-%m-%d'),
            'end': rets.index[-1].strftime('%Y-%m-%d'),
        }


    # === 巴菲特盲区补充(RQ-092):近5年年报毛利率/ROIC 序列 + 最新审计意见 ===
    fina_annual = []
    if len(annual):
        cols_needed = [c for c in ['end_date', 'grossprofit_margin', 'roic'] if c in annual.columns]
        recent5 = annual[cols_needed].tail(5)
        for _, row in recent5.iterrows():
            fina_annual.append({
                'end_date': str(row['end_date']),
                'grossprofit_margin': float(row['grossprofit_margin']) if pd.notna(row.get('grossprofit_margin')) else None,
                'roic': float(row['roic']) if pd.notna(row.get('roic')) else None,
            })
    audit_result = None
    audit_end_date = None
    audit_ann_date = None
    try:
        audit = pro.fina_audit(ts_code=ts_code)
        if audit is not None and len(audit):
            a0 = audit.iloc[0]
            audit_result = str(a0.get('audit_result', '')).strip() or None
            audit_end_date = str(a0['end_date']) if pd.notna(a0.get('end_date')) else None
            audit_ann_date = str(a0['ann_date']) if pd.notna(a0.get('ann_date')) else None
    except Exception:
        audit_result = None  # 接口不可用/积分不足,降级灰灯

    # === RQ-096 时效标注:行情日期 + 财务报告期 ===
    as_of_date = panel.index[-1].strftime('%Y-%m-%d') if len(panel) else None
    fina_end_date = str(last['end_date']) if ('end_date' in last.index and pd.notna(last.get('end_date'))) else None
    fina_ann_date = str(last['ann_date']) if ('ann_date' in last.index and pd.notna(last.get('ann_date'))) else None

    return {
        'basic': {
            'name': b['name'], 'industry': b['industry'],
            'market': b['market'], 'list_date': str(b['list_date']),
        },
        'panel': panel,
        'growth': {'rev_cagr_3y': rev_cagr_3y, 'np_cagr_3y': np_cagr_3y, 'np_yoy': np_yoy},
        'profit': {'roe': roe, 'gross_margin': gross_margin,
                   'net_margin': net_margin, 'cash_ratio': cash_ratio},
        'value':  {'pe_now': pe_now, 'pe_pct': pe_pct, 'peg': peg},
        'trend':  {'ret_1y': ret_1y, 'above_ma60': above_ma60},
        'safety': {'debt_ratio': debt_ratio, 'current_ratio': current_ratio,
                   'max_dd': max_dd, 'max_dd_detail': max_dd_detail,
                   'risk_windows': risk_windows, 'calmar': calmar,
                   'ann_ret_all': float(ann_ret_all) if ann_ret_all is not None else None,
                   'var_detail': var_detail},
        'fina_annual': fina_annual,
        'audit_result': audit_result,
        'audit_end_date': audit_end_date,
        'audit_ann_date': audit_ann_date,
        'as_of_date': as_of_date,         # 行情日期(最新交易日)
        'fina_end_date': fina_end_date,   # 最新财务报告期(如 20251231)
        'fina_ann_date': fina_ann_date,   # 最新财报公告日
    }


if __name__ == '__main__':
    code = sys.argv[1] if len(sys.argv) > 1 else '603171.SH'
    a = analyze_stock(code)
    print(f"=== {a['basic']['name']} ({code}) ===")
    for k, v in a.items():
        if k in ('basic', 'panel'):
            continue
        print(f'{k}: {v}')
