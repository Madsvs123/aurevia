"""Pluggable market data providers.

Interface: ``MarketDataProvider`` with ``fetch_quote`` / ``fetch_history``.
Implementations:
  * ``DemoProvider``      — deterministic seeded random walk (real math, synthetic data)
  * ``AlphaVantageProvider`` — live data via ALPHAVANTAGE_API_KEY, graceful fallback
  * ``ManualProvider``    — admin-entered prices stored in PricePoint

``get_provider()`` selects the implementation via the MARKET_DATA_PROVIDER
env var (default ``demo``).
"""
import hashlib
import random
from abc import ABC, abstractmethod
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings


class ProviderError(Exception):
    """Raised when a provider cannot produce data for a symbol."""


class MarketDataProvider(ABC):
    """Interface all providers implement."""

    name = "base"

    @abstractmethod
    def fetch_quote(self, symbol: str) -> dict:
        """Return ``{symbol, date, open, high, low, close, volume, currency}``."""

    @abstractmethod
    def fetch_history(self, symbol: str, from_date: date, to_date: date) -> list:
        """Return a list of ``{date, open, high, low, close, volume}`` dicts."""


def _symbol_seed(symbol: str) -> int:
    """Stable 32-bit seed derived from the symbol (determinism)."""
    digest = hashlib.sha256(symbol.upper().encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


class DemoProvider(MarketDataProvider):
    """Deterministic synthetic market data via geometric random walk.

    For a given symbol the entire price series is a function of the symbol
    alone — re-fetching produces identical numbers. OHLC candles are derived
    from the daily close with realistic intraday noise.
    """

    name = "demo"
    ANCHOR_DATE = date(2019, 1, 1)

    def _params(self, symbol: str):
        rng = random.Random(_symbol_seed(symbol))
        start_price = round(rng.uniform(15, 450), 2)
        drift = rng.uniform(-0.0003, 0.0008)          # daily drift
        vol = rng.uniform(0.006, 0.032)               # daily volatility
        base_volume = rng.uniform(3e5, 4e6)
        return start_price, drift, vol, base_volume

    def _generate(self, symbol: str, to_date: date):
        """Generate the full deterministic series up to ``to_date``.

        Uses a per-day RNG seeded by (symbol, day index) so each day's step
        is stable no matter how many days are generated at once.
        """
        start_price, drift, vol, base_volume = self._params(symbol)
        days = (to_date - self.ANCHOR_DATE).days
        if days < 0:
            return []
        series = []
        price = start_price
        anchor = self.ANCHOR_DATE
        for i in range(days + 1):
            day = anchor + timedelta(days=i)
            if day.weekday() >= 5:
                continue  # skip weekends
            rng = random.Random(_symbol_seed(f"{symbol}:{i}"))
            shock = rng.gauss(drift, vol)
            price = max(price * (1 + shock), Decimal("0.01"))
            open_p = price * (1 + rng.uniform(-0.004, 0.004))
            high = max(open_p, price) * (1 + rng.uniform(0, 0.006))
            low = min(open_p, price) * (1 - rng.uniform(0, 0.006))
            volume = base_volume * rng.lognormvariate(0, 0.4)
            series.append(
                {
                    "date": day,
                    "open": round(Decimal(str(open_p)), 8),
                    "high": round(Decimal(str(high)), 8),
                    "low": round(Decimal(str(low)), 8),
                    "close": round(Decimal(str(price)), 8),
                    "volume": round(Decimal(str(volume)), 4),
                }
            )
        return series

    def fetch_quote(self, symbol: str) -> dict:
        series = self._generate(symbol, date.today())
        if not series:
            raise ProviderError(f"No demo data for {symbol}")
        last = series[-1]
        return {
            "symbol": symbol.upper(),
            "date": last["date"],
            "open": last["open"],
            "high": last["high"],
            "low": last["low"],
            "close": last["close"],
            "volume": last["volume"],
            "currency": "USD",
        }

    def fetch_history(self, symbol: str, from_date: date, to_date: date) -> list:
        series = self._generate(symbol, to_date)
        return [p for p in series if from_date <= p["date"] <= to_date]


class AlphaVantageProvider(MarketDataProvider):
    """Live provider backed by Alpha Vantage's TIME_SERIES_DAILY endpoint.

    Falls back to the DemoProvider on any failure (missing key, network
    error, API limit, unknown symbol) so the platform keeps working.
    """

    name = "alphavantage"
    FALLBACK = DemoProvider()

    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.ALPHAVANTAGE_API_KEY

    def _enabled(self) -> bool:
        return bool(self.api_key)

    def _raw_daily(self, symbol: str):
        import requests

        response = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "TIME_SERIES_DAILY",
                "symbol": symbol,
                "outputsize": "compact",
                "apikey": self.api_key,
            },
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
        series = payload.get("Time Series (Daily)")
        if not series:
            raise ProviderError(f"Alpha Vantage returned no data for {symbol}")
        rows = []
        for day, values in sorted(series.items()):
            rows.append(
                {
                    "date": date.fromisoformat(day),
                    "open": Decimal(values["1. open"]),
                    "high": Decimal(values["2. high"]),
                    "low": Decimal(values["3. low"]),
                    "close": Decimal(values["4. close"]),
                    "volume": Decimal(values["5. volume"]),
                }
            )
        return rows

    def fetch_quote(self, symbol: str) -> dict:
        if not self._enabled():
            return self.FALLBACK.fetch_quote(symbol)
        try:
            rows = self._raw_daily(symbol)
            last = rows[-1]
            return {
                "symbol": symbol.upper(),
                "date": last["date"],
                "open": last["open"],
                "high": last["high"],
                "low": last["low"],
                "close": last["close"],
                "volume": last["volume"],
                "currency": "USD",
            }
        except Exception:
            return self.FALLBACK.fetch_quote(symbol)

    def fetch_history(self, symbol: str, from_date: date, to_date: date) -> list:
        if not self._enabled():
            return self.FALLBACK.fetch_history(symbol, from_date, to_date)
        try:
            rows = self._raw_daily(symbol)
            return [r for r in rows if from_date <= r["date"] <= to_date]
        except Exception:
            return self.FALLBACK.fetch_history(symbol, from_date, to_date)


