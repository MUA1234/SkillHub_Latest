"""
LiveKit — mint access tokens so a participant can join a live video room.

Rooms map 1:1 to live sessions (room name = session id). The client connects to
`settings.livekit_url` with the token this service returns; LiveKit handles the
SFU + TURN, so no signaling/WebRTC plumbing lives in our app.
"""

from __future__ import annotations

import logging
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)


def create_token(
    room: str,
    identity: str,
    name: str = "",
    metadata: Optional[str] = None,
    can_publish: bool = True,
) -> str:
    """A JWT granting `identity` permission to join `room`. Raises if LiveKit
    isn't configured — callers should guard with settings.livekit_enabled."""
    if not settings.livekit_enabled:
        raise RuntimeError("LiveKit is not configured (set LIVEKIT_* env vars).")

    from livekit import api  # imported lazily so the app boots without the SDK

    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name(name or identity)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=can_publish,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
    )
    if metadata:
        token = token.with_metadata(metadata)
    return token.to_jwt()
