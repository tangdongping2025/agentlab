"""候选池数据底座批量抓取。
run: cd backend && python scripts/fetch_candidates_data.py [--start 20200101]
读 settings.tushare_token(付费 token)。全量抓,逐股 try/except 不整批崩,重跑幂等。
"""
import os, sys, time, argparse
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))   # backend/ → config/database/models

import pandas as pd
from sqlalchemy.orm import Session

from config import settings
from database import SessionLocal
import models


def _fetch_constituents(pro, db, index_code):
    df = pro.index_weight(index_code=index_code)
    if df is None or df.empty:
        return 0
    db.query(models.IndexConstituentModel).delete()
    n = 0
    for _, r in df.iterrows():
        db.add(models.IndexConstituentModel(
            index_code=index_code, trade_date=str(r["trade_date"]),
            code=r["con_code"], weight=float(r.get("weight") or 0)))
        n += 1
    db.commit()
    return n


def _exch_from_code(code: str) -> str:
    return {"SH": "SSE", "SZ": "SZSE", "BJ": "BSE"}.get(code[-2:], "")


def _fetch_stock_basic(pro, db) -> int:
    """tushare stock_basic 全市场 → UPSERT stock_basic 表(基础信息持久化)。"""
    df = pro.stock_basic()
    if df is None or df.empty:
        return 0
    n = 0
    for _, r in df.iterrows():
        ts_code = str(r.get("ts_code") or "")
        if not ts_code:
            continue
        db.merge(models.StockBasicModel(
            ts_code=ts_code,
            name=r.get("name") or "",
            industry=r.get("industry") or "",
            area=r.get("area") or "",
            market=r.get("market") or "",
            exchange=_exch_from_code(ts_code),
            list_date=str(r.get("list_date") or ""),
            list_status=r.get("list_status") or "",
            delist_date=str(r.get("delist_date") or "") if r.get("delist_date") else None,
            fullname=r.get("fullname") or "",
            enname=r.get("enname") or "",
        ))
        n += 1
    db.commit()
    return n


def _merge_daily(pro, ts_code, start_date, end_date):
    """合并 daily + daily_basic + adj_factor → stock_daily 行列表。"""
    daily = pro.daily(ts_code=ts_code, start_date=start_date, end_date=end_date)
    basic = pro.daily_basic(ts_code=ts_code, start_date=start_date, end_date=end_date)
    adj = pro.adj_factor(ts_code=ts_code, start_date=start_date, end_date=end_date)
    if daily is None or daily.empty:
        return []
    d = daily.set_index("trade_date")
    b = basic.set_index("trade_date")[["pe_ttm", "total_mv"]] if basic is not None and not basic.empty else pd.DataFrame()
    a = adj.set_index("trade_date")[["adj_factor"]] if adj is not None and not adj.empty else pd.DataFrame()
    joined = d.join(b, how="left").join(a, how="left").reset_index()
    rows = []
    for _, r in joined.iterrows():
        rows.append({
            "code": ts_code, "trade_date": str(r["trade_date"]),
            "close": float(r.get("close") or 0),
            "adj_factor": float(r["adj_factor"]) if pd.notna(r.get("adj_factor")) else None,
            "pe_ttm": float(r["pe_ttm"]) if pd.notna(r.get("pe_ttm")) else None,
            "total_mv": float(r["total_mv"]) if pd.notna(r.get("total_mv")) else None,
        })
    return rows


def _fetch_fundamentals(pro, ts_code):
    """fina_indicator 不传 fields(保 ann_date)。年报(end_date 末四位=1231)去重留最新 ann_date。"""
    df = pro.fina_indicator(ts_code=ts_code)
    if df is None or df.empty or "ann_date" not in df.columns:
        return []
    df = df.dropna(subset=["ann_date"])
    annual = df[df["end_date"].astype(str).str.endswith("1231")] if "end_date" in df.columns else df
    annual = annual.sort_values(["end_date", "ann_date"]).drop_duplicates("end_date", keep="last")
    rows = []
    for _, r in annual.iterrows():
        rows.append({
            "code": ts_code, "end_date": str(r["end_date"]), "ann_date": str(r["ann_date"]),
            "roe": float(r["roe"]) if pd.notna(r.get("roe")) else None,
            "grossprofit_margin": float(r["grossprofit_margin"]) if pd.notna(r.get("grossprofit_margin")) else None,
            "debt_to_assets": float(r["debt_to_assets"]) if pd.notna(r.get("debt_to_assets")) else None,
        })
    return rows


