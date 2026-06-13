from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import (
    SessionCreate, SessionUpdate, SessionOut, SessionListItem, MessageOut,
)

router = APIRouter(prefix="/api/db", tags=["sessions"])


def _compute_total_tokens(messages) -> int:
    total = 0
    for m in messages or []:
        tu = m.tokenUsage if hasattr(m, "tokenUsage") else (m.get("tokenUsage") if isinstance(m, dict) else None)
        if tu:
            total += int(tu.get("input", 0)) + int(tu.get("output", 0))
    return total


def _to_session_out(sess: models.SessionModel, include_messages: bool) -> SessionOut:
    messages = []
    if include_messages and sess.messages:
        for mm in sorted(sess.messages, key=lambda x: x.seq):
            payload = mm.payload or {}
            messages.append(MessageOut(
                role=mm.role,
                content=mm.content or "",
                timestamp=payload.get("timestamp"),
                tokenUsage=payload.get("tokenUsage"),
                toolsUsed=payload.get("toolsUsed"),
                files=payload.get("files"),
                isFileOnly=payload.get("isFileOnly"),
                thinkingContent=payload.get("thinkingContent"),
                thinkingTokens=payload.get("thinkingTokens"),
            ))
    return SessionOut(
        id=sess.id,
        name=sess.name,
        sceneId=sess.scene_id,
        systemPrompt=sess.system_prompt,
        selectedTools=sess.selected_tools or [],
        contextStrategy=sess.context_strategy,
        contextSize=sess.context_size,
        totalTokens=sess.total_tokens or 0,
        messages=messages,
        createdAt=sess.created_at.isoformat() if sess.created_at else None,
        updatedAt=sess.updated_at.isoformat() if sess.updated_at else None,
    )


def _sync_messages(db: Session, sess: models.SessionModel, messages) -> None:
    # 删旧，按新列表重建
    db.query(models.MessageModel).filter_by(session_id=sess.id).delete()
    for seq, m in enumerate(messages or []):
        d = m if isinstance(m, dict) else m.model_dump(exclude_none=True)
        content = d.get("content", "") or ""
        db.add(models.MessageModel(
            session_id=sess.id,
            seq=seq,
            role=d.get("role", "user"),
            content=content,
            payload=d,
        ))


@router.post("/sessions", response_model=SessionOut)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    sess = models.SessionModel(
        id=payload.id or str(uuid4()),  # 优先用前端 id（乐观更新一致性）
        name=payload.name,
        scene_id=payload.sceneId,
        system_prompt=payload.systemPrompt,
        selected_tools=payload.selectedTools,
        context_strategy=payload.contextStrategy,
        context_size=payload.contextSize,
        total_tokens=0,
        created_at=now,
        updated_at=now,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return _to_session_out(sess, include_messages=True)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db)):
    # 侧栏用：返回完整会话（含 messages）。N 较小，载荷可接受。
    rows = db.execute(
        select(models.SessionModel).order_by(models.SessionModel.updated_at.desc())
    ).scalars().all()
    return [_to_session_out(s, include_messages=True) for s in rows]


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db)):
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    return _to_session_out(sess, include_messages=True)
