import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

P = dict(w_pe=0.3, w_roe=0.3, w_mom=0.4, window=252, top_n=30,
         pe_filter=True, roe_min=12.0, mom_top_pct=40.0)


def _row(code, pe, roe, mom, name="N", industry="I"):
    return {"code": code, "name": name, "industry": industry,
            "pe": pe, "roe": roe, "momentum": mom}


def test_score_directions_pe_cheaper_higher():
    from screener import rank_composite_score
    rows = [_row("A", pe=8, roe=20, mom=0.1), _row("B", pe=40, roe=20, mom=0.1)]
    out = {c.ts_code: c for c in rank_composite_score(rows, {**P, "roe_min": 0, "mom_top_pct": 100})}
    assert out["A"].pe_rank > out["B"].pe_rank          # PE 更便宜 → 秩更高


def test_score_directions_roe_momentum_higher_better():
    from screener import rank_composite_score
    rows = [_row("A", pe=10, roe=25, mom=0.3), _row("B", pe=10, roe=10, mom=-0.1)]
    out = {c.ts_code: c for c in rank_composite_score(rows, {**P, "roe_min": 0, "mom_top_pct": 100})}
    assert out["A"].roe_rank > out["B"].roe_rank
    assert out["A"].momentum_rank > out["B"].momentum_rank


def test_hard_filter_pe_roe():
    from screener import rank_composite_score
    rows = [_row("A", pe=8, roe=20, mom=0.2),
            _row("B", pe=-5, roe=20, mom=0.2),    # PE<=0 滤掉
            _row("C", pe=10, roe=5, mom=0.2)]      # ROE<12 滤掉
    out = rank_composite_score(rows, P)
    assert {c.ts_code for c in out} == {"A"}


def test_momentum_top_pct_filter_uses_universe():
    """动量前40% 基于 universe(过滤前全体)的下沿,非 survivors 内。"""
    from screener import rank_composite_score
    # 10 只,动量 0..9;top40% 下沿 = quantile(0.6)=6 → 仅 mom>=6 留
    rows = [_row(str(i), pe=10, roe=20, mom=i * 0.01) for i in range(10)]
    out = rank_composite_score(rows, {**P, "roe_min": 0})
    assert {c.ts_code for c in out} == {"6", "7", "8", "9"}


def test_top_n_truncation_and_ranking():
    from screener import rank_composite_score
    rows = [_row(str(i), pe=10 + i, roe=20, mom=0.5 - i * 0.01) for i in range(10)]
    out = rank_composite_score(rows, {**P, "roe_min": 0, "mom_top_pct": 100, "top_n": 3})
    assert len(out) == 3
    assert out[0].score >= out[1].score >= out[2].score   # 按 score 降序
    assert out[0].rank == 1 and out[1].rank == 2


def test_weight_zero_exits_factor():
    """w_pe=0 → PE 不影响排序(纯动量+ROE)。"""
    from screener import rank_composite_score
    rows = [_row("A", pe=8, roe=20, mom=0.5), _row("B", pe=80, roe=20, mom=0.5)]
    out = rank_composite_score(rows, {**P, "w_pe": 0.0, "w_mom": 0.5,
                                      "roe_min": 0, "mom_top_pct": 100})
    # PE 差异巨大但权重 0 → 两只 score 应近似相等
    a = next(c for c in out if c.ts_code == "A")
    b = next(c for c in out if c.ts_code == "B")
    assert abs(a.score - b.score) < 1.0


def test_empty_rows_returns_empty():
    from screener import rank_composite_score
    assert rank_composite_score([], P) == []


def test_all_filtered_returns_empty():
    from screener import rank_composite_score
    rows = [_row("A", pe=-1, roe=20, mom=0.2)]
    assert rank_composite_score(rows, P) == []
