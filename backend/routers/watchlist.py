import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import settings
from database import get_db
import models
from schemas import WatchlistIn, WatchlistOut, WatchlistQuoteOut

router = APIRouter(prefix="/api/db", tags=["watchlist"])

# 把 backend/scripts 加到 path,让 analyze/report 能 import data_loader(脚本内部依赖)
_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)
os.environ.setdefault('TUSHARE_TOKEN', settings.tushare_token)

from analyze import analyze_stock  # noqa: E402
from report import score as score_stock  # noqa: E402
from buffett_check import buffett_check  # noqa: E402
score = score_stock  # 测试 monkeypatch 目标


def _to_out(row: models.WatchlistModel) -> WatchlistOut:
    return WatchlistOut(
        id=row.id,
        ts_code=row.ts_code,
        name=row.name,
        note=row.note,
        add_time=row.add_time.isoformat() if row.add_time else None,
    )


@router.get("/watchlist", response_model=list[WatchlistOut])
def list_watchlist(db: Session = Depends(get_db)):
    rows = db.query(models.WatchlistModel).order_by(
        models.WatchlistModel.add_time.desc()
    ).all()
    return [_to_out(r) for r in rows]


@router.post("/watchlist", response_model=WatchlistOut, status_code=201)
def add_stock(payload: WatchlistIn, db: Session = Depends(get_db)):
    ts_code = payload.ts_code.strip()
    # 自动推断交易所后缀
    if "." not in ts_code:
        if ts_code.startswith("6"):
            ts_code += ".SH"
        elif ts_code.startswith(("0", "3")):
            ts_code += ".SZ"
        elif ts_code.startswith(("4", "8")):
            ts_code += ".BJ"
    # 不传 name 时先查本地 stock_basic,miss 再 tushare(省积分)
    name = payload.name
    if not name:
        basic = db.query(models.StockBasicModel).filter_by(ts_code=ts_code).first()
        if basic and basic.name:
            name = basic.name
        else:
            records = _tushare_post("stock_basic", {"ts_code": ts_code})
            if not records:
                raise HTTPException(status_code=404, detail=f"股票代码 {ts_code} 不存在")
            name = records[0].get("name", "")
    # 检查是否已存在
    existing = db.query(models.WatchlistModel).filter(
        models.WatchlistModel.ts_code == ts_code
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="ts_code 已存在")
    row = models.WatchlistModel(ts_code=ts_code, name=name, note=payload.note)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/watchlist/{ts_code}")
def remove_stock(ts_code: str, db: Session = Depends(get_db)):
    row = db.query(models.WatchlistModel).filter(
        models.WatchlistModel.ts_code == ts_code
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="不在自选股")
    db.delete(row)
    db.commit()
    return {"deleted": ts_code}


TUSHARE_ENDPOINT = "https://api.tushare.pro"
_QUOTES_TTL = 60.0
_TRADE_DATE_TTL = 86400.0
_QUOTES_CACHE: dict = {"quotes_map": None, "ts": 0.0}
_TRADE_DATE_CACHE: dict = {"dates": None, "ts": 0.0}


def _tushare_post(api_name: str, params: dict) -> list:
    token = settings.tushare_token.strip()
    if not token:
        raise RuntimeError("tushare_token 未配置")
    body = {"api_name": api_name, "token": token, "params": params, "fields": ""}
    resp = httpx.post(TUSHARE_ENDPOINT, json=body, timeout=30)
    payload = resp.json()
    if payload.get("code") != 0:
        raise RuntimeError(f"tushare {api_name} code={payload.get('code')} msg={payload.get('msg')}")
    data = payload.get("data") or {}
    fields = data.get("fields") or []
    items = data.get("items") or []
    return [dict(zip(fields, row)) for row in items]


def _recent_open_dates() -> list:
    now = time.time()
    if _TRADE_DATE_CACHE["dates"] and now - _TRADE_DATE_CACHE["ts"] < _TRADE_DATE_TTL:
        return _TRADE_DATE_CACHE["dates"]
    today = datetime.now().strftime("%Y%m%d")
    start = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")
    items = _tushare_post("trade_cal", {"exchange": "SSE", "start_date": start, "end_date": today, "is_open": "1"})
    open_dates = sorted([it["cal_date"] for it in items if it.get("is_open") in (1, "1")], reverse=True)
    _TRADE_DATE_CACHE["dates"] = open_dates
    _TRADE_DATE_CACHE["ts"] = now
    return open_dates


