import pandas as pd
from fastapi.testclient import TestClient

import main


def _fake_analysis():
    return {
        'basic': {'name': '贵州茅台', 'industry': '白酒', 'market': '主板', 'list_date': '20010827'},
        'panel': pd.DataFrame([{
            'close': 1212.1, 'pe_ttm': 18.4, 'pb': 5.59,
            'total_mv': 1.5e12, 'dv_ttm': 2.5,
        }]),
        'growth': {'rev_cagr_2y': 18.5, 'np_yoy': 22.3},
        'profit': {'roe': 30.0, 'gross_margin': 91.0, 'net_margin': 50.0, 'cash_ratio': 1.2},
        'value':  {'pe_now': 18.4, 'pe_pct': 0.35, 'peg': 0.8},
        'trend':  {'ret_1y': 0.15, 'above_ma60': True},
        'safety': {'debt_ratio': 25.0, 'current_ratio': 3.5, 'max_dd': -0.3},
    }


def _fake_score(a):
    return {
        'dim_scores':  {'成长性': 95, '盈利质量': 95, '估值': 70, '趋势': 90, '安全': 85},
        'dim_labels':  {'成长性': '🟢', '盈利质量': '🟢', '估值': '🟡', '趋势': '🟢', '安全': '🟢'},
        'dim_reasons': {'成长性': '均值高增长', '盈利质量': 'ROE 30%', '估值': 'PE分位35%',
                        '趋势': '站上MA60', '安全': '财务稳健'},
        'total': 88.5,
        'verdict': '通过初筛,值得深入研究',
    }


def test_stock_detail_returns_json(monkeypatch):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, 'analyze_stock', lambda ts_code, **kw: _fake_analysis())
    monkeypatch.setattr(wl, 'score', _fake_score)
    wl._DETAIL_CACHE.clear()

    client = TestClient(main.app)
    r = client.get('/api/db/watchlist/stock-detail/600519.SH')
    assert r.status_code == 200
    body = r.json()
    assert body['basic']['name'] == '贵州茅台'
    assert body['quotes']['close'] == 1212.1
    assert body['quotes']['pe_ttm'] == 18.4
    assert body['score']['total'] == 88.5
    assert body['score']['verdict'] == '通过初筛,值得深入研究'
    assert body['score']['dim_scores']['成长性'] == 95
    assert body['growth']['rev_cagr_2y'] == 18.5
    assert body['trend']['above_ma60'] is True


def test_stock_detail_cache_hit(monkeypatch):
    from routers import watchlist as wl
    calls = {'n': 0}
    def mock_analyze(ts_code, **kw):
        calls['n'] += 1
        return _fake_analysis()
    monkeypatch.setattr(wl, 'analyze_stock', mock_analyze)
    monkeypatch.setattr(wl, 'score', _fake_score)
    wl._DETAIL_CACHE.clear()

    client = TestClient(main.app)
    client.get('/api/db/watchlist/stock-detail/600519.SH')
    client.get('/api/db/watchlist/stock-detail/600519.SH')
    assert calls['n'] == 1


def test_stock_detail_error(monkeypatch):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, 'analyze_stock', lambda ts_code, **kw: (_ for _ in ()).throw(RuntimeError('tushare 挂了')))
    monkeypatch.setattr(wl, 'score', _fake_score)
    wl._DETAIL_CACHE.clear()

    client = TestClient(main.app)
    r = client.get('/api/db/watchlist/stock-detail/999999.SH')
    assert r.status_code == 500
    assert wl._DETAIL_CACHE.get('999999.SH') is None
