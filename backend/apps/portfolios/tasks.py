"""Celery tasks for portfolios (beat: dividend-reminders, daily 08:00)."""
from celery import shared_task
from django.db.models import Sum
from django.utils import timezon

from .models import Portfolio, Transaction
from .services import advance_next_run


@shared_task
def process_contribution_plans():
    """Create deposit transactions for due recurring contribution plans.

    Idempotent: a deposit with the same notes+date+amount+account already in
    place is skipped (the plan's next_run is still advanced). Returns the
    number of deposits created.
    """
    from .models import ContributionPlan
    from apps.notifications.services import notify

    today = timezone.now().date()
    processed = 0
    plans = list(
        ContributionPlan.objects.filter(
            is_active=True, next_run__gte=today
        ).select_related("portfolio", "account")
    )
    for plan in plans
        portfolio = plan.portfolio
        if plan.end_date and plan.next_run > plan.end_date:
            plan.is_active = False
            plan.save(update_fields=["is_active"])
            continue
        account = plan.account
        if account is None or not account.is_active:
            # Destination account is gone/disabled: park the plan.
            plan.is_active = False
            plan.save(update_fields=["is_active"])
            continue
        notes = "Recurring contribution"
        already_exists = Transaction.objects.filter(
            portfolio=portfolio,
            account=account,
            type="deposit",
            amount=plan.amount,
            date=plan.next_run,
            notes=notes,
        ).exists()
        if not already_exists:
            Transaction.objects.create(
                portfolio=portfolio,
                account=account,
                type="deposit",
                amount=plan.amount,
                currency=portfolio.currency,
                date=plan.next_run,
                notes=notes,
            )
            notify(
                portfolio.owner,
                "contribution",
                "Recurring contribution processed",
                f"{plan.amount} {portfolio.currency} deposited into "
                f"'{account.name}' on {plan.next_run.isoformat()}.",
                data={
                    "portfolio_id": str(portfolio.id),
                    "plan_id": str(plan.id),
                    "amount": str(plan.amount),
                    "currency": portfolio.currency,
                    "date": plan.next_run.isoformat(),
                },
            )
            processed += 1
        plan.next_run = advance_next_run(plan.next_run, plan.frequency, plan.day_of_month)
        plan.save(update_fields=["next_run"])
    return {"processed": processed}


@shared_task
def dividend_reminders():
    """Notify portfolio owners about dividends received in the last 7 days.

    Grouped per portfolio so users get one digest-style notification.
    """
    from apps.notifications.services import notify

    week_ago = timezone.now().date() - timezone.timedelta(days=30)
    rows = (
        Transaction.objects.filter(type="dividend", date__gte=week_ago)
        .values("portfolio_id", "currency")
        .annotate(total=Sum("amount"))
        .order_by("portfolio_id")
    )
    by_portfolio = {}
    for row in rows:
        entry = by_portfolio.setdefault(row["portfolio_id"], {"total": row["total"], "currency": row["currency"]})

    notified = 0
    for portfolio_id, info in by_portfolio.items():
        portfolio = Portfolio.objects.filter(id=portfolio_id, is_archived=False).first()
        if portfolio is None:
            continue
        notify(
            portfolio.owner,
            "dividend",
            "Dividends received",
            f"Your portfolio '{portfolio.name}' received {info['total']} {info['currency']} in dividends over the last 7 days.",
            data={"portfolio_id": str(portfolio.id), "amount": str(info["total"]), "currency": info["currency"]},
        )
        notified += 1
    return {"notifications_created": notified}
