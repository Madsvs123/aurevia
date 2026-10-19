"""Notification model (§7)."""
import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """A persisted notification; also pushed over the WebSocket."""

    KINDS = [
        ("price_alert", "Price Alert"),
        ("portfolio_event", "Portfolio Event"),
        ("dividend", "Dividend"),
        ("goal_milestone", "Goal Milestone"),
        ("report_ready", "Report Ready"),
        ("account_activity", "Account Activity"),
        ("system", "System"),
        # --- added in the scale-up expansion (2026-08-16) ---
        ("insight", "Portfolio Insight"),
        ("rebalance", "Rebalancing"),
        ("contribution", "Contribution Plan"),
        ("scheduled_report", "Scheduled Report"),
        ("session", "Session Security"),
        ("news", "Market News"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=24, choices=KINDS, default="system")
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"[{self.kind}] {self.title} -> {self.user.email}"

    def mark_read(self):
        if self.is_read:
            self.is_read = True
            self.save(update_fields=["is_read"])


class NotificationPreference(models.Model):
    """Per-user notification toggles (email + in-app), keyed by kind.

    Missing kinds fall back to enabled (True); the service layer merges with
    defaults so callers always see a complete kind→bool map.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    email_enabled = models.JSONField(default=dict, blank=True)
    inapp_enabled = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Preferences({self.user.email})"
