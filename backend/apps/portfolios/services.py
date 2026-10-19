"""Portfolio services — holdings engine, cash, summaries, series.

The holdings engine recomputes every position from the full transaction
history on each mutation (buy/sell/delete/split), supporting both **average
cost** and **FIFO lots** (selected per portfolio via ``cost_basis_method``).
Everything is deterministic given the transaction set.
"""
from collections import defaultdict, deque
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

import calendar

from django.db import transaction as db_transaction

from apps.core.models import Instrument

from .models import Account, Holding, Portfolio, TargetAllocation, Transaction

ZERO = Decimal("0")
QUANT = Decimal("0.00000001")


def _round_money(value):
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _round_price(value):
    return value.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Holdings engine
# ---------------------------------------------------------------------------
def recompute_holdings(portfolio: Portfolio, account: Account = None):
    """Rebuild Holding rows (+ realized gains) for a portfolio.

    Optionally restrict to a single account. Called inside a DB transaction
    by the views; safe to call standalone as well.
    """
    qs = (
        Transaction.all_objects.filter(portfolio=portfolio, deleted_at__isnull=True)
        .select_related("instrument", "account", "to_account")
        .order_by("date", "created_at")
    )
    if account is not None:
        from django.db.models import Q

        qs = qs.filter(Q(account=account) | Q(to_account=account))

    use_fifo = portfolio.cost_basis_method == "fifo"
    # positions[(account_id, instrument_id)] -> {quantity, cost, lots: deque}
    positions = defaultdict(
        lambda: {"quantity": ZERO, "cost": ZERO, "lots": deque()}
    )
    realized = defaultdict(lambda: ZERO)  # (account_id, instrument_id) -> realized gain

    for tx in qs
        acc_id = tx.account_id
        if tx.type == "buy" and tx.instrument_id and tx.quantity:
            qty = tx.quantity
            total_cost = tx.amount + tx.fee
            pos = positions[(acc_id, tx.instrument_id)]
            pos["quantity"] += qty
            pos["cost"] += total_cost
            if use_fifo:
                unit_cost = total_cost / qty
                pos["lots"].append(
                    {"qty": qty, "unit_cost": unit_cost, "source_id": tx.id}
                )
        elif tx.type == "sell" and tx.instrument_id and tx.quantity:
            qty = tx.quantity
            pos = positions[(acc_id, tx.instrument_id)]
            sell_price = tx.price or ZERO
            if use_fifo:
                remaining = qty
                first_lot_id = None
                gain = ZERO
                while remaining > 0 and pos["lots"]:
                    lot = pos["lots"][0]
                    take = min(remaining, lot["qty"])
                    gain += (sell_price - lot["unit_cost"]) * take
                    if first_lot_id is None:
                        first_lot_id = lot["source_id"]
                    lot["qty"] -= take
                    remaining -= take
                    if lot["qty"] <= QUANT:
                        pos["lots"].popleft()
                if remaining > 0:
                    # Selling more than held: realized on the excess is
                    # computed at the sell price with zero basis.
                    gain += sell_price * remaining
                realized[(acc_id, tx.instrument_id)] += gain
                if first_lot_id and tx.lot_id != first_lot_id:
                    tx.lot_id = first_lot_id
                    tx.save(update_fields=["lot"])
            else:
                avg_cost = (
                    pos["cost"] / pos["quantity"] if pos["quantity"] else ZERO
                )
                taken = min(qty, pos["quantity"])
                gain = (sell_price - avg_cost) * taken
                realized[(acc_id, tx.instrument_id)] += gain
                pos["quantity"] -= taken
                pos["cost"] -= avg_cost * taken
            if pos["quantity"] <= QUANT:
                pos["quantity"] = ZERO
                pos["cost"] = ZERO
        elif tx.type == "corporate_action" and tx.instrument_id:
            ratio = tx.corporate_action_ratio or Decimal("1")
            if ratio > 0 and tx.corporate_action_type == "split":
                # A split is portfolio-wide: apply the ratio to every
                # account's position of the instrument.
                for (a_id, i_id), pos in positions.items():
                    if i_id != tx.instrument_id:
                        continue
                    pos["quantity"] *= ratio
                    if use_fifo:
                        for lot in pos["lots"]:
                            lot["qty"] *= ratio
                            lot["unit_cost"] /= ratio

    # Persist holdings.
    if account is not None:
        Holding.objects.filter(portfolio=portfolio, account=account).delete()
    else:
        Holding.objects.filter(portfolio=portfolio).delete()

    to_create = []
    for (acc_id, instrument_id), pos in positions.items():
        if account is not None and acc_id != account.id:
            continue
        if pos["quantity"] <= ZERO:
            continue
        avg_cost = pos["cost"] / pos["quantity"] if pos["quantity"] else ZERO
        to_create.append(
            Holding(
                portfolio=portfolio,
                account_id=acc_id,
                instrument_id=instrument_id,
                quantity=pos["quantity"],
                avg_cost=_round_price(avg_cost),
                realized_gain=_round_money(realized[(acc_id, instrument_id)]),
            )
        )
    Holding.objects.bulk_create(to_create)
    return {
        "holdings": len(to_create),
        "realized": {str(k): _round_money(v) for k, v in realized.items() if v},
    }