def _resolve_start_date(db, force_full: bool, explicit_start):
    """有锚点且非 force_full → 增量(anchor+1 日历日);否则全量(explicit_start 或 20200101)。"""
    if force_full or explicit_start:
        return explicit_start or "20200101"
    log = db.query(models.FetchLogModel).filter_by(source="stock_daily").first()
    if not log or not log.last_anchor_date:
        return "20200101"
    from datetime import timedelta
    d = datetime.strptime(log.last_anchor_date, "%Y%m%d") + timedelta(days=1)
    return d.strftime("%Y%m%d")


def fetch_all(pro, db: Session, index_code="000300.SH", start_date=None,
              end_date=None, sleep=0.3, force_full=False, progress_callback=None) -> dict:
    """抓沪深300。start_date=None 读 FetchLog 锚点:有→增量(anchor+1),无→全量;force_full 强制全量。
    daily 增量:只删 trade_date>=eff_start 的行(旧数据保留)。progress_callback(done,total,code,fail)。"""
    eff_start = _resolve_start_date(db, force_full, start_date)
    end_date = end_date or datetime.now().strftime("%Y%m%d")
    counts = {"index_constituent": 0, "stock_daily": 0, "fundamental_pit": 0, "stock_basic": 0}
    fail = 0

    try:
        counts["index_constituent"] = _fetch_constituents(pro, db, index_code)
    except Exception as e:
        print(f"[warn] index_weight 失败: {e}")

    try:
        counts["stock_basic"] = _fetch_stock_basic(pro, db)
    except Exception as e:
        print(f"[warn] stock_basic 失败: {e}")

    codes = [r.code for r in db.query(models.IndexConstituentModel.code).filter(
        models.IndexConstituentModel.index_code == index_code).distinct()]
    for i, code in enumerate(codes):
        try:
            sd = _merge_daily(pro, code, eff_start, end_date)
            # 增量:只删 >= eff_start 的行(旧数据保留)
            db.query(models.StockDailyModel).filter(
                models.StockDailyModel.code == code,
                models.StockDailyModel.trade_date >= eff_start).delete()
            for r in sd:
                db.add(models.StockDailyModel(**r))
            fp = _fetch_fundamentals(pro, code)
            for r in fp:
                db.merge(models.FundamentalPitModel(**r))  # 全量 upsert(PK 幂等)
            db.commit()
            counts["stock_daily"] += len(sd)
            counts["fundamental_pit"] += len(fp)
        except Exception as e:
            fail += 1
            db.rollback()
            print(f"[warn] {code} 抓取失败: {e}")
        if progress_callback:
            progress_callback(i + 1, len(codes), code, fail)
        if sleep:
            time.sleep(sleep)

    db.merge(models.FetchLogModel(
        source="stock_daily", last_anchor_date=end_date,
        last_updated_at=datetime.utcnow(),
        rows_total=db.query(models.StockDailyModel).count(),
        note=f"start={eff_start} codes={len(codes)} fail={fail}"))
    db.commit()
    print(f"[done] {counts} start={eff_start} codes={len(codes)} fail={fail}")
    return counts


if __name__ == "__main__":
    import tushare as ts
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=None, help="起始日(默认读 FetchLog 增量)")
    ap.add_argument("--end", default=None)
    ap.add_argument("--force-full", action="store_true", help="强制全量重抓")
    args = ap.parse_args()
    token = settings.tushare_token.strip()
    if not token:
        sys.exit("tushare_token 未配置(settings.tushare_token)")
    pro = ts.pro_api(token)

    def _cli_progress(done, total, cur, fail):
        if done % 50 == 0 or done == total:
            print(f"[progress] {done}/{total} current={cur} fail={fail}")

    db = SessionLocal()
    try:
        fetch_all(pro, db, start_date=args.start, end_date=args.end,
                  force_full=args.force_full, progress_callback=_cli_progress)
    finally:
        db.close()
