"""
Aurevia — Django settings.

Owned by the backend-platform agent. Every value is overridable via
environment variables (see ARCHITECTURE.md §4). Secrets never live in code.
"""
from datetime import timedelta
from pathlib import Path

import environ
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_SECRET_KEY=(str, "dev-only-insecure-secret-key-change-me"),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1", "backend"]),
    FRONTEND_URL=(str, "http://localhost:5173"),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173", "http://127.0.0.1:5173"]),
    EMAIL_BACKEND=(str, "django.core.mail.backends.console.EmailBackend"),
    DEFAULT_FROM_EMAIL=(str, "Aurevia <no-reply@aurevia.dev>"),
    MARKET_DATA_PROVIDER=(str, "demo"),
    ALPHAVANTAGE_API_KEY=(str, ""),
    SEED_DEMO=(bool, True),
)
# Reads backend/.env if present; missing files are ignored (compose injects env).
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS")
FRONTEND_URL = env("FRONTEND_URL").rstrip("/")

# --------------------------------------------------------------------------
# Applications
# --------------------------------------------------------------------------
DJANGO_CORE_APPS = [
    "daphne",  # ASGI server app (must be first for runserver to use ASGI)
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "channels",
]

# AUREVIA_APPS — integration adds: "apps.analytics", "apps.goals",
# "apps.watchlists", "apps.research"
AUREVIA_APPS = [
    "apps.accounts",
    "apps.core",
    "apps.portfolios",
    "apps.reports",
    "apps.notifications",
    "apps.analytics",
    "apps.goals",
    "apps.watchlists",
    "apps.research",
    "seed",  # management commands only (seed_demo)
]

INSTALLED_APPS = DJANGO_CORE_APPS + THIRD_PARTY_APPS + AUREVIA_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "aurevia.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "aurevia.wsgi.application"
ASGI_APPLICATION = "aurevia.asgi.application"

# --------------------------------------------------------------------------
# Database / Cache / Channels
# --------------------------------------------------------------------------
DATABASES = {
    # Production sets DATABASE_URL (postgres://...). Defaults to sqlite so the
    # project can be sanity-checked locally without a running database server.
    "default": env.db("DATABASE_URL", default="sqlite:///db.sqlite3"),
}

REDIS_URL = env("REDIS_URL", default=None)

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "KEY_PREFIX": "aurevia",
            "TIMEOUT": 300,
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
else:
    # Local-dev fallbacks (compose always sets REDIS_URL).
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "aurevia-local",
            "KEY_PREFIX": "aurevia",
            "TIMEOUT": 300,
        }
    }
    CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }

# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DATETIME_FORMAT": "%Y-%m-%dT%H:%M:%SZ",
    "DATE_FORMAT": "%Y-%m-%d",
    "DATE_INPUT_FORMATS": ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ", "iso-8601"],
}

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

# --------------------------------------------------------------------------
# Celery (broker = Redis, see ARCHITECTURE.md §10)
# --------------------------------------------------------------------------
CELERY_BROKER_URL = REDIS_URL or "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = REDIS_URL or "redis://localhost:6379/0"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"
CELERY_BEAT_SCHEDULE = {
    "refresh-market-prices": {
        "task": "apps.core.tasks.refresh_market_prices",
        "schedule": crontab(minute=0, hour="*"),
    },
    "check-watchlist-alerts": {
        "task": "apps.watchlists.tasks.check_watchlist_alerts",
        "schedule": crontab(minute="*/5"),
    },
    "check-goal-milestones": {
        "task": "apps.goals.tasks.check_goal_milestones",
        "schedule": crontab(hour=1, minute=0),
    },
    "dividend-reminders": {
        "task": "apps.portfolios.tasks.dividend_reminders",
        "schedule": crontab(hour=8, minute=0),
    },
    "cleanup-expired-tokens": {
        "task": "apps.accounts.tasks.cleanup_expired_tokens",
        "schedule": crontab(hour=3, minute=30),
    },
    # --- scale-up expansion tasks (2026-08-16) ---
    "generate-daily-insights": {
        "task": "apps.insights.tasks.generate_daily_insights",
        "schedule": crontab(hour=6, minute=0),
    },
    "fetch-market-news": {
        "task": "apps.core.tasks.fetch_market_news",
        "schedule": crontab(hour=7, minute=0),
    },
    "process-contribution-plans": {
        "task": "apps.portfolios.tasks.process_contribution_plans",
        "schedule": crontab(hour=8, minute=30),
    },
    "process-scheduled-reports": {
        "task": "apps.reports.tasks.process_scheduled_reports",
        "schedule": crontab(hour=9, minute=0),
    },
    "daily-digest": {
        "task": "apps.notifications.tasks.daily_digest",
        "schedule": crontab(hour=18, minute=0),
    },
}

# --------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------
EMAIL_BACKEND = env("EMAIL_BACKEND")
EMAIL_HOST = env("EMAIL_HOST", default=None)
EMAIL_PORT = env("EMAIL_PORT", default=None)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default=None)
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default=None)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")

# --------------------------------------------------------------------------
# Market data (see apps.core.providers)
# --------------------------------------------------------------------------
MARKET_DATA_PROVIDER = env("MARKET_DATA_PROVIDER")
ALPHAVANTAGE_API_KEY = env("ALPHAVANTAGE_API_KEY")

# --------------------------------------------------------------------------
# i18n / static / media
# --------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