def _quotes_map() -> dict:
    now = time.time()
    if _QUOTES_CACHE["quotes_map"] is not None and now - _QUOTES_CACHE["ts"] < _QUOTES_TTL:
        return _QUOTES_CACHE["quotes_map"]
    qm = {}
    for d in _recent_open_dates():
        try:
            basic = _tushare_post("daily_basic", {"trade_date": d})
            daily = _tushare_post("daily", {"trade_date": d})
        except Exception:
            continue
        if not basic and not daily:
            continue
        basic_map = {it["ts_code"]: it for it in basic}
        daily_map = {it["ts_code"]: it for it in daily}
        for tc in set(basic_map) | set(daily_map):
            b = basic_map.get(tc, {})
            dy = daily_map.get(tc, {})
            qm[tc] = {
                "close": b.get("close", dy.get("close")),
                "pct_chg": dy.get("pct_chg"),
                "pe": b.get("pe"),
                "pb": b.get("pb"),
                "total_mv": b.get("total_mv"),
            }
        if qm:
            break
    _QUOTES_CACHE["quotes_map"] = qm
    _QUOTES_CACHE["ts"] = now
    return qm


@router.get("/watchlist/quotes", response_model=list[WatchlistQuoteOut])
def get_watchlist_quotes(refresh: bool = False, db: Session = Depends(get_db)):
    rows = db.query(models.WatchlistModel).order_by(models.WatchlistModel.add_time.desc()).all()
    if not rows:
        return []
    if refresh:
        _QUOTES_CACHE["ts"] = 0.0
    try:
        qm = _quotes_map()
    except Exception:
        qm = {}
    out = []
    for r in rows:
        q = qm.get(r.ts_code, {})
        out.append(WatchlistQuoteOut(
            id=r.id, ts_code=r.ts_code, name=r.name, note=r.note,
            add_time=r.add_time.isoformat() if r.add_time else None,
            close=q.get("close"), pct_chg=q.get("pct_chg"),
            pe=q.get("pe"), pb=q.get("pb"), total_mv=q.get("total_mv"),
        ))
    return out


_DETAIL_TTL = 600.0  # 10 分钟
_DETAIL_CACHE: dict = {}  # {ts_code: {"data": ..., "ts": float}}


def _clean(obj):
    """递归把 numpy float/NaN/inf 转成 JSON 安全的 Python 原生类型(NaN→None)。"""
    import math
    import numpy as np
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        f = float(obj)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(obj, float):
        return None if math.isnan(obj) or math.isinf(obj) else obj
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


