from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import (
    AppendMessagesIn,
    MessageOut,
    MessageWindowOut,
    QueryResult,
    SessionCreate,
    SessionListItem,
    SessionOut,
    SessionUpdate,
)

router = APIRouter(prefix="/api/db", tags=["sessions"])

DEFAULT_MESSAGE_WINDOW_LIMIT = 12
MAX_MESSAGE_WINDOW_LIMIT = 50


def _compute_total_tokens(messages) -> int:
    total = 0
    for m in messages or []:
        tu = m.tokenUsage if hasattr(m, "tokenUsage") else (m.get("tokenUsage") if isinstance(m, dict) else None)
        if tu:
            total += int(tu.get("input", 0)) + int(tu.get("output", 0))
    return total


def _message_out(mm: models.MessageModel) -> MessageOut:
    payload = mm.payload or {}
    return MessageOut(
        seq=mm.seq,
        role=mm.role,
        content=mm.content or "",
        timestamp=payload.get("timestamp") or (mm.created_at.isoformat() if mm.created_at else None),
        tokenUsage=payload.get("tokenUsage"),
        toolsUsed=payload.get("toolsUsed"),
        files=payload.get("files"),
        isFileOnly=payload.get("isFileOnly"),
        thinkingContent=payload.get("thinkingContent"),
        thinkingTokens=payload.get("thinkingTokens"),
    )


def _message_payload(d: dict) -> dict:
    return {k: v for k, v in d.items() if k not in {"role", "content"} and v is not None}


def _bounded_limit(limit: int) -> int:
    return max(1, min(limit, MAX_MESSAGE_WINDOW_LIMIT))


