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
    existing = db.query(models.WatchlistModel).filter(
        models.WatchlistModel.ts_code == payload.ts_code
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="ts_code 已存在")
    row = models.WatchlistModel(ts_code=payload.ts_code, name=payload.name, note=payload.note)
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
