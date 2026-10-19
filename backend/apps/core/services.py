"""Core services: persisting provider data into PricePoint rows."""
from datetime import date, timedelta

from django.db import transaction

from .models import Instrument, PricePoint


def upsert_quote(instrument: Instrument, quote: dict, source: str = None):
    """Create or update the PricePoint for the quote's date (idempotent)."""
    quote_date = quote["date"]
    if isinstance(quote_date, str):
        quote_date = date.fromisoformat(quote_date)
    defaults = {
        "open": quote["open"],
        "high": quote["high"],
        "low": quote["low"],
        "close": quote["close"],
        "volume": quote.get("volume", 0),
        "source": source or "provider",
    }
    point, created = PricePoint.objects.update_or_create(
        instrument=instrument, date=quote_date, defaults=defaults
    )
    return point, created


def ensure_price_history(instrument: Instrument, days: int = 730, source: str = None):
    """Backfill missing PricePoints for an instrument.

    Fetches history from the configured provider and bulk-inserts only the
    dates that are not already present. Idempotent and deterministic.
    Returns the number of rows created.
    """
    from .providers import ProviderError, get_provider

    existing_dates = set(
        instrument.prices.values_list("date", flat=True)
    )
    to_date = date.today()
    from_date = to_date - timedelta(days=days)

    provider = get_provider()
    try:
        rows = provider.fetch_history(instrument.symbol, from_date, to_date)
    except ProviderError:
        return 0

    created = 0
    with transaction.atomic():
        for row in rows:
            if row["date"] in existing_dates:
                continue
            PricePoint.objects.create(
                instrument=instrument,
                date=row["date"],
                open=row["open"],
                high=row["high"],
                low=row["low"],
                close=row["close"],
                volume=row.get("volume", 0),
                source=source or provider.name,
            )
            created += 1
    return created


def refresh_instrument_quote(instrument: Instrument, source: str = None):
    """Fetch the latest quote and upsert today's PricePoint.

    Returns the quote dict or None if the provider failed.
    """
    from .providers import ProviderError, get_provider

    provider = get_provider()
    try:
        quote = provider.fetch_quote(instrument.symbol)
    except ProviderError:
        return None
    upsert_quote(instrument, quote, source=source or provider.name)
    return quote


def last_close_on(instrument: Instrument, on_date: date):
    """Close price as of ``on_date`` (latest PricePoint <= on_date)."""
    point = (
        instrument.prices.filter(date__lte=on_date).order_by("-date").values("close").first()
    )
    return point["close"] if point else None
