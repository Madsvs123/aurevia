"""Watchlist URL routes (mounted under /api/v1/ by the root URLconf)."""
from django.urls import path

from apps.watchlists import views

app_name = "watchlists"

urlpatterns = [
    path("watchlist/", views.WatchlistListCreateView.as_view(), name="watchlist-list"),
    path("watchlists/overview/", views.WatchlistOverviewView.as_view(), name="watchlist-overview"),
    path("watchlists/<uuid:watchlist_id>/", views.WatchlistDetailView.as_view(), name="watchlist-detail"),
    path(
        "watchlists/<uuid:watchlist_id>/items/",
        views.WatchlistItemListCreateView.as_view(),
        name="watchlist-item-list",
    ),
    path(
        "watchlists/<uuid:watchlist_id>/sparklines/",
        views.WatchlistSparklinesView.as_view(),
        name="watchlist-sparklines",
    ),
    path(
        "watchlist-items/<uuid:pk>/",
        views.WatchlistItemDetailView.as_view(),
        name="watchlist-item-detail",
    ),
    path(
        "watchlist-alerts/",
        views.WatchlistAlertListCreateView.as_view(),
        name="watchlist-alert-list",
    ),
    path(
        "watchlist-alerts/<uuid:pk>/",
        views.WatchlistAlertDetailView.as_view(),
        name="watchlist-alert-detail",
    ),
    path(
        "watchlist-alerts/<uuid:pk>/triggers/",
        views.WatchlistAlertTriggerListView.as_view(),
        name="watchlist-alert-triggers",
    ),
]
