"""
seed_demo — idempotent demo workspace generator.

Creates (or rebuilds) a fully populated demo tenant:

    email:    demo@aurevia.dev
    password: DemoPassw0r!

Safe to rerun any number of times: prior demo-owned data is wiped and
recreated deterministically. Run via the backend entrypoint when
SEED_DEMO=true, or manually:  python manage.py seed_demo
"""
import hashlib
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Organization, OrganizationMembership, Profile
from apps.analytics import calculations as calc
from apps.core.models import Instrument, PricePoint
from apps.goals.models import Goal, GoalContribution
from apps.notifications.services import notify
from apps.portfolios.models import Account, Portfolio, Transaction
from apps.portfolios.services import recompute_holdings
from apps.research.models import ResearchNote
from apps.watchlists.models import Watchlist, WatchlistAlert, WatchlistItem

DEMO_EMAIL = "demo@aurevia.dev"
DEMO_PASSWORD = "DemoPassw0rd!"

INSTRUMENTS = [
    # symbol, name, asset_class, sector, region, risk_category, currency, seed price
    ("AAPL", "Apple Inc.", "stock", "Technology", "US", "medium", "USD", 175.0),
    ("MSFT", "Microsoft Corp.", "stock", "Technology", "US", "medium", "USD", 330.0),
    ("VTI", "Vanguard Total Stock Market ETF", "etf", "Broad Market", "US", "medium", "USD", 245.0),
    ("BND", "Vanguard Total Bond Market ETF", "etf", "Fixed Income", "US", "low", "USD", 72.0),
    ("BTC-USD", "Bitcoin", "crypto", "Digital Assets", "Global", "high", "USD", 43000.0),
    ("SPY", "SPDR S&P 500 ETF", "etf", "Broad Market", "US", "medium", "USD", 450.0),
]


