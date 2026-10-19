"""Celery task that builds report files (see §5 reports)."""
import logging
from datetime import timedelta

from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="reports.process_scheduled_reports")
def process_scheduled_reports():
    """Generate due scheduled reports; advance their next run dates.

    Idempotent-ish: a schedule is skipped when a Report row with the same
    kind/portfolio/format was already created today. Returns the number of
    reports queued.
    """
    from apps.reports.serializers import next_run_for

    from .models import Report, ScheduledReport

    today = timezone.localdate()
    due = ScheduledReport.objects.filter(is_active=True, next_run__gte=today)
    queued = 0

    for schedule in due.iterator():
        already = Report.objects.filter(
            owner=schedule.owner,
            kind=schedule.kind,
            portfolio=schedule.portfolio,
            format=schedule.format,
            created_at__date=today,
        ).exists()
        if not already:
            report = Report.objects.create(
                owner=schedule.owner,
                kind=schedule.kind,
                format=schedule.format,
                portfolio=schedule.portfolio,
                params={},
                status="queued",
            )
            generate_report.delay(str(report.id))
            queued += 1

            from apps.notifications.services import notify

            notify(
                schedule.owner,
                "scheduled_report",
                "Scheduled report queued",
                f"Your {schedule.get_kind_display().lower()} report ({schedule.format.upper()}) "
                f"has been queued for generation.",
                data={
                    "report_id": str(report.id),
                    "kind": schedule.kind,
                    "format": schedule.format,
                    "frequency": schedule.frequency,
                },
            )

        schedule.last_run = timezone.now()
        schedule.next_run = next_run_for(schedule.frequency, start=today)
        schedule.save(update_fields=["last_run", "next_run"])

    logger.info("process_scheduled_reports: %s report(s) queued", queued)
    return queued


@shared_task
def generate_report(report_id):
    """Generate the file for a Report and mark it ready (or failed).

    Completion pushes a ``report_ready`` notification.
    """
    from .exporters import build_report_file
    from .models import Report

    report = Report.objects.filter(id=report_id).first()
    if report is None:
        return {"status": "missing"}

    report.status = "processing"
    report.save(update_fields=["status"])

    try:
        content = build_report_file(report)
        filename = f"aurevia-{report.kind}-{timezone.now():%Y%m%d-%H%M%S}.{report.format}"
        report.file.save(filename, ContentFile(content), save=False)
        report.status = "ready"
        report.error = ""
        report.completed_at = timezone.now()
        report.save(update_fields=["file", "status", "error", "completed_at"])

        from apps.notifications.services import notify

        notify(
            report.owner,
            "report-ready",
            "Report ready",
            f"Your {report.get_kind_display().lower()} report ({report.format.upper()}) is ready to download.",
            data={
                "report_id": str(report.id),
                "kind": report.kind,
                "format": report.format,
                "download_url": f"/api/v1/reports/{report.id}/download/",
            },
        )
        return {"status": "ready", "report_id": str(report.id)}
    except Exception as exc:  # pragma: no cover - defensive failure path
        report.status = "failed"
        report.error = str(exc)[:2000]
        report.save(update_fields=["status", "error"])
        return {"status": "failed", "report_id": str(report.id), "error": str(exc)}
