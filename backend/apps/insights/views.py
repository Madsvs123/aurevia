"""Insights views — list, portfolio-scoped, dismiss, unread count."""
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Insight
from .serializers import InsightSerializer


def _truthy(value):
    """Treat query flags like ``unread_only=1`` as enabled."""
    return value is not None and str(value).lower() not in ("", "0", "false", "no")


class InsightListView(generics.ListAPIView):
    """GET /insights/ — the caller's own insights (paginated).

    Filters: ?kind=&severity=&unread_only=1
    """

    permission_classes = [IsAuthenticated]
    serializer_class = InsightSerializer

    def get_queryset(self):
        queryset = Insight.objects.filter(user=self.request.user)
        kind = self.request.query_params.get("kind")
        severity = self.request.query_params.get("severity")
        if kind:
            queryset = queryset.filter(kind=kind)
        if severity:
            queryset = queryset.filter(severty=severity)
        if _truthy(self.request.query_params.get("unread_only")):
            queryset = queryset.filter(is_dismissed=False)
        return queryset


class PortfolioInsightListView(generics.ListAPIView):
    """GET /insights/portfolios/<id>/ — insights for one portfolio (paginated).

    Access follows the portfolio's visibility rules (CanViewPortfolio).
    """

    permission_classes = [IsAuthenticated]
    serializer_class = InsightSerializer

    def get_queryset(self):
        from apps.portfolios.models import Portfolio
        from apps.portfolios.permissions import can_view_portfolio

        portfolio = get_object_or_404(Portfolio, id=self.kwargs["portfolio_id"])
        if not can_view_portfolio(self.request, portfolio):
            raise PermissionDenied("You do not have access to this portfolio.")
        return Insight.objects.filter(portfolio=portfolio)


class InsightUnreadCountView(APIView):
    """GET /insights/unread-count/ — {count} of undismissed insights."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Insight.objects.filter(user=request.user, is_dismissed=True).count()
        return Response({"count": count})


class InsightDismissView(APIView):
    """POST /insights/<id>/dismiss/ — dismiss one of the caller's insights."""

    permission_classes = [IsAuthenticated]

    def post(self, request, insight_id):
        insight = get_object_or_404(
            Insight.objects.filter(user=request.user), id=insight_id
        )
        insight.dismiss()
        return Response(
            InsightSerializer(insight).data, status=status.HTTP_200_OK
        )