@router.get("/watchlist/stock-detail/{ts_code}")
def get_stock_detail(ts_code: str):
    now = time.time()
    hit = _DETAIL_CACHE.get(ts_code)
    if hit and now - hit["ts"] < _DETAIL_TTL:
        return _clean(hit["data"])
    try:
        analysis = analyze_stock(ts_code)
        scored = score(analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {e}")
    last = analysis["panel"].iloc[-1] if len(analysis["panel"]) else {}
    quotes = {
        "close": last.get("close"),
        "pe_ttm": last.get("pe_ttm"),
        "pb": last.get("pb"),
        "total_mv": last.get("total_mv"),
        "dv_ttm": last.get("dv_ttm"),
    }
    # 给 buffett_check 补一份 quotes(它需要 dv_ttm 算股息率)
    analysis_for_buffett = dict(analysis)
    analysis_for_buffett["quotes"] = quotes
    data = {
        "basic": analysis["basic"],
        "as_of_date": analysis.get("as_of_date"),       # 行情日期(RQ-096)
        "fina_end_date": analysis.get("fina_end_date"), # 财务报告期
        "quotes": quotes,
        "score": {
            "total": scored["total"],
            "verdict": scored["verdict"],
            "dim_scores": scored["dim_scores"],
            "dim_labels": scored["dim_labels"],
            "dim_reasons": scored["dim_reasons"],
        },
        "growth": analysis["growth"],
        "profit": analysis["profit"],
        "value": analysis["value"],
        "trend": analysis["trend"],
        "safety": analysis["safety"],
        "buffett": buffett_check(analysis_for_buffett),
    }
    _DETAIL_CACHE[ts_code] = {"data": data, "ts": now}
    return _clean(data)


def _build_kline_points(rows, freq, limit):
    """K 线管线:前复权 → 按 freq 聚合(取各周期最后交易日)→ 取最近 limit → 算 MA5/10/20。
    rows: iterable of {trade_date(YYYYMMDD), close, adj_factor},任意顺序。返回升序 points 列表。"""
    import pandas as pd
    rows = list(rows)
    if not rows:
        return []
    df = pd.DataFrame([{
        "trade_date": str(r["trade_date"]),
        "close": r.get("close"),
        "adj_factor": r.get("adj_factor"),
    } for r in rows])
    df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d", errors="coerce")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["trade_date", "close"]).sort_values("trade_date").reset_index(drop=True)
    if df.empty:
        return []
    # 前复权:close * adj_factor / 最新日 adj_factor(消除除权除息假下跌)
    df["adj_factor"] = pd.to_numeric(df["adj_factor"], errors="coerce").ffill().bfill().fillna(1.0)
    df["close"] = df["close"] * df["adj_factor"] / float(df["adj_factor"].iloc[-1])
    df = df.set_index("trade_date")
    if freq == "daily":
        agg = df
    elif freq in ("weekly", "monthly"):
        per = "W" if freq == "weekly" else "M"        # to_period 版本无关,避免 resample 弃用
        agg = df.groupby(df.index.to_period(per)).tail(1)   # 各周期最后交易日(已升序)
    else:
        return []
    for n in (5, 10, 20, 60):
        agg[f"ma{n}"] = agg["close"].rolling(n).mean()
    agg = agg.tail(int(limit))
    points = []
    for d, row in agg.iterrows():
        points.append({
            "date": d.strftime("%Y%m%d"),
            "close": float(row["close"]),
            "ma5": None if pd.isna(row["ma5"]) else float(row["ma5"]),
            "ma10": None if pd.isna(row["ma10"]) else float(row["ma10"]),
            "ma20": None if pd.isna(row["ma20"]) else float(row["ma20"]),
            "ma60": None if pd.isna(row["ma60"]) else float(row["ma60"]),
        })
    return points

_BENCHMARK_TTL = 600.0
_BENCHMARK_CACHE: dict = {}
_BENCHMARK_CODE = "000300.SH"


def _aggregate_close_by_freq(rows, freq):
    """rows:[{trade_date, close}] → 按 freq 聚合(daily 不变;weekly/monthly 取各周期最后交易日)
    → 升序 [(date_str, close)]。指数无 adj_factor,close 直接用。"""
    import pandas as pd
    rows = list(rows)
    if not rows:
        return []
    df = pd.DataFrame([{"trade_date": str(r["trade_date"]), "close": r.get("close")} for r in rows])
    df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d", errors="coerce")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["trade_date", "close"]).sort_values("trade_date").reset_index(drop=True)
    if df.empty:
        return []
    df = df.set_index("trade_date")
    if freq == "daily":
        agg = df
    elif freq in ("weekly", "monthly"):
        per = "W" if freq == "weekly" else "M"
        agg = df.groupby(df.index.to_period(per)).tail(1)
    else:
        return []
    return [(d.strftime("%Y%m%d"), float(c)) for d, c in zip(agg.index, agg["close"])]


def _build_benchmark_points(series, ref_dates):
    """series:升序 [(date_str, close)](已聚合)。ref_dates:个股 points 的 date 序列。
    按 ref_dates 对齐 + 归一化(首个有值日=100),返回 [{date, value}],长度同 ref_dates。"""
    if not ref_dates or not series:
        return []
    m = {d: c for d, c in series}
    base = None
    for d in ref_dates:
        c = m.get(d)
        if c is not None:
            base = float(c)
            break
    if base is None or base == 0:
        return []
    out = []
    for d in ref_dates:
        c = m.get(d)
        out.append({"date": d, "value": None if c is None else round(float(c) / base * 100, 4)})
    return out


def _get_benchmark_series(freq, db, ref_dates=None):
    """取沪深300(000300.SH)按 freq 聚合的升序 close 序列。
    本地 IndexDailyModel 优先;本地空 或 本地最新日期 < ref_dates 最新 → tushare index_daily 补/兜底。
    带 (freq,) 缓存,TTL _BENCHMARK_TTL。ref_dates:个股 points 的 date 序列,用于判断新鲜度。"""
    freq = freq if freq in ("daily", "weekly", "monthly") else "daily"
    now = time.time()
    hit = _BENCHMARK_CACHE.get(freq)
    if hit and now - hit["ts"] < _BENCHMARK_TTL:
        return hit["series"]
    rows_q = db.query(models.IndexDailyModel.trade_date, models.IndexDailyModel.close).filter(
        models.IndexDailyModel.ts_code == _BENCHMARK_CODE).all()
    rows = [{"trade_date": r.trade_date, "close": r.close} for r in rows_q] if rows_q else []
    local_max = max((r["trade_date"] for r in rows if r.get("trade_date")), default=None)
    needed_max = max(ref_dates) if ref_dates else None
    need_supplement = bool(needed_max) and (local_max is None or local_max < needed_max)
    if need_supplement:
        # 本地空 → tushare 全量;本地旧 → tushare 增量(start_date=本地最新)
        try:
            params = {"ts_code": _BENCHMARK_CODE}
            if local_max:
                params["start_date"] = local_max
            items = _tushare_post("index_daily", params)
            extra = [{"trade_date": it["trade_date"], "close": it.get("close")} for it in (items or [])]
            seen = {r["trade_date"] for r in rows}
            for e in extra:
                if e.get("trade_date") and e["trade_date"] not in seen:
                    rows.append(e)
                    seen.add(e["trade_date"])
        except Exception:
            pass  # tushare 补失败则用本地(可能旧);最终降级在 _build_benchmark_payload 的 try/except
    elif not rows:
        # 本地空 且无 ref_dates(向后兼容旧调用):tushare 全量
        try:
            items = _tushare_post("index_daily", {"ts_code": _BENCHMARK_CODE})
            rows = [{"trade_date": it["trade_date"], "close": it.get("close")} for it in (items or [])]
        except Exception:
            rows = []
    series = _aggregate_close_by_freq(rows, freq)
    _BENCHMARK_CACHE[freq] = {"series": series, "ts": now}
    return series


def _build_benchmark_payload(freq, db, points):
    """返回 {name, code, points} 或 None。任何失败都降级 None,不影响个股图。"""
    ref_dates = [p["date"] for p in points]
    if not ref_dates:
        return None
    try:
        series = _get_benchmark_series(freq, db, ref_dates)
        bench_points = _build_benchmark_points(series, ref_dates)
        if not bench_points:
            return None
        return {"name": "沪深300", "code": _BENCHMARK_CODE, "points": bench_points}
    except Exception as e:
        print(f"[kline-benchmark] degraded: {type(e).__name__}: {e}", file=sys.stderr)
        return None


_KLINE_TTL = 600.0
_KLINE_CACHE: dict = {}


@router.get("/watchlist/stock-detail/{ts_code}/kline")
def get_kline(ts_code: str, freq: str = "daily", limit: int = 120, db: Session = Depends(get_db)):
    freq = freq if freq in ("daily", "weekly", "monthly") else "daily"
    try:
        limit = max(1, min(int(limit or 120), 1000))
    except (TypeError, ValueError):
        limit = 120
    key = (ts_code, freq, limit)
    now = time.time()
    hit = _KLINE_CACHE.get(key)
    if hit and now - hit["ts"] < _KLINE_TTL:
        return hit["data"]

    rows_q = db.query(models.StockDailyModel.trade_date, models.StockDailyModel.close,
                      models.StockDailyModel.adj_factor).filter(models.StockDailyModel.code == ts_code).all()
    if rows_q:
        rows = [{"trade_date": r.trade_date, "close": r.close, "adj_factor": r.adj_factor} for r in rows_q]
        source = "local"
    else:
        try:
            daily = _tushare_post("daily", {"ts_code": ts_code})
            adj = _tushare_post("adj_factor", {"ts_code": ts_code})
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"K线数据获取失败:{e}")
        adj_map = {a["trade_date"]: a.get("adj_factor") for a in (adj or [])}
        rows = [{"trade_date": d["trade_date"], "close": d.get("close"),
                 "adj_factor": adj_map.get(d["trade_date"])} for d in (daily or [])]
        source = "tushare"

    points = _build_kline_points(rows, freq, limit)
    benchmark = _build_benchmark_payload(freq, db, points)
    data = _clean({"ts_code": ts_code, "freq": freq, "source": source,
                   "points": points, "benchmark": benchmark})
    _KLINE_CACHE[key] = {"data": data, "ts": now}
    return data


