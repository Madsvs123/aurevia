"""Portfolio models — Portfolio, Account, Holding, Transaction (§7).

Money: DecimalField(20,4); quantities/prices: DecimalField(20,8).
Soft delete: Transactions use ``deleted_at``; Portfolios use ``is_archived``;
Accounts use ``is_active``.
"""
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class Portfolio(models.Model):
    """A user's (or org's) investment portfolio."""

    COST_BASIS_METHODS = [
        ("average", "Average Cost")
        ("fifo", "FIFO"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="portfolios"
    )
    org = models.ForeignKey(
        "accounts.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="portfolios",
    )
    name = models.CharField(max_length=255)
    currency = models.CharField(max_length=3, default="USD")
    description = models.TextField(blank=True)
    cost_basis_method = models.CharField(
        max_length=16, choices=COST_BASIS_METHODS, default="average"
    )
    drift_threshold_pct = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=Decimal("5.0"),
        help_text="Rebalancing drift threshold in percentage points.",
    )
    is_archived = models.BooleanField(default=False)  # soft delete flag
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("created_at",)
        indexes = [models.Index(fields=["owner", "is_archive"])]

    def __str__(self):
        return f"{self.name} ({self.owner.email})"

    def archive(self):
        self.is_archived = True
        self.save(update_fields=["is_archived", "updated_at"])


class Account(models.Model):
    """Cash / brokerage / retirement sub-account inside a portfolio."""

    KINDS = [
        ("cash", "Cash"),
        ("brokerage", "Brokerage"),
        ("retirement", "Retirement"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name="accounts"
    )
    name = models.CharField(max_length=255)
    broker = models.CharField(max_length=255, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    kind = models.CharField(max_length=16, choices=KINDS, default="brokerage")
    is_active = models.BooleanField(default=True)  # soft delete flag
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.name} ({self.portfolio.name})"


class Holding(models.Model):
    """Current position of an instrument inside a portfolio (per account).

    ``quantity`` and ``avg_cost`` are recomputed by the holdings engine on
    every buy/sell/delete (supports both FIFO lots and average cost).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name="holdings"
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="holdings",
    )
    instrument = models.ForeignKey(
        "core.Instrument", on_delete=models.CASCADE, related_name="holdings"
    )
    quantity = models.DecimalField(max_digits=20, decimal_places=8, default=Decimal("0"))
    avg_cost = models.DecimalField(max_digits=20, decimal_places=8, default=Decimal("0"))
    realized_gain = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal("0"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["portfolio", "account", "instrument"],
                name="unique_portfolio_account_instrument",
            )
        ]
        ordering = ("instrument__symbol",)

    def __str__(self):
        return f"{self.instrument.symbol} x{self.quantity} @ {self.avg_cost}"


class TargetAllocation(models.Model):
    """A target weight for an asset class or a single instrument.

    ``target_weight_pct`` is in percentage points (e.g. 60.0 == 60%%).
    One row per (portfolio, label); PUT /targets/ replaces the whole set.
    """

    KINDS = [
        ("asset_class", "Asset Class"),
        ("instrument", "Instrument"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name="target_allocations"
    )
    label = models.CharField(
        max_length=64,
        help_text="Asset class name (e.g. 'stock') or instrument symbol (e.g. 'AAPL').",
    )
    kind = models.CharField(max_length=16, choices=KINDS)
    target_weight_pct = models.DecimalField(max_digits=10, decimal_places=4)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["portfolio", "label"], name="unique_target_per_portfolio_label"
            )
        ]
        ordering = ("label",)

    def __str__(self):
        return f"{self.label} ({self.kind}) -> {self.target_weight_pct}%"


class ContributionPlan(models.Model):
    """Recurring deposit plan — processed by the process_contribution_plans task."""

    FREQUENCIES = [
        ("monthly", "Monthly"),
        ("quarterly", "Quarterly"),
        ("annual", "Annual"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name="contribution_plans"
    )
    account = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name="contribution_plans"
    )
    amount = models.DecimalField(max_digits=20, decimal_places=4)
    frequency = models.CharField(max_length=16, choices=FREQUENCIES, default="monthly")
    day_of_month = models.PositiveSmallIntegerField(default=1)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    next_run = models.DateField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.amount} {self.frequency} into {self.account_id} (next {self.next_run})"


clas ActiveTransactionManager(models.Manager):
    """Default manager excluding soft-deleted transactions."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Transaction(models.Model):
    """A single portfolio transaction (buys, sells, cash flows, splits...)."""

    TYPES = [
        ("buy", "Buy"),
        ("sell", "Sell"),
        ("deposit", "Deposit"),
        ("withdrawal", "Withdrawal"),
        ("dividend", "Dividend"),
        ("interest", "Interest"),
        ("fee", "Fee"),
        ("transfer", "Transfer"),
        ("corporate_action", "Corporate Action"),
    ]
    CORPORATE_ACTIONS = [
        ("split", "Split"),
        ("merger", "Merger"),
        ("spinoff", "Spinoff"),
        ("name_change", "Name Change"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name="transactions"
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    to_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfer_in_transactions",
        help_text="Destination account for transfers.",
    )
    instrument = models.ForeignKey(
        "core.Instrument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    type = models.CharField(max_length=24, choices=TYPES)
    quantity = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    price = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    amount = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal("0"))
    fee = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal("0"))
    currency = models.CharField(max_length=3, default="USD")
    date = models.DateField(db_index=True)
    notes = models.TextField(blank=True)
    corporate_action_type = models.CharField(
        max_length=24, choices=CORPORATE_ACTIONS, null=True, blank=True
    )
    corporate_action_ratio = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True,
        help_text="e.g. 4.0 for a 4:1 split.",
    )
    lot = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="consumed_by",
        help_text="FIFO: buy transaction whose lot this sell consumed first.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_transactions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)  # soft delete

    objects = ActiveTransactionManager()
    all_objects = models.Manager()  # includes soft-deleted rows

    class Meta:
        ordering = ("-date", "-created_at")
        indexes = [
            models.Index(fields=["portfolio", "date"]),
            models.Index(fields=["portfolio", "type"]),
        ]

    def __str__(self):
        return f"{self.type} {self.amount} {self.currency} on {self.date}"