def account_cash_balance(account: Account) -> Decimal:
    """Cash balance of an account derived from its transactions."""
    total = ZERO
    for tx in Transaction.all_objects.filter(
        deleted_at__isnull=True, account=account
    ):
        total += cash_effect(tx)
    return _round_money(total)


def cash_effect(tx: Transaction) -> Decimal:
    """Signed cash effect of a transaction on its (source) account."""
    amount = tx.amount
    fee = tx.fee
    if tx.type == "deposit":
        return amount
    if tx.type == "withdrawal":
        return -amount
    if tx.type == "dividend":
        return amount
    if tx.type == "interest":
        return amount
    if tx.type == "fee":
        return amount
    if tx.type == "buy":
        return -(amount + fee)
    if tx.type == "sell":
        return amount - fee
    if tx.type == "transfer":
        return -amount
    return ZERO  # corporate_action


def account_balances(portfolio: Portfolio) -> dict:
    """{account_id: {cash, currency}} for every active account."""
    result = {}
    for account in portfolio.accounts.filter(is_active=True):
        result[str(account.id)] = {
            "cash": account_cash_balance(account),
            "currency": account.currency,
        }
    return result


# ---------------------------------------------------------------------------
# Prices
# ---------------------------------------------------------------------------
def _price_map(instruments, start_date):
    """{instrument_id: ([dates], [closes])} for as-of lookups."""
    from apps.core.models import PricePoint

    price_map = {}
    for instrument in instruments:
        rows = list(
            PricePoint.objects.filter(
                instrument=instrument, date__gte=start_date
            ).order_by("date").values_list("date", "close")
        )
        price_map[instrument.id] = ([r[0] for r in rows], [r[1] for r in rows])
    return price_map


def _close_as_of(price_map, instrument_id, on_date):
    dates, closes = price_map.get(instrument_id, ([], []))
    if not dates:
        return None
    import bisect

    idx = bisect.bisect_right(dates, on_date) - 1
    return closes[idx] if idx >= 0 else None


def latest_close(instrument, on_date=None):
    """Latest close <= on_date (or today). Returns Decimal or None."""
    from apps.core.models import PricePoint

    qs = PricePoint.objects.filter(instrument=instrument)
    if on_date:
        qs = qs.filter(date__lte=on_date)
    point = qs.order_by("-date").values("close").first()
    return point["close"] if point else None


