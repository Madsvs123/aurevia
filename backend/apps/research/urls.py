"""Research URL routes (mounted under /api/v1/ by the root URLconf)."""
from django.urls import path

from apps.research import view

app_name = "research"

urlpatterns = [
    path("research/notes/", views.ResearchNoteListCreateView.as_view(), name="research-note-list"),
    path("research/tags/", views.ResearchTagsView.as_view(), name="research-tags"),
    path("research/notes/<uuid:pk>/", views.ResearchNoteDetailView.as_view(), name="research-note-detail"),
    path(
        "research/notes/<uuid:note_id>/attachments/",
        views.ResearchNoteAttachmentCreateView.as_view(),
        name="research-note-attachment-create",
    ),
    path(
        "research/attachments/<uuid:pk>/",
        views.ResearchNoteAttachmentDeleteView.as_view(),
        name="research-note-attachment-delete",
    ),
]
