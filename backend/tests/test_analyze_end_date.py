"""analyze_stock 默认 end_date 应为当天。

回归:曾硬编码 end_date='20260707',致自选股详情/ai-deepdive 数据截面
永久停在 2026-07-07(数据表与 K 线均新,唯分析面板旧)。
不真调 tushare:monkeypatch build_daily_panel 捕获入参后立即中断。
"""
import datetime

import pandas as pd
import pytest

from scripts import analyze


class _Stop(Exception):
    """捕获到 build_daily_panel 入参后立即停止,跳过后续网络 IO。"""


class _FakePro:
    """最小 pro 替身:stock_basic 返回非空(否则 analyze_stock 抛'未找到')。"""

    def stock_basic(self, ts_code=None, **kw):
        return pd.DataFrame([{"ts_code": ts_code or "X"}])


def test_default_end_date_is_today(monkeypatch):
    captured = {}

    def fake_panel(ts_code, start_date, end_date, pro=None):
        captured["start"] = start_date
        captured["end"] = end_date
        raise _Stop

    monkeypatch.setattr(analyze, "build_daily_panel", fake_panel)
    with pytest.raises(_Stop):
        analyze.analyze_stock("300750.SZ", pro=_FakePro())

    today = datetime.date.today().strftime("%Y%m%d")
    assert captured["end"] == today, (
        f"默认 end_date 应为当天 {today},实际收到 {captured['end']}(硬编码回归)"
    )


def test_explicit_end_date_respected(monkeypatch):
    """显式传日期的调用(如回测)不受默认值改动影响。"""
    captured = {}

    def fake_panel(ts_code, start_date, end_date, pro=None):
        captured["end"] = end_date
        raise _Stop

    monkeypatch.setattr(analyze, "build_daily_panel", fake_panel)
    with pytest.raises(_Stop):
        analyze.analyze_stock("300750.SZ", end_date="20250101", pro=_FakePro())

    assert captured["end"] == "20250101"
