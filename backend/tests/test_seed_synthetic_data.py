import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__, models.StockBasicModel.__table__,
                                          models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__])
    S = sessionmaker(bind=eng); db = S(); yield db; db.close()


def test_seed_all_enables_ml_pipeline(db):
    """合成数据让 ML 全链路可跑:build_panel 非空 + ≥12 调仓期 + ML 选出候选。"""
    from seed_synthetic_data import seed_all
    from ml_strategy import _build_panel, clear_panel_cache
    from screener import compute_candidates
    clear_panel_cache()
    counts = seed_all(db)
    assert counts["stock_daily"] > 0
    assert counts["fundamental_pit"] > 0
    assert counts["index_constituent"] > 0
    panel = _build_panel(db, "20200101", "20231231")
    assert not panel.empty
    assert panel["date"].nunique() >= 12          # 满足 min_train
    assert panel["fwd_ret"].notna().any()
    latest = panel["date"].max()
    cands = compute_candidates(db, "ml_ridge",
                               {"top_n": 5, "ml_start": "20200101", "ml_end": latest},
                               as_of_date=latest)
    assert len(cands) >= 1


def test_seed_all_is_idempotent(db):
    """重跑不翻倍(delete + insert)。"""
    from seed_synthetic_data import seed_all
    seed_all(db)
    n1 = db.query(models.StockDailyModel).count()
    seed_all(db)
    n2 = db.query(models.StockDailyModel).count()
    assert n1 == n2
