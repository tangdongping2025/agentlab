import os
import sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import settings
from database import get_db
import models

# 让 router 能 import screener(在 backend/scripts)
_SCRIPTS = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from screener import compute_candidates, PRESETS, DEFAULT_PARAMS, _latest_trade_date  # noqa: E402
from backtest import run_backtest  # noqa: E402

router = APIRouter(prefix="/api/db", tags=["candidates"])

# 策略白名单(v1 支持的策略)
_ALLOWED = {"rank_composite", "ml_lightgbm"}


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
    if strategy not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"v1 仅支持 {sorted(_ALLOWED)}: {strategy}")
    if db.query(models.StockDailyModel).count() == 0:
        raise HTTPException(status_code=409, detail="数据底座为空,先跑 scripts/fetch_candidates_data.py")
    label = payload.get("label")
    params = _resolve_params(label, payload.get("params"))

    candidates = compute_candidates(db, strategy, params)        # as_of 默认最新交易日

    snap = models.CandidateSnapshotModel(
        run_at=datetime.utcnow(),
        strategy_name=strategy, strategy_label=label or "自定义",
        universe="000300.SH", params=params, count=len(candidates),
        as_of_date=_latest_trade_date(db))
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


@router.post("/candidates/backtest")
def backtest(payload: dict, db: Session = Depends(get_db)):
    strategy = payload.get("strategy", "rank_composite")
    if strategy not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"v1 仅支持 {sorted(_ALLOWED)}: {strategy}")
    if db.query(models.StockDailyModel).count() == 0:
        raise HTTPException(status_code=409, detail="数据底座为空,先跑 scripts/fetch_candidates_data.py")
    params = _resolve_params(payload.get("label"), payload.get("params"))
    weighting = payload.get("weighting", "equal")
    result = run_backtest(db, strategy, params,
                        start_date=payload.get("start", "20200101"),
                        end_date=payload.get("end"),
                        cadence=payload.get("cadence", "monthly"),
                        cost_single=payload.get("cost", 0.001),
                        weighting=weighting,
                        opt_window=payload.get("opt_window", 60),
                        max_w=payload.get("max_w", 0.3))
    # 自动存历史(AI 点评 null,按需 UPDATE)
    eq = result.get("equity", [])
    rec = models.BacktestHistoryModel(
        strategy=strategy, strategy_label=payload.get("label"),
        params={**params, "weighting": weighting, "opt_window": payload.get("opt_window", 60), "max_w": payload.get("max_w", 0.3)},
        start_date=payload.get("start", "20200101"), end_date=result.get("as_of"),
        cadence=payload.get("cadence", "monthly"), weighting=weighting,
        metrics=result.get("metrics"),
        equity_first=eq[0]["strategy"] if eq else None,
        equity_last=eq[-1]["strategy"] if eq else None,
        benchmark_last=eq[-1]["benchmark"] if eq else None,
        points_count=len(eq),
        ic_count=len(result.get("ic", [])),
    )
    db.add(rec); db.commit(); db.refresh(rec)
    result["backtest_id"] = rec.id
    return result


def _parse_verdict(comment: str) -> str:
    for line in (comment or "").splitlines():
        line = line.strip()
        if line.upper().startswith("VERDICT:"):
            v = line.split(":", 1)[1].strip()
            for k in ("不靠谱", "谨慎", "靠谱"):   # 先匹配"不靠谱",避免子串误判("靠谱" in "不靠谱")
                if k in v:
                    return k
    return "谨慎"


