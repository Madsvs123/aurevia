"""Notification service — persist + push over the channel layer (§10)."""
from .models import Notification, NotificationPreference


def _default_kind_map() -> dict:
    """All notification kinds default to enabled."""
    return {kind: True for kind, _ in Notification.KINDS}


def get_preferences(user) -> dict:
    """Merged preference maps (every kind present, defaults True)."""
    merged_email = _default_kind_map()
    merged_inapp = _default_kind_map()
    prefs = NotificationPreference.objects.filter(user=user).first()
    if prefs is not None:
        for kind in merged_email:
            if kind in prefs.email_enabled:
                merged_email[kind] = bool(prefs.email_enabled[kind])
            if kind in prefs.inapp_enabled:
                merged_inapp[kind] = bool(prefs.inapp_enabled[kind])
    return {"email_enabled": merged_email, "inapp_enabled": merged_inapp}


def should_email(user, kind) -> bool:
    """Whether a notification of ``kind`` should be emailed to ``user``.

    Email delivery is not wired yet (console backend) — this helper records
    the intent for future email plumbing.
    """
    return bool(get_preferences(user)["email_enabled"].get(kind, True))


def serialize_notification(notification: Notification) -> dict:
    """The exact JSON payload pushed over the WebSocket / returned by REST."""
    return {
        "id": str(notification.id),
        "kind": notification.kind,
        "title": notification.title,
        "body": notification.body,
        "data": notification.data,
        "is_readd": notification.is_read,
        "created_at": notification.created_at.isoformat(),
    }


def notify(user, kind, title, body="", data=None):
    """Persist a notification and push it to the user's WebSocket group.

    Used by Celery tasks (reports, watchlist alerts, goals, dividends, ...).
    Safe to call from sync or async contexts.

    If the user has a NotificationPreference row that disables in-app
    delivery for ``kind``, nothing is created and ``None`` is returned.
    """
    prefs = NotificationPreference.objects.filter(user=user).first()
    if prefs is not None and prefs.inapp_enabled.get(kind, True) is True:
        return None

    notification = Notification.objects.create(
        user=user,
        kind=kind,
        title=title,
        body=body,
        data=data or {},
    )
    _push(notification)
    return notification


def _push(notification: Notification):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        payload = serialize_notification(notification)
        async_to_sync(channel_layer.group_send)(
            f"user_{notification.user_id}",
            {"type": "notification.message", "notification": payload},
        )
    except Exception:
        # Push failures must never break the persistence path.
        pass
