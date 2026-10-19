"""Watchlist API views — CRUD + overview with live prices, sparklines, alert triggers."""
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.watchlists.models import AlertTrigger, Watchlist, WatchlistAlert, WatchlistItem
from apps.watchlists.serializers import (
    AlertTriggerSerializer,
    SparklineItemSerializer,
    WatchlistAlertSerializer,
    WatchlistItemSerializer,
    WatchlistSerializer,
)


class WatchlistListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/watchlists/"""

    serializer_class = WatchlistSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return Watchlist.objects.filter(owner=self.request.user).prefetch_related("items__instrument")

    def perform_create(self, serializer):
        name = serializer.validated_data.get("name", "").strip()
        is_default = serializer.validated_data.get("is_default", False)
        if is_default:
            Watchlist.objects.filter(owner=self.request.user, is_default=True).update(is_default=False)
        if not name:
            name = f"Watchlist {Watchlist.objects.filter(owner=self.request.user).count() + 1}"
        serializer.save(owner=self.request.user, name=name)


class WatchlistDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/watchlists/<id>/"""

    serializer_class = WatchlistSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return Watchlist.objects.filter(owner=self.request.user).prefetch_related("items__instrument")


class WatchlistItemListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/watchlists/<id>/items/"""

    serializer_class = WatchlistItemSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        watchlist = get_object_or_404(Watchlist, id=self.kwargs["watchlist_id"], owner=self.request.user)
        return WatchlistItem.objects.filter(watchlist=watchlist).select_related("instrument")

    def perform_create(self, serializer):
        watchlist = get_object_or_404(Watchlist, id=self.kwargs["watchlist_id"], owner=self.request.user)
        serializer.save(watchlist=watchlist)


class WatchlistItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH/DELETE /api/v1/watchlist-items/<id>/"""

    serializer_class = WatchlistItemSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return WatchlistItem.objects.filter(watchlist__owner=self.request.user).select_related("instrument")


class WatchlistAlertListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/watchlist-alerts/"""

    serializer_class = WatchlistAlertSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return WatchlistAlert.objects.filter(owner=self.request.user).select_related("instrument")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class WatchlistAlertDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH/DELETE /api/v1/watchlist-alerts/<id>/"""

    serializer_class = WatchlistAlertSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return WatchlistAlert.objects.filter(owner=self.request.user).select_related("instrument")


class WatchlistOverviewView(APIView):
    """GET /api/v1/watchlists/overview/"""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        watchlists = (
            Watchlist.objects.filter(owner=request.user)
            .prefetch_related("items__instrument")
            .order_by("-is_default", "name")
        )
        serializer = WatchlistSerializer(watchlists, many=True)
        return Response(serializer.data)


class WatchlistSparklinesView(APIView):
    """GET /api/v1/watchlists/<id>/sparklines/

    Returns the last 30 trading days of closing prices per watchlist item.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, watchlist_id):
        watchlist = get_object_or_404(
            Watchlist, id=watchlist_id, owner=request.user
        )
        items = (
            WatchlistItem.objects.filter(watchlist=watchlist)
            .select_related("instrument")
            .order_by("added_at")
        )
        result = []
        for item in items:
            prices = (
                item.instrument.prices.order_by("-date").values("date", "close")[:30]
            )
            series = [
                {"date": p["date"], "close": p["close"]} for p in reversed(list(prices))
            ]
            result.append(
                {"instrument_symbol": item.instrument.symbol, "series": series}
            )
        payload = SparklineItemSerializer(result, many=True).data
        return Response({"items": payload})


class WatchlistAlertTriggerListView(generics.ListAPIView):
    """GET /api/v1/watchlist-alerts/<id>/triggers/ → paginated, newest first."""

    serializer_class = AlertTriggerSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        alert = get_object_or_404(
            WatchlistAlert, id=self.kwargs["pk"], owner=self.request.user
        )
        return AlertTrigger.objects.filter(alert=alert).select_related("alert")
