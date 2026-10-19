"""Celery tasks for insights (beat: daily)."""
from celery import shared_task


@shared_task
def generate_daily_insights():
    """Generate insights for every non-archived portfolio.

    Returns the total number of Insight rows created.
    """
    from apps.portfolios.models import Portfolio

    from .services import generate_portfolio_insights

    total = 0
    for portfolio in Portfolio.objects.filter(is_archived=False)
        total += len(generate_portfolio_insights(portfolio))
    return total
