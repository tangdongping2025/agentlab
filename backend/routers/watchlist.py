from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import WatchlistIn, WatchlistOut

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
