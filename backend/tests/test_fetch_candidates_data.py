import os, sys
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__,
                                          models.FetchLogModel.__table__])
    S = sessionmaker(bind=eng)
    yield S()


class FakePro:
    """假 tushare pro。"""
    def index_weight(self, index_code, **_):
        import pandas as pd
        return pd.DataFrame([
            {"trade_date": "20260101", "con_code": "A.SH", "weight": 0.5},
            {"trade_date": "20260101", "con_code": "B.SH", "weight": 0.5},
        ])
    def daily(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260710", "close": 10.0}])
    def daily_basic(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260710", "pe_ttm": 12.0, "total_mv": 1e5}])
    def adj_factor(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260710", "adj_factor": 1.5}])
    def fina_indicator(self, ts_code):  # 注意:不传 fields
        import pandas as pd
        return pd.DataFrame([{"end_date": "20251231", "ann_date": "20260301",
                              "roe": 18.0, "grossprofit_margin": 40.0, "debt_to_assets": 30.0}])


class CrashPro:
    def index_weight(self, **_):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260101", "con_code": "A.SH", "weight": 1.0}])
    def daily(self, **_):
        raise RuntimeError("tushare 500")
    def daily_basic(self, **_):
        raise RuntimeError("x")
    def adj_factor(self, **_):
        raise RuntimeError("x")
    def fina_indicator(self, **_):
        raise RuntimeError("x")


def test_fetch_writes_three_tables(db):
    from fetch_candidates_data import fetch_all
    counts = fetch_all(FakePro(), db, sleep=0)
    assert db.query(models.StockDailyModel).count() == 2          # A,B 各 1 行
    assert db.query(models.FundamentalPitModel).count() == 2
    assert db.query(models.IndexConstituentModel).count() == 2
    assert counts["stock_daily"] == 2


def test_fetch_idempotent_rerun_no_duplicate(db):
    from fetch_candidates_data import fetch_all
    fetch_all(FakePro(), db, sleep=0)
    fetch_all(FakePro(), db, sleep=0)
    assert db.query(models.StockDailyModel).count() == 2          # 重跑不重复
    assert db.query(models.FundamentalPitModel).count() == 2


def test_fetch_per_code_failure_continues(db):
    from fetch_candidates_data import fetch_all
    counts = fetch_all(CrashPro(), db, sleep=0)
    assert counts["stock_daily"] == 0                              # 全失败但没崩
    assert counts["index_constituent"] == 1                       # index_weight 没崩
    assert db.query(models.FetchLogModel).count() == 1            # 回写了 log
