"""Portfolio views — portfolios, holdings, transactions, accounts, analytics-lite."""
from datetime import date
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AdvisorClient
from apps.accounts.services import write_audit
from apps.core.models import Instrument

from .models import (
    Account,
    ContributionPlan,
    Holding,
    Portfolio,
    Transaction,
)
from .permissions import CanEditPortfolio, CanViewPortfolio, can_edit_portfolio
from .serializers import (
    AccountDetailSerializer,
    AccountSerializer,
    ContributionPlanSerializer,
    HoldingSerializer,
    PortfolioCreateSerializer,
    PortfolioSerializer,
    TargetAllocationSerializer,
    TransactionSerializer,
)
from .services import (
    REBALANCE_TOLERANCE,
    allocation,
    daily_value_series,
    duplicate_portfolio,
    holdings_with_prices,
    income_report,
    instrument_for_class,
    performance_series,
    rebalance_suggestions,
    recompute_holdings,
    replace_targets,
    resample_series,
    target_allocation_state,
)


def _visible_portfolios(user):
    """Portfolios the user may see: own, org-member, advisor-linked."""
    own = Q(owner=user)
    org_ids = list(
        user.org_memberships.values_list("org_id", flat=True)
    )
    org = Q(org_id__in=org_ids) if org_ids else Q(pk__in=[])
    advisor_portfolio_ids = list(
        AdvisorClient.objects.filter(advisor=user, status="active")
        .exclude(portfolio__isnull=True)
        .values_list("portfolio_id", flat=True)
    )
    advisor_owned = list(
        AdvisorClient.objects.filter(advisor=user, status="active")
        .values_list("client_id", flat=True)
    )
    advisor = Q(owner_id__in=advisor_owned) if advisor_owned else Q(pk__in=[])
    linked = Q(pk__in=advisor_portfolio_ids) if advisor_portfolio_ids else Q(pk__in=[])
    return Portfolio.objects.filter(is_archived=False).filter(
        own | org | advisor | linked
    ).distinct()