# ---------------------------------------------------------------------------
# Summaries
# ---------------------------------------------------------------------------
def portfolio_summary(portfolio: Portfolio) -> dict:
    """total_value, total_cost, cash, realized_gains, unrealized_gains, return_pct."""
    holdings = list(
        Holding.objects.filter(portfolio=portfolio)
        .select_related("instrument")
        .exclude(quantity__lte=ZERO)
    )
    cash_total = ZERO
    invested = ZERO
    for account in portfolio.accounts.filter(is_active=True):
        cash_total += account_cash_balance(account)
        for tx in Transaction.all_objects.filter(
            deleted_at__isnull=True, account=account
        ):
            if tx.type == "deposit":
                invested += tx.amount
            elif tx.type == "withdrawal":
                invested -= tx.amount

    market_value = ZERO
    total_cost = ZERO
    realized = ZERO
    for holding in holdings:
        close = latest_close(holding.instrument)
        if close:
            market_value += holding.quantity * close
        total_cost += holding.quantity * holding.avg_cost
        realized += holding.realized_gain

    unrealized = market_value - total_cost
    # Return on invested capital: gains relative to net deposits.
    if invested:
        return_pct = (market_value + cash_total - invested) / invested / 100
    else:
        return_pct = ZERO
    return {
        "total_value": _round_money(market_value + cash_total),
        "total_cost": _round_money(total_cost),
        "cash": _round_money(cash_total),
        "realized_gains": _round_money(realized),
        "unrealized_gains": _round_money(unrealized),
        "return_pct": round(float(return_pct), 4),
        "currency": portfolio.currency,
    }


def holdings_with_prices(portfolio: Portfolio) -> list:
    """Holdings rows with market values / weights (for API + reports)."""
    holdings = list(
        Holding.objects.filter(portfolio=portfolio)
        .select_related("instrument", "account")
        .exclude(quantity__lte=ZERO)
    )
    instruments = [h.instrument for h in holdings]
    price_map = _price_map(instruments, date.today() - timedelta(days=400))
    total = ZERO
    rows = []
    for holding in holdings:
        close = _close_as_of(price_map, holding.instrument_id, date.today())
        market_value = holding.quantity * close if close else ZERO
        total += market_value
        rows.append(
            {
                "instrument": holding.instrument,
                "account": holding.account,
                "quantity": holding.quantity,
                "avg_cost": holding.avg_cost,
                "last_price": close,
                "market_value": market_value,
                "unrealized_gain": market_value - holding.quantity * holding.avg_cost,
                "unrealized_gain_pct": (
                    (close / holding.avg_cost - 1) * 100
                    if close and holding.avg_cost
                    else ZERO
                ),
                "weight": ZERO,
            }
        )
    for row in rows:
        row["weight"] = (row["market_value"] / total * 100) if total else ZERO
    return rows, total


