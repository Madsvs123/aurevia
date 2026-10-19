"""Accounts URL routes (mounted under /api/v1/)."""
from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    # Auth
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"
    path("auth/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path(
        "auth/verify-email/<uuid:token>/",
        views.VerifyEmailView.as_view(),
        name="auth-verify-email",
    ),
    path(
        "auth/resend-verification/",
        views.ResendVerificationView.as_view(),
        name="auth-resend-verification",
    ),
    path("auth/password-reset/", views.PasswordResetView.as_view(), name="auth-password-reset"),
    path(
        "auth/password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("auth/mfa/setup/", views.MFASetupView.as_view(), name="auth-mfa-setup"),
    path("auth/mfa/confirm/", views.MFAConfirmView.as_view(), name="auth-mfa-confirm"),
    path("auth/mfa/disable/", views.MFADisableView.as_view(), name="auth-mfa-disable"),
    path(
        "auth/mfa/recovery-codes/",
        views.MFARecoveryCodesView.as_view(),
        name="auth-mfa-recovery-codes",
    ),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    # Sessions / device management
    path("auth/sessions/", views.AuthSessionListView.as_view(), name="auth-sessions"),
    path(
        "auth/sessions/revoke-all/",
        views.AuthSessionRevokeAllView.as_view(),
        name="auth-sessions-revoke-all",
    ),
    path(
        "auth/sessions/<uuid:session_id>/revoke/",
        views.AuthSessionRevokeView.as_view(),
        name="auth-sessions-revoke",
    ),
    # Users
    path("users/me/", views.MeView.as_view(), name="users-me"),
    path("users/me/security/", views.MeSecurityView.as_view(), name="users-me-security"),
    # Organizations
    path("orgs/", views.OrgListView.as_view(), name="orgs-list"),
    path("orgs/<uuid:org_id>/", views.OrgDetailView.as_view(), name="orgs-detail"),
    path(
        "orgs/<uuid:org_id>/members/",
        views.OrgMembersView.as_view(),
        name="orgs-members",
    ),
    path(
        "orgs/<uuid:org_id>/members/<uuid:user_id>/",
        views.OrgMembersView.as_view(),
        name="orgs-member-detail",
    ),
    path(
        "orgs/<uuid:org_id>/invitations/",
        views.OrgInvitationCreateView.as_view(),
        name="orgs-invitations",
    ),
    path(
        "invitations/pending/",
        views.PendingInvitationsView.as_view(),
        name="invitations-pending",
    ),
    path(
        "invitations/<uuid:invitation_id>/accept/",
        views.InvitationAcceptView.as_view(),
        name="invitations-accept",
    ),
    path(
        "invitations/<uuid:invitation_id>/",
        views.InvitationDeclineView.as_view(),
        name="invitations-decline",
    ),
    # Advisor clients
    path("clients/", views.ClientsView.as_view(), name="clients-list"),
    path("clients/aum/", views.ClientsAumView.as_view(), name="clients-aum"),
    path("clients/assign/", views.ClientAssignView.as_view(), name="clients-assign"),
    path(
        "clients/<uuid:client_id>/summary/",
        views.ClientSummaryView.as_view(),
        name="clients-summary",
    ),
]
