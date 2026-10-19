"""Goal serializers."""
from django.db.models import Sum
from rest_framework import serializers

from apps.goals.models import Goal, GoalContribution


class GoalContributionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GoalContribution
        fields = ("id", "goal", "amount", "date", "note", "created_at")
        read_only_fields = ("id", "created_at")


class GoalSerializer(serializers.ModelSerializer):
    contributions_total = serializers.SerializerMethodField()
    progress_pct = serializers.SerializerMethodField()

    class Meta:
        model = Goal
        fields = (
            "id", "name", "target_amount", "target_date", "starting_amount",
            "monthly_contribution", "expected_return_pct", "risk_level",
            "portfolio", "is_achieved", "contributions_total", "progress_pct",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "is_achieved", "created_at", "updated_at")

    def get_contributions_total(self, obj):
        total = obj.contributions.aggregate(total=Sum("amount"))["total"]
        return str(total)

    def get_progress_pct(self, obj)
        from apps.goals.services import goal_progress
        progress = goal_progress(obj)
        return round(progress["progress_pct"], 2)
