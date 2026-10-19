"""Insight generation service — analytics-driven, deduped, notified."""
from datetime import date

from .models import Insight


def generate_portfolio_insights(portfolio):
    """Build 1-4 Insight rows for a portfolio from the analytics engine.

    Rules (all imported lazily to keep app boundaries clean):

    * concentration: ``diversification_payload`` reports ``high``.
    * drawdown:      ``returns_payload`` ``max_drawdown_pct`` < -15%.
    * performance:   latest monthly return outside the ±5% band.
    * goal_pacing:   any owner goal under 50% progress with < 24 months left.

    Each kind is deduped: skipped while an undismissed insight of the same
    kind exists for the portfolio. Every created insight also notifies the
    portfolio owner. Returns the list of created Insight objects.
    """
    from apps.analytics import calculations as calc
    from apps.analytics import services as analytics_services
    from apps.goals.models import Goal
    from apps.goals.services import goal_progress
    from apps.notifications.services import notify

    owner = portfolio.owner
    existing_kinds = set(
        Insight.objects.filter(
            portfolio=portfolio, user=owner, is_dismissed=False
        ).values_list("kind", flat=True)
    )
    created = []

    def _create(kind, severity, title, body, data=None):
        if kind in existing_kinds:
            return None
        insight = Insight.objects.create(
            user=owner,
            portfolio=portfolio,
            kind=kind,
            severity=severity,
            title=title,
            body=body,
            data=data or {},
        )
        notify(
            owner,
            "insight",
            title,
            body,
            {"kind": kind, "portfolio_id": str(portfolio.id), **(data or {})},
        )
        created.append(insight)
        existing_kinds.add(kind)  # no same-kind duplicates within one run
        return insight

    # --- concentration ---
    try:
        diversification = analytics_services.diversification_payload(portfolio)
        if diversification.get("concentration_level") == "high":
            _create(
                "concentration",
                "warning",
                "High portfolio concentration",
                (
                    f"{portfolio.name} is heavily concentrated: its effective "
                    f"number of holdings is {diversification.get('effective_count')}. "
                    "Consider diversifying to reduce single-position risk."
                ),
                {
                    "concentration_level": "high",
                    "hhi": diversification.get("hhi"),
                    "effective_count": diversification.get("effective_count"),
                },
            )
    except Exception:
        pass

    # --- drawdown + performance (share one returns payload) ---
    try:
        returns = analytics_services.returns_payload(portfolio, None, None, None)
    except Exception:
        returns = None

    if returns is not None:
        # analytics returns max_drawdown as a positive magnitude (0.23 == -23%);
        # abs() keeps the rule correct under either sign convention.
        max_drawdown_pct = returns.get("max_drawdown_pct")
        if max_drawdown_pct is not None and abs(max_drawdown_pct) > 15:
            depth = abs(max_drawdown_pct)
            _create(
                "drawdown",
                "critical",
                "Portfolio in a deep drawdown",
                (
                    f"{portfolio.name} is {depth:.2f}% below its peak. Review "
                    "risk exposure and consider rebalancing."
                ),
                {"max_drawdown_pct": round(depth, 4)},
            )

    try:
        series = analytics_services.build_value_series(portfolio, None, None, "day")
        monthly = calc.monthly_returns_from_daily(
            [(date.fromisoformat(row["date"]), row["value"]) for row in series]
        )
        if monthly:
            month, monthly_return = monthly[-1]
            # calc returns fractions (0.0569 == +5.69%); scale to percentage points.
            monthly_return_pct = monthly_return * 100
            if monthly_return_pct > 5 or monthly_return_pct < -5:
                _create(
                    "performance",
                    "info" if monthly_return_pct > 0 else "warning",
                    f"Monthly performance {monthly_return_pct:+.1f}%",
                    (
                        f"{portfolio.name} returned {monthly_return_pct:+.2f}% in "
                        f"{month}, outside the ±5% band."
                    ),
                    {"month": month, "monthly_return_pct": round(monthly_return_pct, 4)},
                )
    except Exception:
        pass

    # --- goal pacing ---
    try:
        slow_goals = []
        for goal in Goal.objects.filter(owner=owner, is_achieved=False):
            progress = goal_progress(goal)
            if progress["progress_pct"] < 50 and progress["months_remaining"] < 24:
                slow_goals.append(goal)
        if slow_goals:
            names = ", ".join(g.name for g in slow_goals[:3])
            _create(
                "goal_pacing",
                "warning",
                "Goals behind schedule",
                (
                    f"Goal(s) {names} are under 50% funded with less than 24 "
                    "months remaining. Increase contributions or extend the "
                    "target horizon."
                ),
                {"goals": [g.name for g in slow_goals]},
            )
    except Exception:
        pass

    return created