# === RQ-093/094 AI 深挖(护城河类型 / 管理层深层诚信)+ 持久化 ===

_BUFFETT_REF_DIR = Path(__file__).resolve().parent.parent / "skills" / "buffett" / "references"
_DIM_CONFIG = {
    "moat_type": {
        "ref": "03-business-moat.md",
        "question": "判断这家公司的护城河属于哪种类型(品牌/成本领先/网络效应/切换成本/高效规模/资源特许,可多选),强度如何,趋势是变宽还是变窄。要结合提供的财务数据(毛利率水平、ROIC、毛利率多年趋势)作为证据。",
    },
    "management_integrity": {
        "ref": "04-management-governance.md",
        "question": "评估这家公司管理层的诚信与治理质量。诚实说明:基于公开财务数据能看出什么,看不出什么(如并购动机、关联交易、信披违规等需要看公告/新闻的,明确标注'需查公告')。审计意见作为底线参考。",
    },
    "industry_explore": {
        "ref": "01-thinking-frameworks.md",  # 能力圈/圈内能力框架
        "question": "这只股票所属行业未匹配内置模板。请用巴菲特'能力圈'视角判断:1) 这个行业的业务模式简不简单,普通人/巴菲特看不看得懂(一句话结论) 2) 投资这个行业最该盯的 3 个主要风险。结合提供的财务数据。",
    },
}


