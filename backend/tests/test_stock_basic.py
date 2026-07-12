import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pandas as pd
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockBasicModel.__table__])
    S = sessionmaker(bind=eng)
    db = S()
    yield db
    db.close()


class _FakePro:
    def stock_basic(self, **kwargs):
        return pd.DataFrame([
            {"ts_code": "600000.SH", "name": "浦发银行", "industry": "银行", "area": "上海",
             "market": "主板", "list_date": "19991110", "list_status": "L", "delist_date": None,
             "fullname": "上海浦东发展银行", "enname": "SPDB"},
        ])


def test_fetch_stock_basic_upserts(db):
    from fetch_candidates_data import _fetch_stock_basic
    n = _fetch_stock_basic(_FakePro(), db)
    assert n == 1
    row = db.query(models.StockBasicModel).first()
    assert row.ts_code == "600000.SH"
    assert row.name == "浦发银行"
    assert row.exchange == "SSE"   # 从 .SH 映射
    assert row.list_date == "19991110"
    # 幂等:重跑不翻倍(UPSERT)
    _fetch_stock_basic(_FakePro(), db)
    assert db.query(models.StockBasicModel).count() == 1


def test_names_map_from_local(db):
    """screener._stock_names_map 查本地表(不再调 tushare)。"""
    from screener import _stock_names_map
    db.add(models.StockBasicModel(ts_code="600000.SH", name="浦发银行", industry="银行"))
    db.commit()
    m = _stock_names_map(db)
    assert m == {"600000.SH": {"name": "浦发银行", "industry": "银行"}}


def test_names_map_empty_when_no_data(db):
    from screener import _stock_names_map
    assert _stock_names_map(db) == {}
