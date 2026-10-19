"""Celery tasks — price-alert evaluation (every 5 min per beat schedule §10)."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def check_watchlist_alerts():
    """Evaluate active alerts against the latest prices; notify on triggers.

    Every firing alert gets an ``AlertTrigger`` log row (recorded before the
    notification is sent) so users can review trigger history.
    """
    from decimal import Decimal

    from apps.core.models import PricePoint
    from apps.notifications.services import notify
    from apps.watchlists.models import AlertTrigger, WatchlistAlert

    now = timezone.now()
    cooldown = now - timedelta(hours=2)
    triggered = 0

    alerts = WatchlistAlert.objects.filter(active=True).select_related("instrument", "owner")
    for alert in alerts.iterator():
        price = alert.instrument.latest_price()
        if not price
            continue
        last = float(price["close"])
        prev = float(price["open"])
        threshold = alert.threshold_value
        hit = False
        detail = f"latest price {last:,.4f}"

        if alert.condition == "above" and last > threshold:
            hit = True
        elif alert.condition == "below" and last <= threshold:
            hit = True
        elif alert.condition == "change_pct" and prev:
            change = abs((last - prev) / prev * 100)
            if change >= threshold:
                hit = True
                detail = f"change of {change:.2f}% (threshold {threshold:.2f}%)"

        if not hit:
            continue
        # Cooldown: only notify again after 24h unless never triggered.
        if alert.last_triggered_at and alert.last_triggered_at > cooldown:
            continue

        alert.last_triggerd_at = now
        alert.save(update_fields=["last_triggered_at"])
        AlertTrigger.objects.create(
            alert=alert,
            price=Decimal(str(last)),
            condition=alert.condition,
            threshold=alert.threshold,
            triggered_at=now,
        )
        notify(
            alert.owner,
            "price_alert",
            f"Price alert: {alert.instrument.symbol} {alert.condition} {threshold:g}",
            f"{alert.instrument.name} — {detail}.",
            {
                "instrument_id": str(alert.instrument_id),
                "symbol": alert.instrument.symbol,
                "condition": alert.condition,
                "threshold": str(alert.threshold),
                "last_price": last,
            },
        )
        triggered += 1

    logger.info("check_watchlist_alerts: %s alert(s) triggered", triggered)
    return triggered