def _build_analysis_prompt(rec) -> tuple[str, str]:
    m = rec.metrics or {}
    ic_part = (f" ICIR={m.get('icir')} IC胜率={m.get('ic_win_rate')} IC期数={rec.ic_count}"
               if rec.strategy.startswith("ml") else "")
    system = (
        "你是量化回测分析助手,严格基于提供的回测指标诊断,不臆测未给的数据。"
        "诊断维度:①绝对收益与年化 ②风险(最大回撤/Sharpe/Calmar)③超额 vs 沪深300 ④胜率 ⑤回撤恢复力 "
        "⑥参数合理性(window/top_n/权重/调仓频率)⑦幸存者偏差/过拟合/前视风险提醒 ⑧改进建议。"
        "要求:中文,结论先行,关键数字加粗,分维度小标题,诚实标注数据局限。"
        "输出格式:第一行必须是 `VERDICT: 靠谱` 或 `VERDICT: 谨慎` 或 `VERDICT: 不靠谱`(三选一),"
        "后续 Markdown 点评 300-500 字。"
    )
    user = (
        f"策略:{rec.strategy}({rec.strategy_label or '自定义'}) 区间:{rec.start_date}~{rec.end_date} "
        f"频率:{rec.cadence} 加权:{rec.weighting}\n参数:{rec.params}\n"
        f"指标:年化={m.get('ann_return')} 基准年化={m.get('bench_ann_return')} 超额={m.get('excess')} "
        f"Sharpe={m.get('sharpe')} 最大回撤={m.get('max_drawdown')} Calmar={m.get('calmar')} 胜率={m.get('win_rate')}{ic_part}\n"
        f"净值:起点{rec.equity_first} → 末点{rec.equity_last}(共{rec.points_count}期),沪深300末点{rec.benchmark_last}"
    )
    return system, user


def _call_llm(system_prompt: str, user_prompt: str) -> str:
    """调 LLM(anthropic SDK + deepseek 兼容端点)。失败抛异常。"""
    from anthropic import Anthropic
    client = Anthropic(api_key=settings.llm_api_key, base_url=settings.llm_base_url)
    resp = client.messages.create(model=settings.llm_model, max_tokens=1500,
                                  system=system_prompt, messages=[{"role": "user", "content": user_prompt}])
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    return "".join(parts).strip() or "AI 未返回有效内容"


@router.post("/candidates/backtest/{bt_id}/analyze")
def analyze_backtest(bt_id: int, db: Session = Depends(get_db)):
    rec = db.query(models.BacktestHistoryModel).filter_by(id=bt_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="回测记录不存在")
    system, user = _build_analysis_prompt(rec)
    try:
        comment = _call_llm(system, user)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {e}")
    verdict = _parse_verdict(comment)
    rec.ai_comment = comment
    rec.ai_verdict = verdict
    rec.ai_analyzed_at = datetime.utcnow()
    db.commit()
    return {"verdict": verdict, "comment": comment, "analyzed_at": rec.ai_analyzed_at.isoformat()}


@router.get("/candidates/backtest/history")
def backtest_history(db: Session = Depends(get_db)):
    rows = db.query(models.BacktestHistoryModel).order_by(
        models.BacktestHistoryModel.created_at.desc()).all()
    return [{"id": r.id, "created_at": r.created_at.isoformat() if r.created_at else None,
             "strategy": r.strategy, "strategy_label": r.strategy_label,
             "start_date": r.start_date, "end_date": r.end_date,
             "ann_return": (r.metrics or {}).get("ann_return"),
             "excess": (r.metrics or {}).get("excess"),
             "max_drawdown": (r.metrics or {}).get("max_drawdown"),
             "ai_verdict": r.ai_verdict} for r in rows]


@router.get("/candidates/backtest/{bt_id}")
def backtest_detail(bt_id: int, db: Session = Depends(get_db)):
    r = db.query(models.BacktestHistoryModel).filter_by(id=bt_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="回测记录不存在")
    return {"id": r.id, "created_at": r.created_at.isoformat() if r.created_at else None,
            "strategy": r.strategy, "strategy_label": r.strategy_label, "params": r.params,
            "start_date": r.start_date, "end_date": r.end_date, "cadence": r.cadence,
            "weighting": r.weighting, "metrics": r.metrics,
            "equity_first": r.equity_first, "equity_last": r.equity_last,
            "benchmark_last": r.benchmark_last, "points_count": r.points_count,
            "ic_count": r.ic_count, "ai_verdict": r.ai_verdict, "ai_comment": r.ai_comment,
            "ai_analyzed_at": r.ai_analyzed_at.isoformat() if r.ai_analyzed_at else None}


@router.delete("/candidates/backtest/{bt_id}")
def delete_backtest(bt_id: int, db: Session = Depends(get_db)):
    r = db.query(models.BacktestHistoryModel).filter_by(id=bt_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="回测记录不存在")
    db.delete(r); db.commit()
    return {"deleted": bt_id}
