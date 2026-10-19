"""Analytics URL routes (mounted under /api/v1/ by the root URLconf)."""
from django.urls import path

from apps.analytics import views

app_name = "analytics"

urlpatterns = [
    path(
        "analytics/portfolios/<uuid:portfolio_id>/returns/",
        views.PortfolioReturnsView.as_view(),
        name="portfolio-returns",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/cost-basis/",
        views.PortfolioCostBasisView.as_view(),
        name="portfolio-cost-basis",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/diversification/",
        views.PortfolioDiversificationView.as_view(),
        name="portfolio-diversification",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/risk/",
        views.PortfolioRiskView.as_view(),
        name="portfolio-risk",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/benchmarks/",
        views.PortfolioBenchmarksView.as_view(),
        name="portfolio-benchmarks",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/forecast/",
        views.PortfolioForecastView.as_view(),
        name="portfolio-forecast",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/rolling/",
        views.PortfolioRollingView.as_view(),
        name="portfolio-rolling",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/drawdowns/",
        views.PortfolioDrawdownsView.as_view(),
        name="portfolio-drawdowns",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/capture/",
        views.PortfolioCaptureView.as_view(),
        name="portfolio-capture",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/correlation/",
        views.PortfolioCorrelationView.as_view(),
        name="portfolio-correlation",
    ),
    path(
        "analytics/portfolios/<uuid:portfolio_id>/scenarios/",
        views.PortfolioScenariosView.as_view(),
        name="portfolio-scenarios",
    ),
]