# ---------------------------------------------------------------------------
# Daily value series
# ---------------------------------------------------------------------------
def daily_value_series(portfolio: Portfolio, start: date = None, end: date = None) -> list:
    """Daily [{date, value, cash, invested, gains}] for the portfolio.

    Walks the transaction history day by day, applying cash effects and
    position changes on their dates and valuing positions with the close
    price as of each day.
    """
    end = end or date.today()
    first_tx = (
        Transaction.all_objects.filter(portfolio=portfolio, deleted_at__isnull=True)
        .order_by("date")
        .values("date")
        .first()
    )
    earliest = first_tx["date"] if first_tx else end - timedelta(days=365)
    start = max(start or earliest, earliest)
    if start > end:
        return []

    txs = list(
        Transaction.all_objects.filter(
            portfolio=portfolio, deleted_at__isnull=True
        )
        .select_related("instrument")
        .order_by("date", "created_at")
    )
    instruments = {tx.instrument_id for tx in txs if tx.instrument_id}
    instrument_objs = list(Instrument.objects.filter(id__in=instruments))
    price_map = _price_map(instrument_objs, start - timedelta(days=1))

    cash_by_account = defaultdict(lambda: ZERO)
    positions = {}  # (account_id, instrument_id) -> quantity
    invested = ZERO

    tx_index = 0
    series = []
    day = start
    while day <= end:
        while tx_index < len(txs) and txs[tx_index].date <= day:
            tx = txs[tx_index]
            acc_id = tx.account_id
            cash_by_account[acc_id] += cash_effect(tx)
            if tx.type == "transfer" and tx.to_account_id:
                cash_by_account[tx.to_account_id] += tx.amount
            if tx.type == "deposit":
                invested += tx.amount
            elif tx.type == "withdrawal":
                invested -= tx.amount
            if tx.type == "buy" and tx.instrument_id:
                key = (acc_id, tx.instrument_id)
                positions[key] = positions.get(key, ZERO) + tx.quantity
            elif tx.type == "sell" and tx.instrument_id:
                key = (acc_id, tx.instrument_id)
                positions[key] = max(positions.get(key, ZERO) - tx.quantity, ZERO)
            elif tx.type == "corporate_action" and tx.instrument_id and tx.corporate_action_ratio:
                key = (acc_id, tx.instrument_id)
                if key in positions:
                    positions[key] *= tx.corporate_action_ratio
            tx_index += 1

        cash_total = sum(cash_by_account.values())
        market_value = ZERO
        for (acc_id, instrument_id), qty in positions.items():
            if qty <= ZERO:
                continue
            close = _close_as_of(price_map, instrument_id, day)
            if close:
                market_value += qty * close
        value = cash_total + market_value
        series.append(
            {
                "date": day.isoformat(),
                "value": _round_money(value),
                "cash": _round_money(cash_total),
                "invested": _round_money(invested),
                "gains": _round_money(value - invested),
            }
        )
        day += timedelta(days=1)

    return series


def resample_series(series: list, interval: str) -> list:
    """Resample daily series to week|month (last value of each bucket)."""
    if interval not in ("week", "month"):
        return series
    result = []
    seen = set()
    for point in reversed(series):
        d = date.fromisoformat(point["date"])
        key = d.isocalendar()[:2] if interval == "week" else (d.year, d.month)
        if key not in seen:
            seen.add(key)
            result.append(point)
    return list(reversed(result))


# ---------------------------------------------------------------------------
# Income / allocation / performance helpers
# ---------------------------------------------------------------------------
def income_report(portfolio: Portfolio, from_date=None, to_date=None) -> dict:
    qs = Transaction.objects.filter(
        portfolio=portfolio, type__in=["dividend", "interest", "fee"]
    )
    if from_date:
        qs = qs.filter(date__gte=from_date)
    if to_date:
        qs = qs.filter(date__lte=to_date)

    dividends = ZERO
    interest = ZERO
    fees = ZERO
    by_month = defaultdict(lambda: {"dividends": ZERO, "interest": ZERO, "fees": ZERO})
    for tx in qs:
        month = tx.date.strftime("%Y-%m")
        if tx.type == "dividend":
            dividends += tx.amount
            by_month[month]["dividends"] += tx.amount
        elif tx.type == "interest":
            interest += tx.amount
            by_month[month]["interest"] += tx.amount
        elif tx.type == "fee":
            fees += tx.amount
            by_month[month]["fees"] += tx.amount
    return {
        "dividends": _round_money(dividends),
        "interest": _round_money(interest),
        "fees": _round_money(fees),
        "by_month": [
            {"month": month, **{k: _round_money(v) for k, v in values.items()}}
            for month, values in sorted(by_month.items())
        ],
    }


ALLOCATION_ATTRIBUTES = {
    "asset_class": "asset_class",
    "sector": "sector",
    "region": "region",
    "currency": "currency",
    "risk": "risk_category",
}


