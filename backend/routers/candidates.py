import os
import sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models

# 让 router 能 import screener(在 backend/scripts)
_SCRIPTS = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from screener import compute_candidates, PRESETS, DEFAULT_PARAMS  # noqa: E402

router = APIRouter(prefix="/api/db", tags=["candidates"])


def _resolve_params(label: str | None, params: dict | None) -> dict:
    if params:                                  # 自定义优先
        return {**DEFAULT_PARAMS, **params}
    if label and label in PRESETS:              # 预设
        return dict(PRESETS[label])
    return dict(DEFAULT_PARAMS)


@router.get("/candidates/strategies")
def list_strategies():
    return {"strategies": [{"name": "rank_composite", "label": "rank-composite 横截面秩复合"}],
            "presets": {k: dict(v) for k, v in PRESETS.items()}}


@router.post("/candidates/run")
def run(payload: dict, db: Session = Depends(get_db)):
    strategy = payload.get("strategy", "rank_composite")
    if strategy != "rank_composite":
        raise HTTPException(status_code=400, detail=f"v1 仅支持 rank_composite: {strategy}")
    if db.query(models.StockDailyModel).count() == 0:
        raise HTTPException(status_code=409, detail="数据底座为空,先跑 scripts/fetch_candidates_data.py")
    label = payload.get("label")
    params = _resolve_params(label, payload.get("params"))

    candidates = compute_candidates(db, strategy, params)        # as_of 默认最新交易日

    snap = models.CandidateSnapshotModel(
        run_at=datetime.utcnow(),
        strategy_name=strategy, strategy_label=label or "自定义",
        universe="000300.SH", params=params, count=len(candidates))
    db.add(snap)
    db.flush()
    for c in candidates:
        db.add(models.CandidatePoolModel(
            snapshot_id=snap.id, rank=c.rank, ts_code=c.ts_code, name=c.name,
            industry=c.industry, score=c.score, pe_rank=c.pe_rank,
            roe_rank=c.roe_rank, momentum_rank=c.momentum_rank))
    db.commit()
    return {"snapshot_id": snap.id, "count": snap.count, "as_of_date": snap.as_of_date}


@router.get("/candidates/snapshots")
def list_snapshots(db: Session = Depends(get_db)):
    rows = db.query(models.CandidateSnapshotModel).order_by(
        models.CandidateSnapshotModel.run_at.desc()).all()
    return [{"id": r.id, "run_at": r.run_at.isoformat() if r.run_at else None,
             "as_of_date": r.as_of_date, "strategy_name": r.strategy_name,
             "strategy_label": r.strategy_label, "count": r.count, "params": r.params}
            for r in rows]


@router.get("/candidates")
def list_candidates(snapshot_id: int | None = None, db: Session = Depends(get_db)):
    if not snapshot_id:
        last = db.query(models.CandidateSnapshotModel).order_by(
            models.CandidateSnapshotModel.run_at.desc()).first()
        if not last:
            return {"snapshot_id": None, "items": []}
        snapshot_id = last.id
    rows = db.query(models.CandidatePoolModel).filter_by(snapshot_id=snapshot_id).order_by(
        models.CandidatePoolModel.rank.asc()).all()
    return {"snapshot_id": snapshot_id,
            "items": [{"id": r.id, "rank": r.rank, "ts_code": r.ts_code, "name": r.name,
                       "industry": r.industry, "score": r.score, "pe_rank": r.pe_rank,
                       "roe_rank": r.roe_rank, "momentum_rank": r.momentum_rank,
                       "promoted": r.promoted} for r in rows]}


@router.post("/candidates/{snapshot_id}/promote/{ts_code}")
def promote(snapshot_id: int, ts_code: str, db: Session = Depends(get_db)):
    row = db.query(models.CandidatePoolModel).filter_by(snapshot_id=snapshot_id, ts_code=ts_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="该候选不在快照中")
    # 防重入 watchlist
    exists = db.query(models.WatchlistModel).filter_by(ts_code=ts_code).first()
    if not exists:
        db.add(models.WatchlistModel(ts_code=ts_code, name=row.name))
    row.promoted = True
    row.promoted_at = datetime.utcnow()
    db.commit()
    return {"promoted": ts_code, "already_in_watchlist": exists is not None}
