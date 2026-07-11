import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import numpy as np


def test_equal():
    from weighting import equal
    w = equal(4)
    assert len(w) == 4 and abs(sum(w) - 1.0) < 1e-9 and all(x == 0.25 for x in w)


def test_min_variance_respects_constraints_and_beats_equal():
    from weighting import min_variance, equal
    # 3 只? N<4 → equal(本测试用 N=5 满足 max_w=0.3 可行:5×0.3=1.5≥1)
    cov = np.array([[0.04, 0.01, 0.0, 0.0, 0.0],
                    [0.01, 0.09, 0.0, 0.0, 0.0],
                    [0.0, 0.0, 0.01, 0.0, 0.0],
                    [0.0, 0.0, 0.0, 0.02, 0.0],
                    [0.0, 0.0, 0.0, 0.0, 0.05]])
    w = min_variance(cov, max_w=0.3)
    assert abs(sum(w) - 1.0) < 1e-6                      # Σw=1
    assert all(-1e-9 <= x <= 0.3 + 1e-6 for x in w)      # 0≤w≤max_w
    # 最小方差应 ≤ 等权方差(简化版)
    ew = equal(5)
    assert np.array(w) @ cov @ np.array(w) <= np.array(equal(5)) @ cov @ np.array(equal(5)) + 1e-9


def test_risk_parity_sum_one_bounded():
    from weighting import risk_parity
    cov = np.diag([0.04, 0.09, 0.01, 0.02, 0.05])        # 对角(相关=0,逆波动率即 ERC)
    w = risk_parity(cov, max_w=0.3)
    assert abs(sum(w) - 1.0) < 1e-6 and all(0 <= x <= 0.3 + 1e-6 for x in w)


def test_compute_weights_unknown_method_falls_back_equal():
    from weighting import compute_weights, equal
    cov = np.eye(5) * 0.04
    w = compute_weights("nonsense", cov, max_w=0.3)
    assert w == equal(5)


def test_compute_weights_n_less_than_4_falls_back_equal():
    from weighting import compute_weights, equal
    cov = np.eye(3) * 0.04
    assert compute_weights("min_var", cov, max_w=0.3) == equal(3)
    assert compute_weights("risk_parity", cov, max_w=0.3) == equal(3)


def test_min_variance_singular_cov_falls_back_equal_no_raise():
    from weighting import min_variance, equal
    cov = np.ones((5, 5)) * 0.04      # 全同(秩1,奇异)
    w = min_variance(cov, max_w=0.3)
    assert w == equal(5)              # 不抛,降级


def test_cap_truncates_max_w():
    from weighting import _cap
    w = _cap(np.array([0.5, 0.5, 0.0, 0.0, 0.0]), max_w=0.3)
    assert all(x <= 0.3 + 1e-6 for x in w) and abs(sum(w) - 1.0) < 1e-6
