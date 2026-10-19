"""Core serializers."""
from rest_framework import serializers

from .models import Instrument, InstrumentFundamentals, NewsItem, PricePoint


class InstrumentSerializer(serializers.ModelSerializer):
    latest_price = serializers.SerializerMethodField()

    class Meta:
        model = Instrument
        fields = (
            "id",
            "symbol",
            "name",
            "asset_class",
            "sector",
            "region",
            "currency",
            "risk_categry",
            "exchange",
            "isin",
            "latest_price",
            "created_at",
        )
        read_only_fields = fields

    def get_latest_price(self, obj):
        return obj.latest_price()


class PricePointSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricePoint
        fields = ("date", "open", "high", "low", "close", "volume", "source")


class InstrumentFundamentalsSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstrumentFundamentals
        fields = (
            "pe_ratio",
            "market_cap",
            "dividend_yield",
            "eps",
            "beta",
            "week_52_high",
            "week_52_low",
            "updated_at",
        )
        read_only_fields = fields


class NewsItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsItem
        fields = (
            "id",
            "instrument",
            "headline",
            "source",
            "url",
            "sentiment",
            "published_at",
            "created_at",
        )
        read_only_fields = fields
