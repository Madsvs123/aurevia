"""
Analytics service layer — bridges the pure calculation engine
(calculations.py) to the Django ORM (portfolios/core apps).

Owned by the finance-analytics agent. Views call these functions; they never
touch HTTP concerns. Object-level permission checks happen in views.
"""
from __future__ import annotations

import bisects
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Sequence, Tuple

from django.db.models import Q

from apps.analytics import calculations as calc
from apps.core.models import Instrument, PricePoint
from apps.portfolios.models import Holding, Portfolio, Transaction

CASHFLOW_TYPES = {"deposit", "withdrawal", "dividend", "interest", "fee"}


# ---------------------------------------------------------------------------
# Price lookups
# ---------------------------------------------------------------------------

class PriceSeries:
    """Sorted (date, close) series with bisect lookup for 'close on or before d'."""

    def __init__(self, points: Sequence[Tuple[date, Decimal]]):
        self.dates = [p[0] for p in points]
        self.closes = [float(p[1]) for p in points]

    def at(self, d: date) -> Optional[float]:
        if not self.dates:
            return None
        idx = bisect.bisect_right(self.dates, d) - 1
        if idx < 0:
            # Before the first known price: use the first available price.
            return self.closes[0]
        return self.closes[idx]

    def latest(self) -> Optional[float]:
        return self.closes[-1] if self.closes else None


def build_price_map(instruments, from_date: date, to_date: date) -> Dict[str, PriceSeries]:
    """Map symbol -> PriceSeries over [from_date, to_date]."""
    by_symbol: Dict[str, List[Tuple[date, Decimal]]] = defaultdict(list)
    qs = PricePoint.objects.filter(
        instrument__in=instruments, date__lt=to_date, date__gte=from_date
    ).order_by("date")
    for pp in qs.iterator():
        by_symbol[pp.instrument.symbol].append((pp.date, pp.close))
    return {sym: PriceSeries(points) for sym, points in by_symbol.items()}


# ---------------------------------------------------------------------------
# Transaction walking: quantities, cash, lots
# ---------------------------------------------------------------------------

