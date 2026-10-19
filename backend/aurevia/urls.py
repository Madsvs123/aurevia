"""
Aurevia root URL configuration.

Every app is mounted under ``/api/v1/`` with the app name as prefix. Each
app's ``urls.py`` declares its own full sub-paths (see ARCHITECTURE.md §5).
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.portfolios.urls")),
    path("api/v1/", include("apps.reports.urls")),
    path("api/v1/", include("apps.notifications.urls")),
    # Integration adds: these apps are owned by the finance-analytics agent and
    # are guaranteed to exist before the first container start.
    path("api/v1/", include("apps.analytics.urls")),
    path("api/v1/", include("apps.goals.urls")),
    path("api/v1/", include("apps.watchlists.urls")),
    path("api/v1/", include("apps.research.urls")),
    path("api/v1/", include("apps.insights.urls")
]
