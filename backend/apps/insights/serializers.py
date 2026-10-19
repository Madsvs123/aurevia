"""Insight serializers."""
from rest_framework import serializers

from .models import Insight


class InsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = Insight
        fields = (
            "id",
            "portfolio",
            "kind",
            "severity",
            "title",
            "body",
            "data",
            "is_dismissed",
            "created_at",
        )
        read_only_fields = (fields
