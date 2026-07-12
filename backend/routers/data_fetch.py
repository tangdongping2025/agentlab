"""数据抓取管理:异步触发(daemon thread)+ 进度查询 + 状态查询。"""
import threading
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/api/db", tags=["data_fetch"])

# 进程内任务状态(backend 重启重置 idle)
_JOB: dict = {"state": "idle", "done": 0, "total": 0, "current_code": "",
              "fail": 0, "started_at": None, "finished_at": None, "error": None,
              "force_full": False}


def _reset_job():
    _JOB.update(state="idle", done=0, total=0, current_code="", fail=0,
                started_at=None, finished_at=None, error=None, force_full=False)


def _update_job(done, total, current_code, fail):
    _JOB["done"] = done
    _JOB["total"] = total
    _JOB["current_code"] = current_code
    _JOB["fail"] = fail


def _run_fetch_job(force_full: bool):
    import sys, os
    _SCRIPTS = os.path.join(os.path.dirname(__file__), '..', 'scripts')
    if _SCRIPTS not in sys.path:
        sys.path.insert(0, _SCRIPTS)
    from database import SessionLocal
    from config import settings
    db = SessionLocal()
    try:
        token = (settings.tushare_token or "").strip()
        if not token:
            raise RuntimeError("tushare_token 未配置")
        import tushare as ts
        from fetch_candidates_data import fetch_all
        pro = ts.pro_api(token)
        fetch_all(pro, db, force_full=force_full, progress_callback=_update_job)
        _JOB["state"] = "done"
        _JOB["finished_at"] = datetime.utcnow().isoformat()
    except Exception as e:
        _JOB["state"] = "failed"
        _JOB["error"] = str(e)
        _JOB["finished_at"] = datetime.utcnow().isoformat()
    finally:
        db.close()


@router.get("/fetch/status")
def fetch_status(db: Session = Depends(get_db)):
    log = db.query(models.FetchLogModel).filter_by(source="stock_daily").first()
    return {
        "stock_daily": db.query(models.StockDailyModel).count(),
        "fundamental_pit": db.query(models.FundamentalPitModel).count(),
        "index_constituent": db.query(models.IndexConstituentModel).count(),
        "stock_basic": db.query(models.StockBasicModel).count(),
        "last_anchor_date": log.last_anchor_date if log else None,
        "last_updated_at": log.last_updated_at.isoformat() if log and log.last_updated_at else None,
    }


@router.post("/fetch/trigger")
def fetch_trigger(payload: dict):
    if _JOB.get("state") == "running":
        raise HTTPException(status_code=409, detail="已有抓取任务在跑")
    force_full = bool(payload.get("force_full", False))
    _reset_job()
    _JOB.update(state="running", started_at=datetime.utcnow().isoformat(), force_full=force_full)
    threading.Thread(target=_run_fetch_job, args=(force_full,), daemon=True).start()
    return {"job_id": "singleton", "state": "running"}


@router.get("/fetch/progress")
def fetch_progress():
    return dict(_JOB)
