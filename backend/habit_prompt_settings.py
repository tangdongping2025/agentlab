from __future__ import annotations

from sqlalchemy import select

from database import SessionLocal
from models import InsightItemModel

SUPPORTED_HABIT_PROMPT_AGENT_IDS = {"assistant", "research", "claude-sdk"}


def build_habit_prompt_for_agent(agent_id: str) -> str:
    if agent_id not in SUPPORTED_HABIT_PROMPT_AGENT_IDS:
        return ""
    db = SessionLocal()
    try:
        rows = db.execute(
            select(InsightItemModel)
            .where(InsightItemModel.kind == "habit")
            .where(InsightItemModel.status == "accepted")
            .where(InsightItemModel.enabled_for_prompt == True)
            .order_by(InsightItemModel.updated_at.desc())
        ).scalars().all()
    finally:
        db.close()
    if not rows:
        return ""
    lines = [f"- {item.title}：{item.description}" for item in rows]
    return "[用户协作偏好]\n" + "\n".join(lines) + "\n[/用户协作偏好]\n\n"
