"""Celery tasks — notification digests (ARCHITECTURE.md §10)."""
import logging
from datetime import timedelta

from celery import shared_task
from django.db.models import Count
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def daily_digest():
    """Summarize stale unread notifications per user.

    For every user with at least one unread notification older than 24h,
    create a single ``system`` notification titled \"Daily digest\" whose
    body lists ``kind: count`` pairs. Returns the number of digests sent.
    """
    from django.contrib.auth import get_user_model

    from .models import Notification
    from .services import notify

    User = get_user_model()
    cutoff = timezone.now() - timedelta(hours=12)

    stale_users = (
        Notification.objects.filter(is_read=False, created_at__lt=cutoff)
        .values("user_id")
        .annotate(total=Count("id"))
        .order_by()
    )

    sent = 0
    for row in stale_users:
        user = User.objects.filter(id=row["user_id"]).first()
        if user is None:
            continue
        kinds = (
            Notification.objects.filter(user=user, is_read=False, created_at__lt=cutoff)
            .values("kind")
            .annotate(total=Count("id"))
            .order_by("-total")
        )
        lines = [f"{k['kind']}: {k['total']}" for k in kinds]
        body = "No unread notifications." if lines else "; ".join(lines)
        notify(
            user,
            "system",
            "Daily digest",
            f"Unread notifications older than 24h — {body}",
            data={"digest": {k["kind"]: k["total"] for k in kinds}},
        )
        sent += 1

    logger.info("daily_digest: %s digest(s) sent", sent)
    return sent
