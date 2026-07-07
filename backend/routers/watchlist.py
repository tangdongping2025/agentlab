import os
import sys
import time
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import settings
from database import get_db
import models
from schemas import WatchlistIn, WatchlistOut, WatchlistQuoteOut

router = APIRouter(prefix="/api/db", tags=["watchlist"])

# 把 backend/scripts 加到 path,让 analyze/report 能 import data_loader(脚本内部依赖)
_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)
os.environ.setdefault('TUSHARE_TOKEN', settings.tushare_token)

from analyze import analyze_stock  # noqa: E402
from report import score as score_stock  # noqa: E402
score = score_stock  # 测试 monkeypatch 目标


def _to_out(row: models.WatchlistModel) -> WatchlistOut:
    return WatchlistOut(
        id=row.id,
        ts_code=row.ts_code,
        name=row.name,
        note=row.note,
        add_time=row.add_time.isoformat() if row.add_time else None,
    )


@router.get("/watchlist", response_model=list[WatchlistOut])
def list_watchlist(db: Session = Depends(get_db)):
    rows = db.query(models.WatchlistModel).order_by(
        models.WatchlistModel.add_time.desc()
    ).all()
    return [_to_out(r) for r in rows]


@router.post("/watchlist", response_model=WatchlistOut, status_code=201)
def add_stock(payload: WatchlistIn, db: Session = Depends(get_db)):
    ts_code = payload.ts_code.strip()
    # 自动推断交易所后缀
    if "." not in ts_code:
        if ts_code.startswith("6"):
            ts_code += ".SH"
        elif ts_code.startswith(("0", "3")):
            ts_code += ".SZ"
        elif ts_code.startswith(("4", "8")):
            ts_code += ".BJ"
    # 不传 name 时从 tushare 补齐
    name = payload.name
    if not name:
        records = _tushare_post("stock_basic", {"ts_code": ts_code})
        if not records:
            raise HTTPException(status_code=404, detail=f"股票代码 {ts_code} 不存在")
        name = records[0].get("name", "")
    # 检查是否已存在
    existing = db.query(models.WatchlistModel).filter(
        models.WatchlistModel.ts_code == ts_code
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="ts_code 已存在")
    row = models.WatchlistModel(ts_code=ts_code, name=name, note=payload.note)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/watchlist/{ts_code}")
def remove_stock(ts_code: str, db: Session = Depends(get_db)):
    row = db.query(models.WatchlistModel).filter(
        models.WatchlistModel.ts_code == ts_code
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="不在自选股")
    db.delete(row)
    db.commit()
    return {"deleted": ts_code}


TUSHARE_ENDPOINT = "https://api.tushare.pro"
_QUOTES_TTL = 60.0
_TRADE_DATE_TTL = 86400.0
_QUOTES_CACHE: dict = {"quotes_map": None, "ts": 0.0}
_TRADE_DATE_CACHE: dict = {"dates": None, "ts": 0.0}


def _tushare_post(api_name: str, params: dict) -> list:
    token = settings.tushare_token.strip()
    if not token:
        raise RuntimeError("tushare_token 未配置")
    body = {"api_name": api_name, "token": token, "params": params, "fields": ""}
    resp = httpx.post(TUSHARE_ENDPOINT, json=body, timeout=30)
    payload = resp.json()
    if payload.get("code") != 0:
        raise RuntimeError(f"tushare {api_name} code={payload.get('code')} msg={payload.get('msg')}")
    data = payload.get("data") or {}
    fields = data.get("fields") or []
    items = data.get("items") or []
    return [dict(zip(fields, row)) for row in items]


def _recent_open_dates() -> list:
    now = time.time()
    if _TRADE_DATE_CACHE["dates"] and now - _TRADE_DATE_CACHE["ts"] < _TRADE_DATE_TTL:
        return _TRADE_DATE_CACHE["dates"]
    today = datetime.now().strftime("%Y%m%d")
    start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")
    items = _tushare_post("trade_cal", {"exchange": "SSE", "start_date": start, "end_date": today, "is_open": "1"})
    open_dates = sorted([it["cal_date"] for it in items if it.get("is_open") in (1, "1")], reverse=True)
    _TRADE_DATE_CACHE["dates"] = open_dates
    _TRADE_DATE_CACHE["ts"] = now
    return open_dates