def _to_session_out(sess: models.SessionModel, include_messages: bool) -> SessionOut:
    messages = []
    if include_messages and sess.messages:
        for mm in sorted(sess.messages, key=lambda x: x.seq):
            messages.append(_message_out(mm))
    return SessionOut(
        id=sess.id,
        name=sess.name,
        sceneId=sess.scene_id,
        systemPrompt=sess.system_prompt,
        selectedTools=sess.selected_tools or [],
        contextStrategy=sess.context_strategy,
        contextSize=sess.context_size,
        agentId=sess.agent_id,
        cwd=sess.cwd,
        cwdHistory=sess.cwd_history or [],
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
            payload=_message_payload(d),
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
        agent_id=payload.agentId,
        cwd=payload.cwd,
        cwd_history=payload.cwdHistory,
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


@router.get("/sessions/query", response_model=QueryResult)
def query_sessions(
    q: Optional[str] = None,
    scene: Optional[str] = None,
    agent: Optional[str] = None,
    start: Optional[str] = None,   # ISO 日期/时间，对应 from
    end: Optional[str] = None,     # 对应 to
    min_token: Optional[int] = None,
    max_token: Optional[int] = None,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
):
    stmt = select(models.SessionModel)

    # 关键词：命中任一消息全文，或会话名 LIKE
    if q:
        # 转义 LIKE 通配符，避免用户输入 % / _ 被当通配符
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        subq = select(models.MessageModel.session_id).where(
            models.MessageModel.content.match(q)
        )
        stmt = stmt.where(or_(models.SessionModel.name.like(f"%{escaped}%", escape="\\"), models.SessionModel.id.in_(subq)))

    if scene:
        stmt = stmt.where(models.SessionModel.scene_id == scene)
    if agent:
        stmt = stmt.where(models.SessionModel.agent_id == agent)
    if start:
        stmt = stmt.where(models.SessionModel.created_at >= start)
    if end:
        stmt = stmt.where(models.SessionModel.created_at <= end)
    if min_token is not None:
        stmt = stmt.where(models.SessionModel.total_tokens >= min_token)
    if max_token is not None:
        stmt = stmt.where(models.SessionModel.total_tokens <= max_token)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
    rows = db.execute(
        stmt.order_by(models.SessionModel.updated_at.desc())
        .offset((page - 1) * size).limit(size)
    ).scalars().all()

    items = []
    for sess in rows:
        first = sorted(sess.messages, key=lambda x: x.seq)[0] if sess.messages else None
        preview = (first.content[:30] if first and first.content else "") or (sess.name or "")
        items.append(SessionListItem(
            id=sess.id, name=sess.name, sceneId=sess.scene_id, agentId=sess.agent_id, preview=preview,
            totalTokens=sess.total_tokens or 0,
            createdAt=sess.created_at.isoformat() if sess.created_at else None,
            updatedAt=sess.updated_at.isoformat() if sess.updated_at else None,
        ))
    return QueryResult(items=items, total=total, page=page, size=size)


@router.get("/sessions/{session_id}/messages", response_model=MessageWindowOut)
def get_session_messages(
    session_id: str,
    beforeSeq: Optional[int] = None,
    aroundSeq: Optional[int] = None,
    limit: int = DEFAULT_MESSAGE_WINDOW_LIMIT,
    db: Session = Depends(get_db),
):
    if beforeSeq is not None and aroundSeq is not None:
        raise HTTPException(status_code=400, detail="beforeSeq and aroundSeq cannot be used together")
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")

    limit = _bounded_limit(limit)
    total = db.execute(
        select(func.count()).select_from(models.MessageModel).where(models.MessageModel.session_id == session_id)
    ).scalar() or 0

    query = select(models.MessageModel).where(models.MessageModel.session_id == session_id)
    if aroundSeq is not None:
        target_exists = db.execute(
            select(models.MessageModel.id).where(
                models.MessageModel.session_id == session_id,
                models.MessageModel.seq == aroundSeq,
            )
        ).scalar()
        if target_exists is None:
            raise HTTPException(status_code=404, detail="message not found")
        start_seq = max(0, aroundSeq - limit // 2)
        rows = db.execute(
            query.where(models.MessageModel.seq >= start_seq)
            .order_by(models.MessageModel.seq.asc())
            .limit(limit)
        ).scalars().all()
    elif beforeSeq is not None:
        rows = db.execute(
            query.where(models.MessageModel.seq < beforeSeq)
            .order_by(models.MessageModel.seq.desc())
            .limit(limit)
        ).scalars().all()
        rows = list(reversed(rows))
    else:
        rows = db.execute(query.order_by(models.MessageModel.seq.desc()).limit(limit)).scalars().all()
        rows = list(reversed(rows))

    oldest = rows[0].seq if rows else None
    newest = rows[-1].seq if rows else None
    return MessageWindowOut(
        messages=[_message_out(row) for row in rows],
        hasMoreBefore=oldest is not None and oldest > 0,
        hasMoreAfter=newest is not None and newest < total - 1,
        oldestSeq=oldest,
        newestSeq=newest,
        total=total,
    )


@router.post("/sessions/{session_id}/messages", response_model=MessageWindowOut)
def append_session_messages(session_id: str, payload: AppendMessagesIn, db: Session = Depends(get_db)):
    sess = db.execute(
        select(models.SessionModel)
        .where(models.SessionModel.id == session_id)
        .with_for_update()
    ).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if not payload.messages:
        return get_session_messages(session_id, db=db)

    next_seq = db.execute(
        select(func.coalesce(func.max(models.MessageModel.seq), -1)).where(models.MessageModel.session_id == session_id)
    ).scalar() + 1

    added: list[models.MessageModel] = []
    for offset, message in enumerate(payload.messages):
        data = message.model_dump(exclude_none=True)
        row = models.MessageModel(
            session_id=session_id,
            seq=next_seq + offset,
            role=data.get("role", "user"),
            content=data.get("content", "") or "",
            payload=_message_payload(data),
        )
        db.add(row)
        added.append(row)

    sess.total_tokens = (sess.total_tokens or 0) + _compute_total_tokens(payload.messages)
    sess.updated_at = datetime.utcnow()
    db.commit()
    for row in added:
        db.refresh(row)

    total = db.execute(
        select(func.count()).select_from(models.MessageModel).where(models.MessageModel.session_id == session_id)
    ).scalar() or 0
    return MessageWindowOut(
        messages=[_message_out(row) for row in added],
        hasMoreBefore=bool(added and added[0].seq > 0),
        hasMoreAfter=False,
        oldestSeq=added[0].seq if added else None,
        newestSeq=added[-1].seq if added else None,
        total=total,
    )


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db)):
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    return _to_session_out(sess, include_messages=True)


@router.put("/sessions/{session_id}", response_model=SessionOut)
def update_session(session_id: str, payload: SessionUpdate, db: Session = Depends(get_db)):
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if payload.name is not None:
        sess.name = payload.name
    if payload.sceneId is not None:
        sess.scene_id = payload.sceneId
    if payload.systemPrompt is not None:
        sess.system_prompt = payload.systemPrompt
    if payload.selectedTools is not None:
        sess.selected_tools = payload.selectedTools
    if payload.contextStrategy is not None:
        sess.context_strategy = payload.contextStrategy
    if payload.contextSize is not None:
        sess.context_size = payload.contextSize
    if payload.agentId is not None:
        sess.agent_id = payload.agentId
    if payload.cwd is not None:
        sess.cwd = payload.cwd
    if payload.cwdHistory is not None:
        sess.cwd_history = payload.cwdHistory
    if payload.messages is not None:
        _sync_messages(db, sess, payload.messages)
        sess.total_tokens = _compute_total_tokens(payload.messages)
    sess.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(sess)
    return _to_session_out(sess, include_messages=True)


@router.delete("/sessions")
def delete_all_sessions(db: Session = Depends(get_db)):
    db.query(models.MessageModel).delete()
    db.query(models.SessionModel).delete()
    db.commit()
    return {"deleted_all": True}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    sess = db.get(models.SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    db.delete(sess)  # messages 级联删除（FK ON DELETE CASCADE）
    db.commit()
    return {"deleted": session_id}
