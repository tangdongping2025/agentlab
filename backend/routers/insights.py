from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import InsightItemCreate, InsightItemList, InsightItemOut, InsightItemUpdate

router = APIRouter(prefix="/api/db", tags=["insights"])


def _to_out(item: models.InsightItemModel) -> InsightItemOut:
    return InsightItemOut(
        id=item.id,
        kind=item.kind,
        title=item.title,
        description=item.description,
        sourceSessionIds=item.source_session_ids or [],
        status=item.status,
        enabledForPrompt=bool(item.enabled_for_prompt),
        createdAt=item.created_at.isoformat() if item.created_at else None,
        updatedAt=item.updated_at.isoformat() if item.updated_at else None,
    )


@router.get("/insights", response_model=InsightItemList)
def list_insights(db: Session = Depends(get_db)):
    rows = db.execute(
        select(models.InsightItemModel).order_by(models.InsightItemModel.updated_at.desc())
    ).scalars().all()
    return InsightItemList(items=[_to_out(item) for item in rows])


@router.post("/insights", response_model=InsightItemOut)
def create_insight(payload: InsightItemCreate, db: Session = Depends(get_db)):
    if payload.kind not in {"habit", "knowledge"}:
        raise HTTPException(status_code=400, detail="invalid insight kind")
    if payload.status not in {"accepted", "ignored"}:
        raise HTTPException(status_code=400, detail="invalid insight status")
    now = datetime.utcnow()
    item = models.InsightItemModel(
        id=str(uuid4()),
        kind=payload.kind,
        title=payload.title,
        description=payload.description,
        source_session_ids=payload.sourceSessionIds,
        status=payload.status,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.patch("/insights/{insight_id}", response_model=InsightItemOut)
def update_insight(insight_id: str, payload: InsightItemUpdate, db: Session = Depends(get_db)):
    item = db.get(models.InsightItemModel, insight_id)
    if not item:
        raise HTTPException(status_code=404, detail="insight not found")
    if payload.enabledForPrompt is not None:
        item.enabled_for_prompt = bool(payload.enabledForPrompt)
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.delete("/insights/{insight_id}")
def delete_insight(insight_id: str, db: Session = Depends(get_db)):
    item = db.get(models.InsightItemModel, insight_id)
    if not item:
        raise HTTPException(status_code=404, detail="insight not found")
    db.delete(item)
    db.commit()
    return {"ok": True}
