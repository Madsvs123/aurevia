"""Report URL routes (mounted under /api/v1/)."""
from django.urls import path

from . import views

app_name = "reports"

urlpatterns = [
    path("reports/", views.ReportListView.as_view(), name="report-list"),
    path("reports/<uuid:report_id>/", views.ReportDetailView.as_view(), name="report-detail"),
    path(
        "reports/<uuid:report_id>/download/",
        views.ReportDownload.as_view(),
        name="report-download",
    ),
    path(
        "scheduled-reports/",
        views.ScheduledReportListCreateView.as_view(),
        name="scheduled-report-list",
    ),
    path(
        "scheduled-reports/<uuid:pk>/",
        views.ScheduledReportDetailView.as_view(),
        name="scheduled-report-detail",
    ),
]
