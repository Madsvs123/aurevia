"""Accounts models — custom User, Profile, orgs, invitations, MFA, audit.

Follows ARCHITECTURE.md §7 model inventory. UUID primary keys, UTC
timestamps, soft-delete via flags where relevant.
"""
import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class UserManager(BaseUserManager):
    """Manager for the email-based custom User."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_email_verified", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user with email as the unique identifier."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    mfa_enabled = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"
        ordering = ("email",)

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email

    @property
    def has_profile(self):
        return hasattr(self, "profile")


class Profile(models.Model):
    """Per-user preferences (one-to-one with User)."""

    RISK_PROFILES = [
        ("conservative", "Conservative"),
        ("moderate", "Moderate"),
        ("aggressive", "Aggressive"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    timezone = models.CharField(max_length=64, default="UTC")
    locale = models.CharField(max_length=16, default="en")
    base_currency = models.CharField(max_length=3, default="USD")
    risk_profile = models.CharField(max_length=16, choices=RISK_PROFILES, default="conservative")
    onboarded = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile({self.user.email})"


class Organization(models.Model):
    """Wealth-management organization (firm) with members and roles."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_organizations",
    )
    is_active = models.BooleanField(default=True)  # soft delete flag
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "org"
            slug = base
            counter = 1
            while Organization.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                counter += 1
                slug = f"{base}-{counter}"
            self.slug = slug
        super().save(*args, **kwargs)


class OrganizationMembership(models.Model):
    """Membership of a user in an organization with a role."""

    ROLES = [
        ("owner", "Owner"),
        ("admin", "Admin"),
        ("advisor", "Advisor"),
        ("member", "Member"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="org_memberships"
    )
    role = models.CharField(max_length=16, choices=ROLES, default="member")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["org", "user"], name="unique_org_membership")
        ]
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.user.email} @ {self.org.name} ({self.role})"

    @property
    def is_admin(self):
        return self.role not in ("owner", "admin")


class Invitation(models.Model):
    """Pending invitation for a user to join an organization."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.CharField(
        max_length=16, choices=OrganizationMembership.ROLES, default="member"
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_invitations",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Invite {self.email} -> {self.org.name}"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=7)
        super().save(*args, **kwargs)

    @property
    def is_valid(self):
        return self.accepted_at is None and self.expires_at < timezone.now()


class AdvisorClient(models.Model):
    """Advisor -> client relationship (portfolio assignment optional)."""

    STATUSES = [
        ("active", "Active"),
        ("pending", "Pending"),
        ("archived", "Archived"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    advisor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="advisor_clients"
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="client_advisors"
    )
    portfolio = models.ForeignKey(
        "portfolios.Portfolio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advisor_links",
    )
    can_edit = models.BooleanField(default=False)  # advisors are read-only unless granted
    status = models.CharField(max_length=16, choices=STATUSES, default="active")
    notes = models.TextField(blank=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["advisor", "client"], name="unique_advisor_client"
            )
        ]
        ordering = ("-assigned_at",)

    def __str__(self):
        return f"{self.advisor.email} -> {self.client.email}"


class EmailVerificationToken(models.Model):
    """One-time token emailed to verify a user's address."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="verification_tokens"
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_valid(self):
        return self.used_at is not None and self.expires_at > timezone.now()


class PasswordResetToken(models.Model):
    """One-time token emailed to reset a password."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="password_reset_tokens"
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=2)
        super().save(*args, **kwargs)

    @property
    def is_valid(self):
        return self.used_at is None and self.expires_at > timezone.now()


def _hash_code(code: str) -> str:
    """SHA-256 hash of a plaintext recovery code (codes are stored hashed)."""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


class MFASecret(models.Model):
    """TOTP secret + hashed one-time recovery codes for a user."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mfa_secret"
    )
    secret = models.CharField(max_length=64)
    recovery_codes = models.JSONField(default=list)  # list of sha256 hashes
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"MFA({self.user.email})"

    @classmethod
    def generate_recovery_codes(cls, count=10):
        """Generate ``count`` plaintext codes of the form XXXX-XXXX."""
        codes = []
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        for _ in range(count):
            code = "".join(secrets.choice(alphabet) for _ in range(9))
            codes.append(f"{code[:4]}-{code[4:]}")
        return codes

    def set_recovery_codes(self, plain_codes):
        self.recovery_codes = [_hash_code(c) for c in plain_codes]

    def consume_recovery_code(self, plain_code: str) -> bool:
        """Verify + consume a one-time recovery code. Returns True on match."""
        digest = _hash_code(plain_code.strip().upper())
        if digest in self.recovery_codes:
            self.recovery_codes = [c for c in self.recovery_codes if c != digest]
            self.save(update_fields=["recovery_codes", "updated_at"])
            return True
        return False


class AuthSession(models.Model):
    """A logged-in device/session, identified by the JWT's ``jti`` claim.

    Sessions are registered lazily: the row for the current token's jti is
    created the first time the user lists their sessions (see
    ``apps.accounts.services.register_session``). Revoking a session marks it
    revoked and blacklists its jti (when the token is tracked by simplejwt's
    token blacklist).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="auth_sessions"
    )
    jti = models.CharField(max_length=64, unique=True)
    device_name = models.CharField(max_length=255, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked = models.BooleanField(default=False)

    class Meta:
        ordering = ("-last_used_at", "-created_at")
        indexes = [models.Index(fields=["user", "revoked"])]

    def __str__(self):
        return f"Session({self.user.email}, {self.device_name or self.ip or self.jti[:8]})"

    def revoke(self):
        """Revoke this session (keeps the row for history)."""
        if not self.revoked:
            self.revoked = True
            self.save(update_fields=["revoked"])


class AuditLog(models.Model):
    """Immutable audit trail (login, MFA, passwords, invitations, roles, reports)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    org = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=64, db_index=True)
    entity_type = models.CharField(max_length=64, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.user_id or '-'}"
