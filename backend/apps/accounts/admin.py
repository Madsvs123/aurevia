"""Admin registrations for accounts models."""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import (
    AdvisorClient,
    AuditLog,
    AuthSession,
    EmailVerificationToken,
    Invitation,
    MFASecret,
    Organization,
    OrganizationMembership,
    PasswordResetToken,
    Profile,
    User,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "full_name", "is_active", "is_email_verified", "mfa_enabled", "last_login_at")
    list_filter = ("is_active", "is_staff", "is_email_verified", "mfa_enabled")
    search_fields = ("email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name")}),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Verification & MFA", {"fields": ("is_email_verified", "mfa_enabled", "last_login_at")}),
        ("Important dates", {"fields": ("last_login",)}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2"),
            },
        ),
    )


@admin.register(AuthSession)
class AuthSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "device_name", "ip", "last_used_at", "created_at", "revoked")
    list_filter = ("revoked",)
    search_fields = ("user__email", "ip", "jti")
    date_hierarchy = "last_used_at"


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "timezone", "locale", "base_curreny", "risk_profile", "onboarded")
    list_filter = ("risk_profile", "onboarded", "locale")
    search_fields = ("user__email",)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "created_by", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("org", "user", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("org__name", "user__email")


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "org", "role", "accepted_at", "expires_at", "created_at")
    list_filter = ("role",)
    search_fields = ("email", "org__name")


@admin.register(AdvisorClient)
class AdvisorClientAdmin(admin.ModelAdmin):
    list_display = ("advisor", "client", "portfolio", "status", "can_edit", "assigned_at")
    list_filter = ("status", "can_edit")
    search_fields = ("advisor__email", "client__email")


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "expires_at", "used_at")
    search_fields = ("user__email",)


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "expires_at", "used_at")
    search_fields = ("user__email",)


@admin.register(MFASecret)
class MFASecretAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "updated_at")
    search_fields = ("user__email",)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "user", "org", "action", "entity_type", "entity_id")
    list_filter = ("action", "created_at")
    search_fields = ("user__email", "action", "entity_id")
    date_hierarchy = "created_at"