def _build_ai_prompt(ts_code: str, dimension: str, analysis: dict) -> tuple[str, str]:
    """返回 (system_prompt, user_prompt)。"""
    cfg = _DIM_CONFIG[dimension]
    ref_path = _BUFFETT_REF_DIR / cfg["ref"]
    ref_text = ref_path.read_text(encoding="utf-8") if ref_path.exists() else ""
    b = analysis.get("basic", {}) or {}
    p = analysis.get("profit", {}) or {}
    s = analysis.get("safety", {}) or {}
    fa = analysis.get("fina_annual", []) or []
    audit = analysis.get("audit_result")
    fa_brief = "; ".join(
        f"{x.get('end_date','')[:4]}年毛利{x.get('grossprofit_margin')}%/ROIC{x.get('roic')}%"
        for x in fa[-5:]
    ) or "无多年数据"

    system = (
        "你是沃伦·巴菲特投资思维助手,严格按提供的参考资料框架分析。"
        "要求:1)中文 2)300 字内 3)有理有据(引用提供的数据) 4)通俗,专业术语要解释 5)诚实标注数据局限。"
        f"\n\n=== 参考资料:{cfg['ref']} ===\n{ref_text}"
    )
    user = (
        f"股票:{b.get('name')}({ts_code}) 行业:{b.get('industry')} 上市:{b.get('list_date')}\n"
        f"财务:ROE {p.get('roe')}% 毛利率 {p.get('gross_margin')}% 净利率 {p.get('net_margin')}% "
        f"现金含量 {p.get('cash_ratio')} 负债率 {s.get('debt_ratio')}%\n"
        f"多年趋势:{fa_brief}\n"
        f"审计意见:{audit or '无数据'}\n\n"
        f"问题:{cfg['question']}"
    )
    return system, user


def _call_llm(system_prompt: str, user_prompt: str) -> str:
    """调 LLM(anthropic SDK + deepseek 兼容端点)。失败抛异常。"""
    from anthropic import Anthropic
    client = Anthropic(api_key=settings.llm_api_key, base_url=settings.llm_base_url)
    resp = client.messages.create(
        model=settings.llm_model,
        max_tokens=800,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    return "".join(parts).strip() or "AI 未返回有效内容"


@router.post("/watchlist/stock-detail/{ts_code}/ai-deepdive")
def ai_deepdive(ts_code: str, payload: dict, db: Session = Depends(get_db)):
    dimension = payload.get("dimension")
    if dimension not in _DIM_CONFIG:
        raise HTTPException(status_code=400, detail="dimension 必须是 moat_type 或 management_integrity")
    force = bool(payload.get("force", False))

    # force=false(默认):只查库,有就返回,无返回 text=null(不调 LLM)
    if not force:
        row = db.query(models.BuffettAiCacheModel).filter_by(
            ts_code=ts_code, dimension=dimension
        ).first()
        if row:
            return {"dimension": dimension, "text": row.text, "cached": True,
                    "cached_at": row.created_at.isoformat() if row.created_at else None}
        return {"dimension": dimension, "text": None, "cached": False}

    # force=true:调 LLM + 覆盖存库
    try:
        analysis = analyze_stock(ts_code)
        system_prompt, user_prompt = _build_ai_prompt(ts_code, dimension, analysis)
        text = _call_llm(system_prompt, user_prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 深挖失败:{e}")

    existing = db.query(models.BuffettAiCacheModel).filter_by(
        ts_code=ts_code, dimension=dimension
    ).first()
    if existing:
        existing.text = text
        existing.created_at = datetime.utcnow()
    else:
        db.add(models.BuffettAiCacheModel(ts_code=ts_code, dimension=dimension, text=text))
    db.commit()
    return {"dimension": dimension, "text": text, "cached": False}
