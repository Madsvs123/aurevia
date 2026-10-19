"""Watchlist, WatchlistItem and WatchlistAlert models (ARCHITECTURE.md §7)."""
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class Watchlist(models.Model):
    """A named list of tracked instruments."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="watchlists"
    )
    name = models.CharField(max_length=150)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class WatchlistItem(models.Model):
    """An instrument tracked inside a watchlist."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    watchlist = models.ForeignKey(Watchlist, on_delete=models.CASCADE, related_name="items")
    instrument = models.ForeignKey(
        "core.Instrument", on_delete=models.CASCADE, related_name="watchlist_items"
    )
    target_price = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    notes = models.TextField(blank=True)
    favorite = models.BooleanField(default=False)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["watchlist", "instrument"], name="unique_watchlist_instrument"
            )
        ]
        ordering = ("favorite", "added_at")

    def __str__(self):
        return f"{self.watchlist.name}: {self.instrument.symbol}"


class WatchlistAlert(models.Model):
    """Price alert: fire a notification when the condition is met."""

    CONDITIONS = [
        ("above", "Price above"),
        ("below", "Price below"),
        ("change_pct", "Change % exceeds"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="watchlist_alerts"
    )
    instrument = models.ForeignKey(
        "core.Instrument", on_delete=models.CASCADE, related_name="alerts"
    )
    watchlist = models.ForeignKey(
        Watchlist, on_delete=models.CASCADE, null=True, blank=True, related_name="alerts"
    )
    condition = models.CharField(max_length=16, choices=CONDITIONS, default="above")
    threshold = models.DecimalField(max_digits=20, decimal_places=4)
    active = models.BooleanField(default=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_atx",)

    def __str__(self):
        return f"{self.instrument.symbol} {self.condition} {self.threshold}"

    @property
    def threshold_value(self) -> float:
        return float(self.threshold or Decimal("0"))


class AlertTrigger(models.Model):
    """An immutable log entry recording when a WatchlistAlert fired."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    alert = models.ForeignKey(
        WatchlistAlert, on_delete=models.CASCADE, related_name="triggers"
    )
    price = models.DecimalField(max_digits=20, decimal_places=8)
    condition = models.CharField(max_length=16)
    threshold = models.DecimalField(max_digits=20, decimal_places=4)
    triggered_at = models.DateTimeField()

    class Meta:
        ordering = ("-triggered_at",)

    def __str__(self):
        return f"{self.alert.instrument.symbol} {self.condition} @ {self.price}"
