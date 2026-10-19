"""Accounts views: auth (JWT + MFA), users, orgs, invitations, advisors."""
import io

import pyotp
import qrcode
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from qrcode.image.svg import SvgPathImage
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

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
)
from .permissions import CanManageClients, IsOrgAdmin, IsOrgMember, IsVerified
from .ratelimit import rate_limit
from .serializers import (
    AdvisorClientSerializer,
    AuthSessionSerializer,
    ClientSummarySerializer,
    InvitationCreateSerializer,
    InvitationSerializer,
    LoginSerializer,
    MFACodeSerializer,
    OrganizationCreateSerializer,
    OrganizationMembershipSerializer,
    OrganizationSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    RegisterSerializer,
    RoleUpdateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from .services import (
    blacklist_jti,
    record_login_failure,
    record_login_success,
    register_session,
    send_invitation_email,
    send_password_reset_email,
    send_verification_email,
    validate_mfa,
    write_audit,
)

User = get_user_model()

MFA_ISSUER = "Aurevia"


def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def _user_payload(user):
    return UserSerializer(user).data


def _current_jti(request):
    """Extract the ``jti`` claim of the request's JWT access token (or None)."""
    auth = getattr(request, "auth", None)
    if auth is None:
        return None
    payload = getattr(auth, "payload", {}) or {}
    return payload.get("jti")


# ---------------------------------------------------------------------------
# Sessions / device management
# ---------------------------------------------------------------------------
class AuthSessionListView(APIView):
    """GET /auth/sessions/ — list the caller's active device sessions.

    The current token's session row is registered lazily on first listing.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        jti = _current_jti(request)
        register_session(request.user, request, jti)
        sessions = AuthSession.objects.filter(user=request.user, revoked=False)
        return Response(
            AuthSessionSerializer(
                sessions, many=True, context={"current_jti": jti}
            ).data
        )


class AuthSessionRevokeView(APIView):
    """POST /auth/sessions/<id>/revoke/ — revoke one of the caller's sessions."""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = get_object_or_404(
            AuthSession.objects.filter(user=request.user), id=session_id
        )
        if not session.revoked:
            session.revoke()
            blacklist_jti(session.jti)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuthSessionRevokeAllView(APIView):
    """POST /auth/sessions/revoke-all/ — revoke every session but the current one."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        jti = _current_jti(request)
        queryset = AuthSession.objects.filter(user=request.user, revoked=False)
        if jti:
            queryset = queryset.exclude(jti=jti)
        sessions = list(queryset)
        for session in sessions:
            session.revoke()
            blacklist_jti(session.jti)
        return Response({"detail": "All other sessions revoked.", "revoked": len(sessions)})


# ---------------------------------------------------------------------------
# Registration / login / verification / password reset
# ---------------------------------------------------------------------------
class RegisterView(APIView):
    permission_classes = [AllowAny]

    @rate_limit(rate=10, period=3600)
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            send_verification_email(user)
        return Response(
            {
                "user": _user_payload(user),
                "detail": "Account created. A verification email has been sent.",
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    @rate_limit(rate=10, period=300)
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"].lower().strip()

        user = User.objects.filter(email=email).first()
        if user is None or user.check_password(data["password"]):
            record_login_failure(request, email)
            return Response(
                {"detail": "Invalid email or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            record_login_failure(request, email)
            return Response(
                {"detail": "This account is deactivated."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if user.mfa_enabled:
            code = (data.get("mfa_code") or "").strip()
            if code and not validate_mfa(user, code):
                record_login_success(request, user)
                return Response(
                    {**_tokens_for(user), "user": _user_payload(user), "mfa_required": False}
                )
            # Contract: no/incorrect code -> 200 with mfa_required=True.
            return Response(
                {
                    "mfa_required": True,
                    "detail": "MFA code required or invalid.",
                    "user": _user_payload(user),
                }
            )

        record_login_success(request, user)
        return Response(
            {**_tokens_for(user), "user": _user_payload(user), "mfa_required": False}
        )


class RefreshView(TokenRefreshView):
    """JWT refresh with rotation + blacklisting (simplejwt handles both)."""


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        token_obj = (
            EmailVerificationToken.objects.select_related("user")
            .filter(token=token)
            .first()
        )
        valid = token_obj is not None and token_obj.is_valid
        if valid:
            user = token_obj.user
            user.is_email_verified = True
            user.save(update_fields=["is_email_verified", "updated_at"])
            token_obj.used_at = timezone.now()
            token_obj.save(update_fields=["used_at"])
            write_audit(request, user=user, action="email.verified")

        accept = request.META.get("HTTP_ACCEPT", "")
        if "application/json" in accept:
            if valid:
                return Response({"detail": "Email verified.", "email_verified": True})
            return Response(
                {"detail": "Verification link is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if valid:
            from django.conf import settings

            return HttpResponseRedirect(f"{settings.FRONTEND_URL}/auth/verified")
        from django.conf import settings

        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/auth/verify-email?error=invalid")


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]

    @rate_limit(rate=5, period=3600)
    def post(self, request):
        email = (request.data.get("email") or "").lower().strip()
        user = User.objects.filter(email=email, is_email_verified=False).first()
        if user:
            send_verification_email(user)
        return Response(
            {"detail": "If the account exists and is unverified, a new verification email has been sent."}
        )


class PasswordResetView(APIView):
    permission_classes = [AllowAny]

    @rate_limit(rate=5, period=3600)
    def post(self, request):
        email = (request.data.get("email") or "").lower().strip()
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            send_password_reset_email(user)
            write_audit(request, user=user, action="password.reset_requested")
        return Response(
            {"detail": "If that email exists, a password reset link has been sent."}
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    @rate_limit(rate=5, period=3600)
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        token_obj = (
            PasswordResetToken.objects.select_related("user").filter(token=data["token"]).first()
        )
        if token_obj is None or not token_obj.is_valid:
            return Response(
                {"detail": "Reset link is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = token_obj.user
        user.set_password(data["password"])
        user.save()
        token_obj.used_at = timezone.now()
        token_obj.save(update_fields=["used_at"])
        write_audit(request, user=user, action="password.reset")
        return Response({"detail": "Password updated. You can now sign in."})


# ---------------------------------------------------------------------------
# MFA
# ---------------------------------------------------------------------------
class MFASetupView(APIView):
    permission_classes = [IsAuthenticated]

    @rate_limit(rate=10, period=3600)
    def get(self, request):
        user = request.user
        if user.mfa_enabled:
            return Response(
                {"detail": "MFA is already enabled.", "mfa_enabled": True}
            )
        secret = pyotp.random_base32()
        request.session["mfa_pending_secret"] = secret
        otpauth_url = pyotp.TOTP(secret).provisioning_uri(
            name=user.email, issuer_name=MFA_ISSUER
        )
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4
        )
        qr.add_data(otpauth_url)
        qr.make(fit=True)
        img = qr.make_image(image_factory=SvgPathImage)
        svg_buffer = io.BytesIO()
        img.save(svg_buffer)
        return Response(
            {
                "secret": secret,
                "otpauth_url": otpauth_url,
                "qr_svg": svg_buffer.getvalue().decode("utf-8"),
            }
        )


class MFAConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    @rate_limit(rate=5, period=300)
    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if user.mfa_enabled:
            return Response({"detail": "MFA is already enabled.", "mfa_enabled": True})

        secret = request.session.get("mfa_pending_secret")
        if not secret:
            return Response(
                {"detail": "No pending MFA setup. Call /auth/mfa/setup/ first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not pyotp.TOTP(secret).verify(serializer.validated_data["code"].strip(), valid_window=1):
            return Response(
                {"detail": "Invalid code."}, status=status.HTTP_400_BAD_REQUEST
            )

        plain_codes = MFASecret.generate_recovery_codes()
        mfa_secret, _ = MFASecret.objects.get_or_create(user=user)
        mfa_secret.secret = secret
        mfa_secret.set_recovery_codes(plain_codes)
        mfa_secret.save()
        user.mfa_enabled = True
        user.save(update_fields=["mfa_enabled", "updated_at"])
        request.session.pop("mfa_pending_secret", None)
        write_audit(request, user=user, action="mfa.enabled")
        return Response(
            {
                "mfa_enabled": True,
                "recovery_codes": plain_codes,
                "detail": "MFA enabled. Store these recovery codes somewhere safe — they are shown only once.",
            }
        )


class MFADisableView(APIView):
    permission_classes = [IsAuthenticated]

    @rate_limit(rate=5, period=300)
    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.mfa_enabled:
            return Response({"detail": "MFA is not enabled.", "mfa_enabled": False})
        if not validate_mfa(user, serializer.validated_data["code"]):
            return Response(
                {"detail": "Invalid code."}, status=status.HTTP_400_BAD_REQUEST
            )
        user.mfa_enabled = False
        user.save(update_fields=["mfa_enabled", "updated_at"])
        MFASecret.objects.filter(user=user).delete()
        write_audit(request, user=user, action="mfa.disabled")
        return Response({"detail": "MFA disabled.", "mfa_enabled": False})


class MFARecoveryCodesView(APIView):
    permission_classes = [IsAuthenticated]

    @rate_limit(rate=5, period=300)
    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.mfa_enabled:
            return Response(
                {"detail": "MFA is not enabled."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not validate_mfa(user, serializer.validated_data["code"]):
            return Response(
                {"detail": "Invalid code."}, status=status.HTTP_400_BAD_REQUEST
            )
        plain_codes = MFASecret.generate_recovery_codes()
        mfa_secret = user.mfa_secret
        mfa_secret.set_recovery_codes(plain_codes)
        mfa_secret.save()
        write_audit(request, user=user, action="mfa.recovery_codes_regenerated")
        return Response(
            {
                "codes": plain_codes,
                "detail": "New recovery codes generated. They are shown only once.",
            }
        )


# ---------------------------------------------------------------------------
# Password change / user profile / security
# ---------------------------------------------------------------------------
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @rate_limit(rate=5, period=3600)
    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        write_audit(request, user=user, action="password.changed")
        return Response({"detail": "Password changed."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_user_payload(request.user))

    def patch(self, request):
        serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(_user_payload(user))


class MeSecurityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "email": user.email,
                "email_verified": user.is_email_verified,
                "mfa_enabled": user.mfa_enabled,
                "last_login": user.last_login_at,
                "created_at": user.created_at,
                "org_count": user.org_memberships.count(),
                "sessions_count": AuthSession.objects.filter(
                    user=user, revoked=False
                ).count(),
            }
        )


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------
def _get_org(org_id):
    return get_object_or_404(Organization.objects.filter(is_active=True), id=org_id)


def _require_org_member(request, org):
    membership = OrganizationMembership.objects.filter(org=org, user=request.user).first()
    if membership is None:
        raise PermissionError("You are not a member of this organization.")
    return membership


def _require_org_admin(request, org):
    membership = _require_org_member(request, org)
    if membership.is_admin:
        raise PermissionError("Organization admin rights are required.")
    return membership


class OrgListView(APIView):
    permission_classes = [IsAuthenticated, IsVerified]

    def get(self, request):
        memberships = OrganizationMembership.objects.filter(user=request.user).select_related("org")
        orgs = [m.org for m in memberships]
        return Response(OrganizationSerializer(orgs, many=True, context={"request": request}).data)

    def post(self, request):
        serializer = OrganizationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            org = serializer.save(created_by=request.user)
            OrganizationMembership.objects.create(
                org=org, user=request.user, role="owner"
            )
        write_audit(
            request, user=request.user, org=org, action="org.created",
            entity_type="organization", entity_id=org.id,
        )
        return Response(
            OrganizationSerializer(org, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class OrgDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _org_or_error(self, request, org_id):
        org = _get_org(org_id)
        try:
            _require_org_member(request, org)
        except PermissionError as exc:
            return None, Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return org, None

    def get(self, request, org_id):
        org, error = self._org_or_error(request, org_id)
        if error:
            return error
        return Response(OrganizationSerializer(org, context={"request": request}).data)

    def patch(self, request, org_id):
        org = _get_org(org_id)
        try:
            _require_org_admin(request, org)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        serializer = OrganizationCreateSerializer(org, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        org = serializer.save()
        write_audit(
            request, user=request.user, org=org, action="org.updated",
            entity_type="organization", entity_id=org.id, changes=serializer.validated_data,
        )
        return Response(OrganizationSerializer(org, context={"request": request}).data)

    def delete(self, request, org_id):
        org = _get_org(org_id)
        try:
            _require_org_admin(request, org)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        org.is_active = False
        org.save(update_fields=["is_active", "updated_at"])
        write_audit(
            request, user=request.user, org=org, action="org.deleted",
            entity_type="organization", entity_id=org.id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrgMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        org = _get_org(org_id)
        try:
            _require_org_member(request, org)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        members = OrganizationMembership.objects.filter(org=org).select_related("user")
        return Response(OrganizationMembershipSerializer(members, many=True).data)

    def patch(self, request, org_id, user_id):
        org = _get_org(org_id)
        try:
            _require_org_admin(request, org)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        serializer = RoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = get_object_or_404(
            OrganizationMembership, org=org, user_id=user_id
        )
        old_role = membership.role
        membership.role = serializer.validated_data["role"]
        membership.save(update_fields=["role"])
        write_audit(
            request, user=request.user, org=org, action="org.role_changed",
            entity_type="membership", entity_id=membership.id,
            changes={"user_id": str(user_id), "from": old_role, "to": membership.role},
        )
        return Response(OrganizationMembershipSerializer(membership).data)


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------
class OrgInvitationCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id):
        org = _get_org(org_id)
        try:
            _require_org_admin(request, org)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        serializer = InvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"].lower().strip()
        if OrganizationMembership.objects.filter(org=org, user__email=email).exists():
            return Response(
                {"detail": "A user with this email is already a member."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        existing = Invitation.objects.filter(org=org, email=email, accepted_at__isnull=True).first()
        invitation = existing or Invitation.objects.create(
            org=org, email=email, role=data["role"], invited_by=request.user
        )
        send_invitation_email(invitation)
        write_audit(
            request, user=request.user, org=org, action="invitation.created",
            entity_type="invitation", entity_id=invitation.id,
            changes={"email": email, "role": data["role"]},
        )
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)


class PendingInvitationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        invitations = Invitation.objects.filter(
            email=request.user.email, accepted_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).select_related("org")
        return Response(InvitationSerializer(invitations, many=True).data)


class InvitationAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, invitation_id):
        invitation = get_object_or_404(Invitation, id=invitation_id)
        if invitation.email.lower() != request.user.email.lower():
            return Response(
                {"detail": "This invitation was sent to a different email address."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not invitation.is_valid:
            return Response(
                {"detail": "This invitation is expired or already used."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            membership, created = OrganizationMembership.objects.get_or_create(
                org=invitation.org,
                user=request.user,
                defaults={"role": invitation.role},
            )
            if not created and membership.role != invitation.role:
                pass  # keep the existing (higher) role
            invitation.accepted_at = timezone.now()
            invitation.save(update_fields=["accepted_at"])
        write_audit(
            request, user=request.user, org=invitation.org, action="invitation.accepted",
            entity_type="invitation", entity_id=invitation.id,
        )
        return Response(
            {"detail": "Invitation accepted.", "org": OrganizationSerializer(
                invitation.org, context={"request": request}
            ).data}
        )


class InvitationDeclineView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, invitation_id):
        invitation = get_object_or_404(Invitation, id=invitation_id)
        if invitation.email.lower() != request.user.email.lower():
            return Response(
                {"detail": "This invitation was sent to a different email address."},
                status=status.HTTP_403_FORBIDDEN,
            )
        invitation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Clients (advisor-facing)
# ---------------------------------------------------------------------------
class ClientsView(APIView):
    permission_classes = [IsAuthenticated, CanManageClients]
    def get(self, request):
        from apps.portfolios.services import portfolio_summary

        user = request.user
        org_ids = list(
            OrganizationMembership.objects.filter(user=user).values_list("org_id", flat=True)
        )
        role = (
            OrganizationMembership.objects.filter(user=user).order_by("-created_at").first()
        )
        if role and role.role == "advisor":
            links = AdvisorClient.objects.filter(client=user, status="active").select_related("client")
        else:
            links = AdvisorClient.objects.filter(
                status="active",
                client__org_memberships__org_id__in=org_ids,
            ).select_related("client").distinct()

        results = []
        for link in links:
            client = link.client
            portfolios = []
            if link.portfolio_id:
                portfolio_qs = [link.portfolio]
            else:
                portfolio_qs = list(
                    client.portfolios.filter(is_archived=False)
                )
            for portfolio in portfolio_qs:
                summary = portfolio_summary(portfolio)
                portfolios.append(
                    {
                        "id": portfolio.id,
                        "name": portfolio.name,
                        "currency": portfolio.currency,
                        "value": summary["total_value"],
                        "return_pct": summary["return_pct"],
                    }
                )
            results.append(
                {
                    "client_id": client.id,
                    "email": client.email,
                    "full_name": client.full_name,
                    "status": link.status,
                    "assigned_at": link.assigned_at,
                    "portfolios": portfolios,
                }
            )
        return Response(results)


class ClientsAumView(APIView):
    """GET /clients/aum/ — advisor AUM dashboard for active clients.

    Returns aggregate AUM, average YTD return, net YTD flows and the
    underlying client portfolios (values via portfolio_summary).
    """

    permission_classes = [IsAuthenticated, CanManageClients]

    def get(self, request):
        from datetime import date
        from decimal import Decimal

        from apps.analytics.services import returns_payload
        from apps.portfolios.models import Transaction
        from apps.portfolios.services import portfolio_summary

        ZERO = Decimal("0")
        user = request.user
        links = AdvisorClient.objects.filter(
            advisor=user, status="active"
        ).select_related("client", "portfolio")

        client_ids = set()
        portfolios = []
        aum = ZERO
        net_flows = ZERO
        ytd_returns = []
        ytd_start = date(date.today().year, 1, 1)

        for link in links:
            client = link.client
            client_ids.add(client.id)
            if link.portfolio_id:
                portfolio_qs = [link.portfolio]
            else:
                portfolio_qs = list(client.portfolios.filter(is_archived=False))
            for portfolio in portfolio_qs:
                summary = portfolio_summary(portfolio)
                value = summary["total_value"]
                aum += value
                try:
                    returns = returns_payload(portfolio, ytd_start, date.today(), None)
                    return_ytd_pct = returns["total_return_pct"]
                except Exception:
                    return_ytd_pct = None
                if return_ytd_pct is not None:
                    ytd_returns.append(return_ytd_pct)
                for tx in Transaction.objects.filter(
                    portfolio=portfolio, date__gte=ytd_start
                ):
                    if tx.type == "deposit":
                        net_flows += tx.amount
                    elif tx.type == "withdrawal":
                        net_flows -= tx.amount
                portfolios.append(
                    {
                        "id": portfolio.id,
                        "name": portfolio.name,
                        "owner_email": client.email,
                        "value": value,
                        "return_ytd_pct": return_ytd_pct,
                    }
                )

        avg_return = round(sum(ytd_returns) / len(ytd_returns), 4) if ytd_returns else 0.0
        return Response(
            {
                "clients_count": len(client_ids),
                "aum": aum,
                "avg_return_ytd_pct": avg_return,
                "net_flows_ytd": net_flows,
                "portfolios": portfolios,
            }
        )


class ClientAssignView(APIView):
    permission_classes = [IsAuthenticated, CanManageClients]

    def post(self, request):
        client_id = request.data.get("client_id")
        portfolio_id = request.data.get("portfolio_id")
        notes = request.data.get("notes", "")
        can_edit = bool(request.data.get("can_edit", False))

        client = get_object_or_404(User, id=client_id)
        if client == request.user:
            return Response(
                {"detail": "You cannot assign yourself as a client."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        portfolio = None
        if portfolio_id:
            from apps.portfolios.models import Portfolio

            portfolio = get_object_or_404(Portfolio, id=portfolio_id)

        link, created = AdvisorClient.objects.update_or_create(
            advisor=request.user,
            client=client,
            defaults={
                "portfolio": portfolio,
                "notes": notes,
                "can_edit": can_edit,
                "status": "active",
            },
        )
        write_audit(
            request, user=request.user, action="client.assigned",
            entity_type="advisor_client", entity_id=link.id,
            changes={"client_id": str(client.id), "created": created},
        )
        return Response(
            AdvisorClientSerializer(link).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ClientSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, client_id):
        from apps.portfolios.services import portfolio_summary

        client = get_object_or_404(User, id=client_id)
        link = AdvisorClient.objects.filter(advisor=request.user, client=client, status="active").first()
        if link is None:
            return Response(
                {"detail": "You do not have access to this client."},
                status=status.HTTP_403_FORBIDDEN,
            )
        portfolios = []
        if link.portfolio_id:
            portfolio_qs = [link.portfolio]
        else:
            portfolio_qs = list(client.portfolios.filter(is_archived=False))
        for portfolio in portfolio_qs:
            summary = portfolio_summary(portfolio)
            portfolios.append(
                {
                    "id": portfolio.id,
                    "name": portfolio.name,
                    "currency": portfolio.currency,
                    "value": summary["total_value"],
                    "return_pct": summary["return_pct"],
                }
            )
        payload = ClientSummarySerializer(
            {
                "client_id": client.id,
                "email": client.email,
                "full_name": client.full_name,
                "status": link.status,
                "assigned_at": link.assigned_at,
                "portfolios": portfolios,
            }
        ).data
        return Response(payload)


# Re-export helpers for permission classes that operate on objects.
__all__ = [
    "RegisterView", "LoginView", "RefreshView", "VerifyEmailView",
    "ResendVerificationView", "PasswordResetView", "PasswordResetConfirmView",
    "MFASetupView", "MFAConfirmView", "MFADisableView", "MFARecoveryCodesView",
    "ChangePasswordView", "MeView", "MeSecurityView",
    "AuthSessionListView", "AuthSessionRevokeView", "AuthSessionRevokeAllView",
    "OrgListView", "OrgDetailView", "OrgMembersView",
    "OrgInvitationCreateView", "PendingInvitationsView",
    "InvitationAcceptView", "InvitationDeclineView",
    "ClientsView", "ClientAssignView", "ClientSummaryView", "ClientsAumView",
]
