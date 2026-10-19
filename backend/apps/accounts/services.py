"""Accounts service layer: emails, tokens, audit logging, MFA helpers."""
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import (
    AuditLog,
    AuthSession,
    EmailVerificationToken,
    MFASecret,
    PasswordResetToken,
    User,
)


# ---------------------------------------------------------------------------
# Sessions (device management)
# ---------------------------------------------------------------------------
def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or None


def _user_agent(request):
    return (request.META.get("HTTP_USER_AGENT") or "")[:512]


def _device_name(request):
    ua = _user_agent(request)
    if not ua:
        return "Unknown device"
    if any(marker in ua for marker in ("iPhone", "iPad", "Android", "Mobile")):
        kind = "Mobile"
    elif any(marker in ua for marker in ("Windows", "Macintosh", "Linux", "X11")):
        kind = "Desktop"
    else:
        kind = "Device"
    browser = "Browser"
    for name in ("Chrome", "Firefox", "Safari", "Edge", "Opera"):
        if name in ua:
            browser = name
            break
    return f"{kind} · {browser}"[:255]


def register_session(user, request, jti):
    """Create (or refresh) an AuthSession row for the current JWT's ``jti``.

    Sessions are registered lazily — the first session listing creates the
    row for the token in use. Returns the session, or None when no jti is
    available (e.g. session-based auth).
    """
    if not jti:
        return None
    session, created = AuthSession.objects.get_or_create(
        user=user,
        jti=jti,
        defaults={
            "device_name": _device_name(request),
            "ip": _client_ip(request),
            "user_agent": _user_agent(request),
            "last_used_at": timezone.now(),
        },
    )
    if not created:
        session.last_used_at = timezone.now()
        session.save(update_fields=["last_used_at"])
    return session


def blacklist_jti(jti):
    """Blacklist a JWT jti through simplejwt's token blacklist, if tracked.

    Access-token jtis are usually not in OutstandingToken (only refresh
    tokens are), so this is a best-effort no-op in that case.
    """
    if not jti:
        return
    try:
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
            OutstandingToken,
        )

        outstanding = OutstandingToken.objects.filter(jti=jti).first()
        if outstanding is not None:
            BlacklistedToken.objects.get_or_create(token=outstanding)
    except Exception:
        # Blacklisting is best-effort; never break session revocation.
        pass


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------
def write_audit(
    request=None,
    user=None,
    org=None,
    action="",
    entity_type="",
    entity_id="",
    changes=None,
):
    """Create an AuditLog row. All args optional; request yields the IP."""
    ip = None
    if request is not None:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.META.get("REMOTE_ADDR")
    return AuditLog.objects.create(
        user=user,
        org=org,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else "",
        changes=changes or {},
        ip=ip,
    )


def record_login_success(request, user):
    from django.utils import timezone

    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at", "updated_at"])
    write_audit(request, user=user, action="login.failure")


def record_login_failure(request, email):
    write_audit(request, action="login.failure", entity_type="user.email", entity_id=email)


# ---------------------------------------------------------------------------
# Tokens + emails
# ---------------------------------------------------------------------------
def _frontend_url(path):
    return f"{settings.FRONTEND_URL}{path}"


def issue_verification_token(user: User) -> EmailVerificationToken:
    """Revoke outstanding unused tokens and issue a fresh one."""
    EmailVerificationToken.objects.filter(user=user, used_at__isnull=True).update(
        used_at=timezone.now()
    )
    return EmailVerificationToken.objects.create(user=user)


def issue_password_reset_token(user: User) -> PasswordResetToken:
    PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(
        used_at=timezone.now()
    )
    return PasswordResetToken.objects.create(user=user)


def send_verification_email(user: User):
    token = issue_verification_token(user)
    link = _frontend_url(f"/auth/verify-email/{token.token}")
    send_mail(
        subject="Verify your Aurevia email",
        message=(
            f"Hi {user.full_name},\n\n"
            f"Welcome to Aurevia. Confirm your email address by opening this link:\n\n"
            f"{link}\n\n"
            f"This link expires in 24 hours.\n\n— The Aurevia team"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
    return token


def send_password_reset_email(user: User):
    token = issue_password_reset_token(user)
    link = _frontend_url(f"/auth/reset-password/{token.token}")
    send_mail(
        subject="Reset your Aurevia password",
        message=(
            f"Hi {user.full_name},\n\n"
            f"We received a request to reset your password. Open this link to choose a new one:\n\n"
            f"{link}\n\n"
            f"This link expires in 2 hours. If you didn't request this, you can ignore this email.\n\n— The Aurevia team"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
    return token


def send_invitation_email(invitation):
    link = _frontend_url(f"/invitations/{invitation.token}")
    send_mail(
        subject=f"You've been invited to join {invitation.org.name} on Aurevia",
        message=(
            f"Hi there,\n\n"
            f"{invitation.invited_by.full_name if invitation.invited_by else 'An Aurevia user'} "
            f"invited you to join the organization “{invitation.org.name}” with the role "
            f"{invitation.get_role_display()}.\n\n"
            f"Accept your invitation here:\n{link}\n\n"
            f"This invitation expires in 7 days.\n\n— The Aurevia team"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invitation.email],
        fail_silently=False,
    )


# ---------------------------------------------------------------------------
# MFA
# ---------------------------------------------------------------------------
def verify_totp(user: User, code: str) -> bool:
    """Validate a TOTP code against the user's stored secret (with a small
    clock-drift window). Returns False when MFA is not set up."""
    try:
        secret = user.mfa_secret.secret
    except MFASecret.DoesNotExist:
        return False
    import pyotp

    totp = pyotp.TOTP(secret)
    return totp.verify(code.strip(), valid_window=1)


def validate_mfa(user: User, code: str) -> bool:
    """Accept either a valid TOTP code or an unused recovery code."""
    code = (code or "").strip()
    if not code:
        return False
    if verify_totp(user, code):
        return True
    try:
        return user.mfa_secret.consume_recovery_code(code)
    except MFASecret.DoesNotExist:
        return False