class PortfolioLedger:
    """Replays a portfolio's transactions to derive quantities/cash over time."""

    def __init__(self, transactions: Sequence[Transaction]):
        self.transactions = sorted(transactions, key=lambda t: (t.date, t.created_at))
        # symbol -> list of (qty, unit_price) unconsumed buy lots (FIFO)
        self.lots: Dict[str, List[Tuple[float, float]]] = defaultdict(list)
        # symbol -> cumulative quantity
        self.quantity: Dict[str, float] = defaultdict(float)
        # symbol -> average cost per unit (average-cost method)
        self.avg_cost: Dict[str, float] = defaultdict(float)
        # symbol -> realized gain (average-cost method)
        self.realized_avg: Dict[str, float] = defaultdict(float)
        # symbol -> realized gain (FIFO method)
        self.realized_fifo: Dict[str, float] = defaultdict(float)
        self.cash = 0.0
        self.deposits = 0.0
        self.withdrawals = 0.0
        # daily external cashflow: date -> net (deposits - withdrawals)
        self.external_cashflows: Dict[date, float] = defaultdict(float)

    def replay(self) -> "PortfolioLedger":
        for t in self.transactions:
            self._apply(t)
        return self

    def _apply(self, t: Transaction):
        amount = float(t.amount or 0)
        fee = float(t.fee or 0)
        qty = float(t.quantity or 0)
        price = float(t.price or 0)
        symbol = t.instrument.symbol if t.instrument else None

        if t.type == "buy":
            if symbol:
                self.quantity[symbol] += qty
                self.lots[symbol].append((qty, price))
                self._update_avg(symbol, qty, price)
            self.cash -= amount + fee
        elif t.type == "sell":
            if symbol:
                self.quantity[symbol] -= qty
                self._consume_lots(symbol, qty, price)
                self._consume_avg(symbol, qty, price)
            self.cash += amount - fee
        elif t.type == "deposit":
            self.cash += amount
            self.deposits += amount
            self.external_cashflows[t.date] += amount
        elif t.type == "withdrawal":
            self.cash -= amount
            self.withdrawals += amount
            self.external_cashflows[t.date] -= amount
        elif t.type == "dividend":
            self.cash += amount
        elif t.type == "interest":
            self.cash += amount
        elif t.type == "fee":
            self.cash -= amount
        elif t.type == "transfer":
            # Internal movement between accounts: net zero at portfolio level.
            pass
        elif t.type == "corporate_action":
            if symbol and t.corporate_action_type == "split":
                ratio = float(t.corporate_action_ratio or t.quantity or 0)
                if ratio > 0:
                    self.quantity[symbol] *= ratio
                    self.lots[symbol] = [(q * ratio, p) for q, p in self.lots[symbol]]
                    self.avg_cost[symbol] = self.avg_cost[symbol] / ratio
            # merger/spinoff/name_change: no quantity change by default.

    def _update_avg(self, symbol: str, qty: float, price: float):
        prev_qty = self.quantity[symbol] - qty
        prev_avg = self.avg_cost[symbol]
        total_cost = prev_qty * prev_avg + qty * price
        self.avg_cost[symbol] = total_cost / self.quantity[symbol] if self.quantity[symbol] else 0.0

    def _consume_avg(self, symbol: str, qty: float, price: float):
        avg = self.avg_cost[symbol]
        take = min(qty, self.quantity[symbol])
        self.realized_avg[symbol] += take * (price - avg)

    def _consume_lots(self, symbol: str, qty: float, price: float):
        remaining = qty
        lots = self.lots[symbol]
        while remaining > 1e-9 and lots:
            lot_qty, lot_price = lots[0]
            take = min(remaining, lot_qty)
            self.realized_fifo[symbol] += take * (price - lot_price)
            remaining -= take
            if lot_qty - take <= 1e-9:
                lots.pop(0)
            else:
                lots[0] = (lot_qty - take, lot_price)

    def net_contributions(self) -> float:
        return self.deposits - self.withdrawals

    def quantity_at(self, symbol: str, d: date) -> float:
        """Quantity held on date d (transactions are applied on their date)."""
        total = 0.0
        for t in self.transactions:
            if t.date > d:
                break
            if t.instrument and t.instrument.symbol == symbol:
                qty = float(t.quantity or 0)
                if t.type == "buy":
                    total += qty
                elif t.type == "sell":
                    total -= qty
                elif t.type == "corporate_action" and t.corporate_action_type == "split":
                    ratio = float(t.corporate_action_ratio or t.quantity or 0)
                    if ratio > 0:
                        total *= ratio
        return total

    def cash_at(self, d: date) -> float:
        cash = 0.0
        for t in self.transactions:
            if t.date > d:
                break
            cash += self._cash_delta(t)
        return cash

    @staticmethod
    def _cash_delta(t: Transaction) -> float:
        amount = float(t.amount or 0)
        fee = float(t.fee or 0)
        if t.type == "buy":
            return -(amount + fee)
        if t.type == "sell":
            return amount - fee
        if t.type in ("deposit", "dividend", "interest"):
            return amount
        if t.type in ("withdrawal", "fee"):
            return -amount
        return 0.0


def replay_portfolio(portfolio: Portfolio, from_date: Optional[date] = None,
                     to_date: Optional[date] = None) -> PortfolioLedger:
    qs = Transaction.objects.filter(portfolio=portfolio).select_related("instrument")
    if from_date:
        qs = qs.filter(date__gte=from_date)
    if to_date:
        qs = qs.filter(date__lte=to_date)
    return PortfolioLedger(list(qs)).replay()


# ---------------------------------------------------------------------------
# Value series
# ---------------------------------------------------------------------------

def build_value_series(
    portfolio: Portfolio,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    interval: str = "day",
) -> List[Dict]:
    """
    Daily portfolio value series: market value + cash over time.

    Returns [{date, value, cash, invested, gains}] where
    value = holdings market value + cash, invested = net contributions.
    """
    if from_date is None:
        first = Transaction.objects.filter(portfolio=portfolio).order_by("date").values_list("date", flat=True).first()
        from_date = first or date.today() - timedelta(days=365)
    if to_date is None:
        to_date = date.today()

    ledger = replay_portfolio(portfolio, from_date=from_date, to_date=to_date)
    symbols = set(ledger.quantity.keys()) | set(ledger.lots.keys())
    instruments = list(Instrument.objects.filter(symbol__in=symbols)) if symbols else []
    price_map = build_price_map(instruments, from_date, to_date)

    series: List[Dict] = []
    d = from_date
    while d <= to_date:
        market_value = 0.0
        for inst in instruments:
            ps = price_map.get(inst.symbol)
            price = ps.at(d) if ps else None
            if price is not None:
                market_value += ledger.quantity_at(inst.symbol, d) * price
        cash = ledger.cash_at(d)
        invested = ledger.net_contributions()
        value = market_value + cash
        series.append(
            {
                "date": d.isoformat(),
                "value": round(value, 4),
                "cash": round(cash, 4),
                "invested": round(invested, 4),
                "gains": round(value - invested, 4),
            }
        )
        if interval == "day":
            d += timedelta(days=1)
        elif interval == "week":
            d += timedelta(days=7)
        else:  # month
            if d.month == 12:
                d = date(d.year + 1, 1, 1)
            else:
                d = date(d.year, d.month + 1, 1)
    return series


