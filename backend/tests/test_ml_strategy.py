import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__, models.FundamentalPitModel.__table__, models.IndexConstituentModel.__table__])
    S = sessionmaker(bind=eng); db = S(); yield db; db.close()


def _seed(db, code, offs, fund=None):
    for i, (td, c) in enumerate([("20200131",10),("20200228",11),("20200331",12),("20200430",13),("20200531",14),("20200630",15),("20200731",16),("20200831",17),("20200930",18),("20201031",19),("20201130",20),("20201231",21),("20210131",22)]):
        if i < len(offs):
            db.add(models.StockDailyModel(code=code, trade_date=td, close=c+offs[i], adj_factor=1.0, pe_ttm=10.0+offs[i], total_mv=1e5+offs[i]*1e3))
    if fund:
        db.add(models.FundamentalPitModel(code=code, end_date="20191231", ann_date="20200101", roe=fund.get("roe",15), grossprofit_margin=fund.get("gpm",30), debt_to_assets=fund.get("da",40)))
    db.commit()


def test_build_panel_has_factors_and_fwd_ret(db):
    from ml_strategy import _build_panel, clear_panel_cache
    clear_panel_cache()
    for code, off in zip(["A","B","C"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1],[2,0,1,2,0,1,2,0,1,2,0,1,2]]):
        _seed(db, code, off, {"roe": 15+(ord(code[-1])-ord("A"))*5})
    for code in ["A","B","C"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=1/3))
    db.commit()
    panel = _build_panel(db, "20200101", "20210131")
    assert set(["date","code","momentum","pe","roe","grossprofit_margin","debt_to_assets","total_mv","fwd_ret"]).issubset(panel.columns)
    assert panel["code"].nunique() == 3
    # 最新一期无下期 → fwd_ret NaN;早期有 fwd_ret
    last_date = panel["date"].max()
    assert panel[panel.date==last_date]["fwd_ret"].isna().all()
    assert panel[panel.date < last_date]["fwd_ret"].notna().any()


def test_build_panel_pit_future_fundamental_invisible(db):
    from ml_strategy import _build_panel, clear_panel_cache
    clear_panel_cache()
    for code, off in zip(["A","B"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1]]):
        _seed(db, code, off)
    # 一份 ann_date=20210101 的财报(在多数 2020 调仓日之后)→ 不应进入那些日的因子
    db.add(models.FundamentalPitModel(code="A", end_date="20201231", ann_date="20210101", roe=99.0, grossprofit_margin=99, debt_to_assets=99))
    db.commit()
    for code in ["A","B"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.5))
    db.commit()
    panel = _build_panel(db, "20200101", "20201231")
    a2020 = panel[(panel.code=="A") & (panel.date<"20210101")]
    # 2020 的 A 行 roe 不应是 99(那份 ann_date 2021 之后)
    assert (a2020["roe"] != 99.0).all()


def test_prep_features_rank_vs_winsorize():
    from ml_strategy import _prep_features
    import pandas as pd
    df = pd.DataFrame({"momentum":[0.1,0.2,0.3],"pe":[10,20,30],"roe":[5,10,15],
                       "grossprofit_margin":[30,40,50],"debt_to_assets":[40,30,20],"total_mv":[1,2,3],
                       "date":["20200131"]*3})
    Xr = _prep_features(df.copy(), "ridge")
    Xw = _prep_features(df.copy(), "lightgbm")
    assert Xr.shape == (3,6) and Xw.shape == (3,6)
    # ridge: rank pct → 单调;pe 列排名应与原 pe 反向相关(rank pct of pe: 10→0.33? 实际 rank(pct) 升序)
    # winsorize:clip 不改变中间值形状,只裁两端


def test_panel_cache(db):
    from ml_strategy import _get_panel, clear_panel_cache, _PANEL_CACHE
    clear_panel_cache()
    assert _PANEL_CACHE["df"] is None
    for code, off in zip(["A","B"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1]]):
        _seed(db, code, off)
    for code in ["A","B"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.5))
    db.commit()
    p1 = _get_panel(db, "20200101", "20210131")
    assert _PANEL_CACHE["df"] is not None
    p2 = _get_panel(db, "20200101", "20210131")  # 缓存命中
    assert p1 is p2
    clear_panel_cache()
    assert _PANEL_CACHE["df"] is None


def test_ml_ridge_run_returns_topn(db):
    from ml_strategy import clear_panel_cache
    from screener import compute_candidates
    clear_panel_cache()
    for code, off, k in zip(["A","B","C","D","E"], [[i%3+k for i in range(13)] for k in range(5)], range(5)):
        _seed(db, code, off, {"roe": 10+k*5})
    for code in ["A","B","C","D","E"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.2))
    db.commit()
    cands = compute_candidates(db, "ml_ridge", {"top_n": 3, "ml_start": "20200101", "ml_end": "20210131"}, as_of_date="20210131")
    assert len(cands) <= 3 and len(cands) >= 1
    assert all(c.rank >= 1 for c in cands)


def test_ml_lightgbm_predict_all_covers_universe(db):
    from ml_strategy import clear_panel_cache, MlLightgbmStrategy
    clear_panel_cache()
    for code, off, k in zip(["A","B","C","D","E"], [[i%3+k for i in range(13)] for k in range(5)], range(5)):
        _seed(db, code, off, {"roe": 10+k*5})
    for code in ["A","B","C","D","E"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.2))
    db.commit()
    scores = MlLightgbmStrategy().predict_all(db, "20210131", {"ml_start": "20200101", "ml_end": "20210131"})
    assert set(scores) <= {"A","B","C","D","E"} and len(scores) >= 1


def test_ml_min_train_insufficient_returns_empty(db):
    from ml_strategy import clear_panel_cache
    from screener import compute_candidates
    clear_panel_cache()
    for code, off in zip(["A","B"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1]]):
        _seed(db, code, off)
    for code in ["A","B"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.5))
    db.commit()
    # min_train=12,只有少量调仓日 → []
    cands = compute_candidates(db, "ml_ridge", {"top_n": 3, "ml_start": "20200101", "ml_end": "20200331"}, as_of_date="20200228")
    assert cands == []


def test_ml_run_default_as_of_returns_candidates(db):
    """as_of=None(API /run 默认不传)时兜底 latest trade date,返回候选。
    回归 RQ-C bug:MlStrategy._train_panel 原先不兜底 as_of=None → train 空 → count=0。"""
    from ml_strategy import clear_panel_cache
    from screener import compute_candidates
    clear_panel_cache()
    for code, off, k in zip(["A", "B", "C", "D", "E"], [[i % 3 + k for i in range(13)] for k in range(5)], range(5)):
        _seed(db, code, off, {"roe": 10 + k * 5})
    for code in ["A", "B", "C", "D", "E"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.2))
    db.commit()
    # 不传 as_of_date(默认 None)→ 应兜底 latest trade date 并返回候选
    cands = compute_candidates(db, "ml_ridge", {"top_n": 3, "ml_start": "20200101", "ml_end": "20210131"})
    assert len(cands) >= 1
