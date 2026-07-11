"""候选池工具(invest agent):跑策略 / 列候选 / 晋升自选股。"""
from __future__ import annotations
import json, os, sys
from typing import Any
from datetime import datetime

from database import SessionLocal
import models
from .registry import register_tool

# 引入 screener(backend/scripts)
_SCRIPTS = os.path.join(os.path.dirname(__file__), '..', '..', 'scripts')
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from screener import compute_candidates, PRESETS, DEFAULT_PARAMS, _latest_trade_date  # noqa: E402


class RunScreenerTool:
    name = "run_screener"
    description = ("跑一次策略选股(默认「多因子平衡」rank-composite),生成最新候选池快照。"
                   "可选传 label(预设)或 params(自定义)。返回快照 id + 命中数。")
    input_schema = {
        "type": "object", "properties": {
            "label": {"type": "string", "description": "预设名:多因子平衡/价值+质量/纯动量/价值+动量"},
            "params": {"type": "object", "description": "自定义参数(覆盖预设)"},
        },
    }

    async def execute(self, **params: Any) -> str:
        label = params.get("label", "多因子平衡")
        custom = params.get("params")
        p = {**DEFAULT_PARAMS, **custom} if custom else dict(PRESETS.get(label, DEFAULT_PARAMS))
        db = SessionLocal()
        try:
            if db.query(models.StockDailyModel).count() == 0:
                return json.dumps({"error": "数据底座为空,先跑 fetch_candidates_data.py"}, ensure_ascii=False)
            cands = compute_candidates(db, "rank_composite", p)
            snap = models.CandidateSnapshotModel(run_at=datetime.utcnow(),
                strategy_name="rank_composite", strategy_label=label,
                universe="000300.SH", params=p, count=len(cands),
                as_of_date=_latest_trade_date(db))
            db.add(snap); db.flush()
            for c in cands:
                db.add(models.CandidatePoolModel(snapshot_id=snap.id, rank=c.rank, ts_code=c.ts_code,
                    name=c.name, industry=c.industry, score=c.score, pe_rank=c.pe_rank,
                    roe_rank=c.roe_rank, momentum_rank=c.momentum_rank))
            db.commit()
            return json.dumps({"snapshot_id": snap.id, "count": snap.count,
                               "top": [{"code": c.ts_code, "name": c.name, "score": c.score} for c in cands[:5]]},
                              ensure_ascii=False)
        finally:
            db.close()


class ListCandidatesTool:
    name = "list_candidates"
    description = "列出最新候选池 top30(或指定 snapshot_id 的历史快照)。"
    input_schema = {"type": "object", "properties": {"snapshot_id": {"type": "integer"}}}

    async def execute(self, **params: Any) -> str:
        db = SessionLocal()
        try:
            sid = params.get("snapshot_id")
            if not sid:
                last = db.query(models.CandidateSnapshotModel).order_by(
                    models.CandidateSnapshotModel.run_at.desc()).first()
                sid = last.id if last else None
            if not sid:
                return json.dumps({"count": 0, "items": []}, ensure_ascii=False)
            rows = db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid).order_by(
                models.CandidatePoolModel.rank.asc()).all()
            return json.dumps({"snapshot_id": sid, "count": len(rows), "items": [
                {"rank": r.rank, "ts_code": r.ts_code, "name": r.name, "score": r.score,
                 "pe_rank": r.pe_rank, "roe_rank": r.roe_rank, "momentum_rank": r.momentum_rank}
                for r in rows]}, ensure_ascii=False)
        finally:
            db.close()


class PromoteCandidateTool:
    name = "promote_candidate"
    description = "把候选池里的某只股票晋升到自选股(防重)。需 ts_code,可选 snapshot_id(默认最新)。"
    input_schema = {"type": "object", "properties": {"ts_code": {"type": "string"},
                                                     "snapshot_id": {"type": "integer"}},
                    "required": ["ts_code"]}

    async def execute(self, **params: Any) -> str:
        ts_code = params.get("ts_code", "")
        db = SessionLocal()
        try:
            sid = params.get("snapshot_id")
            if not sid:
                last = db.query(models.CandidateSnapshotModel).order_by(
                    models.CandidateSnapshotModel.run_at.desc()).first()
                sid = last.id if last else None
            row = db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid, ts_code=ts_code).first() if sid else None
            exists = db.query(models.WatchlistModel).filter_by(ts_code=ts_code).first()
            if not exists and row:
                db.add(models.WatchlistModel(ts_code=ts_code, name=row.name))
            if row:
                row.promoted = True; row.promoted_at = datetime.utcnow()
            db.commit()
            return json.dumps({"promoted": ts_code, "already_in_watchlist": exists is not None}, ensure_ascii=False)
        finally:
            db.close()


def _register_default():
    register_tool(RunScreenerTool())
    register_tool(ListCandidatesTool())
    register_tool(PromoteCandidateTool())

_register_default()
