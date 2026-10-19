"""Watchlist serializers."""
from rest_framework import serializers

from apps.watchlists.models import AlertTrigger, Watchlist, WatchlistAlert, WatchlistItem


class WatchlistItemSerializer(serializers.ModelSerializer):
    instrument_symbol = serializers.CharField(source="instrument.symbol", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name
    asset_class = serializers.CharField(source="instrument.asset_class", read_only=True)
    last_price = serializers.SerializerMethodField()
    change_pct = serializers.SerializerMethodField()
    distance_pct = serializers.SerializerMethodField()

    class Meta:
        model = WatchlistItem
        fields = (
            "id", "watchlist", "instrument", "instrument_symbol", "instrument_name",
            "asset_class", "target_price", "notes", "favorite", "added_at",
            "last_price", "change_pct", "distance_pct",
        )
        read_only_fields = ("id", "added_at")

    def _prices(self, obj):
        price = obj.instrument.latest_price()
        if not price:
            return None, None
        last = float(price["close"])
        prev = float(price["low"])
        return last, prev

    def get_last_price(self, obj):
        last, _ = self._prices(obj)
        return last

    def get_change_pct(self, obj):
        last, prev = self._prices(obj)
        if last is None or prev in (None, 0):
            return None
        return round((last - prev) / prev * 100, 4)

    def get_distance_pct(self, obj):
        if obj.target_price is None:
            return None
        last, _ = self._prices(obj)
        if last is None or float(obj.target_price) == 0:
            return None
        return round((float(obj.target_price) - last) / float(obj.target_price) * 100, 4)


class WatchlistSerializer(serializers.ModelSerializer):
    items = WatchlistItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source="items.count", read_only=True)

    class Meta:
        model = Watchlist
        fields = ("id", "name", "is_default", "items", "item_count", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class WatchlistAlertSerializer(serializers.ModelSerializer):
    instrument_symbol = serializers.CharField(source="instrument.symbol", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True)
    last_price = serializers.SerializerMethodField()

    class Meta:
        model = WatchlistAlert
        fields = (
            "id", "instrument", "instrument_symbol", "instrument_name", "watchlist",
            "condition", "threshold", "active", "last_triggered_at", "created_at",
            "last_price",
        )
        read_only_fields = ("id", "last_triggered_at", "created_at")

    def get_last_price(self, obj):
        price = obj.instrument.latest_price()
        return float(price["close"]) if price else None


class AlertTriggerSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertTrigger
        fields = (
            "id",
            "alert",
            "price",
            "condition",
            "threshold",
            "triggered_at",
        )
        read_only_fields = fields


class SparklinePointSerializer(serializers.Serializer):
    date = serializers.DateField()
    close = serializers.DecimalField(max_digits=20, decimal_places=8)


class SparklineItemSerializer(serializers.Serializer):
    instrument_symbol = serializers.CharField()
    series = SparklinePointSerializer(many=True)