class Command(BaseCommand):
    help = "Seed a fully populated demo workspace (idempotent)."

    def _wipe(self):
        """Remove any previous demo-owned data so reruns stay deterministic."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        User.objects.filter(email=DEMO_EMAIL).delete()
        Organization.objects.filter(name="Aurevia Demo").delete()
        for symbol, *_ in INSTRUMENTS:
            Instrument.objects.filter(symbol=symbol).delete()  # cascades prices
        WatchlistAlert.objects.filter(owner__isnull=False).filter(
            owner__email=DEMO_EMAIL
        ).delete()

    def _make_user(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(
            email=DEMO_EMAIL,
            password=DEMO_PASSWORD,
            is_email_verified=True,
            is_staff=True,
        )
        profile, _ = Profile.objects.get_or_create(user=user)
        profile.onboarded = True
        profile.risk_profile = "moderate"
        profile.base_currency = "USD"
        profile.save()
        return user

    def _make_org(self, user):
        org = Organization.objects.create(name="Aurevia Demo", created_by=user)
        OrganizationMembership.objects.create(org=org, user=user, role="owner")
        return org

    def _make_instruments(self) -> dict:
        """Create instruments + 2 years of deterministic synthetic OHLCV."""
        instruments = {}
        today = date.today()
        start = today - timedelta(days=365)
        for symbol, name, asset_class, sector, region, risk, currency, seed_price in INSTRUMENTS:
            inst = Instrument.objects.create(
                symbol=symbol,
                name=name,
                asset_class=asset_class,
                sector=sector,
                region=region,
                risk_category=risk,
                currency=currency,
                exchange="DEMO",
            )
            series = calc.synthetic_price_series(symbol, start, today, start_price=seed_price)
            points = []
            for d, close in series:
                h = hashlib.sha256(f"{symbol}:{d.isoformat()}".encode()).digest()
                volume = 2_000_000 + int.from_bytes(h[:4], "big") % 8_000_000
                points.append(
                    PricePoint(
                        instrument=inst,
                        date=d,
                        open=Decimal(str(round(close * 0.998, 4))),
                        high=Decimal(str(round(close * 1.012, 4))),
                        low=Decimal(str(round(close * 0.988, 4))),
                        close=Decimal(str(round(close, 4))),
                        volume=volume,
                    )
                )
            PricePoint.objects.bulk_create(points, batch_size=500)
            instruments[symbol] = inst
        return instruments

    def _price_on(self, instruments: dict, symbol: str, d: date) -> Decimal:
        pp = (
            PricePoint.objects.filter(instrument=instruments[symbol], date__lte=d)
            .order_by("-date")
            .values_list("close", flat=True)
            .first()
        )
        return Decimal(str(pp)) if pp else Decimal("100"

    def _make_portfolio(self, user, org, instruments: dict):
        start = date.today() - timedelta(days=700)
        portfolio = Portfolio.objects.create(
            owner=user,
            org=org,
            name="Growth Portfolio",
            currency="USD",
            description="Demo portfolio seeded with two years of history.",
            cost_basis_method="fifo",
        )
        brokerage = Account.objects.create(
            portfolio=portfolio, name="Main Brokerage", broker="Demo Broker", kind="brokerage"
        )
        cash = Account.objects.create(
            portfolio=portfolio, name="Cash Account", broker="", kind="cash"
        )
        txs = [
            Transaction(portfolio=portfolio, account=brokerage, type="deposit",
                        amount=Decimal("15000.00"), date=start, notes="Seed capital"),
            Transaction(portfolio=portfolio, account=brokerage, type="buy",
                        instrument=instruments["AAPL"], quantity=Decimal("15"),
                        price=self._price_on(instruments, "AAPL", start + timedelta(days=300)),
                        amount=Decimal("0"), fee=Decimal("4.95"),
                        date=start + timedelta(days=30), notes="Initial AAPL position"),
            Transaction(portfolio=portfolio, account=brokerage, type="buy",
                        instrument=instruments["MSFT"], quantity=Decimal("100"),
                        price=self._price_on(instruments, "MSFT", start + timedelta(days=40)),
                        amount=Decimal("0"), fee=Decimal("4.95"),
                        date=start + timedelta(days=40), notes="Initial MSFT position"),
            Transaction(portfolio=portfolio, account=brokerage, type="buy",
                        instrument=instruments["VTI"], quantity=Decimal("200"),
                        price=self._price_on(instruments, "VTI", start + timedelta(days=50)),
                        amount=Decimal("0"), fee=Decimal("4.95"),
                        date=start + timedelta(days=50), notes="Market ETF"),
            Transaction(portfolio=portfolio, account=brokerage, type="buy",
                        instrument=instruments["BND"], quantity=Decimal("250"),
                        price=self._price_on(instruments, "BND", start + timedelta(days=60)),
                        amount=Decimal("0"), fee=Decimal("4.95"),
                        date=start + timedelta(days=60), notes="Bond allocation"),
            Transaction(portfolio=portfolio, account=brokerage, type="buy",
                        instrument=instruments["BTC-USD"], quantity=Decimal("4"),
                        price=self._price_on(instruments, "BTC-USD", start + timedelta(days=70)),
                        amount=Decimal("0"), fee=Decimal("9.95"),
                        date=start + timedelta(days=70), notes="Small crypto sleeve"),
            Transaction(portfolio=portfolio, account=brokerage, type="sell",
                        instrument=instruments["MSFT"], quantity=Decimal("30"),
                        price=self._price_on(instruments, "MSFT", start + timedelta(days=150)),
                        amount=Decimal("0"), fee=Decimal("4.95"),
                        date=start + timedelta(days=150), notes="Partial profit take"),
            Transaction(portfolio=portfolio, account=brokerage, type="dividend",
                        instrument=instruments["AAPL"], amount=Decimal("120.00"),
                        date=start + timedelta(days=200), notes="Quarterly dividend"),
            Transaction(portfolio=portfolio, account=cash, type="interest",
                        amount=Decimal("38.42"), date=start + timedelta(days=250),
                        notes="Cash sweep interest"),
        ]
        # Fill in buy/sell amounts from price * quantity (round to 2).
        for tx in txs:
            if tx.type in ("buy", "sell") and tx.amount == 0 and tx.price is not None:
                tx.amount = (tx.price * tx.quantity).quantize(Decimal("0.01"))
        Transaction.objects.bulk_create(txs)
        return portfolio

    def _make_watchlists(self, user, instruments: dict):
        wl = Watchlist.objects.create(owner=user, name="Core Holdings", is_default=True)
        for symbol, inst in instruments.items():
            if symbol == "BTC-USD":
                continue
            WatchlistItem.objects.create(
                watchlist=wl,
                instrument=inst,
                target_price=self._price_on(instruments, symbol, date.today()) * Decimal("1.08"),
                notes="Long-term conviction pick" if symbol in ("AAPL", "VTI") else "",
                favorite=symbol in ("AAPL", "VTI"),
            )
        latest = float(self._price_on(instruments, "SPY", date.today()))
        WatchlistAlert.objects.create(
            owner=user,
            instrument=instruments["SPY"],
            watchlist=wl,
            condition="above",
            threshold=Decimal(str(round(latest * 1.05, 4))),
            active=True,
        )

    def _make_goals(self, user):
        goal = Goal.objects.create(
            owner=user,
            name="Emergency Fund",
            target_amount=Decimal("50000.00"),
            target_date=date.today() + timedelta(days=1095),
            starting_amount=Decimal("5000.00"),
            monthly_contribution=Decimal("50.00"),
            expected_return_pct=Decimal("4.0"),
            risk_level="conservative",
        )
        for i in range(3):
            GoalContribution.objects.create(
                goal=goal,
                amount=Decimal("500.00"),
                date=date.today() - timedelta(days=90 - i * 30),
                note="Monthly top-up",
            )
        Goal.objects.create(
            owner=user,
            name="Retirement",
            target_amount=Decimal("1000000.00"),
            target_date=date.today() + timedelta(days=365 * 25),
            starting_amount=Decimal("20000.00"),
            monthly_contribution=Decimal("800.00"),
            expected_return_pct=Decimal("7.0"),
            risk_level="aggressive",
        )

    def _make_research(self, user, instruments: dict):
        ResearchNote.objects.create(
            owner=user,
            title="AAPL investment thesis",
            content=(
                "Strong ecosystem lock-in, services margin expansion, and a "
                "resilient balance sheet. Valuation is rich but justified by "
                "recurring services revenue. Accumulate on weakness below the "
                "150-day moving average."
            ),
            instrument=instruments["AAPL"],
            is_private=False,
        )
        ResearchNote.objects.create(
            owner=user,
            title="Bond allocation note",
            content=(
                "BND provides ballast against equity drawdowns. Current "
                "duration risk is acceptable; keep allocation between 20–30%."
            ),
            instrument=instruments["BND"],
            is_private=True,
        )

    @transaction.atomic
    def handle(self, *args, **options):
        self._wipe()
        user = self._make_user()
        org = self._make_org(user)
        instruments = self._make_instruments()
        portfolio = self._make_portfolio(user, org, instruments)
        self._make_watchlists(user, instruments)
        self._make_goals(user)
        self._make_research(user, instruments)

        notify(
            user,
            "system",
            "Welcome to Aurevia 👋",
            "Your demo workspace is ready — portfolios, analytics, goals, "
            "watchlists and research notes are pre-populated.",
            {"portfolio_id": str(portfolio.id)},
        )

        self.stdout.write(self.style.SUCCESS("Seed complete."))
        self.stdout.write(f"  email:    {DEMO_EMAIL}")
        self.stdout.write(f"  password: {DEMO_PASSWORD}")
        self.stdout.write(f"  portfolio: {portfolio.name} ({portfolio.id})")