class PortfolioViewSet(viewsets.GenericViewSet):
    """/api/v1/portfolios/... — CRUD + holdings/transactions/analytics."""

    queryset = Portfolio.objects.none()
    permission_classes = [IsAuthenticated]
    lookup_field = "pk"

    def get_queryset(self):
        return _visible_portfolios(self.request.user)

    def get_object(self):
        obj = get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, obj)
        return obj

    def list(self, request):
        portfolios = self.get_queryset()
        return Response(
            PortfolioSerializer(
                portfolios, many=True, context={"request": request}
            ).data
        )

    def create(self, request):
        self.check_permissions(request)
        if not request.user.is_email_verified:
            return Response(
                {"detail": "Email verification is required to create a portfolio."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = PortfolioCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        with db_transaction.atomic():
            portfolio = serializer.save(owner=request.user)
        write_audit(
            request, user=request.user, org=portfolio.org,
            action="portfolio.created", entity_type="portfolio", entity_id=portfolio.id,
        )
        return Response(
            PortfolioSerializer(portfolio, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def retrieve(self, request, pk=None):
        portfolio = self.get_object()
        return Response(
            PortfolioSerializer(portfolio, context={"request": request}).data
        )

    def partial_update(self, request, pk=None):
        portfolio = self.get_object()
        self.check_object_permissions(request, portfolio)
        if not can_edit_portfolio(request, portfolio):
            return Response(
                {"detail": "You do not have edit rights on this portfolio."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = PortfolioCreateSerializer(
            portfolio, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        portfolio = serializer.save()
        return Response(
            PortfolioSerializer(portfolio, context={"request": request}).data
        )

    def destroy(self, request, pk=None):
        portfolio = self.get_object()
        self.check_object_permissions(request, portfolio)
        if not can_edit_portfolio(request, portfolio):
            return Response(
                {"detail": "You do not have edit rights on this portfolio."},
                status=status.HTTP_403_FORBIDDEN,
            )
        portfolio.archive()
        write_audit(
            request, user=request.user, org=portfolio.org,
            action="portfolio.archived", entity_type="portfolio", entity_id=portfolio.id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Holdings
    # ------------------------------------------------------------------
    @action(detail=True, methods=["get"])
    def holdings(self, request, pk=None):
        portfolio = self.get_object()
        rows, total = holdings_with_prices(portfolio)
        ids = [r["instrument"].id for r in rows]
        queryset = (
            Holding.objects.filter(portfolio=portfolio, instrument_id__in=ids)
            if ids
            else Holding.objects.none()
        )
        serializer = HoldingSerializer(
            queryset,
            many=True,
            context={"request": request, "holding_rows": rows},
        )
        return Response(serializer.data)

    # ------------------------------------------------------------------
    # Transactions
    # ------------------------------------------------------------------
    @action(detail=True, methods=["get", "post"])
    def transactions(self, request, pk=None):
        portfolio = self.get_object()
        if request.method == "POST":
            return self._create_transaction(request, portfolio)
        queryset = Transaction.objects.filter(portfolio=portfolio)
        txn_type = request.query_params.get("type")
        if txn_type:
            queryset = queryset.filter(type=txn_type)
        from_date = request.query_params.get("from")
        if from_date:
            queryset = queryset.filter(date__gte=from_date)
        to_date = request.query_params.get("to")
        if to_date:
            queryset = queryset.filter(date__lte=to_date)
        page = self.paginate_queryset(queryset)
        serializer = TransactionSerializer(
            page if page is not None else queryset, many=True
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def _create_transaction(self, request, portfolio):
        serializer = TransactionSerializer(
            data=request.data,
            context={"request": request, "portfolio": portfolio},
        )
        serializer.is_valid(raise_exception=True)
        with db_transaction.atomic():
            transaction_obj = serializer.save()
            recompute_holdings(portfolio)
        write_audit(
            request, user=request.user, org=portfolio.org,
            action="transaction.created", entity_type="transaction",
            entity_id=transaction_obj.id,
            changes={"type": transaction_obj.type, "date": str(transaction_obj.date)},
        )
        return Response(
            TransactionSerializer(transaction_obj).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="transactions/summary")
    def transactions_summary(self, request, pk=None):
        portfolio = self.get_object()
        queryset = Transaction.objects.filter(portfolio=portfolio)
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        if from_date:
            queryset = queryset.filter(date__gte=from_date)
        if to_date:
            queryset = queryset.filter(date__lte=to_date)
        txs = list(queryset)

        by_type = {}
        total_buys = Decimal("0")
        total_sells = Decimal("0")
        dividends = Decimal("0")
        fees = Decimal("0")
        deposits = Decimal("0")
        withdrawals = Decimal("0")
        for tx in txs:
            entry = by_type.setdefault(
                tx.type, {"type": tx.type, "count": 0, "total": Decimal("0")}
            )
            entry["count"] += 1
            entry["total"] += tx.amount
            if tx.type == "buy":
                total_buys += tx.amount + tx.fee
            elif tx.type == "sell":
                total_sells += tx.amount - tx.fee
            elif tx.type == "dividend":
                dividends += tx.amount
            elif tx.type == "fee":
                fees += tx.amount
            elif tx.type == "deposit":
                deposits += tx.amount
            elif tx.type == "withdrawal":
                withdrawals += tx.amount

        net_cashflow = deposits - withdrawals + dividends + fees
        return Response(
            {
                "by_type": [
                    {
                        "type": e["type"],
                        "count": e["count"],
                        "total": str(e["total"]),
                    }
                    for e in by_type.values()
                ],
                "total_buys": str(total_buys),
                "total_sells": str(total_sells),
                "dividends": str(dividends),
                "fees": str(fees),
                "net_cashflow": str(net_cashflow),
            }
        )

    # ------------------------------------------------------------------
    # Performance / allocation / history / income
    # ------------------------------------------------------------------
    @action(detail=True, methods=["get"])
    def performance(self, request, pk=None):
        portfolio = self.get_object()
        benchmark = request.query_params.get("benchmark")
        data = performance_series(
            portfolio,
            from_date=request.query_params.get("from"),
            to_date=request.query_params.get("to"),
            benchmark_symbol=benchmark,
        )
        return Response(data)

    @action(detail=True, methods=["get"])
    def allocation(self, request, pk=None):
        portfolio = self.get_object()
        by = request.query_params.get("by", "asset_class")
        return Response(allocation(portfolio, by=by))

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        portfolio = self.get_object()
        interval = request.query_params.get("interval", "day")
        series = daily_value_series(portfolio)
        return Response(resample_series(series, interval))

    @action(detail=True, methods=["get"])
    def income(self, request, pk=None):
        portfolio = self.get_object()
        data = income_report(
            portfolio,
            from_date=request.query_params.get("from"),
            to_date=request.query_params.get("to"),
        )
        return Response(data)

    # ------------------------------------------------------------------
    # Watchlist link (quick add/remove from a portfolio's holdings)
    # ------------------------------------------------------------------
    @action(detail=True, methods=["get", "post"])
    def watchlist(self, request, pk=None):
        portfolio = self.get_object()
        from django.apps import apps as django_apps

        watchlists_installed = django_apps.is_installed("apps.watchlists")
        if not watchlists_installed:
            return Response(
                {"detail": "The watchlists module is not available yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        Watchlist = django_apps.get_model("watchlists", "Watchlist")
        WatchlistItem = django_apps.get_model("watchlists", "WatchlistItem")
        default_watchlist, _ = Watchlist.objects.get_or_create(
            owner=request.user, is_default=True, defaults={"name": "Watchlist"}
        )
        if request.method == "POST":
            symbol = (request.data.get("symbol") or "").strip()
            instrument = Instrument.objects.filter(symbol__iexact=symbol).first()
            if instrument is None:
                return Response(
                    {"detail": f"Unknown instrument '{symbol}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            item, created = WatchlistItem.objects.get_or_create(
                watchlist=default_watchlist, instrument=instrument
            )
            return Response(
                {"added": created, "instrument": instrument.symbol},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        symbols = list(
            Holding.objects.filter(portfolio=portfolio)
            .exclude(quantity__lte=0)
            .values_list("instrument__symbol", flat=True)
        )
        return Response(
            {
                "instruments": [
                    {"symbol": s, "on_watchlist": WatchlistItem.objects.filter(
                        watchlist=default_watchlist, instrument__symbol=s
                    ).exists()}
                    for s in symbols
                ]
            }
        )

    # ------------------------------------------------------------------
    # Accounts (nested)
    # ------------------------------------------------------------------
    @action(detail=True, methods=["get", "post"])
    def accounts(self, request, pk=None):
        portfolio = self.get_object()
        if request.method == "POST":
            serializer = AccountSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            account = serializer.save(portfolio=portfolio)
            write_audit(
                request, user=request.user, org=portfolio.org,
                action="account.created", entity_type="account", entity_id=account.id,
            )
            return Response(
                AccountDetailSerializer(account).data,
                status=status.HTTP_201_CREATED,
            )
        accounts = portfolio.accounts.filter(is_active=True)
        return Response(AccountDetailSerializer(accounts, many=True).data)

    # ------------------------------------------------------------------
    # Target allocation & rebalancing
    # ------------------------------------------------------------------
    @action(detail=True, methods=["get", "put"])
    def targets(self, request, pk=None):
        portfolio = self.get_object()
        if request.method == "PUT":
            if not can_edit_portfolio(request, portfolio):
                return Response(
                    {"detail": "You do not have edit rights on this portfolio."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            raw = request.data.get("items", request.data)
            if not isinstance(raw, list):
                return Response(
                    {"detail": "Expected a list of target rows or {'items': [...]}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            rows = []
            for entry in raw
                serializer = TargetAllocationSerializer(data=entry)
                serializer.is_valid(raise_exception=True)
                rows.append(serializer.validated_data)
            return Response(replace_targets(portfolio, rows))
        return Response(target_allocation_state(portfolio))

    @action(detail=True, methods=["get"], url_path="rebalance-suggestions")
    def rebalance_suggestions(self, request, pk=None):
        portfolio = self.get_object()
        return Response(rebalance_suggestions(portfolio))

    @action(detail=True, methods=["post"], url_path="rebalance/apply")
    def rebalance_apply(self, request, pk=None):
        portfolio = self.get_object()
        if not can_edit_portfolio(request, portfolio):
            return Response(
                {"detail": "You do not have edit rights on this portfolio."},
                status=status.HTTP_403_FORBIDDEN,
            )
        items = request.data.get("items", [])
        if not isinstance(items, list):
            return Response(
                {"detail": "Expected {'items': [...]}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        account = portfolio.accounts.filter(is_active=True).order_by("created_at").first()
        if account is None:
            return Response(
                {"detail": "Portfolio has no active account to trade against."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        today = date.today()
        created_ids = []
        skipped = []
        with db_transaction.atomic():
            for entry in items:
                label = str(entry.get("label") or "").strip()
                action = str(entry.get("action") or "").strip().lower()
                est_amount = entry.get("est_amount")
                if not label or action not in ("buy", "sell") or est_amount is None:
                    skipped.append({"label": label, "reason": "invalid item"})
                    continue
                try:
                    amount = Decimal(str(est_amount))
                except Exception:
                    skipped.append({"label": label, "reason": "invalid est_amount"})
                    continue
                if amount <= Decimal("0"):
                    skipped.append({"label": label, "reason": "non-positive amount"})
                    continue
                instrument = Instrument.objects.filter(symbol__iexact=label).first()
                if instrument is None:
                    instrument = instrument_for_class(portfolio, label, action)
                if instrument is None:
                    skipped.append(
                        {"label": label, "reason": "no matching instrument"}
                    )
                    continue
                latest = instrument.latest_price()
                price = latest["close"] if latest else None
                if not price:
                    skipped.append({"label": label, "reason": "no price data"})
                    continue
                quantity = (amount / price).quantize(Decimal("0.00000001"))
                if action == "sell":
                    held = (
                        Holding.objects.filter(portfolio=portfolio, instrument=instrument)
                        .aggregate(total=Sum("quantity"))["total"]
                        or Decimal("0")
                    )
                    if quantity > held + REBALANCE_TOLERANCE:
                        skipped.append(
                            {"label": label, "reason": "exceeds holdings"}
                        )
                        continue
                tx = Transaction.objects.create(
                    portfolio=portfolio,
                    account=account,
                    instrument=instrument,
                    type=action,
                    quantity=quantity,
                    price=price,
                    amount=amount,
                    fee=Decimal("0"),
                    currency=portfolio.currency,
                    date=today,
                    notes=f"Rebalance: {label}",
                    created_by=request.user,
                )
                created_ids.append(str(tx.id))
            recompute_holdings(portfolio)
        if created_ids:
            from apps.notifications.services import notify

            notify(
                request.user,
                "rebalance",
                "Portfolio rebalanced",
                f"Applied {len(created_ids)} rebalance trade(s) to '{portfolio.name}'.",
                data={
                    "portfolio_id": str(portfolio.id),
                    "created": created_ids,
                },
            )
        write_audit(
            request, user=request.user, org=portfolio.org,
            action="portfolio.rebalanced", entity_type="portfolio",
            entity_id=portfolio.id,
            changes={"created": created_ids, "skipped": skipped},
        )
        return Response(
            {"created": created_ids, "holdings_recomputed": True, "skipped": skipped}
        )

    # ------------------------------------------------------------------
    # Duplication
    # ------------------------------------------------------------------
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        portfolio = self.get_object()
        if not can_edit_portfolio(request, portfolio):
            return Response(
                {"detail": "You do not have edit rights on this portfolio."},
                status=status.HTTP_403_FORBIDDEN,
            )
        with db_transaction.atomic():
            new_portfolio = duplicate_portfolio(
                portfolio, owner=request.user, created_by=request.user
            )
        write_audit(
            request, user=request.user, org=new_portfolio.org,
            action="portfolio.duplicated", entity_type="portfolio",
            entity_id=new_portfolio.id,
            changes={"source": str(portfolio.id)},
        )
        return Response(
            PortfolioSerializer(new_portfolio, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    # ------------------------------------------------------------------
    # Contribution plans (recurring deposits)
    # ------------------------------------------------------------------
    @action(detail=True, methods=["get", "post"], url_path="contribution-plans")
    def contribution_plans(self, request, pk=None):
        portfolio = self.get_object()
        if request.method == "POST":
            if not can_edit_portfolio(request, portfolio):
                return Response(
                    {"detail": "You do not have edit rights on this portfolio."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = ContributionPlanSerializer(
                data=request.data,
                context={"request": request, "portfolio": portfolio},
            )
            serializer.is_valid(raise_exception=True)
            plan = serializer.save()
            return Response(
                ContributionPlanSerializer(plan).data,
                status=status.HTTP_201_CREATED,
            )
        plans = portfolio.contribution_plans.all()
        return Response(ContributionPlanSerializer(plans, many=True).data)


# ---------------------------------------------------------------------------
# Global account + transaction detail routes
# ---------------------------------------------------------------------------
class AccountDetailView(APIView):
    permission_classes = [IsAuthenticated, CanEditPortfolio]

    def get_object(self, account_id):
        account = get_object_or_404(
            Account.objects.select_related("portfolio"), id=account_id
        )
        self.check_object_permissions(self.request, account)
        return account

    def get(self, request, account_id):
        account = self.get_object(account_id)
        return Response(AccountDetailSerializer(account).data)

    def patch(self, request, account_id):
        account = self.get_object(account_id)
        serializer = AccountSerializer(account, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        account = serializer.save()
        return Response(AccountDetailSerializer(account).data)

    def delete(self, request, account_id):
        account = self.get_object(account_id)
        account.is_active = False
        account.save(update_fields=["is_active", "updated_at"])
        write_audit(
            request, user=request.user, org=account.portfolio.org,
            action="account.deleted", entity_type="account", entity_id=account.id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountBalanceView(APIView):
    permission_classes = [IsAuthenticated, CanViewPortfolio]

    def get(self, request, account_id):
        account = get_object_or_404(
            Account.objects.select_related("portfolio"), id=account_id
        )
        self.check_object_permissions(self.request, account)
        from .services import account_cash_balance, holdings_with_prices

        cash = account_cash_balance(account)
        rows, _ = holdings_with_prices(account.portfolio)
        market_value = sum(
            (r["market_value"] for r in rows if r["account"] and r["account"].id == account.id),
            Decimal("0"),
        )
        return Response(
            {
                "balance": str(cash + market_value),
                "cash": str(cash),
                "market_value": str(market_value),
                "currency": account.currency,
                "as_of": date.today().isoformat(),
            }
        )


class TransactionDetailView(APIView):
    permission_classes = [IsAuthenticated, CanEditPortfolio]

    def get_object(self, transaction_id):
        transaction_obj = get_object_or_404(
            Transaction.objects.select_related("portfolio"), id=transaction_id
        )
        self.check_object_permissions(self.request, transaction_obj)
        return transaction_obj

    def get(self, request, transaction_id):
        transaction_obj = self.get_object(transaction_id)
        return Response(TransactionSerializer(transaction_obj).data)

    def patch(self, request, transaction_id):
        transaction_obj = self.get_object(transaction_id)
        serializer = TransactionSerializer(
            transaction_obj,
            data=request.data,
            partial=True,
            context={"request": request, "portfolio": transaction_obj.portfolio},
        )
        serializer.is_valid(raise_exception=True)
        with db_transaction.atomic():
            updated = serializer.save()
            recompute_holdings(transaction_obj.portfolio)
        write_audit(
            request, user=request.user, org=transaction_obj.portfolio.org,
            action="transaction.updated", entity_type="transaction", entity_id=transaction_obj.id,
        )
        return Response(TransactionSerializer(updated).data)

    def delete(self, request, transaction_id):
        """Soft-delete + reverse holdings recompute."""
        transaction_obj = self.get_object(transaction_id)
        portfolio = transaction_obj.portfolio
        with db_transaction.atomic():
            transaction_obj.deleted_at = timezone.now()
            transaction_obj.save(update_fields=["deleted_at", "updated_at"])
            recompute_holdings(portfolio)
        write_audit(
            request, user=request.user, org=portfolio.org,
            action="transaction.deleted", entity_type="transaction",
            entity_id=transaction_obj.id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ContributionPlanDetailView(APIView):
    """PATCH/DELETE /api/v1/contribution-plans/<uuid:plan_id>/ (owner + edit)."""

    permission_classes = [IsAuthenticated, CanEditPortfolio]

    def get_object(self, plan_id):
        plan = get_object_or_404(
            ContributionPlan.objects.select_related("portfolio"), id=plan_id
        )
        self.check_object_permissions(self.request, plan)
        return plan

    def patch(self, request, plan_id):
        plan = self.get_object(plan_id)
        serializer = ContributionPlanSerializer(
            plan,
            data=request.data,
            partial=True,
            context={"request": request, "portfolio": plan.portfolio},
        )
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        return Response(ContributionPlanSerializer(plan).data)

    def delete(self, request, plan_id):
        plan = self.get_object(plan_id)
        portfolio = plan.portfolio
        plan.delete()
        write_audit(
            request, user=request.user, org=portfolio.org,
            action="contribution_plan.deleted", entity_type="contribution_plan",
            entity_id=plan_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