def _quotes_map() -> dict:
    now = time.time()
    if _QUOTES_CACHE["quotes_map"] is not None and now - _QUOTES_CACHE["ts"] < _QUOTES_TTL:
        return _QUOTES_CACHE["quotes_map"]
    qm = {}
    for d in _recent_open_dates():
        try:
            basic = _tushare_post("daily_basic", {"trade_date": d})
            daily = _tushare_post("daily", {"trade_date": d})
        except Exception:
            continue
        if not basic and not daily:
            continue
        basic_map = {it["ts_code"]: it for it in basic}
        daily_map = {it["ts_code"]: it for it in daily}
        for tc in set(basic_map) | set(daily_map):
            b = basic_map.get(tc, {})
            dy = daily_map.get(tc, {})
            qm[tc] = {
                "close": b.get("close", dy.get("close")),
                "pct_chg": dy.get("pct_chg"),
                "pe": b.get("pe"),
                "pb": b.get("pb"),
                "total_mv": b.get("total_mv"),
            }
        if qm:
            break
    _QUOTES_CACHE["quotes_map"] = qm
    _QUOTES_CACHE["ts"] = now
    return qm


@router.get("/watchlist/quotes", response_model=list[WatchlistQuoteOut])
def get_watchlist_quotes(refresh: bool = False, db: Session = Depends(get_db)):
    rows = db.query(models.WatchlistModel).order_by(models.WatchlistModel.add_time.desc()).all()
    if not rows:
        return []
    if refresh:
        _QUOTES_CACHE["ts"] = 0.0
    try:
        qm = _quotes_map()
    except Exception:
        qm = {}
    out = []
    for r in rows:
        q = qm.get(r.ts_code, {})
        out.append(WatchlistQuoteOut(
            id=r.id, ts_code=r.ts_code, name=r.name, note=r.note,
            add_time=r.add_time.isoformat() if r.add_time else None,
            close=q.get("close"), pct_chg=q.get("pct_chg"),
            pe=q.get("pe"), pb=q.get("pb"), total_mv=q.get("total_mv"),
        ))
    return out


_DETAIL_TTL = 600.0  # 10 分钟
_DETAIL_CACHE: dict = {}  # {ts_code: {"data": ..., "ts": float}}


def _clean(obj):
    """递归把 numpy float/NaN/inf 转成 JSON 安全的 Python 原生类型(NaN→None)。"""
    import math
    import numpy as np
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        f = float(obj)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(obj, float):
        return None if math.isnan(obj) or math.isinf(obj) else obj
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


@router.get("/watchlist/stock-detail/{ts_code}")
def get_stock_detail(ts_code: str):
    now = time.time()
    hit = _DETAIL_CACHE.get(ts_code)
    if hit and now - hit["ts"] < _DETAIL_TTL:
        return _clean(hit["data"])
    try:
        analysis = analyze_stock(ts_code)
        scored = score(analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {e}")
    last = analysis["panel"].iloc[-1] if len(analysis["panel"]) else {}
    data = {
        "basic": analysis["basic"],
        "quotes": {
            "close": last.get("close"),
            "pe_ttm": last.get("pe_ttm"),
            "pb": last.get("pb"),
            "total_mv": last.get("total_mv"),
            "dv_ttm": last.get("dv_ttm"),
        },
        "score": {
            "total": scored["total"],
            "verdict": scored["verdict"],
            "dim_scores": scored["dim_scores"],
            "dim_labels": scored["dim_labels"],
            "dim_reasons": scored["dim_reasons"],
        },
        "growth": analysis["growth"],
        "profit": analysis["profit"],
        "value": analysis["value"],
        "trend": analysis["trend"],
        "safety": analysis["safety"],
    }
    _DETAIL_CACHE[ts_code] = {"data": data, "ts": now}
    return _clean(data)
