"""Core views: instruments, price history, health check."""
from datetime import date, timedelta

from django.db import connection
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Instrument, PricePoint
from .serializers import (
    InstrumentFundamentalsSerializer,
    InstrumentSerializer,
    NewsItemSerializer,
    PricePointSerializer,
)


def _parse_date(value, default):
    """Parse an ISO date from query params, falling back to ``default``."""
    if not value:
        return default
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return default


class InstrumentPaginationMixin:
    """Inline pagination for the public instruments list."""

    def paginate_queryset(self, queryset):
        from rest_framework.pagination import PageNumberPagination

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(queryset, self.request, view=self)
        self._paginator = paginator
        return page

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self._paginator.page.paginator.count,
                "next": self._paginator.get_next_link(),
                "previous": self._paginator.get_previous_link(),
                "results": data,
            }
        )


class InstrumentListView(InstrumentPaginationMixin, APIView):
    """Public instrument search: ?search=&asset_class=&currency=."""

    permission_classes = [AllowAny]

    def get(self, request):
        queryset = Instrument.objects.filter(is_active=True)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(symbol__icontains=search) | Q(name__icontains=search)
            )
        asset_class = request.query_params.get("asset_class", "").strip()
        if asset_class:
            queryset = queryset.filter(asset_class=asset_class)
        currency = request.query_params.get("currency", "").strip().upper()
        if currency:
            queryset = queryset.filter(currency=currency)

        page = self.paginate_queryset(queryset)
        serializer = InstrumentSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response({"count": len(serializer.data), "results": serializer.data})


class InstrumentDetailView(APIView):
    """Instrument + latest price + 1y history summary."""

    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        instrument = get_object_or_404(
            Instrument.objects.filter(is_active=True), symbol__iexact=symbol
        )
        data = InstrumentSerializer(instrument).data

        fundamentals = getattr(instrument, "fundamentals", None)
        data["fundamentals"] = (
            InstrumentFundamentalsSerializer(fundamentals).data
            if fundamentals is not None
            else None
        )

        history = list(
            instrument.prices.filter(date__gte=date.today() - timedelta(days=365))
            .order_by("date")
            .values("date", "close")
        )
        summary = {
            "start": history[0]["date"] if history else None,
            "end": history[-1]["date"] if history else None,
            "points": len(history),
            "high": max((h["close"] for h in history), default=None),
            "low": min((h["close"] for h in history), default=None),
            "change_pct": None,
        }
        if len(history) >= 2:
            first, last = history[0]["close"], history[-1]["close"]
            if first:
                summary["change_pct"] = round((float(last) - float(first)) / float(first) * 100, 4)
        data["history_summary"] = summary
        return Response(data)


class InstrumentFundamentalsView(APIView):
    """GET /instruments/<symbol>/fundamentals/ — fundamentals or 404 "Not available"."""

    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        instrument = get_object_or_404(
            Instrument.objects.filter(is_active=True), symbol__iexact=symbol
        )
        fundamentals = getattr(instrument, "fundamentals", None)
        if fundamentals is None:
            return Response(
                {"detail": "Not available"}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(InstrumentFundamentalsSerializer(fundamentals).data)


class InstrumentNewsView(generics.ListAPIView):
    """GET /instruments/<symbol>/news/ — paginated headlines, newest first."""

    permission_classes = [IsAuthenticated]
    serializer_class = NewsItemSerializer

    def get_queryset(self):
        instrument = get_object_or_404(
            Instrument.objects.filter(is_active=True),
            symbol__iexact=self.kwargs["symbol"],
        )
        return instrument.news.order_by("published_at")


class PriceHistoryView(APIView):
    """Price series: ?from=&to=&interval=day|week|month."""

    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        instrument = get_object_or_404(
            Instrument.objects.filter(is_active=True), symbol__iexact=symbol
        )
        from_date = _parse_date(request.query_params.get("from"), date.today() - timedelta(days=365))
        to_date = _parse_date(request.query_params.get("to"), date.today())
        if from_date > to_date:
            return Response(
                {"detail": "'from' must not be after 'to'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        interval = request.query_params.get("interval", "day")

        points = list(
            instrument.prices.filter(date__gte=from_date, date__lte=to_date).order_by("date")
        )
        # On-demand provider backfill for gaps (keeps demo data always fresh).
        if not points:
            from .services import ensure_price_history

            ensure_price_history(instrument, days=(to_date - from_date).days or 1)
            points = list(
                instrument.prices.filter(date__gte=from_date, date__lte=to_date).order_by("date")
            )

        if interval == "week":
            points = _resample(points, "week")
        elif interval == "month":
            points = _resample(points, "month")

        return Response(PricePointSerializer(points, many=True).data)


def _resample(points, interval):
    """Pick the last point of each ISO week / calendar month."""
    if not points:
        return []
    result = []
    seen = set()
    for point in reversed(points):
        key = point.date.isocalendar()[:2] if interval == "week" else (point.date.year, point.date.month)
        if key not in seen:
            seen.add(key)
            result.append(point)
    return list(reversed(result))


class HealthView(APIView):
    """GET /api/v1/health/ — no auth. {status, db, redis}."""

    permission_classes = [AllowAny]

    def get(self, request):
        db_ok = True
        try:
            connection.ensure_connection()
        except Exception:
            db_ok = False

        redis_ok = True
        try:
            import redis as redis_lib

            from django.conf import settings

            if settings.REDIS_URL:
                client = redis_lib.from_url(settings.REDIS_URL, socket_timeout=2)
                client.ping()
            else:
                from django.core.cache import cache

                cache.set("aurevia:health", "ok", 5)
                cache.get("aurevia:health")
        except Exception:
            redis_ok = False

        payload = {"status": "ok" if db_ok and redis_ok else "degraded", "db": db_ok, "redis": not redis_ok}
        return Response(payload, status=status.HTTP_200_OK if db_ok and redis_ok else status.HTTP_503_SERVICE_UNAVAILABLE)
