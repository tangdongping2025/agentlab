"""自选股四件套工具(invest agent P1)。

- suggest_pin_stock: AI 识别明显关注 → emit ACTION(前端出按钮,不真加)
- pin_stock: 用户明确「加自选」→ INSERT(防重)
- unpin_stock: 用户明确「移除」→ DELETE
- list_watchlist: 列全部

数据持久化到 MySQL watchlist 表(全局单用户)。
"""
from __future__ import annotations

import json
from typing import Any

from database import SessionLocal
import models
from .registry import register_tool


class SuggestPinStockTool:
    name = "suggest_pin_stock"
    description = (
        "向用户推荐把某只股票加入自选股(不直接加,触发前端出现「加入自选」按钮)。"
        "当识别到用户明显关注某股时调用(查行情/问基本面/问值不值得关注/反复追问)。"
        "已自选的返回 already_pinned=true。"
    )
    input_schema = {
        "type": "object",
        "properties": {
            "ts_code": {"type": "string", "description": "股票代码,如 600519.SH"},
            "name": {"type": "string", "description": "股票名称,如 贵州茅台"},
        },
        "required": ["ts_code", "name"],
    }

    async def execute(self, **params: Any) -> str:
        ts_code = params.get("ts_code", "")
        name = params.get("name", "")
        already_pinned = False
        db = SessionLocal()
        try:
            existing = db.query(models.WatchlistModel).filter(
                models.WatchlistModel.ts_code == ts_code
            ).first()
            already_pinned = existing is not None
        finally:
            db.close()
        return json.dumps({
            "_action": "suggest_pin_stock",
            "ts_code": ts_code,
            "name": name,
            "already_pinned": already_pinned,
        }, ensure_ascii=False)


class PinStockTool:
    name = "pin_stock"
    description = "把股票加入自选股(用户明确说「加自选/关注/收藏」时调用)。已存在则忽略(防重)。"
    input_schema = {
        "type": "object",
        "properties": {
            "ts_code": {"type": "string", "description": "股票代码"},
            "name": {"type": "string", "description": "股票名称"},
            "note": {"type": "string", "description": "备注(可选)"},
        },
        "required": ["ts_code", "name"],
    }

    async def execute(self, **params: Any) -> str:
        ts_code = params.get("ts_code", "")
        name = params.get("name", "")
        note = params.get("note")
        db = SessionLocal()
        try:
            existing = db.query(models.WatchlistModel).filter(
                models.WatchlistModel.ts_code == ts_code
            ).first()
            if existing:
                return f"{name}({ts_code}) 已在自选股中,无需重复加入"
            row = models.WatchlistModel(ts_code=ts_code, name=name, note=note)
            db.add(row)
            db.commit()
        except Exception as e:
            db.rollback()
            return f"加入自选失败: {e}"
        finally:
            db.close()
        return f"已加入自选股: {name}({ts_code})"


class UnpinStockTool:
    name = "unpin_stock"
    description = "把股票从自选股移除(用户说「移除/取消关注/删掉」时调用)。"
    input_schema = {
        "type": "object",
        "properties": {"ts_code": {"type": "string", "description": "股票代码"}},
        "required": ["ts_code"],
    }

    async def execute(self, **params: Any) -> str:
        ts_code = params.get("ts_code", "")
        db = SessionLocal()
        try:
            row = db.query(models.WatchlistModel).filter(
                models.WatchlistModel.ts_code == ts_code
            ).first()
            if not row:
                return f"{ts_code} 不在自选股中"
            name = row.name
            db.delete(row)
            db.commit()
        except Exception as e:
            db.rollback()
            return f"移除自选失败: {e}"
        finally:
            db.close()
        return f"已移除自选股: {name}({ts_code})"


class ListWatchlistTool:
    name = "list_watchlist"
    description = "列出用户所有自选股(用户问「我的自选股/我关注了哪些」时调用)。"
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, **params: Any) -> str:
        db = SessionLocal()
        try:
            rows = db.query(models.WatchlistModel).order_by(
                models.WatchlistModel.add_time.desc()
            ).all()
            items = [
                {
                    "ts_code": r.ts_code,
                    "name": r.name,
                    "note": r.note,
                    "add_time": r.add_time.strftime("%Y-%m-%d %H:%M") if r.add_time else "",
                }
                for r in rows
            ]
        finally:
            db.close()
        return json.dumps({"count": len(items), "items": items}, ensure_ascii=False)


def _register_default():
    register_tool(SuggestPinStockTool())
    register_tool(PinStockTool())
    register_tool(UnpinStockTool())
    register_tool(ListWatchlistTool())


_register_default()
