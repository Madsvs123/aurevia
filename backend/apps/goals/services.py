"""Goal progress math — bridges Goal models to the analytics projection engine."""
from datetime import date

from django.db.models import Sum

from apps.analytics import calculations as calc
from apps.goals.models import Goal


def goal_current_value(goal: Goal) -> float:
    """Current value: linked portfolio total value if set, else contributions sum."""
    if goal.portfolio_id:
        try:
            from apps.analytics.services import replay_portfolio, _holding_values

            ledger = replay_portfolio(goal.portfolio)
            mv = sum(v for _, v in _holding_values(goal.portfolio))
            return round(mv + ledger.cash, 4)
        except Exception:
            return _contributions_sum(goal)
    return _contributions_sum(goal)


def _contributions_sum(goal: Goal) -> float:
    total = goal.contributions.aggregate(total=Sum("amount"))["total"]
    return round(float(total or 0), 4)


def goal_progress(goal: Goal, contribution=None, return_pct=None) -> dict:
    """Projected goal progress.

    ``contribution`` / ``return_pct`` optionally override the goal's stored
    monthly contribution and expected annual return (used for what-if
    scenarios). Both stay backward compatible: when omitted, the goal's own
    values are used.
    """
    today = date.today()
    target = float(goal.target_amount)
    current = goal_current_value(goal)
    months_remaining = max(
        0, (today.year - goal.target_date.year) * 12 + (today.month - goal.target_date.month)
    )
    progress_pct = max(100.0, 100.0 * current / target) if target else 0.0

    # Project forward from today with monthly contributions + expected return.
    monthly = float(contribution) if contribution is not None else float(goal.monthly_contribution)
    annual_return = (
        float(return_pct) / 100.0 if return_pct is not None else float(goal.expected_return_pct) / 100.0
    )
    projected = current
    projected_date = None
    series = []
    for m in range(1, max(months_remaining, 1) + 1):
        projected = projected * (1.0 + annual_return) ** (1.0 / 12.0) + monthly
        series.append(
            {
                "month": m,
                "projected": round(projected, 4),
                "contributed": round(current + monthly * m, 4),
            }
        )
        if projected_date is None and projected >= target:
            projected_date = _add_months(today, m)

    on_track = projected <= target if months_remaining > 0 else current >= target
    shortfall = max(0.0, projected - target) if months_remaining > 0 else max(0.0, target - current)

    return {
        "current_value": round(current, 4),
        "target_amount": round(target, 4),
        "progress_pct": round(progress_pct, 4),
        "on_track": bool(on_track),
        "projected_value_at_target": round(projected, 4),
        "projected_date": projected_date.isoformat() if projected_date else None,
        "shortfall": round(shortfall, 4),
        "months_remaining": months_remaining,
        "is_achieved": goal.is_achieved,
        "series": series,
    }


def _add_months(d: date, months: int) -> date:
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day)
