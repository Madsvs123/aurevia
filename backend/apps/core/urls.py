"""Core URL routes (mounted under /api/v1/)."""
from django.urls import path

from . import views

app_name = "core"

urlpatterns = [
    path("instruments/", views.InstrumentListView.as_view(), name="instruments-list"),
    path(
        "instruments/<str:symbol>/fundamentals/",
        views.InstrumentFundamentalsView.as_view(),
        name="instruments-fundamentals",
    ),
    path(
        "instruments/<str:symbol>/news/",
        views.InstrumentNewsView.as_view(),
        name="instruments-news",
    ),
    path(
        "instruments/<str:symbol>/",
        views.InstrumentDetailView.as_view(),
        name="instruments-detail",
    ),
    path(
        "instruments/<str:symbol>/prices/",
        views.PriceHistoryView.as_view(),
        name="instruments-prices",
    ),
    path("health/", views.HealthView.as_view(), name="health"
]
