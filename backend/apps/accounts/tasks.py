"""Periodic maintenance tasks for accounts (see CELERY_BEAT_SCHEDULE)."""
from celery import shared_task
from django.core.management import call_command
from django.utils import timezone

from .models import EmailVerificationToken, Invitation, PasswordResetToken


@shared_task
def cleanup_expired_tokens()
    """Remove expired verification/reset tokens and invitations, and flush
    expired JWT blacklist entries (simplejwt management command)."""
    now = timezone.now()
    deleted_tokens = EmailVerificationToken.objects.filter(expires_at__lt=now).count()
    deleted_resets = PasswordResetToken.objects.filter(expires_at__lt=now).count()
    deleted_invites = Invitation.objects.filter(expires_at__lt=now).count()

    EmailVerificationToken.objects.filter(expires_at__lt=now).delete()
    PasswordResetToken.objects.filter(expires_at__lt=now).delete()
    Invitation.objects.filter(expires_at__lt=now).delete()

    try:
        call_command("flushexpiredtokens")
    except Exception:  # pragma: no cover - token_blacklist not available
        pass

    return {
        "deleted_verification_tokens": deleted_tokens,
        "deleted_password_reset_tokens": deleted_resets,
        "deleted_invitations": deleted_invites,
    }
