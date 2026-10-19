"""Admin registrations for insights models."""
from django.contrib import admin

from .models import Insight


@admin.register(Insight)
class InsightAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "user",
        "portfolio",
        "kind",
        "severity",
        "is_dismissed",
        "created_at",
    )
    list_filter = ("kind", "severity", "is_dismissed")
    search_fields = ("title", "body", "user__email", "portfolio__name")
    date_hierarchy = "created_at"
