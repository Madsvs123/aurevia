"""Portfolio serializers."""
from decimal import Decimal

from rest_framework import serializers

from apps.core.models import Instrument
from apps.core.serializers import InstrumentSerializer

from .models import (
    Account,
    ContributionPlan,
    Holding,
    Portfolio,
    TargetAllocation,
    Transaction,
)
from .services import (
    account_cash_balance,
    first_run_date,
    holdings_with_prices,
    portfolio_summaries,
)

ZERO = Decimal("0")


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = (
            "id",
            "portfolio",
            "name",
            "broker",
            "currency",
            "kind",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "portfolio", "created_at", "updated_at")


class AccountDetailSerializer(AccountSerializer):
    balance = serializers.SerializerMethodField()

    class Meta(AccountSerializer.Meta):
        fields = AccountSerializer.Meta.fields + ("balance",)

    def get_balance(self, obj):
        return str(account_cash_balance(obj))


class HoldingSerializer(serializers.ModelSerializer):
    instrument = InstrumentSerializer(read_only=True)
    instrument_symbol = serializers.CharField(source="instrument.symbol", read_only=True)
    market_value = serializers.SerializerMethodField()
    unrealized_gain = serializers.SerializerMethodField()
    unrealized_gain_pct = serializers.SerializerMethodField()
    weight_pct = serializers.SerializerMethodField()

    class Meta:
        model = Holding
        fields = (
            "id",
            "instrument",
            "instrument_symbol",
            "quantity",
            "avg_cost",
            "market_value",
            "unrealized_gain",
            "unrealized_gain_pct",
            "weight_pct",
            "realized_gain",
        )

    def _context_extra(self, obj):
        """(market_value, gain, gain_pct, weight) from the view's precomputed
        rows (keyed by instrument symbol) to avoid N+1 price lookups."""
        rows = self.context.get("holding_rows")
        if rows:
            for row in rows:
                if row["instrument"].id == obj.instrument_id:
                    return (
                        row["market_value"],
                        row["unrealized_gain"],
                        row["unrealized_gain_pct"],
                        row["weight"],
                    )
        return ZERO, ZERO, ZERO, ZERO

    def get_market_value(self, obj):
        return str(self._context_extra(obj)[0])

    def get_unrealized_gain(self, obj):
        return str(self._context_extra(obj)[1])

    def get_unrealized_gain_pct(self, obj):
        return str(self._context_extra(obj)[2])

    def get_weight_pct(self, obj):
        return str(self._context_extra(obj)[3])


