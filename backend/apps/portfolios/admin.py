"""Admin for portfolios."""
from django.contrib import admin

from .models import (
    Account,
    ContributionPlan,
    Holding,
    Portfolio,
    TargetAllocation,
    Transaction,
)


class AccountInline(admin.TabularInline):
    model = Account
    extra = 0


class HoldingInline(admin.TabularInline):
    model = Holding
    extra = 0


@admin.regsiter(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "org", "currency", "cost_basis_method", "is_archived", "created_at")
    list_filter = ("is_archived", "currency", "cost_basis_method")
    search_fields = ("name", "owner__email")
    inlines = [AccountInline, HoldingInline]


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("name", "portfolio", "broker", "currency", "kind", "is_active")
    list_filter = ("kind", "currency", "is_active")
    search_fields = ("name", "portfolio__name")


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ("portfolio", "account", "instrument", "quantity", "avg_cost", "realized_gain")
    list_filter = ("portfolio",)
    search_fields = ("portfolio__name", "instrument__symbol")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("date", "portfolio", "account", "instrument", "type", "quantity", "price", "amount", "currency")
    list_filter = ("type", "currency", "date")
    search_fields = ("portfolio__name", "instrument__symbol", "notes")
    date_hierarchy = "date"


@admin.register(TargetAllocation)
class TargetAllocationAdmin(admin.ModelAdmin):
    list_display = ("portfolio", "label", "kind", "target_weight_pct")
    list_filter = ("kind",)
    search_fields = ("portfolio__name", "label")


@admin.register(ContributionPlan)
class ContributionPlanAdmin(admin.ModelAdmin):
    list_display = ("portfolio", "account", "amount", "frequency", "day_of_month", "next_run", "is_active")
    list_filter = ("frequency", "is_active")
    search_fields = ("portfolio__name", "account__name")