def _cashflow_map(series: List[Dict], ledger: PortfolioLedger) -> Dict[int, float]:
    """External cashflows keyed by series index (for TWR)."""
    by_date = {d.isoformat(): amt for d, amt in ledger.external_cashflows.items()}
    return {i: by_date[row["date"]] for i, row in enumerate(series) if row["date"] in by_date}


# ---------------------------------------------------------------------------
# Endpoint payload builders
# ---------------------------------------------------------------------------

def returns_payload(portfolio: Portfolio, from_date: Optional[date],
                    to_date: Optional[date], benchmark_symbol: Optional[str]) -> Dict:
    series = build_value_series(portfolio, from_date, to_date, interval="day")
    if len(series) < 2:
        return _empty_returns(benchmark_symbol)
    values = [row["value"] for row in series]
    ledger = replay_portfolio(portfolio)
    cf_map = _cashflow_map(series, ledger)
    twr = calc.time_weighted_return(values, cf_map)

    # External cashflows for IRR: deposits positive, withdrawals negative
    # (engine converts to investor-cash-out internally).
    flows = []
    t0 = date.fromisoformat(series[0]["date"])
    for d, amt in ledger.external_cashflows.items():
        years = (d - t0).days / 365.25
        flows.append((amt, years))
    final_value = values[-1]
    final_years = (date.fromisoformat(series[-1]["date"]) - t0).days / 365.25
    mwr = calc.money_weighted_return(flows, final_value, final_years)

    start_value = values[0]
    # Flows on the period's first day are part of the starting capital
    # (modified-Dietz style); only later flows count as contributions.
    first_date = series[0]["date"]
    net_cf = sum(
        amt for d, amt in ledger.external_cashflows.items() if d.isoformat() > first_date
    )
    total = (final_value - start_value - net_cf) / start_value if start_value else 0.0
    years = max((date.fromisoformat(series[-1]["date"]) - t0).days / 365.25, 1e-9)
    ann = calc.annualized_return(total, years)

    daily_returns = []
    prev = values[0]
    for i in range(1, len(values)):
        cf = cf_map.get(i, 0.0)
        if prev != 0:
            daily_returns.append((values[i] - cf) / prev - 1.0)
        prev = values[i]

    vol = calc.volatility(daily_returns)
    dd, dd_series = calc.max_drawdown(values)
    sharpe = calc.sharpe_ratio(daily_returns)
    sortino = calc.sortino_ratio(daily_returns)
    var95, cvar95 = calc.var_cvar(daily_returns)

    monthly = calc.monthly_returns_from_daily(
        [(date.fromisoformat(r["date"]), r["value"]) for r in series]
    )
    best, worst = calc.best_worst_month([r for _, r in monthly])

    bench_series = None
    bench_total = 0.0
    synthetic = False
    if benchmark_symbol:
        bench_total, bench_series, synthetic = benchmark_series(benchmark_symbol, from_date, to_date)
        if bench_series:
            bench_dates = [d for d, _ in bench_series]
            bench_closes = [c for _, c in bench_series]
            bench_returns = []
            prev_b = bench_series[0][1]
            for _, bv in bench_series[1:]:
                if prev_b != 0:
                    bench_returns.append(bv / prev_b - 1.0)
                prev_b = bv
            beta, alpha = calc.beta_alpha(daily_returns[: len(bench_returns)], bench_returns)
        else:
            bench_dates, bench_closes, bench_returns, beta, alpha = [], [], [], 0.0, 0.0
    else:
        bench_dates, bench_closes, bench_returns, beta, alpha = [], [], [], 0.0, 0.0

    def _bench_on(d: date) -> float:
        """Latest benchmark close on or before d (forward-fill)."""
        idx = bisect.bisect_right(bench_dates, d) - 1
        if idx < 0:
            return bench_closes[0] if bench_closes else None
        return bench_closes[idx]

    return {
        "total_return_pct": round(total * 100, 4),
        "annualized_return_pct": round(ann * 100, 4),
        "twr_pct": round(twr * 100, 4),
        "mwr_pct": round((mwr or 0.0) * 100, 4),
        "benchmark_return_pct": round(bench_total * 100, 4) if bench_series else None,
        "excess_return_pct": round((total - bench_total) * 100, 4) if bench_series else None,
        "alpha": round(alpha, 4),
        "beta": round(beta, 4),
        "sharpe": round(sharpe, 4),
        "sortino": round(sortino, 4),
        "volatility_pct": round(vol * 100, 4),
        "max_drawdown_pct": round(dd * 100, 4),
        "var_95_pct": round(var95 * 100, 4),
        "cvar_95_pct": round(cvar95 * 100, 4),
        "best_month_pct": round(best * 100, 4) if best is not None else None,
        "worst_month_pct": round(worst * 100, 4) if worst is not None else None,
        "winning_months_pct": round(calc.winning_months_pct([r for _, r in monthly]), 4),
        "benchmark_synthetic": synthetic,
        "series": [
            {
                "date": row["date"],
                "portfolio": round(row["value"], 4),
                "benchmark": (
                    round(_bench_on(date.fromisoformat(row["date"])), 4)
                    if bench_series else None
                ),
            }
            for row in series
        ],
    }


