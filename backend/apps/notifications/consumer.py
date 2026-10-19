"""Channels WebSocket consumer for real-time notifications.

Auth: JWT passed as ``?token=<access_token>`` query parameter (WebSockets
can't set Authorization headers). Connection is rejected with code 4001 when
the token is missing/invalid.
"""
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .services import serialize_notification


def _get_user_from_token(token: str):
    """Return the user for a valid JWT access token, or None."""
    from django.contrib.auth import get_user_model

    from rest_framework_simplejwt.tokens import AccessToken

    User = get_user_model()
    try:
        access = AccessToken(token)
        user = User.objects.get(pk=access["user_id"], is_active=True)
        return user
    except Exception:
        return None


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Joins the group ``user_<pk>`` and forwards notification messages."""

    async def connect(self):
        from urllib.parse import parse_qs

        query = parse_qs(self.scope.get("query_string", b"").decode("utf-8"))
        token = (query.get("access_token") or [None])[0]
        if not token:
            await self.close(code=4001)
            return

        self.user = await database_sync_to_async(_get_user_from_token)(token)
        if self.user is None:
            await self.close(code=4001)
            return

        self.group_name = f"user_{self.user.pk}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Server pushes only; acknowledge pings so clients can keep alive.
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def notification_message(self, event):
        """Handler for channel-layer messages of type 'notification.message'."""
        await self.send_json(event["notification"])
