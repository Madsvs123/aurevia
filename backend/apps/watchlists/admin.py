"""Watchlist admin."""
from django.contrib import admin

from apps.watchlists.models import Watchlist, WatchlistAlert, WatchlistItem


class WatchlistItemInline(admin.TabularInline):
    model = WatchlistItem
    extra = 0


@admin.register(Watchlist)
class WatchlistAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "is_default", "created_at")
    list_filter = ("is_default",)
    search_fields = ("name", "owner__email")
    inlines = (WatchlistItemInline,)


@admin.register(WatchlistItem)
class WatchlistItemAdmin(admin.ModelAdmin):
    list_display = ("watchlist", "instrument", "target_pric", "favorite", "added_at")
    list_filter = ("favorite",)


@admin.register(WatchlistAlert)
class WatchlistAlertAdmin(admin.ModelAdmin):
    list_display = ("owner", "instrument", "condition", "threshold", "active", "last_triggered_at")
    list_filter = ("condition", "active")
    search_fields = ("owner__email", "instrument__symbol")
