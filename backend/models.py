from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, BigInteger, DateTime, ForeignKey, Index, Boolean
)
from sqlalchemy.dialects.mysql import MEDIUMTEXT, LONGTEXT, JSON as MySQLJSON
from sqlalchemy.orm import relationship

from database import Base


class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=True)
    scene_id = Column(String(64), nullable=True)
    system_prompt = Column(MEDIUMTEXT, nullable=True)
    selected_tools = Column(MySQLJSON, nullable=False, default=list)
    context_strategy = Column(String(16), nullable=True)
    context_size = Column(BigInteger, nullable=True)
    total_tokens = Column(BigInteger, nullable=False, default=0)
    agent_id = Column(String(64), nullable=True, index=True)
    cwd = Column(String(512), nullable=True)
    cwd_history = Column(MySQLJSON, nullable=False, default=list)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship(
        "MessageModel",
        primaryjoin="SessionModel.id == foreign(MessageModel.session_id)",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MessageModel.seq",
    )

    __table_args__ = (
        Index("idx_sessions_updated_at", "updated_at"),
    )


class AppSettingModel(Base):
    __tablename__ = "app_settings"

    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(MySQLJSON, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class InsightItemModel(Base):
    __tablename__ = "insight_items"

    id = Column(String(36), primary_key=True)
    kind = Column(String(16), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(MEDIUMTEXT, nullable=False)
    source_session_ids = Column(MySQLJSON, nullable=False, default=list)
    status = Column(String(16), nullable=False, index=True)
    enabled_for_prompt = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_insight_items_updated_at", "updated_at"),
    )


class MessageModel(Base):
    __tablename__ = "messages"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    seq = Column(Integer, nullable=False)
    role = Column(String(16), nullable=False)
    content = Column(LONGTEXT, nullable=True)
    payload = Column(MySQLJSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_messages_session_seq", "session_id", "seq"),
        Index("ft_content", "content", mysql_prefix="FULLTEXT", mysql_with_parser="ngram"),
    )
