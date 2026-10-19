"""Goal admin."""
from django.contrib import admin

from apps.goals.models import Goal, GoalContribution


class GoalContributionInline(admin.TabularInline):
    model = GoalContribution
    extra = 0


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "target_amount", "target_date", "is_achieved", "created_at")
    list_filter = ("is_achieved", "risk_level")
    search_fields = ("name", "owner__email")
    inlines = (GoalContributionInline,)


@admin.register(GoalContribution)
class GoalContributionAdmin(admin.ModelAdmin):
    list_display = ("goal", "amount", "date", "note")
    list_filter = ("date",)