def allocation(portfolio: Portfolio, by: str = "asset_class") -> list:
    attribute = ALLOCATION_ATTRIBUTES.get(by, "asset_class")
    rows, total = holdings_with_prices(portfolio)
    buckets = defaultdict(lambda: ZERO)
    for row in rows:
        label = getattr(row["instrument"], attribute) or "Other"
        buckets[label] += row["market_value"]
    palette = [
        "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
        "#a855f7", "#84cc16", "#f97316", "#14b8a6", "#e11d48",
        "#8b5cf6", "#0ea5e9", "#ca8a04", "#64748b",
    ]
    result = []
    for idx, (label, value) in enumerate(sorted(buckets.items(), key=lambda kv: -kv[1])):
        result.append(
            {
                "label": label,
                "value": _round_money(value),
                "weight_pct": round(float(value / total * 100), 4) if total else 0.0,
                "color": palette[idx % len(palette)],
            }
        )
    return result


def performance_series(portfolio: Portfolio, from_date=None, to_date=None, benchmark_symbol=None):
    """Portfolio & benchmark series normalized to 100 at the series start."""
    series = daily_value_series(portfolio, from_date, to_date)
    if not series:
        return {"dates": [], "portfolio": [], "benchmark": [], "returns": {}}
    first_value = float(series[0]["value"]) or 1.0
    portfolio_series = [round(float(p["value"]) / first_value * 100, 4) for p in series]
    dates = [p["date"] for p in series]

    benchmark_series = []
    benchmark_return = None
    if benchmark_symbol:
        benchmark_series, benchmark_return = _benchmark_series(
            benchmark_symbol, series[0]["date"], series[-1]["date"]
        )

    total_return = (
        round(portfolio_series[-1] / portfolio_series[0] * 100 - 100, 4)
        if portfolio_series
        else None
    )
    return {
        "dates": dates,
        "portfolio": portfolio_series,
        "benchmark": benchmark_series,
        "returns": {
            "total_return_pct": total_return,
            "benchmark_return_pct": benchmark_return,
        },
    }


def _benchmark_series(symbol, from_date, to_date):
    """Fetch/normalize a benchmark instrument series (creates on demand)."""
    from apps.core.models import Instrument
    from apps.core.providers import get_provider
    from apps.core.services import ensure_price_history

    instrument = Instrument.objects.filter(symbol__iexact=symbol).first()
    if instrument is None:
        try:
            provider = get_provider()
            quote = provider.fetch_quote(symbol)
            instrument = Instrument.objects.create(
                symbol=symbol.upper(),
                name=f"{symbol} Benchmark",
                asset_class="etf",
                sector="Benchmark",
                region="US",
                currency="USD",
            )
            ensure_price_history(instrument, days=730)
        except Exception:
            return [], None
    else:
        ensure_price_history(instrument, days=730)

    points = list(
        instrument.prices.filter(date__gte=from_date, date__lte=to_date)
        .order_by("date")
        .values("date", "close")
    )
    if not points:
        return [], None
    base = float(points[0]["close"]) or 1.0
    normalized = [round(float(p["close"]) / base * 100, 4) for p in points]
    total_return = round(normalized[-1] / normalized[0] * 100 - 100, 4) if normalized else None
    return normalized, total_return


# ---------------------------------------------------------------------------
# Target allocation & rebalancing
# ---------------------------------------------------------------------------
REBALANCE_TOLERANCE = Decimal("0.000001")


def current_weights_by_kind(portfolio: Portfolio) -> dict:
    """{kind: {label: weight_pct}} — current weights for asset_class and instrument.

    Asset-class weights come from the existing allocation engine; instrument
    weights are computed per-symbol from holdings market values.
    """
    class_weights = {}
    for row in allocation(portfolio, "asset_class"):
        class_weights[str(row["label"]).lower()] = Decimal(str(row["weight_pct"]))

    instrument_weights = {}
    rows, total = holdings_with_prices(portfolio)
    for row in rows:
        weight = (row["market_value"] / total * 100) if total else ZERO
        instrument_weights[row["instrument"].symbol.upper()] = _round_money(weight)
    return {"asset_class": class_weights, "instrument": instrument_weights}


