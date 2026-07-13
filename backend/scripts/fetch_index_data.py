"""补全沪深300历史成分 + 指数日线(一次性独立脚本,不改 fetch_candidates_data 主流程)。

为什么独立:fetch_candidates_data._fetch_constituents 不传日期 → 只抓最新成分 + 全删全写,
导致 index_constituent 只有近 ~2 年。本脚本按月抓 2020 起 index_weight 历史,merge 补全(不删现有);
另抓 index_daily 写新表(回测 benchmark 真指数)。

run: cd backend && python scripts/fetch_index_data.py
读 settings.tushare_token。幂等(merge 按 PK)。
"""
import sys
import time
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))   # backend/ → config/database/models

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from database import SessionLocal
import models


def _monthly_starts(start: str, end: str) -> list[str]:
    """生成 start~end 每月首日 'YYYYMMDD'(index_weight 按月抓)。"""
    s = datetime.strptime(start, "%Y%m%d")
    e = datetime.strptime(end, "%Y%m%d")
    out = []
    y, m = s.year, s.month
    while (y, m) <= (e.year, e.month):
        out.append(f"{y:04d}{m:02d}01")
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def fetch_index_weight_history(pro, db: Session, index_code="000300.SH",
                                start="20200101", end="20240701", sleep=0.3) -> int:
    """按月抓 index_weight 历史成分,merge 入 index_constituent(保留现有 2024-07 后数据)。"""
    months = _monthly_starts(start, end)
    n = 0
    for ms in months:
        # 每月窗口 [首日, 首日+27],tushare 返回该月那一期成分
        me = ms[:6] + "28"
        try:
            df = pro.index_weight(index_code=index_code, start_date=ms, end_date=me)
        except Exception as e:
            print(f"[warn] index_weight {ms[:6]} 失败: {e}")
            if sleep:
                time.sleep(sleep)
            continue
        if df is None or df.empty:
            if sleep:
                time.sleep(sleep)
            continue
        for _, r in df.iterrows():
            db.merge(models.IndexConstituentModel(
                index_code=index_code,
                trade_date=str(r["trade_date"]),
                code=r["con_code"],
                weight=float(r.get("weight") or 0)))
            n += 1
        db.commit()
        print(f"[index_weight] {ms[:6]}: +{len(df)} (累计 merge {n})")
        if sleep:
            time.sleep(sleep)
    return n


def fetch_index_daily(pro, db: Session, ts_code="000300.SH",
                      start="20200101", end="20260710") -> int:
    """抓指数日线,merge 入 index_daily(新表)。tushare index_daily 单次支持大区间。"""
    df = pro.index_daily(ts_code=ts_code, start_date=start, end_date=end)
    if df is None or df.empty:
        print(f"[warn] index_daily {ts_code} 空")
        return 0
    n = 0
    for _, r in df.iterrows():
        db.merge(models.IndexDailyModel(
            ts_code=ts_code,
            trade_date=str(r["trade_date"]),
            close=float(r["close"]),
            pct_chg=float(r["pct_chg"]) if pd.notna(r.get("pct_chg")) else None))
        n += 1
    db.commit()
    print(f"[index_daily] {ts_code}: {n} 行 ({start}~{end})")
    return n


if __name__ == "__main__":
    import tushare as ts
    token = (settings.tushare_token or "").strip()
    if not token:
        sys.exit("tushare_token 未配置(settings.tushare_token)")
    pro = ts.pro_api(token)
    db = SessionLocal()
    try:
        # 1. 补全历史成分(2020-01 ~ 2024-07;现有 2024-07 后数据保留)
        n1 = fetch_index_weight_history(pro, db, "000300.SH", "20200101", "20240701")
        # 2. 指数日线(新 index_daily 表,需先建表 —— main.py create_all 或手动)
        try:
            n2 = fetch_index_daily(pro, db, "000300.SH", "20200101", "20260710")
        except Exception as e:
            print(f"[err] index_daily 写入失败(表未建?): {e}")
            n2 = -1
        # 验证
        c1 = db.query(func.count()).select_from(models.IndexConstituentModel).scalar()
        first_td = db.query(models.IndexConstituentModel.trade_date).order_by(
            models.IndexConstituentModel.trade_date.asc()).first()
        c3 = db.query(func.count()).select_from(models.IndexDailyModel).scalar() if n2 >= 0 else "N/A"
        print(f"[done] index_weight merge {n1}; index_daily {n2}")
        print(f"[verify] index_constituent 总行={c1} 最早={first_td[0] if first_td else None}; index_daily 总行={c3}")
    finally:
        db.close()