def _empty_returns(benchmark_symbol: Optional[str]) -> Dict:
    return {
        "total_return_pct": 0.0, "annualized_return_pct": 0.0, "twr_pct": 0.0,
        "mwr_pct": 0.0, "benchmark_return_pct": None, "excess_return_pct": None,
        "alpha": 0.0, "beta": 0.0, "sharpe": 0.0, "sortino": 0.0,
        "volatility_pct": 0.0, "max_drawdown_pct": 0.0, "var_95_pct": 0.0,
        "cvar_95_pct": 0.0, "best_month_pct": None, "worst_month_pct": None,
        "winning_months_pct": 0.0, "benchmark_synthetic": False, "series": [],
    }


def benchmark_series(symbol: str, from_date: Optional[date],
                     to_date: Optional[date]) -> Tuple[float, List[Tuple[date, float]], bool]:
    """
    Total return + price series for a benchmark symbol.

    Returns (total_return, [(date, close)], synthetic_flag). Falls back to a
    deterministic synthetic GBM series (documented in calculations.py) when
    the instrument has no price data.
    """
    from_date = from_date or date.today() - timedelta(days=365)
    to_date = to_date or date.today()
    inst = Instrument.objects.filter(symbol=symbol).first()
    if inst:
        points = list(
            PricePoint.objects.filter(instrument=inst, date__gte=from_date, date__lte=to_date)
            .order_by("date").values_list("date", "close")
        )
        if points:
            start = float(points[0][1])
            end = float(points[-1][1])
            total = (end - start) / start if start else 0.0
            return total, [(d, float(c)) for d, c in points], False
    series = calc.synthetic_price_series(symbol, from_date, to_date)
    total = (series[-1][1] - series[0][1]) / series[0][1] if series else 0.0
    return total, series, True


def cost_basis_payload(portfolio: Portfolio) -> Dict:
    ledger = replay_portfolio(portfolio)
    holdings: List[Dict] = []
    symbols = set(ledger.quantity.keys()) | set(ledger.lots.keys())
    if not symbols:
        return {"method": "fifo", "holdings": []}
    instruments = {i.symbol: i for i in Instrument.objects.filter(symbol__in=symbols)}
    today = date.today()
    price_map = build_price_map(list(instruments.values()), today - timedelta(days=30), today)
    for symbol in sorted(symbols):
        inst = instruments.get(symbol)
        qty = ledger.quantity.get(symbol, 0.0)
        avg = ledger.avg_cost.get(symbol, 0.0)
        fifo_lots = ledger.lots.get(symbol, [])
        fifo_qty = sum(q for q, _ in fifo_lots)
        total_cost = qty * avg
        ps = price_map.get(symbol)
        market_price = ps.latest() if ps else None
        market_value = qty * market_price if market_price is not None else 0.0
        holdings.append(
            {
                "symbol": symbol,
                "name": inst.name if inst else symbol,
                "quantity": round(qty, 8),
                "fifo_quantity": round(fifo_qty, 8),
                "avg_cost": round(avg, 4),
                "total_cost": round(total_cost, 4),
                "market_value": round(market_value, 4),
                "realized_gain_fifo": round(ledger.realized_fifo.get(symbol, 0.0), 4),
                "realized_gain_average": round(ledger.realized_avg.get(symbol, 0.0), 4),
                "unrealized_gain": round(market_value - total_cost, 4),
            }
        )
    return {"method": "fifo", "holdings": holdings}


