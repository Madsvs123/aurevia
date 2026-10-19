"""Notification URL routes (mounted under /api/v1/ by the root URLconf)."""
from django.urls import path

from . import view

app_name = "notifications"

urlpatterns = [
    path("notifications/", views.NotificationListView.as_view(), name="notification-list"),
    path("notifications/read-all/", views.NotificationReadAllView.as_view(), name="notification-read-all"),
    path("notifications/unread-count/", views.NotificationUnreadCountView.as_view(), name="notification-unread-count"),
    path("notifications/preferences/", views.NotificationPreferenceView.as_view(), name="notification-preferences"),
    path(
        "notifications/<uuid:notification_id>/",
        views.NotificationDeleteView.as_view(),
        name="notification-delete",
    ),
    path(
        "notifications/<uuid:notification_id>/read/",
        views.NotificationReadView.as_view(),
        name="notification-read",
    ),
]
