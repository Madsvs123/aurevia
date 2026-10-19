"""
Standalone unit tests for the analytics expansion engine functions
(rolling metrics, drawdown table, up/down capture, correlation matrix,
stress scenarios).

Runnable without Django:  python3 backend/tests/expansion_test.py
Also collected by pytest / Django test runner.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps"))

from analytics import calculations as calc  # noqa: E402


def test_rolling_returns():
    out = calc.rolling_returns([100, 110, 121, 100], 2)
    assert out[0] is None
    assert abs(out[1] - 0.10) < 1e-9
    assert abs(out[2] - 0.10) < 1e-9
    assert abs(out[3] - (100 / 121 - 1.0)) < 1e-9
    # window 1 == a single price point, so the trailing return is 0.0
    daily = calc.rolling_returns([100, 110, 121], 1)
    assert daily == [0.0, 0.0, 0.0]
    # None / zero-value handling
    assert calc.rolling_returns([100, None, 110], 2) == [None, None, None]
    assert calc.rolling_returns([0, 10], 2) == [None, None]
    assert calc.rolling_returns([], 5) == []
    # length alignment
    assert len(calc.rolling_returns([1, 2, 3, 4, 5], 3)) == 5


def test_rolling_volatility():
    rets = [0.01, -0.01, 0.02, -0.02]
    out = calc.rolling_volatility(rets, 2, 252)
    assert out[0] is None
    assert abs(out[1] - 0.02 * math.sqrt(252)) < 1e-9
    assert abs(out[2] - 0.015 * math.sqrt(252)) < 1e-9
    assert abs(out[3] - 0.02 * math.sqrt(252)) < 1e-9
    assert len(out) == 4
    # fewer than 2 usable returns in a window => None
    assert calc.rolling_volatility([0.01], 2) == [None]
    assert calc.rolling_volatility([], 2) == []
    # None propagation
    out4 = calc.rolling_volatility([0.01, None, 0.02, 0.03], 2)
    assert out4[1] is None


def test_rolling_sharpe():
    out = calc.rolling_sharpe([0.01, 0.03, 0.05], 2, rf=0.0, periods_per_year=252)
    assert out[0] is None
    expected = 0.02 / 0.01 * math.sqrt(252)
    assert abs(out[1] - expected) < 1e-9
    # flat series => zero std => sharpe 0.0 (not None)
    flat = calc.rolling_sharpe([0.01] * 10, 3)
    assert flat[0] is None and flat[1] is None
    assert all(v == 0.0 for v in flat[2:])
    assert calc.rolling_sharpe([], 3) == []
    # None propagation
    out3 = calc.rolling_sharpe([0.01, None, 0.02], 2)
    assert out3[1] is None


def test_drawdown_table():
    # Single drawdown that never recovers.
    table = calc.drawdown_table([100, 120, 90, 110, 105, 70, 100])
    assert len(table) == 1
    dd = table[0]
    assert dd["start_idx"] == 1
    assert dd["trough_idx"] == 5
    assert dd["end_idx"] == 6
    assert abs(dd["depth"] - (1 - 70 / 120)) < 1e-9
    assert dd["recovery_idx"] is None

    # Drawdown with full recovery.
    table2 = calc.drawdown_table([100, 80, 90, 70, 110])
    assert len(table2) == 1
    dd2 = table2[0]
    assert dd2["start_idx"] == 0
    assert dd2["trough_idx"] == 3
    assert dd2["end_idx"] == 3
    assert abs(dd2["depth"] - 0.30) < 1e-9
    assert dd2["recovery_idx"] == 4

    # Multiple drawdowns sorted by depth descending.
    table3 = calc.drawdown_table([100, 120, 90, 110, 130, 100, 80, 100])
    assert len(table3) == 2
    assert table3[0]["depth"] > table3[1]["depth"]
    assert table3[0]["trough_idx"] == 6
    assert table3[0]["recovery_idx"] is None
    assert table3[1]["start_idx"] == 1
    assert table3[1]["recovery_idx"] == 4

    assert calc.drawdown_table([]) == []
    # Flat series has no drawdowns.
    assert calc.drawdown_table([100, 100, 100]) == []


def test_upside_downside_capture():
    cap = calc.upside_downside_capture(
        [0.10, -0.05, 0.02, -0.03, 0.01],
        [0.05, -0.02, 0.01, -0.01, 0.03],
    )
    assert cap["up_count"] == 3
    assert cap["down_count"] == 2
    assert abs(cap["up_capture"] - 0.13 / 0.09) < 1e-9
    assert abs(cap["down_capture"] - (-0.08) / (-0.03)) < 1e-9

    # No benchmark movement => zero captures and counts.
    flat = calc.upside_downside_capture([0.01, 0.02], [0.0, 0.0])
    assert flat == {
        "up_capture": 0.0,
        "down_capture": 0.0,
        "up_count": 0,
        "down_count": 0,
    }

    # Different lengths: aligned to the shorter tail.
    cap2 = calc.upside_downside_capture([0.10, -0.05], [0.05, -0.02, 0.01])
    assert cap2["up_count"] == 1
    assert cap2["down_count"] == 1


def test_correlation_matrix():
    result = calc.correlation_matrix(
        {
            "A": [1, 2, 3, 4, 5],
            "B": [2, 4, 6, 8, 10],
            "C": [1, 1, 1, 1, 1],
        }
    )
    assert result["symbols"] == ["A", "B", "C"]
    m = result["matrix"]
    assert abs(m[0][0] - 1.0) < 1e-9
    assert abs(m[0][1] - 1.0) < 1e-9
    assert abs(m[1][0] - 1.0) < 1e-9
    assert abs(m[1][1] - 1.0) < 1e-9
    # Zero-variance series => correlation 0.0 everywhere.
    assert m[0][2] == 0.0 and m[2][0] == 0.0
    assert m[1][2] == 0.0 and m[2][1] == 0.0
    assert m[2][2] == 0.0

    # Fewer than 2 points => 0.0 (including diagonal).
    tiny = calc.correlation_matrix({"X": [1.0], "Y": [2.0]})
    assert tiny["symbols"] == ["X", "Y"]
    assert tiny["matrix"] == [[0.0, 0.0], [0.0, 0.0]]

    # Mismatched lengths => 0.0 off-diagonal.
    ragged = calc.correlation_matrix({"A": [1, 2, 3], "B": [1, 2]})
    assert ragged["matrix"][0][1] == 0.0
    assert ragged["matrix"][1][0] == 0.0


def test_stress_scenario():
    # Up-trending history: shock applies, no historical drawdown.
    result = calc.stress_scenario([100, 110, 121], -20, 1.5)
    assert abs(result["scenario_value"] - 96.8) < 1e-9
    assert abs(result["change_pct"] - (-20.0)) < 1e-9
    assert result["max_drawdown_pct"] == 0.0

    # History with a drawdown: scaled replay reproduces it.
    result2 = calc.stress_scenario([100, 120, 90], -10, 1.0)
    assert abs(result2["scenario_value"] - 81.0) < 1e-9
    assert abs(result2["change_pct"] - (-10.0)) < 1e-9
    assert abs(result2["max_drawdown_pct"] - 25.0) < 1e-9

    # Vol multiplier amplifies the historical drawdown.
    result3 = calc.stress_scenario([100, 120, 90], 0, 2.0)
    assert abs(result3["scenario_value"] - 90.0) < 1e-9
    assert abs(result3["change_pct"] - 0.0) < 1e-9
    assert result3["max_drawdown_pct"] > 25.0

    # Empty input => zeros.
    empty = calc.stress_scenario([], -20, 1.5)
    assert empty == {
        "scenario_value": 0.0,
        "change_pct": 0.0,
        "max_drawdown_pct": 0.0,
    }


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
    total = sum(1 for n in globals() if n.startswith("test_") and callable(globals()[n]))
    print(f"\n{total - failures}/{total} passed")
    sys.exit(1 if failures else 0)
