from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from routers.sessions import _sync_messages, _compute_total_tokens

router = APIRouter(prefix="/api/db", tags=["migrate"])


class MigrateRequest(BaseModel):
    sessions: list[dict]


@router.post("/migrate")
def migrate(req: MigrateRequest, db: Session = Depends(get_db)):
    imported = 0
    skipped = 0
    for raw in req.sessions:
        sid = raw.get("id")
        if not sid or db.get(models.SessionModel, sid):
            skipped += 1
            continue
        messages = raw.get("messages", [])
        sess = models.SessionModel(
            id=sid,
            name=raw.get("name"),
            scene_id=raw.get("sceneId"),
            system_prompt=raw.get("systemPrompt"),
            selected_tools=raw.get("selectedTools", []),
            context_strategy=raw.get("contextStrategy"),
            context_size=raw.get("contextSize"),
            total_tokens=_compute_total_tokens(messages),
            created_at=raw.get("createdAt") or datetime.utcnow(),
            updated_at=raw.get("updatedAt") or datetime.utcnow(),
        )
        db.add(sess)
        db.flush()
        _sync_messages(db, sess, messages)
        imported += 1
    db.commit()
    return {"imported": imported, "skipped": skipped}
