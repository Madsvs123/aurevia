"""Core models — Instrument and PricePoint (ARCHITECTURE.md §7)."""
import uuid
from decimal import Decimal

from django.db import models


class Instrument(models.Model):
    """A tradeable instrument (stock, ETF, bond, crypto, fund, private...)."""

    ASSET_CLASSES = [
        ("stock", "Stock"),
        ("etf", "ETF"),
        ("bond", "Bond"),
        ("fund", "Fund"),
        ("cash", "Cash"),
        ("crypto", "Cryptocurrency"),
        ("private", "Private"),
        ("other", "Other"),
    ]
    RISK_CATEGORIES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    symbol = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    asset_class = models.CharField(max_length=16, choices=ASSET_CLASSES, default="other")
    sector = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    risk_category = models.CharField(max_length=16, choices=RISK_CATEGORIES, default="medium")
    exchange = models.CharField(max_length=50, blank=True)
    isin = models.CharField(max_length=12, blank=True, null=True, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("symbol",)

    def __str__(self):
        return f"{self.symbol} — {self.name}"

    def latest_price(self):
        """Latest PricePoint for this instrument, or None."""
        return (
            self.prices.order_by("date").values(
                "date", "open", "high", "low", "close", "volume"
            ).first()
        )


class InstrumentFundamentals(models.Model):
    """Fundamental valuation metrics for an instrument (one-to-one)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instrument = models.OneToOneField(
        Instrument, on_delete=models.CASCADE, related_name="fundamentals"
    )
    pe_ratio = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    market_cap = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    dividend_yield = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    eps = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    beta = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    week_52_high = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    week_52_low = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "instrument fundamentals"

    def __str__(self):
        return f"Fundamentals({self.instrument.symbol})"


class NewsItem(models.Model):
    """A market-news headline tied to an instrument."""

    SENTIMENTS = [
        ("positive", "Positive"),
        ("negative", "Negative"),
        ("neutral", "Neutral"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instrument = models.ForeignKey(
        Instrument, on_delete=models.CASCADE, related_name="news"
    )
    headline = models.CharField(max_length=255)
    source = models.CharField(max_length=100)
    url = models.URLField(blank=True)
    sentiment = models.CharField(max_length=16, choices=SENTIMENTS, default="neutral")
    published_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-published_at",)

    def __str__(self):
        return f"{self.instrument.symbol}: {self.headline}"


class PricePoint(models.Model):
    """Daily OHLCV price point; unique per (instrument, date)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instrument = models.ForeignKey(
        Instrument, on_delete=models.CASCADE, related_name="prices"
    )
    date = models.DateField(db_index=True)
    open = models.DecimalField(max_digits=20, decimal_places=8)
    high = models.DecimalField(max_digits=20, decimal_places=8)
    low = models.DecimalField(max_digits=20, decimal_places=8)
    close = models.DecimalField(max_digits=20, decimal_places=8)
    volume = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal("0"))
    source = models.CharField(max_length=50, default="demo")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["instrument", "date"], name="unique_instrument_date")
        ]
        ordering = ("date",)
        indexes = [models.Index(fields=["instrument", "-date"])]

    def __str__(self):
        return f"{self.instrument.symbol} {self.date}: {self.close}"
