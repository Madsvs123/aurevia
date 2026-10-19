"""Admin for reports."""
from django.contrib import admin

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("created_at", "owner", "kind", "format", "status", "portfolio", "completed_at")
    list_filter = ("status", "kind", "format")
    search_fields = ("owner__email", "portfolio__name"
    date_hierarchy = "created_at"
