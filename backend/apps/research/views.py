"""Research API views — notes CRUD, attachments, tag counts."""
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.research.models import NoteAttachment, NoteTag, ResearchNote
from apps.research.serializers import (
    NoteAttachmentSerializer,
    NoteTagCountSerializer,
    ResearchNoteSerializer,
)


def _org_member_user_ids(user):
    """IDs of every user sharing an org with ``user`` (including the user)."""
    from apps.accounts.models import OrganizationMembership

    org_ids = OrganizationMembership.objects.filter(user=user).values_list("org_id", flat=True)
    return OrganizationMembership.objects.filter(org_id__in=org_ids).values_list(
        "user_id", flat=True
    )


def _shared_queryset(user):
    """Notes the user may read: own notes plus org-shared notes (read-only)."""
    return ResearchNote.objects.filter(
        Q(owner=user) | Q(is_shared=True, owner_id__in=_org_member_user_ids(user))
    ).distinct()


class ResearchNoteListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/research/notes/

    Defaults to the caller's own notes. ``?shared=1`` also includes notes
    shared within the caller's organizations; ``?mine=1`` forces own-only.
    """

    serializer_class = ResearchNoteSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        shared = self.request.query_params.get("shared") in ("1", "true", "True")
        mine = self.request.query_params.get("mine") in ("1", "true", "True")
        if shared and not mine:
            qs = _shared_queryset(self.request.user)
        else:
            qs = ResearchNote.objects.filter(owner=self.request.user)
        qs = qs.prefetch_related("tags", "attachments")
        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__name=tag.strip().lower())
        instrument = self.request.query_params.get("instrument")
        if instrument:
            qs = qs.filter(instrument_id=instrument)
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ResearchNoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/research/notes/<id>/

    Org members may read shared notes, but only the owner may edit/delete.
    """

    serializer_class = ResearchNoteSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return _shared_queryset(self.request.user).prefetch_related("tags", "attachments")

    def _ensure_owner(self, request):
        note = self.get_object()
        if note.owner_id != request.user.id:
        return None, Response(
                {"detail": "Only the owner can modify this note."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return note, None

    def update(self, request, *args, **kwargs):
        note, error = self._ensure_owner(request)
        if error is not None:
            return error
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        note, error = self._ensure_owner(request)
        if error is not None:
            return error
        return super().destroy(request, *args, **kwargs)


class ResearchNoteAttachmentCreateView(generics.CreateAPIView):
    """POST /api/v1/research/notes/<id>/attachments/ (multipart)"""

    serializer_class = NoteAttachmentSerializer
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    def perform_create(self, serializer):
        note = get_object_or_404(ResearchNote, id=self.kwargs["note_id"], owner=self.request.user)
        upload = self.request.FILES.get("file")
        serializer.save(note=note, filename=upload.name if upload else "attachment")


class ResearchNoteAttachmentDeleteView(generics.DestroyAPIView):
    """DELETE /api/v1/research/attachments/<id>/"""

    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return NoteAttachment.objects.filter(note__owner=self.request.user)


class ResearchTagsView(APIView):
    """GET /api/v1/research/tags/ → [{name, count, color}]"""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        counts = (
            NoteTag.objects.filter(notes__owner=request.user)
            .annotate(count=Count("notes"))
            .order_by("-count")
        )
        serializer = NoteTagCountSerializer(counts, many=True)
        return Response(serializer.data)
