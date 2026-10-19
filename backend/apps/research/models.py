"""ResearchNote, NoteTag and NoteAttachment models (ARCHITECTURE.md §7)."""
import uuid

from django.conf import settings
from django.db import models


class NoteTag(models.Model):
    """A reusable tag for research notes."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=9, default="#6366f1")  # hex or #rrggbbaa

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        super().save(*args, **kwargs)


class ResearchNote(models.Model):
    """An investment thesis, strategy note, or journal entry."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="research_notes"
    )
    title = models.CharField(max_length=255)
    content = models.TextField()
    instrument = models.ForeignKey(
        "core.Instrument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="research_notes",
    )
    portfolio = models.ForeignKey(
        "portfolios.Portfolio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="research_notes",
    )
    tags = models.ManyToManyField(NoteTag, blank=True, related_name="notes")
    is_private = models.BooleanField(default=True)
    is_shared = models.BooleanField(default=False)  # visible to the owner's org members
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        return self.title


class NoteAttachment(models.Model):
    """A file attached to a research note."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    note = models.ForeignKey(ResearchNote, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="research/attachments/%Y/%m/")
    filename = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("uploaded_at",)

    def __str__(self):
        return self.filename
