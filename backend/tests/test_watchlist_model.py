def test_watchlist_model_fields_and_unique_ts_code():
    from models import WatchlistModel
    from sqlalchemy import inspect

    cols = {c.name: c for c in inspect(WatchlistModel).columns}
    assert 'id' in cols
    assert 'ts_code' in cols
    assert cols['ts_code'].unique is True
    assert 'name' in cols
    assert 'add_time' in cols
    assert 'note' in cols
