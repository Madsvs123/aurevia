"""Rate limiting for auth endpoints.

Real enforcement backed by Django's cache (Redis in production). Returns
HTTP 429 with a ``Retry-After`` header when the limit is exceeded.
"""
from functools import wraps

from django.core.cache import cache
from rest_framework.response import Response


def get_client_ip(request):
    """Best-effort client IP from DRF request (handles reverse proxies)."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def rate_limit(rate, period, key=None):
    """Decorator limiting a view to ``rate`` calls per ``period`` seconds.

    ``key`` may be a string or a callable(request) returning a string; it is
    combined with the caller identity (user id, or IP for anonymous) to form
    the cache key.
    """

    def decorator(view_func):
        @wraps(view_func)
        def wrapper(self, request, *args, **kwargs):
            if request.user and request.user.is_authenticated:
                identity = f"user:{request.user.pk}"
            else:
                identity = f"ip:{get_client_ip(request)}"
            suffix = key(request) if callable(key) else (key or "default")
            cache_key = (
                f"aurevia:ratelimit:{view_func.__module__}.{view_func.__name__}"
                f":{identity}:{suffix}"
            )

            current = cache.get(cache_key, 0)
            if current > rate:
                return Response(
                    {"detail": "Too many requests. Please try again later."},
                    status=429,
                    headers={"Retry-After": str(period)},
                )

            if current == 0:
                # Atomic-ish first hit: set with expiry so the window resets.
                cache.add(cache_key, 1, timeout=period)
                if cache.get(cache_key) is None:
                    cache.set(cache_key, 1, timeout=period)
            else:
                try:
                    cache.incr(cache_key)
                except ValueError:
                    cache.set(cache_key, 1, timeout=period)

            return view_func(self, request, *args, **kwargs)

        return wrapper

    return decorator
