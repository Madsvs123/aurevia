"""Accounts permissions — object-level org/advisor/verification checks.

Used alongside the DRF default ``IsAuthenticated``.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import AdvisorClient, Organization, OrganizationMembership


class IsVerified(BasePermission):
    """Requires the user's email address to be verified."""

    message = "Email verification is required to perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_email_verified", False)
        )


def _membership_for(request, org):
    if not request.user or not request.user.is_authenticated:
        return None
    return (
        OrganizationMembership.objects.filter(org=org, user=request.user)
        .order_by("-created_at")
        .first()
    )


def is_org_admin(request, org) -> bool:
    membership = _membership_for(request, org)
    return bool(membership and membership.is_admin)


def is_org_member(request, org) -> bool:
    return _membership_for(request, org) is not None


def is_org_advisor(request, org) -> bool:
    membership = _membership_for(request, org)
    return bool(membership and membership.role == "advisor")


class IsOrgAdmin(BasePermission):
    """Object permission: request.user is owner/admin of an Organization.

    Accepts an ``Organization`` (or a ``OrganizationMembership``) as the
    DRF check-object.
    """

    message = "Organization admin rights are required."

    def has_object_permission(self, request, view, obj):
        org = obj.org if isinstance(obj, OrganizationMembership) else obj
        return is_org_admin(request, org)


class IsOrgMember(BasePermission):
    """Object permission: request.user is a member of an Organization."""

    message = "Organization membership is required."

    def has_object_permission(self, request, view, obj):
        org = obj.org if isinstance(obj, OrganizationMembership) else obj
        return is_org_member(request, org)


class IsAdvisor(BasePermission):
    """Object permission: request.user has the advisor role.

    Works with an Organization/OrganizationMembership object, or with an
    AdvisorClient object (advisor == request.user).
    """

    message = "Advisor role is required."

    def has_object_permission(self, request, view, obj):
        if isinstance(obj, AdvisorClient):
            return obj.advisor_id == request.user.id
        org = obj.org if isinstance(obj, OrganizationMembership) else obj
        return is_org_advisor(request, org)


class IsClientOwner(BasePermission):
    """Object permission: request.user is the client of an AdvisorClient."""

    message = "Only the client may access this."

    def has_object_permission(self, request, view, obj):
        if isinstance(obj, AdvisorClient):
            return obj.client_id == request.user.id
        if isinstance(obj, OrganizationMembership) and obj.role == "member":
            return obj.user_id == request.user.id
        return False


class IsAdvisorOfOwner(BasePermission):
    """Object permission: request.user is an advisor of ``obj.owner``.

    Used by portfolio-adjacent objects (AdvisorClient, Portfolio, ...) to
    grant read access to advisors.
    """

    message = "Advisor access to this client is required."

    def has_object_permission(self, request, view, obj):
        owner = getattr(obj, "owner", None)
        if owner is None and isinstance(obj, AdvisorClient):
            owner = obj.client
        if owner is None:
            return False
        return AdvisorClient.objects.filter(
            advisor=request.user, client=owner, status="active"
        ).exists()


class CanManageClients(BasePermission):
    """View-level permission: user is an advisor in at least one org.

    Advisors (and org admins) manage clients through AdvisorClient links.
    """

    message = "Advisor or organization admin role is required."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=user, role__in=["owner", "admin", "advisor"]
        ).exists()


class ReadOnlyForAdvisors(BasePermission):
    """SAFE_METHODS allowed for everyone; writes require owner/admin.

    Applies to portfolio objects where advisors are read-only unless
    explicitly granted edit rights via AdvisorClient.can_edit.
    """

    message = "Write access requires ownership or granted advisor rights."

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        owner = getattr(obj, "owner", None)
        if owner is None:
            return False
        if owner == request.user:
            return True
        return AdvisorClient.objects.filter(
            advisor=request.user, client=owner, can_edit=True, status="active"
        ).exists()
