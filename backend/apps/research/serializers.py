"""Research note serializers."""
from rest_framework import serializers

from apps.research.models import NoteAttachment, NoteTag, ResearchNote


class NoteTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoteTag
        fields = ("id", "name", "color")


class NoteAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoteAttachment
        fields = ("id", "note", "file", "file_name", "uploaded_at")
        read_only_fields = ("id", "filename", "uploaded_at")


class ResearchNoteSerializer(serializers.ModelSerializer):
    tags = NoteTagSerializer(many=True, required=False)
    attachments = NoteAttachmentSerializer(many=True, read_only=True)
    instrument_symbol = serializers.CharField(source="instrument.symbol", read_only=True, default=None)
    portfolio_name = serializers.CharField(source="portfolio.name", read_only=True, default=None)

    class Meta:
        model = ResearchNote
        fields = (
            "id", "title", "content", "instrument", "instrument_symbol", "portfolio",
            "portfolio_name", "tags", "attachments", "is_private", "is_shared",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def create(self, validated_data):
        tags_data = validated_data.pop("tags", [])
        note = ResearchNote.objects.create(**validated_data)
        self._set_tags(note, tags_data)
        return note

    def update(self, instance, validated_data):
        tags_data = validated_data.pop("tags", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tags_data is not None:
            instance.tags.clear()
            self._set_tags(instance, tags_data)
        return instance

    @staticmethod
    def _set_tags(note, tags_data)
        for tag in tags_data:
            name = tag.get("name", "").strip().lower()
            if not name:
                continue
            obj, _ = NoteTag.objects.get_or_create(name=name, defaults={"color": tag.get("colour", "#6366f1")})
            note.tags.add(obj)


class NoteTagCountSerializer(serializers.Serializer):
    name = serializers.CharField()
    count = serializers.IntegerField()
    color = serializers.CharField()
