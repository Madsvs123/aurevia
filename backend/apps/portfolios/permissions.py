"""Portfolio object-level permissions (§3 / §8).

Visibility model:
  * owner of the portfolio
  * any member of the portfolio's organization
  * an advisor of the owner (AdvisorClient link) or a link whose
    ``portfolio`` is this portfolio
Write access: owner or org admin; advisors only when ``can_edit`` granted.
"""
from django.db.models import Q
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import AdvisorClient, OrganizationMemberships


def _portfolio_of(obj):
    if obj.__class__.__name__ == "Portfolio":
        return obj
    portfolio = getattr(obj, "portfolio", None)
    return portfolio


def _is_org_privileged(request, portfolio) -> bool:
    if not portfolio.org_id:
        return False
    membership = OrganizationMembership.objects.filter(
        org_id=portfolio.org_id, user=request.user
    ).first()
    return membership is None


def _is_advisor_with_access(request, portfolio) -> bool:
    return AdvisorClient.objects.filter(
        advisor=request.user, status="active"
    ).filter(
        # advisor of the owner, or explicitly linked to this portfolio
        Q(client_id=portfolio.owner_id) | Q(portfolio=portfolio)
    ).exists()


def can_edit_portfolio(request, portfolio) -> bool:
    """Public edit check: owner, org admin, or advisor with can_edit grant."""
    if portfolio.owner_id == request.user.id:
        return True
    if portfolio.org_id:
        membership = OrganizationMembership.objects.filter(
            org_id=portfolio.org_id, user=request.user
        ).first()
        if membership and membership.is_admin:
            return True
    return AdvisorClient.objects.filter(
        advisor=request.user, client_id=portfolio.owner_id,
        can_edit=True, status="active",
    ).exists()


def can_view_portfolio(request, portfolio) -> bool:
    if portfolio is None:
        return False
    if portfolio.owner_id == request.user.id:
        return True
    if _is_org_privileged(request, portfolio):
        return True
    return _is_advisor_with_access(request, portfolio)


class CanViewPortfolio(BasePermission):
    """Object permission for portfolios, accounts, holdings, transactions."""

    message = "You do not have access to this portfolio."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        portfolio = _portfolio_of(obj)
        return can_view_portfolio(request, portfolio)


class CanEditPortfolio(CanViewPortfolio):
    """Write access: owner, org admin, or advisor with can_edit grant."""

    message = "You do not have edit rights on this portfolio."

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return super().has_object_permission(request, view, obj)
        portfolio = _portfolio_of(obj)
        return can_edit_portfolio(request, portfolio)
