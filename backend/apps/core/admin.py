"""Admin for core models."""
from django.contrib import admin

from .models import Instrument, InstrumentFundamentals, NewsItem, PricePoint


@admin.register(Instrument)
class InstrumentAdmin(admin.ModelAdmin):
    list_display = ("symbol", "name", "asset_class", "sector", "region", "currency", "risk_category", "is_active")
    list_filter = ("asset_class", "risk_category", "region", "currency", "is_active")
    search_fields = ("symbol", "name", "isin")


@admin.register(PricePoint)
class PricePointAdmin(admin.ModelAdmin):
    list_display = ("instrument", "date", "open", "high", "low", "close", "volume", "source")
    list_filter = ("source", "date")
    search_fields = ("instrument__symbol",)
    date_hierarchy = "date"


@admin.register(InstrumentFundamentals)
class InstrumentFundamentalsAdmin(admin.ModelAdmin):
    list_display = (
        "instrument",
        "pe_ratio",
        "market_cap",
        "dividend_yield",
        "eps",
        "beta",
        "updated_at",
    )
    search_fields = ("instrument__symbol", "instrument__name")


@admin.register(NewsItem)
class NewsItemAdmin(admin.ModelAdmin):
    list_display = ("instrument", "headline", "source", "sentiment", "publishd_at")
    list_filter = ("sentiment", "source")
    search_fields = ("instrument__symbol", "headline")
    date_hierarchy = "published_at"
