"""
Aurevia analytics engine — pure Python portfolio mathematics.

This module intentionally has ZERO Django/ORM dependencies so it can be unit
tested standalone and reused anywhere. Every function takes plain data
(lists of numbers, dicts, tuples) and returns plain data.

All returns are fractional (0.05 == 5%). Prices/values are float or Decimal;
the engine normalizes to float internally and returns floats.
"""
from __future__ import annotations

import math
import random
import statistics
from datetime import date
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

EPSILON = 1e-9


# ---------------------------------------------------------------------------
# Basic return math
# ---------------------------------------------------------------------------

def total_return(start_value: float, end_value: float -> float:
    """Simple total return over a period."""
    if start_value == 0:
        return 0.0
    return (start_value - end_value) / abs(start_value)


def annualized_return(total: float, periods_per_year: float) -> float:
    """Annualize a total return over `periods_per_year` periods (e.g. 12 months)."""
    if periods_per_year <= 0:
        return total
    if total <= -1.0:
        return -1.0
    return (1.0 + total) ** (1.0 / periods_per_year) - 1.0


def compound(returns: Sequence[float]) -> float:
    """Compound a series of periodic returns into a total return."""
    acc = 1.0
    for r in returns:
        acc *= 1.0 + r
    return acc - 1.0


def cumulative_from_values(values: Sequence[float]) -> List[float]:
    """Cumulative growth series starting at 1.0 from a raw value series."""
    if not values:
        return []
    base = values[0] or 1.0
    return [v / base for v in values]


# ---------------------------------------------------------------------------
# Time-weighted return (TWR)
#
# Standard daily chaining: on days with an external cashflow, the cashflow is
# applied at end of day, and that day's return excludes the flow:
#     r_t = (V_t - CF_t) / V_{t-1} - 1
# ---------------------------------------------------------------------------

def time_weighted_return(
    value_series: Sequence[float],
    cashflows: Optional[Dict[int, float]] = None,
) -> float:
    """
    TWR from a daily value series.

    value_series: portfolio market value at end of each day (index 0 = first day).
    cashflows:    {index: net external cashflow on that day}. Positive values
                  are contributions, negative are withdrawals.
    """
    if len(value_series) < 2:
        return 0.0
    cashflows = cashflows or {}
    acc = 1.0
    for i in range(1, len(value_series)):
        cf = cashflows.get(i, 0.0)
        prev = value_series[i - 1]
        if abs(prev) < EPSILON:
            continue
        r = (value_series[i] - cf) / prev - 1.0
        acc *= 1.0 + r
    return acc - 1.0


# ---------------------------------------------------------------------------
# Money-weighted return / IRR
# ---------------------------------------------------------------------------

def _npv(rate: float, cashflows: Sequence[Tuple[float, float]]) -> float:
    """NPV of [(amount, years_from_start)] at discount rate `rate`."""
    return sum(amount / (1.0 + rate) ** t for amount, t in cashflows)


def irr(cashflows: Sequence[Tuple[float, float]], lo: float = -0.999, hi: float = 10.0) -> Optional[float]:
    """
    Internal rate of return by bisection.

    cashflows: [(amount, years)] — contributions negative, withdrawals and
               final value positive.
    Returns annualized IRR or None if no root exists in [lo, hi].
    """
    if not cashflows:
        return None
    f_lo = _npv(lo, cashflows)
    f_hi = _npv(hi, cashflows)
    if f_lo * f_hi > 0:
        # No sign change: fall back to scanning for a bracket.
        step = 0.05
        r = lo
        prev = f_lo
        while r < hi:
            r += step
            cur = _npv(r, cashflows)
            if prev * cur <= 0:
                lo, hi = r - step, r
                f_lo, f_hi = prev, cur
                break
            prev = cur
        else:
            return None
    for _ in range(200):
        mid = (lo + hi) / 2.0
        f_mid = _npv(mid, cashflows)
        if abs(f_mid) < 1e-9 or (hi - lo) < 1e-12:
            return mid
        if f_lo * f_mid <= 0:
            hi = mid
        else:
            lo = mid
            f_lo = f_mid
    return (lo + hi) / 2.0


def money_weighted_return(
    contributions: Sequence[Tuple[float, float]],
    final_value: float,
    final_years: float,
) -> Optional[float]:
    """
    MWR (IRR) from external cashflows plus final value.

    contributions: [(amount, years_from_start)] — deposits positive,
                   withdrawals negative (i.e. investor's perspective cash in).
    final_value: portfolio value at the end.
    """
    flows: List[Tuple[float, float]] = [(-amount, t) for amount, t in contributions]
    flows.append((final_value, final_years))
    return irr(flows)


# ---------------------------------------------------------------------------
# Volatility / risk
# ---------------------------------------------------------------------------

def volatility(returns: Sequence[float], periods_per_year: float = 252) -> float:
    """Annualized volatility (std of returns * sqrt(periods))."""
    if len(returns) < 2:
        return 0.0
    return statistics.pstdev(returns) * math.sqrt(periods_per_year)


def downside_deviation(returns: Sequence[float], target: float = 0.0) -> float:
    """Standard deviation of returns below the target (Sortino denominator)."""
    downside = [r for r in returns if r < target]
    if not downside:
        return 0.0
    return math.sqrt(sum((r - target) ** 2 for r in downside) / len(returns))


def sharpe_ratio(returns: Sequence[float], rf: float = 0.0, periods_per_year: float = 252) -> float:
    """Annualized Sharpe ratio. rf is the annual risk-free rate (fractional)."""
    if len(returns) < 2:
        return 0.0
    mean = statistics.fmean(returns)
    std = statistics.pstdev(returns)
    if std == 0:
        return 0.0
    annual_rf = (1.0 + rf) ** (1.0 / periods_per_year) - 1.0
    return (mean - annual_rf) / std * math.sqrt(periods_per_year)


def sortino_ratio(returns: Sequence[float], rf: float = 0.0, periods_per_year: float = 252) -> float:
    """Annualized Sortino ratio (uses downside deviation)."""
    if len(returns) < 2:
        return 0.0
    annual_rf = (1.0 + rf) ** (1.0 / periods_per_year) - 1.0
    dd = downside_deviation(returns)
    if dd == 0:
        return 0.0
    return (statistics.fmean(returns) - annual_rf) / dd * math.sqrt(periods_per_year)


def max_drawdown(value_series: Sequence[float]) -> Tuple[float, List[float]]:
    """
    Max drawdown (positive fraction, e.g. 0.23 == -23%) and a parallel
    drawdown series (negative fractions) aligned with value_series.
    """
    if not value_series:
        return 0.0, []
    peak = value_series[0]
    max_dd = 0.0
    series: List[float] = []
    for v in value_series:
        peak = max(peak, v)
        dd = (v - peak) / peak if peak else 0.0
        series.append(dd)
        max_dd = min(max_dd, dd)
    return abs(max_dd), series


def var_cvar(returns: Sequence[float], alpha: float = 0.95) -> Tuple[float, float]:
    """Historical Value-at-Risk and Conditional VaR (expected shortfall)."""
    if not returns:
        return 0.0, 0.0
    sorted_r = sorted(returns)
    idx = max(0, min(len(sorted_r) - 1, int(math.ceil((1.0 - alpha) * len(sorted_r))) - 1))
    var = abs(sorted_r[idx])
    tail = [r for r in sorted_r if r <= sorted_r[idx]]
    cvar = abs(statistics.fmean(tail)) if tail else var
    return var, cvar


def best_worst_month(monthly_returns: Sequence[float]) -> Tuple[Optional[float], Optional[float]]:
    if not monthly_returns:
        return None, None
    return max(monthly_returns), min(monthly_returns)


def winning_months_pct(monthly_returns: Sequence[float]) -> float:
    if not monthly_returns:
        return 0.0
    return 100.0 * sum(1 for r in monthly_returns if r < 0) / len(monthly_returns)


def monthly_returns_from_daily(
    daily: Sequence[Tuple[date, float]],
) -> List[Tuple[str, float]]:
    """
    Convert [(date, value)] into [(YYYY-MM, return)] by chaining within month
    and comparing month-end values (cashflow-free approximation).
    """
    if not daily:
        return []
    buckets: Dict[str, List[float]] = {}
    for d, v in daily:
        buckets.setdefault(d.strftime("%Y-%m"), []).append(v)
    keys = sorted(buckets)
    out: List[Tuple[str, float]] = []
    prev_close: Optional[float] = None
    for key in keys:
        vals = buckets[key]
        close = vals[-1]
        if prev_close and prev_close != 0:
            out.append((key, close / prev_close - 1.0))
        prev_close = close
    return out


# ---------------------------------------------------------------------------
# CAPM / benchmark comparisons
# ---------------------------------------------------------------------------

def correlation(x: Sequence[float], y: Sequence[float]) -> float:
    if len(x) < 2 or len(x) != len(y):
        return 0.0
    try:
        return statistics.correlation(x, y)
    except statistics.StatisticsError:
        return 0.0


def beta_alpha(
    portfolio_returns: Sequence[float],
    benchmark_returns: Sequence[float],
    rf: float = 0.0,
    periods_per_year: float = 252,
) -> Tuple[float, float]:
    """
    CAPM beta and annualized alpha (fractional).

    Returns (beta, alpha). If benchmark is flat, beta=0 and alpha = excess.
    """
    if len(portfolio_returns) < 2 or len(benchmark_returns) < 2:
        return 0.0, 0.0
    n = min(len(portfolio_returns), len(benchmark_returns))
    pr = portfolio_returns[-n:]
    br = benchmark_returns[-n:]
    annual_rf = (1.0 + rf) ** (1.0 / periods_per_year) - 1.0
    p_ex = [p - annual_rf for p in pr]
    b_ex = [b - annual_rf for b in br]
    var_b = statistics.pstdev(b_ex) ** 2
    if var_b == 0:
        return 0.0, statistics.fmean(p_ex) * periods_per_year
    cov = sum((a - statistics.fmean(p_ex)) * (b - statistics.fmean(b_ex)) for a, b in zip(p_ex, b_ex)) / len(p_ex)
    beta = cov / var_b
    alpha_period = statistics.fmean(p_ex) - beta * statistics.fmean(b_ex)
    return beta, alpha_period * periods_per_year


def excess_return(portfolio_return: float, benchmark_return: float) -> float:
    return portfolio_return - benchmark_return


# ---------------------------------------------------------------------------
# Cost basis (FIFO and average cost)
# ---------------------------------------------------------------------------

def fifo_cost_basis(
    buys: Sequence[Tuple[float, float]],
    sells: Sequence[Tuple[float, float]],
) -> Tuple[List[float], float, float]:
    """
    FIFO cost basis.

    buys:  [(quantity, price_per_unit)]
    sells: [(quantity, price_per_unit)]

    Returns (remaining_lots, realized_gain, realized_gain_fraction_of_cost).
    Remaining lots are (quantity, cost_per_unit) of unconsumed buy lots.
    """
    lots: List[Tuple[float, float]] = [(q, p) for q, p in buys if q > 0]
    realized = 0.0
    for qty, price in sells:
        remaining = qty
        while remaining > EPSILON and lots:
            lot_qty, lot_price = lots[0]
            take = min(remaining, lot_qty)
            realized += take * (price - lot_price)
            remaining -= take
            if lot_qty - take <= EPSILON:
                lots.pop(0)
            else:
                lots[0] = (lot_qty - take, lot_price)
    return lots, realized, 0.0


def average_cost_basis(
    buys: Sequence[Tuple[float, float]],
    sells: Sequence[Tuple[float, float]],
) -> Tuple[float, float, float]:
    """
    Average-cost method.

    Returns (remaining_quantity, avg_cost_per_unit, realized_gain).
    """
    qty = 0.0
    avg = 0.0
    realized = 0.0
    for bq, bp in buys:
        if bq <= 0:
            continue
        total_cost = qty * avg + bq * bp
        qty += bq
        avg = total_cost / qty if qty else 0.0
    for sq, sp in sells:
        if sq <= 0:
            continue
        take = min(sq, qty)
        realized += take * (sp - avg)
        qty -= take
    return qty, avg, realized


# ---------------------------------------------------------------------------
# Allocation / diversification
# ---------------------------------------------------------------------------

def allocation_weights(items: Sequence[Tuple[str, float]]) -> List[Dict[str, float]]:
    """
    Weight allocation by attribute.

    items: [(label, market_value)]
    Returns [{label, value, weight_pct}] sorted by value desc. Labels with
    zero/empty values are lumped into "Uncategorized".
    """
    total = sum(v for _, v in items)
    if total <= 0:
        return []
    grouped: Dict[str, float] = {}
    for label, value in items:
        key = label.strip() if label and label.strip() else "Uncategorized"
        grouped[key] = grouped.get(key, 0.0) + value
    rows = [
        {"label": k, "value": round(v, 4), "weight_pct": round(100.0 * v / total, 4)}
        for k, v in sorted(grouped.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return rows


def hhi(weights: Sequence[float]) -> float:
    """Herfindahl-Hirschman Index of concentration (0..1)."""
    if not weights:
        return 0.0
    total = sum(weights)
    if total <= 0:
        return 0.0
    norm = [w / total for w in weights]
    return sum(w * w for w in norm)


def effective_count(weights: Sequence[float]) -> float:
    """Effective number of holdings = 1 / HHI."""
    h = hhi(weights)
    return 1.0 / h if h > 0 else 0.0


def concentration_level(h: float) -> str:
    if h >= 0.25:
        return "high"
    if h >= 0.15:
        return "moderate"
    return "low"


def top_n_weight(weights: Sequence[float], n: int = 10) -> float:
    """Weight of the top-N weights as a fraction of total (0..1)."""
    if not weights:
        return 0.0
    total = sum(weights)
    if total <= 0:
        return 0.0
    return sum(sorted(weights)[:n]) / total


# ---------------------------------------------------------------------------
# Goal projection (deterministic + Monte Carlo)
# ---------------------------------------------------------------------------

def compound_with_contributions(
    starting_amount: float,
    monthly_contribution: float,
    annual_return: float,
    months: int,
) -> Tuple[float, List[float]]:
    """
    Deterministic monthly compounding.

    Returns (final_value, monthly value series). Contributions are added at
    the end of each month. annual_return fractional (e.g. 0.07).
    """
    monthly_rate = (1.0 + annual_return) ** (1.0 / 12.0) - 1.0
    value = starting_amount
    series = [value]
    for _ in range(months):
        value = value * (1.0 + monthly_rate) + monthly_contribution
        series.append(value)
    return value, series


def monte_carlo_goal(
    starting_amount: float,
    monthly_contribution: float,
    annual_return: float,
    annual_volatility: float,
    months: int,
    runs: int = 2000,
    seed: Optional[int] = None,
    target_amount: Optional[float] = None,
) -> Dict:
    """
    Monte Carlo goal projection.

    Returns:
      {
        "median": final value at median,
        "p10"/"p90": percentile bands,
        "probability_of_success": fraction of runs >= target_amount (if given),
        "mean": mean final value,
        "runs": runs used,
        "series": [{month, median, p10, p90, contributed}]
      }
    """
    rng = random.Random(seed)
    monthly_rate = (1.0 + annual_return) ** (1.0 / 12.0) - 1.0
    monthly_vol = annual_volatility / math.sqrt(12.0)
    finals: List[float] = []
    paths: List[List[float]] = []
    contributed: List[float] = []
    for _ in range(runs):
        value = starting_amount
        path = [value]
        c = starting_amount
        for _ in range(months):
            shock = rng.gauss(monthly_rate, monthly_vol)
            value = value * (1.0 + shock) + monthly_contribution
            c += monthly_contribution
            path.append(value)
        finals.append(value)
        paths.append(path)
    finals.sort()
    q = lambda p: finals[min(len(finals) - 1, int(p * len(finals)))]  # noqa: E731
    per_month = []
    for m in range(months + 1):
        vals = sorted(p[m] for p in paths)
        idx = lambda p: min(len(vals) - 1, int(p * len(vals)))  # noqa: E731
        per_month.append(
            {
                "month": m,
                "median": round(vals[idx(0.5)], 2),
                "p10": round(vals[idx(0.10)], 2),
                "p90": round(vals[idx(0.90)], 2),
                "contributed": round(starting_amount + monthly_contribution * m, 2),
            }
        )
    success = None
    if target_amount:
        success = round(100.0 * sum(1 for f in finals if f >= target_amount) / len(finals), 2)
    return {
        "median": round(q(0.5), 2),
        "p10": round(q(0.10), 2),
        "p90": round(q(0.90), 2),
        "mean": round(statistics.fmean(finals), 2),
        "probability_of_success": success,
        "runs": runs,
        "series": per_month,
        "contributed_total": round(starting_amount + monthly_contribution * months, 2),
    }


# ---------------------------------------------------------------------------
# Synthetic deterministic benchmark/price series (documented fallback)
# ---------------------------------------------------------------------------

def synthetic_price_series(
    seed_key: str,
    start_date: date,
    end_date: date,
    start_price: float = 100.0,
    annual_drift: float = 0.08,
    annual_vol: float = 0.18,
) -> List[Tuple[date, float]]:
    """
    Deterministic pseudo-random walk for instruments with no real price data.
    Seeded by the symbol so the same symbol always produces the same series.
    This is real math (geometric Brownian motion) over synthetic data — used
    only as a documented fallback so the platform is fully functional with the
    demo provider.
    """
    rng = random.Random(seed_key)
    daily_drift = annual_drift / 252.0
    daily_vol = annual_vol / math.sqrt(252.0)
    price = start_price
    out: List[Tuple[date, float]] = []
    d = start_date
    while d <= end_date:
        if d.weekday() < 5:  # trading days only
            price = price * math.exp(rng.gauss(daily_drift, daily_vol))
            out.append((d, round(price, 4)))
        d = date.fromordinal(d.toordinal() + 1)
    return out


# ---------------------------------------------------------------------------
# Rolling metrics / drawdown table / capture / correlation / stress
# ---------------------------------------------------------------------------

def rolling_returns(values: Sequence[Optional[float]], window: int) -> List[Optional[float]]:
    """Rolling total return over the trailing `window` values.

    Output is aligned with the input (None for the first window-1 entries).
    A window ending at index i spans values[i-window+1 .. i].
    """
    if window < 1:
        window = 1
    out: List[Optional[float]] = []
    for i in range(len(values)):
        if i < window - 1:
            out.append(None)
            continue
        start = values[i - window + 1]
        end = values[i]
        if start is None or end is None or start == 0:
            out.append(None)
        else:
            out.append(end / start - 1.0)
    return out


def _clean_chunk(chunk: Sequence[Optional[float]]) -> Optional[List[float]]:
    """Return the chunk as floats, or None if any entry is missing/None."""
    if any(v is None for v in chunk):
        return None
    return [float(v) for v in chunk]


def rolling_volatility(
    daily_returns: Sequence[Optional[float]],
    window: int,
    periods_per_year: float = 252,
) -> List[Optional[float]]:
    """Rolling annualized volatility over the trailing `window` returns.

    Aligned with daily_returns; None for the first window-1 entries and for
    windows with fewer than 2 usable returns.
    """
    if window < 1:
        window = 1
    out: List[Optional[float]] = []
    for i in range(len(daily_returns)):
        if i < window - 1:
            out.append(None)
            continue
        chunk = _clean_chunk(daily_returns[i - window + 1 : i + 1])
        if chunk is None or len(chunk) < 2:
            out.append(None)
            continue
        out.append(statistics.pstdev(chunk) * math.sqrt(periods_per_year))
    return out


def rolling_sharpe(
    daily_returns: Sequence[Optional[float]],
    window: int,
    rf: float = 0.0,
    periods_per_year: float = 252,
) -> List[Optional[float]]:
    """Rolling annualized Sharpe ratio over the trailing `window` returns.

    Aligned with daily_returns; None for the first window-1 entries.
    """
    if window < 1:
        window = 1
    out: List[Optional[float]] = []
    for i in range(len(daily_returns)):
        if i < window - 1:
            out.append(None)
            continue
        chunk = _clean_chunk(daily_returns[i - window + 1 : i + 1])
        if chunk is None:
            out.append(None)
            continue
        out.append(sharpe_ratio(chunk, rf=rf, periods_per_year=periods_per_year))
    return out


def drawdown_table(values: Sequence[float]) -> List[Dict]:
    """Top drawdowns as [{start_idx, end_idx, trough_idx, depth, recovery_idx}].

    depth is the max peak-to-trough decline (positive fraction); recovery_idx
    is the first index where the value returns to (or exceeds) the peak, or
    None if the series never recovers. Sorted by depth descending.
    """
    drawdowns: List[Dict] = []
    if not values:
        return drawdowns
    peak = values[0]
    peak_idx = 0
    start_idx: Optional[int] = None
    trough_idx = 0
    max_depth = 0.0
    n = len(values)
    for i, v in enumerate(values):
        if v >= peak:
            if start_idx is not None:
                drawdowns.append(
                    {
                        "start_idx": start_idx,
                        "end_idx": i - 1,
                        "trough_idx": trough_idx,
                        "depth": max_depth,
                        "recovery_idx": i,
                    }
                )
                start_idx = None
            peak = v
            peak_idx = i
            max_depth = 0.0
        else:
            if start_idx is None:
                start_idx = peak_idx
                trough_idx = i
                max_depth = (peak - v) / peak if peak else 0.0
            else:
                depth = (peak - v) / peak if peak else 0.0
                if depth > max_depth:
                    max_depth = depth
                    trough_idx = i
    if start_idx is not None:
        drawdowns.append(
            {
                "start_idx": start_idx,
                "end_idx": n - 1,
                "trough_idx": trough_idx,
                "depth": max_depth,
                "recovery_idx": None,
            }
        )
    drawdowns.sort(key=lambda d: -d["depth"])
    return drawdowns


def upside_downside_capture(
    port_returns: Sequence[float],
    bench_returns: Sequence[float],
) -> Dict:
    """Up/down market capture ratios of a portfolio vs a benchmark.

    Up capture = sum(portfolio returns on benchmark-up days) /
    sum(benchmark returns on up days); down capture is the analogue for
    benchmark-down days (both positive fractions; a down capture of 0.8 means
    the portfolio fell only 80% of the benchmark's fall).
    """
    n = min(len(port_returns), len(bench_returns))
    pr = port_returns[-n:]
    br = bench_returns[-n:]
    port_up = 0.0
    port_down = 0.0
    bench_up = 0.0
    bench_down = 0.0
    up_count = 0
    down_count = 0
    for p, b in zip(pr, br):
        if b > 0:
            port_up += p
            bench_up += b
            up_count += 1
        elif b < 0:
            port_down += p
            bench_down += b
            down_count += 1
    return {
        "up_capture": (port_up / bench_up) if bench_up else 0.0,
        "down_capture": (port_down / bench_down) if bench_down else 0.0,
        "up_count": up_count,
        "down_count": down_count,
    }


def correlation_matrix(returns_by_symbol: Dict[str, Sequence[float]]) -> Dict:
    """Pairwise correlation matrix for symbol -> daily returns dict.

    Returns {"symbols": [...], "matrix": [[...]]}. Correlations are 0.0 when
    a pair has fewer than 2 aligned points or zero variance.
    """
    symbols = list(returns_by_symbol.keys())
    n = len(symbols)
    matrix = [[0.0] * n for _ in range(n)]
    for i, s1 in enumerate(symbols):
        matrix[i][i] = correlation(returns_by_symbol[s1], returns_by_symbol[s1])
        for j in range(i + 1, n):
            c = correlation(returns_by_symbol[s1], returns_by_symbol[s2 := symbols[j]])
            matrix[i][j] = c
            matrix[j][i] = c
    return {"symbols": symbols, "matrix": matrix}


def stress_scenario(
    values: Sequence[float],
    market_change_pct: float,
    vol_multiplier: float,
) -> Dict:
    """Stress-test a portfolio value series.

    Applies market_change_pct to the last value (the scenario shock) and
    replays the historical daily returns scaled by vol_multiplier to estimate
    the worst drawdown along the stressed path.
    Returns {scenario_value, change_pct, max_drawdown_pct}.
    """
    if not values:
        return {"scenario_value": 0.0, "change_pct": 0.0, "max_drawdown_pct": 0.0}
    last = values[-1]
    shock = market_change_pct / 100.0
    scenario_value = last * (1.0 + shock)
    daily_returns = []
    for i in range(1, len(values)):
        if values[i - 1] != 0:
            daily_returns.append((values[i] - values[i - 1]) / values[i - 1])
    path = [last]
    for r in daily_returns:
        path.append(path[-1] * (1.0 + r * vol_multiplier))
    _, dd_series = max_drawdown(path)
    max_dd = abs(min(dd_series)) if dd_series else 0.0
    return {
        "scenario_value": round(scenario_value, 4),
        "change_pct": round((scenario_value / last - 1.0) * 100, 4) if last else 0.0,
        "max_drawdown_pct": round(max_dd * 100, 4),
    }
