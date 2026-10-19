"""Report and ScheduledReport models (§7)."""
import uuid

from django.conf import settings
from django.db import models


class Report(models.Model):
    """An async report job producing PDF/CSV/XLSX exports."""

    KINDS = [
        ("holdings", "Holdings"),
        ("transactions", "Transactions"),
        ("performance", "Performance"),
        ("allocation", "Allocation"),
        ("income", "Income"),
        ("realized_gains", "Realized Gains"),
        ("portfolio_history", "Portfolio History"),
        ("client_portfolios", "Client Portfolios"),
    ]
    FORMATS = [
        ("pdf", "PDF"),
        ("csv", "CSV"),
        ("xlsx", "XLSX"),
    ]
    STATUSES = [
        ("queued", "Queued"),
        ("processing", "Processing"),
        ("ready", "Ready"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports"
    )
    kind = models.CharField(max_length=32, choices=KINDS)
    portfolio = models.ForeignKey(
        "portfolios.Portfolio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports",
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="client_reports",
    )
    format = models.CharField(max_length=8, choices=FORMATS, default="pdf")
    status = models.CharField(max_length=16, choices=STATUSES, default="queued")
    file = models.FileField(upload_to="reports/%Y/%m/", null=True, blank=True)
    params = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        return f"Report {self.kind} ({self.format}) — {self.status}"


class ScheduledReport(models.Model):
    """A recurring report job processed by ``process_scheduled_reports``."""

    FREQUENCIES = [
        ("daily", "Daily"),
        ("weekly", "Weekly"),
        ("monthly", "Monthly"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scheduled_reports"
    )
    kind = models.CharField(max_length=24, choices=Report.KINDS)
    portfolio = models.ForeignKey(
        "portfolios.Portfolio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scheduled_reports",
    )
    format = models.CharField(max_length=8, choices=Report.FORMATS, default="pdf")
    frequency = models.CharField(max_length=12, choices=FREQUENCIES, default="monthly")
    next_run = models.DateField()
    last_run = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Scheduled {self.kind} ({self.format}) {self.frequency}"
