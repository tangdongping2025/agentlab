from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, BigInteger, DateTime, ForeignKey, Index, Boolean, Text, Float
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


class WatchlistModel(Base):
    """自选股清单(invest agent P1)。全局单用户,所有 session 共享。"""

    __tablename__ = "watchlist"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ts_code = Column(String(32), nullable=False, unique=True)
    name = Column(String(64), nullable=False)
    add_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    note = Column(String(255), nullable=True)


class BuffettAiCacheModel(Base):
    """巴菲特 AI 深挖结果缓存(RQ-094)。每股票每维度一条,永久存,force 才刷新。"""

    __tablename__ = "buffett_ai_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ts_code = Column(String(32), nullable=False)
    dimension = Column(String(32), nullable=False)  # moat_type | management_integrity
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("uniq_buffett_ai", "ts_code", "dimension", unique=True),
    )


class StockDailyModel(Base):
    """日频主表(行情+估值+复权)。主键 (code, trade_date)。候选池数据底座。"""
    __tablename__ = "stock_daily"
    code = Column(String(12), primary_key=True)
    trade_date = Column(String(8), primary_key=True)      # YYYYMMDD
    close = Column(Float)
    adj_factor = Column(Float)
    pe_ttm = Column(Float)
    total_mv = Column(Float)


class FundamentalPitModel(Base):
    """季频财务(PIT 命脉,按 ann_date 对齐)。主键 (code, end_date, ann_date)。
    ML-ready:除 roe 顺手存 grossprofit_margin/debt_to_assets(pillar C 直接用)。"""
    __tablename__ = "fundamental_pit"
    code = Column(String(12), primary_key=True)
    end_date = Column(String(8), primary_key=True)
    ann_date = Column(String(8), primary_key=True)
    roe = Column(Float)
    grossprofit_margin = Column(Float)
    debt_to_assets = Column(Float)


class IndexConstituentModel(Base):
    """指数成分(PIT 时变成分)。主键 (index_code, trade_date, code)。"""
    __tablename__ = "index_constituent"
    index_code = Column(String(12), primary_key=True)
    trade_date = Column(String(8), primary_key=True)
    code = Column(String(12), primary_key=True)
    weight = Column(Float)


class IndexDailyModel(Base):
    """指数日线(沪深300等)。主键 (ts_code, trade_date)。回测 benchmark 用真指数净值。"""
    __tablename__ = "index_daily"
    ts_code = Column(String(12), primary_key=True)
    trade_date = Column(String(8), primary_key=True)      # YYYYMMDD
    close = Column(Float)
    pct_chg = Column(Float)


class StockBasicModel(Base):
    """股票基础信息(tushare stock_basic 持久化,避免每次候选池/自选股都查 tushare)。"""
    __tablename__ = "stock_basic"
    ts_code = Column(String(12), primary_key=True)
    name = Column(String(64))
    industry = Column(String(40))
    area = Column(String(20))
    market = Column(String(16))
    exchange = Column(String(8))
    list_date = Column(String(8))
    list_status = Column(String(2))
    delist_date = Column(String(8))
    fullname = Column(String(128))
    enname = Column(String(128))


class FetchLogModel(Base):
    """增量进度/可续抓。主键 source。"""
    __tablename__ = "fetch_log"
    source = Column(String(40), primary_key=True)
    last_anchor_date = Column(String(8))
    last_updated_at = Column(DateTime)
    rows_total = Column(BigInteger)
    note = Column(String(200))


class CandidateSnapshotModel(Base):
    """一次跑策略 = 一行。保留全部历史。"""
    __tablename__ = "candidate_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    as_of_date = Column(String(8))
    strategy_name = Column(String(32), nullable=False)
    strategy_label = Column(String(32))
    universe = Column(String(12), default="000300.SH")
    params = Column(MySQLJSON, nullable=False, default=dict)
    count = Column(Integer, nullable=False, default=0)


class CandidatePoolModel(Base):
    """候选池行。外键 snapshot_id。"""
    __tablename__ = "candidate_pool"
    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(Integer, ForeignKey("candidate_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    rank = Column(Integer, nullable=False)
    ts_code = Column(String(32), nullable=False)
    name = Column(String(64))
    industry = Column(String(40))
    score = Column(Float)
    pe_rank = Column(Float)
    roe_rank = Column(Float)
    momentum_rank = Column(Float)
    promoted = Column(Boolean, nullable=False, default=False)
    promoted_at = Column(DateTime)
    __table_args__ = (
        Index("uniq_snap_code", "snapshot_id", "ts_code", unique=True),
    )
