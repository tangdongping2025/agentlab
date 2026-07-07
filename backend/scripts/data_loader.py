"""日频主表构建器：价格 + 估值 + 财务(PIT安全)。

把不同频率的指标对齐到交易日：
  - 日频：价格(daily) + 估值(daily_basic) → 天然日频，直接 join
  - 季频：财务(fina_indicator) → 用【公告日 ann_date】对齐到交易日并 ffill
           公告日前为 NaN，公告后才进入主表 —— 避免 look-ahead bias(前视偏差)

可被其他脚本/notebook import：
    import sys; sys.path.append('scripts')
    from data_loader import build_daily_panel
    df = build_daily_panel('603171.SH', '20210101', '20260707')

也可直接命令行跑（默认 603171 样例）：
    TUSHARE_TOKEN=xxx python scripts/data_loader.py

输出：data/panel_{code}.csv
"""
import os
import sys
from pathlib import Path
import pandas as pd
import tushare as ts

ROOT = Path(__file__).resolve().parent.parent

# 财务指标（fina_indicator 一个接口全覆盖，均为百分比/比率口径）
FINA_FIELDS = [
    'ann_date', 'end_date',             # ann_date=公告日(对齐用, PIT安全) end_date=报告期(追溯用)
    'roe', 'grossprofit_margin', 'netprofit_margin',   # ⚠️ gross_margin是毛利额(元)，用grossprofit_margin才是毛利率(%)
    'debt_to_assets', 'current_ratio', 'ar_turn',
]
# 注：本 token 的 fina_indicator 不返回 f_ann_date(实际公告日)，用 ann_date 替代
#     (对多数公司 ann_date≈f_ann_date，PIT 安全性等价)


def _get_pro():
    token = os.environ.get('TUSHARE_TOKEN')
    if token:
        return ts.pro_api(token)
    # 无环境变量时（如 Jupyter kernel 未继承），读 tushare 缓存 ~/.tushare_token
    return ts.pro_api()


def build_daily_panel(ts_code, start_date, end_date, pro=None):
    """构建日频主表：价格 + 估值 + 财务(按公告日 ffill, PIT安全)。

    参数：
        ts_code    股票代码，如 '603171.SH'
        start_date 起始日 YYYYMMDD
        end_date   结束日 YYYYMMDD
        pro        可选，已建好的 tushare pro_api 对象（复用连接）

    返回：DataFrame，DatetimeIndex(升序, name='date')，列为各指标。
    价格/估值当日值；财务为"截至当日已公告的最新一期"。
    """
    if pro is None:
        pro = _get_pro()

    # 1. 价格（日频主轴）—— 不复权，长期回测建议改 pro_bar(adj='qfq')
    price = pro.daily(ts_code=ts_code, start_date=start_date, end_date=end_date)
    if price is None or price.empty:
        raise ValueError(f'{ts_code} 未拉到日线，检查代码/日期/token')
    price = (price[['trade_date', 'close', 'vol', 'amount', 'pct_chg']]
             .assign(date=lambda x: pd.to_datetime(x['trade_date']))
             .drop(columns='trade_date')
             .set_index('date').sort_index())

    # 2. 估值（日频）
    val = pro.daily_basic(ts_code=ts_code, start_date=start_date, end_date=end_date,
                          fields='trade_date,pe_ttm,pb,ps_ttm,total_mv,dv_ttm')
    if val is not None and not val.empty:
        val = (val.assign(date=lambda x: pd.to_datetime(x['trade_date']))
                .drop(columns='trade_date')
                .set_index('date').sort_index())
        price = price.join(val)

    # 3. 财务（季频 → 按公告日 ann_date 对齐到交易日）
    #    本 token 下 fina_indicator 不返回 f_ann_date，用 ann_date（公告日）替代，PIT 等价
    #    reindex(method='ffill')：每个交易日取 <=当日 的最新一份已公告财报
    #    公告日之前为 NaN → 天然 PIT 安全（拿不到未公告的数据）
    #    注：不传 fields —— 该接口 fields 模式会静默丢弃 ann_date（实测）
    fina = pro.fina_indicator(ts_code=ts_code)
    if fina is not None and not fina.empty:
        have = [c for c in FINA_FIELDS if c in fina.columns]
        fina = (fina.dropna(subset=['ann_date'])
                    .assign(date=lambda x: pd.to_datetime(x['ann_date']))
                    .sort_values('date')
                    .drop_duplicates('date', keep='last')   # 同日多次公告取最新
                    .set_index('date'))
        cols = [c for c in have if c != 'ann_date']
        price = price.join(fina[cols].reindex(price.index, method='ffill'))

    price.index.name = 'date'
    return price


def main():
    TS_CODE = '603171.SH'
    START, END = '20210101', '20260707'

    pro = _get_pro()
    df = build_daily_panel(TS_CODE, START, END, pro=pro)

    out = ROOT / 'data' / f'panel_{TS_CODE.split(".")[0]}.csv'
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out)
    print(f'已写入 {out}：{len(df)} 行  '
          f'{df.index.min().date()} ~ {df.index.max().date()}')
    print(f'列：{list(df.columns)}')

    print('\n--- 各列非空率（看数据覆盖）---')
    print((df.notna().mean()).round(3).to_string())

    # ===== PIT 验证：财务数据应在公告日(ann_date)才更新，而非报告期(end_date) =====
    print('\n===== PIT 验证：每期财报应在【公告日】才进入主表 =====')
    recent = (pro.fina_indicator(ts_code=TS_CODE)
              [['ann_date', 'end_date', 'roe']].head(4))
    print(recent.to_string(index=False))
    print('\n  期号  报告期     公告日     主表中公告前→公告后 ROE')
    for i, row in recent.iterrows():
        fad = pd.to_datetime(row['ann_date'])
        before = df.loc[:fad - pd.Timedelta(days=1), 'roe'].dropna()
        after = df.loc[fad:, 'roe'].dropna()
        if len(before) and len(after):
            b, a = before.iloc[-1], after.iloc[0]
            flag = '✓ 公告日更新' if abs(a - b) > 1e-6 else '= 未变(两期同值)'
            print(f'  {i}   {row["end_date"]}  {row["ann_date"]}   '
                  f'{b:.2f} → {a:.2f}  {flag}')

    print('\n--- tail(5) ---')
    print(df.tail())


if __name__ == '__main__':
    main()
