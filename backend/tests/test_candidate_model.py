def test_candidate_models_fields():
    from models import (StockDailyModel, FundamentalPitModel, IndexConstituentModel,
                        FetchLogModel, CandidateSnapshotModel, CandidatePoolModel)
    from sqlalchemy import inspect

    def cols(model):
        return {c.name: c for c in inspect(model).columns}

    sd = cols(StockDailyModel)
    assert set(sd) >= {"code", "trade_date", "close", "adj_factor", "pe_ttm", "total_mv"}
    assert sd["code"].primary_key and sd["trade_date"].primary_key

    fp = cols(FundamentalPitModel)
    assert set(fp) >= {"code", "end_date", "ann_date", "roe", "grossprofit_margin", "debt_to_assets"}
    assert fp["ann_date"].primary_key

    ic = cols(IndexConstituentModel)
    assert set(ic) >= {"index_code", "trade_date", "code", "weight"}

    fl = cols(FetchLogModel)
    assert "source" in fl and fl["source"].primary_key

    cs = cols(CandidateSnapshotModel)
    assert set(cs) >= {"id", "run_at", "as_of_date", "strategy_name", "strategy_label",
                       "universe", "params", "count"}

    cp = cols(CandidatePoolModel)
    assert set(cp) >= {"id", "snapshot_id", "rank", "ts_code", "name", "score",
                       "pe_rank", "roe_rank", "momentum_rank", "promoted"}
    # unique(snapshot_id, ts_code)
    tbl = CandidatePoolModel.__table__
    uniq_cols = {tuple(c.name for c in idx.columns) for idx in tbl.indexes if idx.unique}
    assert ("snapshot_id", "ts_code") in uniq_cols
