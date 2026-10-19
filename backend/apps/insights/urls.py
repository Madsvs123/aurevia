"""Insights URL routes (mounted under /api/v1/ by the root URLconf)."""
from django.urls import path

from . import views

app_name = "insights"

urlpatterns = [
    path("insights/", views.InsightListView.as_view(), name="insight-list"),
    path(
        "insights/unread-count/",
        views.InsightUnreadCountView.as_view(),
        name="insight-unread-count",
    ),
    path(
        "insights/portfolios/<uuid:portfolio_id>/",
        views.PortfolioInsightListView.as_view(),
        name="portfolio-insights",
    ),
    path(
        "insights/<uuid:insight_id>/dismiss/",
        views.InsightDismiss.as_view(),
        name="insight-dismiss",
    ),
]
