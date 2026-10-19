"""Aurevia backend package.

Imports the Celery app so that ``celery -A aurevia`` and ``@shared_task``
decorators resolve when the Django process boots.
"""
from .celery import app as celery_app

__all__ = ("celery_app",)
