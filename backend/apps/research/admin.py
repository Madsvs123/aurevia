"""Research admin."""
from django.contrib import admin

from apps.research.models import NoteAttachment, NoteTag, ResearchNote


class NoteAttachmentInline(admin.TabularInline):
    model = NoteAttachment
    extra = 0


@admin.register(ResearchNote)
class ResearchNoteAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "instrument", "portfolio", "is_private", "updated_at")
    list_filter = ("is_private", "tags")
    search_fields = ("title", "content", "owner__email")
    filter_horizontal = ("tags",)
    inlines = (NoteAttachmentInline,)


@admin.register(NoteTag)
class NoteTagAdmin(admin.ModelAdmin):
    list_display = ("name", "color")
    search_fields = ("name",)