def _holding_values(portfolio: Portfolio) -> List[Tuple[Instrument, float]]:
    holdings = Holding.objects.filter(portfolio=portfolio).select_related("instrument")
    today = date.today()
    instruments = [h.instrument for h in holdings]
    price_map = build_price_map(instruments, today - timedelta(days=30), today)
    out = []
    for h in holdings:
        ps = price_map.get(h.instrument.symbol)
        price = ps.latest() if ps else None
        value = float(h.quantity) * price if price is not None else 0.0
        out.append((h.instrument, value)
    return out


def allocation_payload(portfolio: Portfolio, by: str) -> List[Dict]:
    rows = _holding_values(portfolio)
    if by == "asset_class":
        items = [(i.asset_class, v) for i, v in rows]
    elif by == "sector":
        items = [(i.sector, v) for i, v in rows]
    elif by == "region":
        items = [(i.region, v) for i, v in rows]
    elif by == "currency":
        items = [(i.currency, v) for i, v in rows]
    elif by == "risk":
        items = [(i.risk_category, v) for i, v in rows]
    else:
        items = [(i.asset_class, v) for i, v in rows]
    return calc.allocation_weights(items)


def diversification_payload(portfolio: Portfolio) -> Dict:
    rows = _holding_values(portfolio)
    weights = [v for _, v in rows if v > 0]
    h = calc.hhi(weights)
    alloc = calc.allocation_weights([(i.symbol, v) for i, v in rows])
    return {
        "hhi": round(h, 6),
        "effective_count": round(calc.effective_count(weights), 4),
        "concentration_level": calc.concentration_level(h),
        "top_10_weight_pct": round(calc.top_n_weight(weights, 10) * 100, 4),
        "by_symbol": alloc,
        "total_market_value": round(sum(weights), 4),
    }


def risk_payload(portfolio: Portfolio) -> Dict:
    series = build_value_series(portfolio, None, None, interval="day")
    values = [row["value"] for row in series]
    if len(values) < 2:
        return {"volatility_pct": 0.0, "var_95_pct": 0.0, "cvar_95_pct": 0.0,
                "beta": 0.0, "drawdown_series": []}
    daily_returns = [(values[i] - values[i - 1]) / values[i - 1] for i in range(1, len(values)) if values[i - 1] != 0]
    vol = calc.volatility(daily_returns)
    var95, cvar95 = calc.var_cvar(daily_returns)
    _, dd_series = calc.max_drawdown(values)
    return {
        "volatility_pct": round(vol * 100, 4),
        "var_95_pct": round(var95 * 100, 4),
        "cvar_95_pct": round(cvar95 * 100, 4),
        "beta": 0.0,
        "drawdown_series": [
            {"date": row["date"], "drawdown_pct": round(dd * 100, 4)}
            for row, dd in zip(series, dd_series)
        ],
    }


def benchmarks_payload(portfolio: Portfolio, symbols: Sequence[str]) -> List[Dict]:
    series = build_value_series(portfolio, None, None, interval="day")
    values = [row["value"] for row in series]
    p_returns = []
    for i in range(1, len(values)):
        if values[i - 1] != 0:
            p_returns.append((values[i] - values[i - 1]) / values[i - 1])
    out = []
    from_date = date.fromisoformat(series[0]["date"]) if series else None
    to_date = date.fromisoformat(series[-1]["date"]) if series else None
    for symbol in symbols:
        total, b_series, synthetic = benchmark_series(symbol, from_date, to_date)
        b_returns = []
        for i in range(1, len(b_series)):
            if b_series[i - 1][1] != 0:
                b_returns.append(b_series[i][1] / b_series[i - 1][1] - 1.0)
        n = min(len(p_returns), len(b_returns))
        beta, alpha = calc.beta_alpha(p_returns[-n:] if n else [], b_returns[-n:] if n else [])
        out.append(
            {
                "symbol": symbol,
                "correlation": round(calc.correlation(p_returns[-n:], b_returns[-n:]), 4),
                "beta": round(beta, 4),
                "alpha": round(alpha, 4),
                "excess_return_pct": round((calc.total_return(values[0], values[-1]) - total) * 100, 4)
                if len(values) > 1 else 0.0,
                "since": from_date.isoformat() if from_date else None,
                "synthetic": synthetic,
            }
        )
    return out


def forecast_payload(portfolio: Portfolio, years: int, expected_return: float,
                     contribution: float, contribution_freq: str) -> Dict:
    months = max(1, int(years * 12))
    monthly = contribution if contribution_freq == "monthly" else contribution * 12.0
    current_value = sum(v for _, v in _holding_values(portfolio))
    ledger = replay_portfolio(portfolio)
    current_value += ledger.cash
    annual_return = expected_return / 100.0
    deterministic, det_series = calc.compound_with_contributions(current_value, monthly, annual_return, months)
    mc = calc.monte_carlo_goal(
        starting_amount=current_value,
        monthly_contribution=monthly,
        annual_return=annual_return,
        annual_volatility=0.15,  # default assumption; UI can refine
        months=months,
        runs=2000,
        seed=42,
        target_amount=deterministic,  # P(beat the expected outcome)
    )
    return {
        "current_value": round(current_value, 4),
        "goal_value": round(deterministic, 4),
        "projected_value": round(mc["median"], 4),
        "probability_of_success": mc["probability_of_success"],
        "contributed_total": round(mc["contributed_total"], 4),
        "expected_return_pct": round(expected_return, 4),
        "years": years,
        "series": det_series,
        "monte_carlo": mc["series"],
    }


# ---------------------------------------------------------------------------
# Expansion endpoints: rolling / drawdowns / capture / correlation / scenarios
# ---------------------------------------------------------------------------

def _value_series_rows(portfolio: Portfolio) -> List[Dict]:
    return build_value_series(portfolio, None, None, interval="day")


def rolling_payload(portfolio: Portfolio, window: int) -> Dict:
    """Rolling returns / volatility / sharpe aligned to the value series dates."""
    series = _value_series_rows(portfolio)
    values = [row["value"] for row in series]
    dates = [row["date"] for row in series]
    daily_returns = []
    for i in range(1, len(values)):
        if values[i - 1] != 0:
            daily_returns.append((values[i] - values[i - 1]) / values[i - 1])

    rets = calc.rolling_returns(values, window)
    vols = calc.rolling_volatility(daily_returns, window)
    sharpes = calc.rolling_sharpe(daily_returns, window)
    # daily-returns-based series are shifted by one against the value dates.
    vols_aligned = [None] + [round(v * 100, 4) if v is not None else None for v in vols]
    sharpes_aligned = [None] + [round(s, 4) if s is not None else None for s in sharpes]
    return {
        "window": window,
        "dates": dates,
        "returns_pct": [round(r * 100, 4) if r is not None else None for r in rets],
        "volatility_pct": vols_aligned,
        "sharpe": sharpes_aligned,
    }


def drawdowns_payload(portfolio: Portfolio) -> Dict:
    """Max drawdown + the full drawdown table with dates and durations."""
    series = _value_series_rows(portfolio)
    values = [row["value"] for row in series]
    dates = [row["date"] for row in series]
    table = calc.drawdown_table(values)
    rows = []
    for dd in table:
        start_d = date.fromisoformat(dates[dd["start_idx"]])
        end_d = date.fromisoformat(dates[dd["end_idx"]])
        trough_d = date.fromisoformat(dates[dd["trough_idx"]])
        rows.append(
            {
                "start": dates[dd["start_idx"]],
                "trough": dates[dd["trough_idx"]],
                "end": dates[dd["end_idx"]],
                "depth_pct": round(dd["depth"] * 100, 4),
                "duration_days": (end_d - start_d).days,
                "recovery_days": (
                    (date.fromisoformat(dates[dd["recovery_idx"]]) - trough_d).days
                    if dd["recovery_idx"] is not None
                    else None
                ),
            }
        )
    max_depth = table[0]["depth"] * 100 if table else 0.0
    return {"max_depth_pct": round(max_depth, 4), "table": rows}


def capture_payload(portfolio: Portfolio, benchmark_symbol: str) -> Dict:
    """Up/down capture vs a benchmark (falls back to synthetic data)."""
    series = _value_series_rows(portfolio)
    values = [row["value"] for row in series]
    p_returns = []
    for i in range(1, len(values)):
        if values[i - 1] != 0:
            p_returns.append((values[i] - values[i - 1]) / values[i - 1])
    from_date = date.fromisoformat(series[0]["date"]) if series else None
    to_date = date.fromisoformat(series[-1]["date"]) if series else None
    total, b_series, synthetic = benchmark_series(benchmark_symbol, from_date, to_date)
    b_returns = []
    for i in range(1, len(b_series)):
        if b_series[i - 1][1] != 0:
            b_returns.append(b_series[i][1] / b_series[i - 1][1] - 1.0)
    n = min(len(p_returns), len(b_returns))
    cap = (
        calc.upside_downside_capture(p_returns[-n:], b_returns[-n:])
        if n
        else {"up_capture": 0.0, "down_capture": 0.0, "up_count": 0, "down_count": 0}
    )
    return {
        "benchmark": benchmark_symbol,
        "up_capture_pct": round(cap["up_capture"] * 100, 4),
        "down_capture_pct": round(cap["down_capture"] * 100, 4),
        "up_count": cap["up_count"],
        "down_count": cap["down_count"],
        "synthetic": synthetic,
    }


def _symbol_daily_returns(
    symbol: str, from_date: date, to_date: date
) -> Dict[date, float]:
    """{date: daily return} for one symbol over [from_date, to_date]."""
    instrument = Instrument.objects.filter(symbol__iexact=symbol).first()
    if instrument is None:
        return {}
    points = list(
        PricePoint.objects.filter(
            instrument=instrument, date__gte=from_date, date__lte=to_date
        )
        .order_by("date")
        .values_list("date", "close")
    )
    out = {}
    prev = None
    for d, close in points:
        close_f = float(close)
        if prev is not None and prev != 0:
            out[d] = close_f / prev - 1.0
        prev = close_f
    return out


def correlation_payload(portfolio: Portfolio) -> Dict:
    """Pairwise correlation matrix for the top 6 holdings by market value."""
    holdings = list(
        Holding.objects.filter(portfolio=portfolio)
        .select_related("instrument")
        .exclude(quantity__lte=0)
    )
    today = date.today()
    instruments = [h.instrument for h in holdings]
    price_map = build_price_map(instruments, today - timedelta(days=30), today)
    valued = []
    for h in holdings:
        ps = price_map.get(h.instrument.symbol)
        price = ps.latest() if ps else None
        value = float(h.quantity) * price if price is not None else 0.0
        if value > 0:
            valued.append((h.instrument, value))
    valued.sort(key=lambda pair: -pair[1])
    top = [inst for inst, _ in valued[:6]]

    first_tx = (
        Transaction.objects.filter(portfolio=portfolio)
        .order_by("date")
        .values_list("date", flat=True)
        .first()
    )
    start = first_tx or today - timedelta(days=365)
    per_symbol = {
        inst.symbol: _symbol_daily_returns(inst.symbol, start, today) for inst in top
    }
    if not per_symbol:
        return {"symbols": [], "matrix": [], "as_of": today.isoformat()}
    common = None
    for by_date in per_symbol.values():
        keys = set(by_date.keys())
        common = keys if common is None else common & keys
    common = sorted(common)
    returns_by_symbol = {
        symbol: [by_date[d] for d in common]
        for symbol, by_date in per_symbol.items()
    }
    result = calc.correlation_matrix(returns_by_symbol)
    result["as_of"] = today.isoformat()
    return result


def scenarios_payload(
    portfolio: Portfolio, market_change_pct: float, vol_multiplier: float
) -> Dict:
    """Stress scenario: shocked value + estimated worst drawdown."""
    series = _value_series_rows(portfolio)
    values = [row["value"] for row in series]
    base = values[-1] if values else 0.0
    result = calc.stress_scenario(values, market_change_pct, vol_multiplier)
    return {
        "base_value": round(base, 4),
        "scenario_value": result["scenario_value"],
        "change_pct": result["change_pct"],
        "est_max_drawdown_pct": result["max_drawdown_pct"],
        "market_change_pct": market_change_pct,
        "vol_multiplier": vol_multiplier,
    }
