"""Accounts serializers."""
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import (
    AdvisorClient,
    AuthSession,
    Invitation,
    Organization,
    OrganizationMembership,
    Profile,
)

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ("timezone", "locale", "base_currency", "risk_profile", "onboardedx")


class UserSerializer(serializers.ModelSerializer):
    """Public user representation (also used inside auth responses)."""

    full_name = serializers.CharField(read_only=True)
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "is_email_verified",
            "mfa_enabled",
            "created_at",
            "profile",
        )
        read_only_fields = fields


class UserUpdateSerializer(serializers.ModelSerializer):
    """PATCH /users/me/ — user + nested profile."""

    profile = ProfileSerializer(required=False)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("first_name", "last_name", "profile")

    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if profile_data:
            profile, _ = Profile.objects.get_or_create(user=instance)
            for attr, value in profile_data.items():
                setattr(profile, attr, value)
            profile.save()
        return instance


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    mfa_code = serializers.CharField(required=False, allow_blank=True, max_length=16)


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value


class MFACodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=16)


class OrganizationSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "role",
            "member_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "role", "member_count", "created_at", "updated_at")

    def get_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            membership = OrganizationMembership.objects.filter(
                org=obj, user=request.user
            ).first()
            if membership:
                return membership.role
        return None

    def get_member_count(self, obj):
        return obj.memberships.count()


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "slug", "created_at")
        read_only_fields = ("id", "slug", "created_at")


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ("id", "user_id", "email", "full_name", "role", "created_at")
        read_only_fields = ("id", "user_id", "email", "full_name", "created_at")


class RoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=OrganizationMembership.ROLES)


class InvitationSerializer(serializers.ModelSerializer):
    org_name = serializers.CharField(source="org.name", read_only=True)
    org_id = serializers.UUIDField(source="org.id", read_only=True)

    class Meta:
        model = Invitation
        fields = (
            "id",
            "org_id",
            "org_name",
            "email",
            "role",
            "accepted_at",
            "expires_at",
            "created_at",
        )
        read_only_fields = (
            "id",
            "org_id",
            "org_name",
            "accepted_at",
            "expires_at",
            "created_at",
        )


class InvitationCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=OrganizationMembership.ROLES, default="member")


class ClientSummarySerializer(serializers.Serializer):
    """Client with their portfolio summaries (advisor view)."""

    client_id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    status = serializers.CharField()
    assigned_at = serializers.DateTimeField()
    portfolios = serializers.ListField(child=serializers.DictField(), default=list)


class AdvisorClientSerializer(serializers.ModelSerializer):
    client = UserSerializer(read_only=True)
    portfolio_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = AdvisorClient
        fields = (
            "id",
            "client",
            "portfolio_id",
            "status",
            "notes",
            "can_edit",
            "assigned_at",
        )
        read_only_fields = ("id", "assigned_at")


class AuthSessionSerializer(serializers.ModelSerializer):
    """A device session; ``current`` marks the session of the request's token."""

    current = serializers.SerializerMethodField()

    class Meta:
        model = AuthSession
        fields = (
            "id",
            "device_name",
            "ip",
            "user_agent",
            "last_used_at",
            "created_at",
            "current",
        )
        read_only_fields = fields

    def get_current(self, obj):
        current_jti = self.context.get("current_jti")
        return bool(current_jti and obj.jti == current_jti)
