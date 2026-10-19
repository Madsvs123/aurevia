"""Celery tasks for market data (beat: hourly)."""
import random
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Instrument, NewsItem
from .services import ensure_price_history, refresh_instrument_quote

# Deterministic headline templates: (template, sentiment). ``{name}`` and
# ``{symbol}`` are interpolated per instrument.
NEWS_TEMPLATES = [
    ("{name} beats earnings expectations as revenue accelerates", "positive"),
    ("Analysts raise price targets for {symbol} after a strong quarter", "positive"),
    ("{symbol} extends rally on institutional buying", "positive"),
    ("{name} announces expanded share buyback program", "positive"),
    ("{symbol} dips as macro headwinds weigh on sentiment", "negative"),
    ("{name} faces margin pressure from rising input costs", "negative"),
    ("{symbol} volatility rises ahead of the Fed decision", "neutral"),
    ("{name} holds guidance steady; markets shrug", "neutral"),
    ("{symbol} trading range-bound as investors await catalysts", "neutral"),
]

NEWS_SOURCES = ["MarketWire", "FinEdge", "Global Markets Daily", "Bloomberg Brief"]


def _seeded_news(instrument):
    """Deterministic (headline, source, sentiment, hours_ago) list for an instrument."""
    rng = random.Random(instrument.symbol)  # stable across reseeds
    count = 2 + rng.randint(0, 1)  # 2-3 items per instrument
    items = []
    for i in range(count):
        template, sentiment = NEWS_TEMPLATES[rng.randrange(len(NEWS_TEMPLATES))]
        headline = template.format(name=instrument.name, symbol=instrument.symbol)
        source = NEWS_SOURCES[rng.randrange(len(NEWS_SOURCES))]
        items.append(
            {
                "headline": headline[:255],
                "source": source,
                "sentiment": sentiment,
                "hours_ago": 3 + i * 7,
            }
        )
    return items


@shared_task
def fetch_market_news():
    """Seed deterministic market-news headlines for active instruments.

    Idempotent: instruments already carrying their full deterministic set of
    news items (2-3, "fewer than 3" guard) are skipped. No notifications are
    emitted — news rows are content, not alerts.
    """
    instruments = Instrument.objects.filter(is_active=True)
    now = timezone.now()
    created = 0
    for instrument in instruments:
        existing = instrument.news.count()
        if existing >= 3:
            continue
        items = _seeded_news(instrument)
        target = len(items)
        need = max(0, min(target, 3) - existing)
        rows = [
            NewsItem(
                instrument=instrument,
                headline=item["headline"],
                source=item["source"],
                sentiment=item["sentiment"],
                url="",
                published_at=now - timedelta(hours=item["hours_ago"]),
            )
            for item in items[:need]
        ]
        if rows:
            NewsItem.objects.bulk_create(rows)
            created += len(rows)
    return {"instruments": instruments.count(), "created": created}


@shared_task
def refresh_market_prices()
    """Refresh quotes for all active instruments and backfill gaps.

    Runs hourly via CELERY_BEAT_SCHEDULE. Upserts today's PricePoint from the
    configured provider and backfills history for instruments without recent
    data (e.g. new symbols).
    """
    instruments = Instrument.objects.filter(is_active=True)
    refreshed = 0
    backfilled = 0
    for instrument in instruments:
        quote = refresh_instrument_quote(instrument)
        if quote:
            refreshed += 1
        created = ensure_price_history(instrument, days=730)
        backfilled += created
    return {"instruments": instruments.count(), "refreshed": refreshed, "backfilled": backfilled}
