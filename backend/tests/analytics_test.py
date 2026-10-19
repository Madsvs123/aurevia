"""
Standalone unit tests for the analytics calculation engine.

Runnable without Django:  python3 backend/tests/analytics_test.py
Also collected by pytest / Django test runner.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps"))

from analytics import calculations as calc  # noqa: E402


def test_total_return():
    assert calc.total_return(100, 110) == 0.10
    assert calc.total_return(0, 10) == 0.0
    assert abs(calc.total_return(100, 50) - -0.5) < 1e-9


def test_annualized_return():
    assert abs(calc.annualized_return(0.1, 1) - 0.1) < 1e-9
    assert abs(calc.annualized_return(0.21, 12) - (1.21 ** (1 / 12) - 1)) < 1e-9
    assert calc.annualized_return(-1.0, 12) == -1.0


def test_compound():
    assert abs(calc.compound([0.1, 0.1]) - 0.22) < 1e-9
    assert calc.compound([]) == 0.0


def test_time_weighted_return():
    # No cashflows: pure growth 100 -> 110 -> 121 = 21%
    twr = calc.time_weighted_return([100, 110, 121])
    assert abs(twr - 0.21) < 1e-9
    # With a cashflow of +10 on day 2 (end of day): 121*1.0 + 10 growth => 100->110 (10%), 110->121 (10%) = 21%
    twr2 = calc.time_weighted_return([100, 110, 131], {2: 10})
    assert abs(twr2 - 0.21) < 1e-9


def test_irr():
    # Invest 100, receive 110 one year later => IRR 10%
    rate = calc.irr([(-100, 0.0), (110, 1.0)])
    assert rate is not None
    assert abs(rate - 0.10) < 1e-6


def test_money_weighted_return():
    # Deposit 100 at t=0, deposit 100 at t=1, final value 220 at t=2
    mwr = calc.money_weighted_return([(100, 0.0), (100, 1.0)], 220.0, 2.0)
    assert mwr is not None
    assert 0.0 < mwr < 0.15  # somewhere around 10%


def test_volatility_and_sharpe():
    returns = [0.01, -0.01, 0.02, -0.02, 0.01, 0.0, 0.01, -0.01]
    vol = calc.volatility(returns, 252)
    assert vol > 0
    sharpe = calc.sharpe_ratio(returns, 0.0, 252)
    assert isinstance(sharpe, float)


def test_max_drawdown():
    series = [100, 120, 90, 110, 105, 70, 100]
    dd, dd_series = calc.max_drawdown(series)
    assert abs(dd - (1 - 70 / 120)) < 1e-9
    assert len(dd_series) == len(series)
    assert dd_series[2] == -0.25


def test_var_cvar():
    returns = [-0.10, -0.05, 0.0, 0.05, 0.10, -0.02]
    var, cvar = calc.var_cvar(returns, 0.95)
    assert var >= 0
    assert cvar >= var


def test_beta_alpha():
    # port = 2 * bench + 0.01 constant => beta=2, positive annualized alpha
    bench = [0.01, 0.02] * 50
    port = [b * 2 + 0.01 for b in bench]
    beta, alpha = calc.beta_alpha(port, bench, 0.0, 252)
    assert abs(beta - 2.0) < 1e-6
    assert alpha > 0


def test_correlation():
    x = [1, 2, 3, 4, 5]
    y = [2, 4, 6, 8, 10]
    assert abs(calc.correlation(x, y) - 1.0) < 1e-9
    assert calc.correlation([1], [2]) == 0.0


def test_fifo_cost_basis():
    buys = [(10, 100.0), (10, 120.0)]
    sells = [(15, 130.0)]
    lots, realized, _ = calc.fifo_cost_basis(buys, sells)
    # First 10 from lot 1 (gain 30 each = 300), next 5 from lot 2 (gain 10 each = 50)
    assert abs(realized - 350.0) < 1e-9
    assert len(lots) == 1
    assert abs(lots[0][0] - 5.0) < 1e-9
    assert abs(lots[0][1] - 120.0) < 1e-9


def test_average_cost_basis():
    buys = [(10, 100.0), (10, 120.0)]
    sells = [(5, 130.0)]
    qty, avg, realized = calc.average_cost_basis(buys, sells)
    assert abs(qty - 15.0) < 1e-9
    assert abs(avg - 110.0) < 1e-9
    assert abs(realized - 50.0) < 1e-9


def test_allocation_weights():
    items = [("stock", 100), ("bond", 300), ("", 100)]
    rows = calc.allocation_weights(items)
    total = sum(r["value"] for r in rows)
    assert abs(total - 500) < 1e-9
    assert rows[0]["label"] == "bond"
    assert abs(rows[0]["weight_pct"] - 60.0) < 1e-9
    assert any(r["label"] == "Uncategorized" for r in rows)


def test_hhi_and_concentration():
    assert abs(calc.hhi([0.5, 0.5]) - 0.5) < 1e-9
    assert abs(calc.hhi([1.0]) - 1.0) < 1e-9
    assert abs(calc.effective_count([0.5, 0.5]) - 2.0) < 1e-9
    assert calc.concentration_level(0.5) == "high"
    assert calc.concentration_level(0.1) == "low"
    assert abs(calc.top_n_weight([10, 5, 2, 1], 2) - 15 / 18) < 1e-9


def test_goal_projection_deterministic():
    final, series = calc.compound_with_contributions(1000, 100, 0.07, 12)
    assert len(series) == 12
    assert final > 1000 + 1200  # growth on top of contributions


def test_monte_carlo_deterministic():
    a = calc.monte_carlo_goal(1000, 100, 0.07, 0.15, 12, runs=500, seed=42, target_amount=3000)
    b = calc.monte_carlo_goal(1000, 100, 0.07, 0.15, 12, runs=500, seed=42, target_amount=3000)
    assert a == b  # seeded => identical
    assert 0 <= a["probability_of_success"] <= 100
    assert len(a["series"]) == 13
    assert a["p10"] <= a["median"] <= a["p90"]


def test_synthetic_price_series_deterministic():
    s1 = calc.synthetic_price_series("SPY", date(2024, 1, 1), date(2024, 1, 31))
    s2 = calc.synthetic_price_series("SPY", date(2024, 1, 1), date(2024, 1, 31))
    assert s1 == s2
    assert all(d.weekday() < 5 for d, _ in s1)


def test_monthly_returns():
    daily = [
        (date(2024, 1, 31), 100),
        (date(2024, 2, 29), 110),
        (date(2024, 3, 31), 99),
    ]
    monthly = calc.monthly_returns_from_daily(daily)
    assert monthly[0][0] == "2024-02"
    assert abs(monthly[0][1] - 0.10) < 1e-9
    assert abs(monthly[1][1] - -0.10) < 1e-9


def test_winning_months():
    assert abs(calc.winning_months_pct([0.1, -0.1, 0.05]) - 2 / 3 * 100) < 1e-9


if __name__ == "__main__":
    import traceback

    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception:
                failures += 1
                print(f"FAIL {name}")
                traceback.print_exc()
    print(f"\n{sum(1 for n in globals() if n.startswith('test_') and callable(globals()[n])) - failures}/{sum(1 for n in globals() if n.startswith('test_') and callable(globals()[n]))} passed")
    sys.exit(1 if failures else 0)