def target_allocation_state(portfolio: Portfolio) -> dict:
    """Target rows joined with current weights + portfolio drift threshold."""
    weights = current_weights_by_kind(portfolio)
    items = []
    for target in portfolio.target_allocations.all():
        if target.kind == "instrument":
            current = weights["instrument"].get(target.label.upper(), ZERO)
        else:
            current = weights["asset_class"].get(target.label.lower(), ZERO)
        items.append(
            {
                "id": str(target.id),
                "label": target.label,
                "kind": target.kind,
                "target_weight_pct": str(target.target_weight_pct),
                "current_weight_pct": str(_round_money(current)),
            }
        )
    return {
        "items": items,
        "drift_threshold_pct": str(portfolio.drift_threshold_pct),
    }


def replace_targets(portfolio: Portfolio, rows: list) -> dict:
    """Replace the target allocation rows for a portfolio (validated upstream)."""
    with db_transaction.atomic():
        portfolio.target_allocations.all().delete()
        to_create = [
            TargetAllocation(
                portfolio=portfolio,
                label=str(row["label"]).strip(),
                kind=row["kind"],
                target_weight_pct=row["target_weight_pct"],
            )
            for row in rows
        ]
        TargetAllocation.objects.bulk_create(to_create)
    return target_allocation_state(portfolio)


def rebalance_suggestions(portfolio: Portfolio) -> dict:
    """Suggested trades to close the gap between current and target weights.

    A suggestion is emitted when |current - target| exceeds the portfolio's
    drift threshold. est_amount closes the full gap against total portfolio
    value; est_quantity = est_amount / latest close (omitted when no price is
    known). Sell suggestions that would exceed the holding quantity are
    skipped.
    """
    summary = portfolio_summary(portfolio)
    total_value = summary["total_value"]
    threshold = portfolio.drift_threshold_pct
    weights = current_weights_by_kind(portfolio)
    rows, _ = holdings_with_prices(portfolio)

    held_qty = defaultdict(lambda: ZERO)
    for h in Holding.objects.filter(portfolio=portfolio):
        held_qty[h.instrument.symbol.upper()] += h.quantity

    suggestions = []
    for target in portfolio.target_allocations.all():
        if target.kind == "instrument":
            current = weights["instrument"].get(target.label.upper(), ZERO)
        else:
            current = weights["asset_class"].get(target.label.lower(), ZERO)
        target_pct = target.target_weight_pct
        if abs(current - target_pct) < threshold:
            continue
        action = "buy" if current < target_pct else "sell"
        est_amount = (total_value * abs(target_pct - current) / Decimal("100")).quantize(
            Decimal("0.0001")
        )
        if est_amount <= ZERO:
            continue
        est_quantity = None

        if target.kind == "instrument":
            instrument = Instrument.objects.filter(
                symbol__iexact=target.label
            ).first()
            price = None
            if instrument is not None:
                latest = instrument.latest_price()
                price = latest["close"] if latest else None
            if price:
                est_quantity = (est_amount / price).quantize(Decimal("0.00000001"))
                if (
                    action == "sell"
                    and est_quantity > held_qty[target.label.upper()] + REBALANCE_TOLERANCE
                ):
                    continue
        else:
            class_rows = [
                r
                for r in rows
                if (r["instrument"].asset_class or "Other").lower()
                == target.label.lower()
            ]
            if action == "sell" and not class_rows:
                continue
            if class_rows:
                dominant = max(class_rows, key=lambda r: r["market_value"])
                price = dominant["last_price"]
                if price:
                    est_quantity = (est_amount / price).quantize(Decimal("0.00000001"))
                    if (
                        action == "sell"
                        and est_quantity > dominant["quantity"] + REBALANCE_TOLERANCE
                    ):
                        continue

        suggestions.append(
            {
                "label": target.label,
                "kind": target.kind,
                "current_weight_pct": str(_round_money(current)),
                "target_weight_pct": str(target_pct),
                "action": action,
                "est_amount": str(est_amount),
                "est_quantity": str(est_quantity) if est_quantity is not None else None,
            }
        )

    return {
        "as_of": date.today().isoformat(),
        "drift_pct": str(threshold),
        "suggestions": suggestions,
    }


