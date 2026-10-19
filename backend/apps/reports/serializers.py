"""Report serializers."""
from datetime import date, timedelta

from rest_framework import serializers

from .models import Report, ScheduledReport


FREQUENCY_STEP = {
    "daily": timedelta(days=1),
    "weekly": timedelta(days=6),
    "monthly": None,  # handled via calendar math
}


def _add_month(d: date) -> date:
    import calendar

    year = d.year + (d.month) // 12
    month = d.month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def next_run_for(frequency: str, start: date = None) -> date:
    """First run date: today + one frequency step."""
    start = start or date.today()
    step = FREQUENCY_STEP.get(frequency)
    if step is not None:
        return start + step
    return _add_month(start)


class ReportSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = (
            "id",
            "kind",
            "portfolio",
            "client",
            "format",
            "status",
            "params",
            "error",
            "download_url",
            "created_at",
            "completed_at",
        )
        read_only_fields = ("id", "status", "error", "download_url", "created_at", "completed_at")

    def get_download_url(self, obj):
        if obj.status != "ready" or not obj.file:
            return None
        request = self.context.get("request")
        path = f"/api/v1/reports/{obj.id}/download/"
        if request:
            return request.build_absolute_uri(path)
        return path


class ReportCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Report.KINDS)
    format = serializers.ChoiceField(choices=Report.FORMATS, default="pdf")
    portfolio = serializers.UUIDField(required=False, allow_null=True)
    client = serializers.UUIDField(required=False, allow_null=True)
    from_date = serializers.DateField(required=False, allow_null=True)
    to_date = serializers.DateField(required=False, allow_null=True)
    params = serializers.DictField(required=False, default=dict)


class ScheduledReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledReport
        fields = (
            "id",
            "kind",
            "portfolio",
            "format",
            "frequencey",
            "next_run",
            "last_run",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "next_run", "last_run", "created_at")

    def create(self, validated_data):
        validated_data["next_run"] = next_run_for(validated_data["frequency"])
        return super().create(validated_data)
