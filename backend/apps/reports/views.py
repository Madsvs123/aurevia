"""Report views — async job lifecycle + download."""
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AdvisorClient
from apps.accounts.services import write_audit
from apps.portfolios.permissions import can_view_portfolio

from .models import Report, ScheduledReport
from .serializers import (
    ReportCreateSerializer,
    ReportSerializer,
    ScheduledReportSerializer,
)
from .tasks import generate_report


class ReportListView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = Report.objects.filter(owner=request.user)
        report_status = request.query_params.get("status")
        if report_status:
            queryset = queryset.filter(staus=report_status)
        page = self.paginate_queryset(queryset)
        serializer = ReportSerializer(
            page if page is not None else queryset,
            many=True,
            context={"request": request},
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def post(self, request):
        serializer = ReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        portfolio = None
        if data.get("portfolio"):
            from apps.portfolios.models import Portfolio

            portfolio = get_object_or_404(Portfolio.objects.filter(is_archived=False), id=data["portfolio"])
            if not can_view_portfolio(request, portfolio):
                return Response(
                    {"detail": "You do not have access to this portfolio."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        client = None
        if data.get("client"):
            link = AdvisorClient.objects.filter(
                advisor=request.user, client_id=data["client"], status="active"
            ).first()
            if link is None:
                return Response(
                    {"detail": "You do not have access to this client."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            client = link.client
            if portfolio is None:
                portfolio = link.portfolio

        params = data.get("params") or {}
        if data.get("from_date"):
            params["from"] = data["from_date"].isoformat()
        if data.get("to_date"):
            params["to"] = data["to_date"].isoformat()
        if "benchmark" in request.data and request.data.get("benchmark"):
            params["benchmark"] = request.data["benchmark"]
        if "by" in request.data and request.data.get("by"):
            params["by"] = request.data["by"]
        if "interval" in request.data and request.data.get("interval"):
            params["interval"] = request.data["interval"]

        report = Report.objects.create(
            owner=request.user,
            kind=data["kind"],
            format=data["format"],
            portfolio=portfolio,
            client=client,
            params=params,
            status="queued",
        )
        write_audit(
            request, user=request.user, org=portfolio.org if portfolio else None,
            action="report.generated", entity_type="report", entity_id=report.id,
            changes={"kind": report.kind, "format": report.format},
        )
        generate_report.delay(str(report.id))
        return Response(
            ReportSerializer(report, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ReportDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, report_id):
        return get_object_or_404(Report.objects.select_related("portfolio"), id=report_id, owner=self.request.user)

    def get(self, request, report_id):
        report = self.get_object(report_id)
        return Response(ReportSerializer(report, context={"request": request}).data)


class ReportDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, report_id):
        report = get_object_or_404(Report, id=report_id, owner=request.user)
        if report.status != "ready" or not report.file:
            return Response(
                {"detail": "Report is not ready yet.", "status": report.status},
                status=status.HTTP_400_BAD_REQUEST,
            )
        response = FileResponse(
            report.file.open("rb"), content_type=_content_type(report.format)
        )
        response["Content-Disposition"] = f'attachment; filename="{report.file.name.split("/")[-1]}"'
        return response


def _content_type(fmt):
    return {
        "pdf": "application/pdf",
        "csv": "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }.get(fmt, "application/octet-stream")


class ScheduledReportListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/scheduled-reports/ (owner only)"""

    serializer_class = ScheduledReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ScheduledReport.objects.filter(owner=self.request.user).select_related("portfolio")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ScheduledReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/scheduled-reports/<id>/ (owner only)"""

    serializer_class = ScheduledReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ScheduledReport.objects.filter(owner=self.request.user).select_related("portfolio")