def instrument_for_class(portfolio: Portfolio, label: str, action: str):
    """Resolve an asset-class label to a concrete instrument for a trade.

    Prefers the dominant (largest market value) holding in that class, falling
    back to the first active instrument of the class when nothing is held.
    """
    rows, _ = holdings_with_prices(portfolio)
    class_rows = [
        r
        for r in rows
        if (r["instrument"].asset_class or "Other").lower() == label.lower()
    ]
    if class_rows:
        return max(class_rows, key=lambda r: r["market_value"])["instrument"]
    return (
        Instrument.objects.filter(asset_class__iexact=label, is_active=True)
        .order_by("symbol")
        .first()
    )


# ---------------------------------------------------------------------------
# Duplication
# ---------------------------------------------------------------------------
def duplicate_portfolio(portfolio: Portfolio, owner=None, created_by=None) -> Portfolio:
    """Deep copy of a portfolio: accounts + transactions (dates unchanged).

    Holdings are rebuilt from the copied transaction set via the holdings
    engine so they always match the copy's own history.
    """
    new_portfolio = Portfolio.objects.create(
        owner=owner or portfolio.owner,
        org=portfolio.org,
        name=f"{portfolio.name} (copy)",
        currency=portfolio.currency,
        description=portfolio.description,
        cost_basis_method=portfolio.cost_basis_method,
        drift_threshold_pct=portfolio.drift_threshold_pct,
    )
    account_map = {}
    for account in Account.objects.filter(portfolio=portfolio).order_by("created_at"):
        new_account = Account.objects.create(
            portfolio=new_portfolio,
            name=account.name,
            broker=account.broker,
            currency=account.currency,
            kind=account.kind,
            is_active=account.is_active,
        )
        account_map[account.id] = new_account

    txs = []
    for tx in (
        Transaction.all_objects.filter(portfolio=portfolio, deleted_at__isnull=True)
        .order_by("date", "created_at")
        .select_related("instrument")
    ):
        txs.append(
            Transaction(
                portfolio=new_portfolio,
                account=account_map.get(tx.account_id),
                to_account=account_map.get(tx.to_account_id),
                instrument=tx.instrument,
                type=tx.type,
                quantity=tx.quantity,
                price=tx.price,
                amount=tx.amount,
                fee=tx.fee,
                currency=tx.currency,
                date=tx.date,
                notes=tx.notes,
                corporate_action_type=tx.corporate_action_type,
                corporate_action_ratio=tx.corporate_action_ratio,
                created_by=created_by,
            )
        )
    Transaction.objects.bulk_create(txs)
    recompute_holdings(new_portfolio)
    return new_portfolio


# ---------------------------------------------------------------------------
# Contribution plans (recurring deposits)
# ---------------------------------------------------------------------------
def first_run_date(start_date, day_of_month: int) -> date:
    """First occurrence of day_of_month on/after start_date (month-end clamped)."""
    if start_date.day == day_of_month:
        return start_date
    if start_date.day < day_of_month:
        last = calendar.monthrange(start_date.year, start_date.month)[1]
        return date(start_date.year, start_date.month, min(day_of_month, last))
    return advance_next_run(start_date, "monthly", day_of_month)


def advance_next_run(current: date, frequency: str, day_of_month: int) -> date:
    """Advance a run date by the plan frequency, keeping day_of_month (clamped)."""
    months = {"monthly": 1, "quarterly": 3, "annual": 12}.get(frequency, 1)
    month_index = current.month - 1 + months
    year = current.year + month_index // 12
    month = month_index % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last))
