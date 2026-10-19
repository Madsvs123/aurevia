"""Goal URL routes (mounted under /api/v1/ by the root URLconf)."""
from django.urls import path

from apps.goals import views

app_name = "goals"

urlpatterns = [
    path("goals/", views.GoalListCreateView.as_view(), name="goal-list"),
    path("goals/<uuid:goal_id>/", views.GoalDetailView.as_view(), name="goal-detail"),
    path("goals/<uuid:goal_id>/progress/", views.GoalProgressView.as_view(), name="goal-progress"),
    path(
        "goals/<uuid:goal_id>/contributions/",
        views.GoalContributionCreateView.as_view(),
        name="goal-contribution-create",
    ),
    path(
        "goals/<uuid:goal_id>/scenarios/",
        views.GoalScenarioView.as_view(),
        name="goal-scenarios",
    ),
]
