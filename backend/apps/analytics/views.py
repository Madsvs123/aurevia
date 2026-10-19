"""Analytics API views — wire the calculation engine to HTTP (ARCHITECTURE.md §5)."""
from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics import servicesx
from apps.portfolios.models import Portfolio
from apps.portfolios.permissions import CanViewPortfolio


def _parse_date(raw):
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


class PortfolioReturnsView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/returns/?from=&to=&benchmark=SPY"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        from_date = _parse_date(request.query_params.get("from"))
        to_date = _parse_date(request.query_params.get("to"))
        benchmark = request.query_params.get("benchmark") or None
        return Response(services.returns_payload(portfolio, from_date, to_date, benchmark))


class PortfolioCostBasisView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/cost-basis/"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        return Response(services.cost_basis_payload(portfolio))


class PortfolioDiversificationView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/diversification/"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        return Response(services.diversification_payload(portfolio))


class PortfolioRiskView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/risk/"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        return Response(services.risk_payload(portfolio))


class PortfolioBenchmarksView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/benchmarks/?symbols=SPY,QQQ,VTI"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        symbols = [s.strip() for s in request.query_params.get("symbols", "SPY").split(",") if s.strip()]
        return Response(services.benchmarks_payload(portfolio, symbols))


class PortfolioForecastView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/forecast/?years=10&expected_return=7&contribution=1000&contribution_freq=monthly"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        try:
            years = max(1, min(60, int(request.query_params.get("years", 10))))
        except ValueError:
            return Response({"detail": "years must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            expected_return = float(request.query_params.get("expected_return", 7))
        except ValueError:
            return Response({"detail": "expected_return must be a number"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            contribution = max(0.0, float(request.query_params.get("contribution", 0)))
        except ValueError:
            return Response({"detail": "contribution must be a number"}, status=status.HTTP_400_BAD_REQUEST)
        freq = request.query_params.get("contribution_freq", "monthly")
        if freq not in ("monthly", "annual"):
            freq = "monthly"
        return Response(services.forecast_payload(portfolio, years, expected_return, contribution, freq))


class PortfolioRollingView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/rolling/?window=30"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        try:
            window = max(1, min(500, int(request.query_params.get("window", 30))))
        except ValueError:
            return Response(
                {"detail": "window must be an integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(services.rolling_payload(portfolio, window))


class PortfolioDrawdownsView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/drawdowns/"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        return Response(services.drawdowns_payload(portfolio))


class PortfolioCaptureView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/capture/?benchmark=SPY"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        benchmark = (request.query_params.get("benchmark") or "SPY").strip().upper()
        return Response(services.capture_payload(portfolio, benchmark))


class PortfolioCorrelationView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/correlation/"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        return Response(services.correlation_payload(portfolio))


class PortfolioScenariosView(APIView):
    """GET /api/v1/analytics/portfolios/<id>/scenarios/?market_change=-20&vol_multiplier=1.5"""

    permission_classes = (CanViewPortfolio,)

    def get(self, request, portfolio_id):
        portfolio = get_object_or_404(Portfolio, id=portfolio_id)
        self.check_object_permissions(request, portfolio)
        try:
            market_change = float(request.query_params.get("market_change", -20))
        except ValueError:
            return Response(
                {"detail": "market_change must be a number"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            vol_multiplier = float(request.query_params.get("vol_multiplier", 1.5))
        except ValueError:
            return Response(
                {"detail": "vol_multiplier must be a number"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            services.scenarios_payload(portfolio, market_change, vol_multiplier)
        )
