"""
ASGI entrypoint — Channels routing.

WebSocket path ``ws/notifications/`` is handled by the notifications consumer
(JWT auth via ``?token=`` query param); everything else falls through to the
Django HTTP application.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aurevia.settings")

# Initialize Django before importing anything that touches the app registry.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from apps.notifications.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            URLRouter(websocket_urlpatterns)
,
    }
)
