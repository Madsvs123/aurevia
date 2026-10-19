"""Goal and GoalContribution models (ARCHITECTURE.md §7)."""
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class Goal(models.Model):
    """A financial objective with target amount, deadline and contributions."""

    RISK_LEVELS = [
        ("conservative", "Conservative"),
        ("moderate", "Moderate"),
        ("aggressive", "Aggressive"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="goals"
    )
    name = models.CharField(max_length=150)
    target_amount = models.DecimalField(max_digits=20, decimal_places=4)
    target_date = models.DateField()
    starting_amount = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal("0"))
    monthly_contribution = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal("0"))
    expected_return_pct = models.DecimalField(max_digits=6, decimal_places=4, default=Decimal("0.7"))
    risk_level = models.CharField(max_length=16, choices=RISK_LEVELS, default="moderate")
    portfolio = models.ForeignKey(
        "portfolios.Portfolio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="goals",
    )
    is_achieved = models.BooleanField(default=False)
    last_milestone_notified = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-target_date",)

    def __str__(self):
        return f"{self.name} ({self.target_amount})"


class GoalContribution(models.Model):
    """A manual contribution recorded against a goal."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    goal = models.ForeignKey(Goal, on_delete=models.CASCADE, related_name="contributions")
    amount = models.DecimalField(max_digits=20, decimal_places=4)
    date = models.DateField()
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-date",)

    def __str__(self):
        return f"{self.goal.name}: {self.amount} on {self.date}"
