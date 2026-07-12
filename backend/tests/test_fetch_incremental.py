import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pandas as pd
import models
from database import Base

# (trade_date, close, pe_ttm, total_mv, adj_factor)
_DAILY = [("20200101", 10.0, 8.0, 1e5, 1.0), ("20200102", 11.0, 9.0, 1.1e5, 1.0),
          ("20200103", 12.0, 10.0, 1.2e5, 1.0)]


class _FakePro:
    def index_weight(self, index_code):
        return pd.DataFrame([{"trade_date": "20200101", "con_code": "600000.SH", "weight": 1.0}])
    def daily(self, ts_code, start_date, end_date):
        return pd.DataFrame([{"trade_date": d, "close": c} for d, c, _, _, _ in _DAILY if start_date <= d <= end_date])
    def daily_basic(self, ts_code, start_date, end_date):
        return pd.DataFrame([{"trade_date": d, "pe_ttm": p, "total_mv": m} for d, _, p, m, _ in _DAILY if start_date <= d <= end_date])
    def adj_factor(self, ts_code, start_date, end_date):
        return pd.DataFrame([{"trade_date": d, "adj_factor": a} for d, _, _, _, a in _DAILY if start_date <= d <= end_date])
    def fina_indicator(self, ts_code):
        return pd.DataFrame([{"ts_code": ts_code, "end_date": "20191231", "ann_date": "20200330",
                              "roe": 15.0, "grossprofit_margin": 30.0, "debt_to_assets": 40.0}])


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__, models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__, models.FetchLogModel.__table__])
    S = sessionmaker(bind=eng); db = S(); yield db; db.close()


def test_resolve_start_date_full_when_no_log(db):
    from fetch_candidates_data import _resolve_start_date
    assert _resolve_start_date(db, force_full=False, explicit_start=None) == "20200101"


def test_resolve_start_date_incremental(db):
    from fetch_candidates_data import _resolve_start_date
    db.add(models.FetchLogModel(source="stock_daily", last_anchor_date="20200102"))
    db.commit()
    assert _resolve_start_date(db, force_full=False, explicit_start=None) == "20200103"


def test_resolve_start_date_force_full(db):
    from fetch_candidates_data import _resolve_start_date
    db.add(models.FetchLogModel(source="stock_daily", last_anchor_date="20200102"))
    db.commit()
    assert _resolve_start_date(db, force_full=True, explicit_start=None) == "20200101"


def test_fetch_full_writes_data_and_log(db):
    from fetch_candidates_data import fetch_all
    fetch_all(_FakePro(), db, start_date="20200101", end_date="20200102")
    assert db.query(models.StockDailyModel).count() == 2
    log = db.query(models.FetchLogModel).filter_by(source="stock_daily").first()
    assert log and log.last_anchor_date == "20200102"


def test_progress_callback_invoked(db):
    from fetch_candidates_data import fetch_all
    calls = []
    fetch_all(_FakePro(), db, start_date="20200101", end_date="20200102",
              progress_callback=lambda done, total, cur, fail: calls.append((done, total, cur)))
    assert len(calls) >= 1 and calls[-1][0] == calls[-1][1]


def test_force_full_fetches_all(db):
    from fetch_candidates_data import fetch_all
    db.add(models.FetchLogModel(source="stock_daily", last_anchor_date="20220101"))
    db.commit()
    fetch_all(_FakePro(), db, start_date="20200101", end_date="20200102", force_full=True)
    assert db.query(models.StockDailyModel).count() == 2


def test_incremental_does_not_refetch_old(db):
    """增量:anchor=02,fetch 到 03 → daily 只请求 start=20200103(不重抓旧)+ 旧数据保留。"""
    from fetch_candidates_data import fetch_all
    for d, c, p, m, a in _DAILY[:2]:
        db.add(models.StockDailyModel(code="600000.SH", trade_date=d, close=c, adj_factor=a, pe_ttm=p, total_mv=m))
    db.add(models.FetchLogModel(source="stock_daily", last_anchor_date="20200102"))
    db.commit()
    pro = _FakePro()
    seen_starts = []
    orig = pro.daily
    pro.daily = lambda ts_code, start_date, end_date: (seen_starts.append(start_date), orig(ts_code, start_date, end_date))[1]
    fetch_all(pro, db, end_date="20200103")  # start_date=None → 读 anchor
    assert seen_starts == ["20200103"]
    dates = sorted(r.trade_date for r in db.query(models.StockDailyModel).all())
    assert dates == ["20200101", "20200102", "20200103"]


def test_skip_daily_when_no_new_trade_day(db):
    """anchor=20200101,end=20200101 → eff_start=20200102>end → 跳过 daily(不调 pro.daily),省 tushare。"""
    from fetch_candidates_data import fetch_all
    db.add(models.FetchLogModel(source="stock_daily", last_anchor_date="20200101"))
    db.commit()
    pro = _FakePro()
    called = []
    pro.daily = lambda tc, s, e: (called.append(s), pd.DataFrame([]))[1]
    fetch_all(pro, db, end_date="20200101")  # eff_start=20200102 > 20200101 → skip daily
    assert called == []  # daily 没被调(跳过,省 3 个 tushare 接口/股)
