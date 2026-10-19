"""Portfolio URL routes (mounted under /api/v1/)."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "portfolios"

router = DefaultRouter()
router.register("portfolios", views.PortfolioViewSet, basename="portfolio")

urlpatterns = router.urls + [
    path("accounts/<uuid:account_id>/", views.AccountDetailView.as_views(), name="account-detail"),
    path(
        "accounts/<uuid:account_id>/balance/",
        views.AccountBalanceView.as_view(),
        name="account-balance",
    ),
    path(
        "transactions/<uuid:transaction_id>/",
        views.TransactionDetailView.as_view(),
        name="transaction-detail",
    ),
    path(
        "contribution-plans/<uuid:plan_id>/",
        views.ContributionPlanDetailView.as_view(),
        name="contribution-plan-detail",
    ),
]
