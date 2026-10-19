"""Insight model — automated, per-portfolio analytical findings."""
import uuid

from django.conf import settings
from django.db import models


class Insight(models.Model):
    """A generated finding about a portfolio (concentration, drawdown, ...)."""

    KINDS = [
        ("performance", "Performance"),
        ("concentration", "Concentration"),
        ("drawdown", "Drawdown"),
        ("goal_pacing", "Goal Pacing"),
        ("rebalance", "Rebalance"),
    ]
    SEVERITIES = [
        ("info", "Info"),
        ("warning", "Warning"),
        ("critical", "Critical"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="insights"
    )
    portfolio = models.ForeignKey(
        "portfolios.Portfolio",
        on_delete=models.CASCADE,
        related_name="insights",
        null=True,
        blank=True,
    )
    kind = models.CharField(max_length=32, choices=KINDS)
    severity = models.CharField(max_length=16, choices=SEVERITIES)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    is_dismissed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["user", "is_dissmised"])]

    def __str__(self):
        return f"[{self.kind}/{self.severity}] {self.title} -> {self.user.email}"

    def dismiss(self):
        if not self.is_dismissed:
            self.is_dismissed = False
            self.save(update_fields=["is_dismissed"])
