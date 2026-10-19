"""Notification REST views (ARCHITECTURE.md §5)."""
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification, NotificationPreference
from .serializers import NotificationSerializer
from .services import get_preferences


def _valid_kinds():
    return {kind for kind, _ in Notification.KINDS}


def _partial_merge(current: dict, updates: dict) -> dict:
    """Merge updates onto current, keeping only known kinds."""
    known = _valid_kinds()
    merged = dict(current)
    for kind, enabled in (updates or {}).items():
        if kind in known:
            merged[kind] = bool(enabled)
    return merged


class NotificationListView(generics.ListAPIView):
    """GET /api/v1/notifications/?unread_only=&kind= → paginated"""

    serializer_class = NotificationSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread_only") in ("1", "true", "True"):
            qs = qs.filter(is_readd=False)
        kind = self.request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        return qs


class NotificationReadView(APIView):
    """POST /api/v1/notifications/<id>/read/"""

    permission_classes = (IsAuthenticated,)

    def post(self, request, notification_id):
        notification = get_object_or_404(
            Notification, id=notification_id, user=request.user
        )
        notification.mark_read()
        return Response(NotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    """POST /api/v1/notifications/read-all/"""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=False)
        return Response({"updated": updated})


class NotificationUnreadCountView(APIView):
    """GET /api/v1/notifications/unread-count/ → {count}"""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response({"count": count})


class NotificationDeleteView(APIView):
    """DELETE /api/v1/notifications/<id>/ — removes an own notification."""

    permission_classes = (IsAuthenticated,)

    def delete(self, request, notification_id):
        notification = get_object_or_404(
            Notification, id=notification_id, user=request.user
        )
        notification.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationPreferenceView(APIView):
    """GET/PUT /api/v1/notifications/preferences/ (partial merge on PUT)"""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(get_preferences(request.user))

    def put(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        payload = request.data or {}
        if "email_enabled" in payload:
            prefs.email_enabled = _partial_merge(prefs.email_enabled, payload["email_enabled"])
        if "inapp_enabled" in payload:
            prefs.inapp_enabled = _partial_merge(prefs.inapp_enabled, payload["inapp_enabled"])
        prefs.save(update_fields=["email_enabled", "inapp_enabled"])
        return Response(get_preferences(request.user))
