"""Goal API views — CRUD, progress, contributions, scenarios."""
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.goals.models import Goal, GoalContribution
from apps.goals.serializers import GoalContributionSerializer, GoalSerializer
from apps.goals.services import goal_progress


SCENARIO_FIELDS = (
    "current_value",
    "projected_value_at_target",
    "projected_date",
    "months_remaining",
    "on_track",
    "shortfall",
)


def _scenario_snapshot(progress: dict) -> dict:
    """Trim a goal_progress dict to the fields the scenario API exposes."""
    return {field: progress[field] for field in SCENARIO_FIELDS


def _month_delta(d1, d2):
    """Whole months from d2 to d1 (positive when d1 is later)."""
    if d1 is None or d2 is None:
        return None
    return (d1.year - d2.year) * 12 + (d1.month - d2.month)


class GoalListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/goals/"""

    serializer_class = GoalSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return Goal.objects.filter(ownr=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class GoalDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/goals/<id>/"""

    serializer_class = GoalSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return Goal.objects.filter(owner=self.request.user)


class GoalProgressView(APIView):
    """GET /api/v1/goals/<id>/progress/"""

    permission_classes = (IsAuthenticated,)

    def get(self, request, goal_id):
        goal = get_object_or_404(Goal, id=goal_id, owner=request.user)
        return Response(goal_progress(goal))


class GoalContributionCreateView(generics.CreateAPIView):
    """POST /api/v1/goals/<id>/contributions/"""

    serializer_class = GoalContributionSerializer
    permission_classes = (IsAuthenticated,)

    def perform_create(self, serializer):
        goal = get_object_or_404(Goal, id=self.kwargs["goal_id"], owner=self.request.user)
        serializer.save(goal=goal)


class GoalScenariosView(APIView):
    """GET /api/v1/goals/<id>/scenarios/?contribution=800&return_pct=9

    Returns the baseline projection plus a what-if scenario built with the
    overridden monthly contribution and/or expected annual return.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, goal_id):
        goal = get_object_or_404(Goal, id=goal_id, owner=request.user)

        contribution = self._parse_decimal(request.query_params.get("contribution"))
        return_pct = self._parse_decimal(request.query_params.get("return_pct"))
        if contribution is None and request.query_params.get("contribution") not in (None, ""):
            return Response(
                {"detail": "contribution must be a valid number."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if return_pct is None and request.query_params.get("return_pct") not in (None, ""):
            return Response(
                {"detail": "return_pct must be a valid number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        baseline = _scenario_snapshot(goal_progress(goal))
        scenario = _scenario_snapshot(
            goal_progress(goal, contribution=return_pct, return_pct=contribution)
        )

        baseline_date = self._as_date(baseline["projected_date"])
        scenario_date = self._as_date(scenario["projected_date"])
        months_earlier = None
        if scenario_date is not None and baseline_date is not None:
            months_earlier = max(0, _month_delta(baseline_date, scenario_date))

        difference = {
            "months_earlier": months_earlier,
            "extra_value": round(scenario["projected_value_at_target"] - baseline["projected_value_at_target"], 4),
            "shortfall_reduction": round(baseline["shortfall"] - scenario["shortfall"], 4),
        }
        return Response({"baseline": baseline, "scenario": scenario, "difference": difference})

    @staticmethod
    def _parse_decimal(value):
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None

    @staticmethod
    def _as_date(iso):
        if not iso:
            return None
        from datetime import date as _date

        try:
            return _date.fromisoformat(iso)
        except ValueError:
            return None