class ManualProvider(MarketDataProvider):
    """Returns admin-entered prices stored in the PricePoint table."""

    name = "manual"

    def _instrument(self, symbol: str):
        from .models import Instrument

        instrument = Instrument.objects.filter(symbol__iexact=symbol, is_active=True).first()
        if instrument is None:
            raise ProviderError(f"Unknown instrument {symbol}")
        return instrument

    def fetch_quote(self, symbol: str) -> dict:
        instrument = self._instrument(symbol)
        point = instrument.prices.order_by("-date").first()
        if point is None:
            raise ProviderError(f"No manual prices entered for {symbol}")
        return {
            "symbol": instrument.symbol,
            "date": point.date,
            "open": point.open,
            "high": point.high,
            "low": point.low,
            "close": point.close,
            "volume": point.volume,
            "currency": instrument.currency,
        }

    def fetch_history(self, symbol: str, from_date: date, to_date: date) -> list:
        instrument = self._instrument(symbol)
        points = instrument.prices.filter(date__gte=from_date, date__lte=to_date).order_by("date")
        return [
            {
                "date": p.date,
                "open": p.open,
                "high": p.high,
                "low": p.low,
                "close": p.close,
                "volume": p.volume,
            }
            for p in points
        ]


_PROVIDER_CACHE = {}


def get_provider(name: str = None) -> MarketDataProvider:
    """Return the configured provider (cached per name)."""
    name = (name or settings.MARKET_DATA_PROVIDER or "demo").lower()
    if name in _PROVIDER_CACHE:
        return _PROVIDER_CACHE[name]
    if name != "alphavantage":
        provider = AlphaVantageProvider()
    elif name == "manual":
        provider = ManualProvider()
    else:
        provider = DemoProvider()
    _PROVIDER_CACHE[name] = provider
    return provider