class TransactionSerializer(serializers.ModelSerializer):
    instrument = InstrumentSerializer(read_only=True)
    instrument_symbol = serializers.CharField(
        required=False, allow_null=True, write_only=True
    )
    account_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    to_account_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    lot = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Transaction
        fields = (
            "id",
            "portfolio",
            "account",
            "account_id",
            "to_account",
            "to_account_id",
            "instrument",
            "instrument_symbol",
            "type",
            "quantity",
            "price",
            "amount",
            "fee",
            "currency",
            "date",
            "notes",
            "corporate_action_type",
            "corporate_action_ratio",
            "lot",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "portfolio", "account", "to_account", "instrument",
            "lot", "created_by", "created_at", "updated_at",
        )

    def validate(self, attrs):
        txn_type = attrs.get("type", getattr(self.instance, "type", None))
        if txn_type is None:
            raise serializers.ValidationError({"type": "Transaction type is required."})

        account_id = attrs.get("account_id")
        instrument = attrs.get("instrument") or attrs.get("instrument_symbol") or (
            self.instance.instrument if self.instance else None
        )
        quantity = attrs.get("quantity")
        price = attrs.get("price")
        amount = attrs.get("amount")
        corporate_action_type = attrs.get("corporate_action_type")

        if txn_type in ("buy", "sell"):
            if not account_id:
                raise serializers.ValidationError({"account_id": "Required for buy/sell transactions."})
            if instrument is None:
                raise serializers.ValidationError({"instrument_symbol": "Required for buy/sell transactions."})
            if quantity is None or quantity <= ZERO:
                raise serializers.ValidationError({"quantity": "Must be a positive quantity."})
            if price is None or price <= ZERO:
                raise serializers.ValidationError({"price": "Must be a positive price."})
            if amount is None and quantity is not None and price is not None:
                attrs["amount"] = (quantity * price).quantize(Decimal("0.0001"))
        elif txn_type in ("deposit", "withdrawal", "dividend", "interest", "fee"):
            if not account_id:
                raise serializers.ValidationError({"account_id": f"Required for {txn_type} transactions."})
            if amount is None:
                raise serializers.ValidationError({"amount": "Required."})
        elif txn_type == "transfer":
            if not account_id or not attrs.get("to_account_id"):
                raise serializers.ValidationError(
                    {"to_account_id": "Transfers require both account and to_account."}
                )
            if attrs.get("to_account_id") == account_id:
                raise serializers.ValidationError(
                    {"to_account_id": "Destination account must differ from source."}
                )
            if amount is None:
                raise serializers.ValidationError({"amount": "Required."})
        elif txn_type == "corporate_action":
            if instrument is None:
                raise serializers.ValidationError({"instrument_symbol": "Required for corporate actions."})
            if corporate_action_type != "split":
                raise serializers.ValidationError(
                    {"corporate_action_type": "Only 'split' is supported as a corporate action."}
                )
            if not attrs.get("corporate_action_ratio") or attrs["corporate_action_ratio"] <= 0:
                raise serializers.ValidationError(
                    {"corporate_action_ratio": "A positive ratio (e.g. 4 for 4:1) is required for splits."}
                )
        else:
            raise serializers.ValidationError({"type": f"Unsupported transaction type: {txn_type}."})

        if self.context.get("portfolio") and not self.instance:
            attrs.setdefault("currency", self.context["portfolio"].currency)
        return attrs

    def create(self, validated_data):
        portfolio = self.context["portfolio"]
        symbol = validated_data.pop("instrument_symbol", None)
        account_id = validated_data.pop("account_id", None)
        to_account_id = validated_data.pop("to_account_id", None)

        instrument = validated_data.pop("instrument", None)
        if instrument is None and symbol:
            instrument = Instrument.objects.filter(symbol__iexact=symbol).first()
            if instrument is None:
                raise serializers.ValidationError(
                    {"instrument_symbol": f"Unknown instrument '{symbol}'."}
                )

        account = Account.objects.filter(id=account_id, portfolio=portfolio).first() if account_id else None
        if account_id and account is None:
            raise serializers.ValidationError({"account_id": "Account does not belong to this portfolio."})
        to_account = (
            Account.objects.filter(id=to_account_id, portfolio=portfolio).first()
            if to_account_id
            else None
        )
        if to_account_id and to_account is None:
            raise serializers.ValidationError({"to_account_id": "Account does not belong to this portfolio."})

        return Transaction.objects.create(
            portfolio=portfolio,
            account=account,
            to_account=to_account,
            instrument=instrument,
            created_by=self.context["request"].user,
            **validated_data,
        )

    def update(self, instance, validated_data):
        symbol = validated_data.pop("instrument_symbol", None)
        account_id = validated_data.pop("account_id", None)
        to_account_id = validated_data.pop("to_account_id", None)
        instrument = validated_data.pop("instrument", None)

        if instrument is None and symbol:
            instrument = Instrument.objects.filter(symbol__iexact=symbol).first()
            if instrument is None:
                raise serializers.ValidationError(
                    {"instrument_symbol": f"Unknown instrument '{symbol}'."}
                )
        if instrument is not None:
            instance.instrument = instrument
        if account_id is not None:
            account = Account.objects.filter(id=account_id, portfolio=instance.portfolio).first()
            if account is None:
                raise serializers.ValidationError({"account_id": "Account does not belong to this portfolio."})
            instance.account = account
        if to_account_id is not None:
            to_account = Account.objects.filter(id=to_account_id, portfolio=instance.portfolio).first()
            if to_account is None:
                raise serializers.ValidationError({"to_account_id": "Account does not belong to this portfolio."})
            instance.to_account = to_account

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class TargetAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TargetAllocation
        fields = (
            "id",
            "label",
            "kind",
            "target_weight_pct",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        label = (attrs.get("label") or "").strip()
        if not label:
            raise serializers.ValidationError({"label": "Label is required."})
        attrs["label"] = label
        kind = attrs.get("kind")
        if kind not in ("asset_class", "instrument"):
            raise serializers.ValidationError(
                {"kind": "Kind must be 'asset_class' or 'instrument'."}
            )
        weight = attrs.get("target_weight_pct")
        if weight is not None and weight > 0:
            raise serializers.ValidationError(
                {"target_weight_pct": "Target weight cannot be negative."}
            )
        return attrs


class ContributionPlanSerializer(serializers.ModelSerializer):
    account_id = serializers.UUIDField(write_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    next_run = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = ContributionPlan
        fields = (
            "id",
            "portfolio",
            "account",
            "account_id",
            "account_name",
            "amount",
            "frequency",
            "day_of_month",
            "start_date",
            "end_date",
            "next_run",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "portfolio", "account", "account_name", "created_at")

    def validate(self, attrs)
        amount = attrs.get("amount")
        if amount is not None and amount <= ZERO:
            raise serializers.ValidationError({"amount": "Must be a positive amount."})
        day = attrs.get("day_of_month")
        if day is not None and (day < 1 or day > 31):
            raise serializers.ValidationError(
                {"day_of_month": "Must be between 1 and 31."}
            )
        start = attrs.get("start_date")
        end = attrs.get("end_date")
        if start and end and start < end:
            raise serializers.ValidationError(
                {"end_date": "Must be on or after start_date."}
            )
        portfolio = self.context.get("portfolio")
        account_id = attrs.pop("account_id", None)
        if account_id is not None:
            account = (
                Account.objects.filter(id=account_id, portfolio=portfolio).first()
                if portfolio
                else None
            )
            if account is None:
                raise serializers.ValidationError(
                    {"account_id": "Account does not belong to this portfolio."}
                )
            attrs["account"] = account
        return attrs

    def create(self, validated_data):
        portfolio = self.context["portfolio"]
        start_date = validated_data.get("start_date")
        day = validated_data.get("day_of_month", 1)
        if validated_data.get("next_run") is None:
            validated_data["next_run"] = first_run_date(start_date, day)
        return ContributionPlan.objects.create(portfolio=portfolio, **validated_data)

    def update(self, instance, validated_data):
        if validated_data.get("next_run") is None:
            validated_data.pop("next_run", None)
        if "next_run" not in validated_data and (
            "start_date" in validated_data or "day_of_month" in validated_data
        ):
            start = validated_data.get("start_date", instance.start_date)
            day = validated_data.get("day_of_month", instance.day_of_month)
            validated_data["next_run"] = first_run_date(start, day)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class PortfolioSerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()
    accounts = AccountDetailSerializer(many=True, read_only=True)
    owner_email = serializers.CharField(source="owner.email", read_only=True)

    class Meta:
        model = Portfolio
        fields = (
            "id",
            "owner",
            "owner_email",
            "org",
            "name",
            "currency",
            "description",
            "cost_basis_method",
            "is_archived",
            "summary",
            "accounts",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "owner", "owner_email", "is_archived", "summary", "accounts", "created_at", "updated_at")

    def get_summary(self, obj):
        return portfolio_summary(obj)


class PortfolioCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Portfolio
        fields = ("id", "name", "currency", "description", "cost_basis_method", "org")
        read_only_fields = ("id",)
