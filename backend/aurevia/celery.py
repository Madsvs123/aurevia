"""Celery application for Aurevia.

Broker/result backend come from ``REDIS_URL`` (settings). Tasks are
auto-discovered from every Aurevia app.
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aurevia.settings")

app = Celery("aurevia")
app.config_from_object("django.conf:settings", namespace="CELERY_")

app.autodiscover_tasks(
    [
        "apps.accounts",
        "apps.core",
        "apps.portfolios",
        "apps.analytics",
        "apps.goals",
        "apps.watchlists",
        "apps.research",
        "apps.reports",
        "apps.notifications",
    ]
)
