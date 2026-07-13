"""
Web Push delivery (Phase F3).

A thin wrapper over `pywebpush` that:
  - looks up every active push subscription for a user,
  - sends each one the supplied payload,
  - prunes subscriptions the push service rejects with 404/410 (the browser
    has unsubscribed — keeping the row would just keep failing forever).

The function is best-effort by design: callers should never let a transient
push failure bubble back into a user-facing 500. We log and move on.

Falls back to a no-op when VAPID keys are not configured. The bell + realtime
path covers users who haven't granted notification permission, so the
platform stays usable while VAPID is being set up.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import settings
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def _serialize_subscription(row: Dict[str, Any]) -> Dict[str, Any]:
    """Shape a `push_subscriptions` row into the dict pywebpush expects."""
    return {
        "endpoint": row["endpoint"],
        "keys": {"p256dh": row["p256dh"], "auth": row["auth"]},
    }


def send_push_to_user(
    user_id: str,
    title: str,
    body: str,
    *,
    url: Optional[str] = None,
    tag: Optional[str] = None,
    icon: Optional[str] = None,
) -> int:
    """Push `title` / `body` to every active subscription `user_id` owns.

    Returns the count of successful sends. Never raises — callers can safely
    invoke from inside a request handler without try/except.
    """
    if not _is_configured():
        return 0

    try:
        from pywebpush import webpush, WebPushException  # type: ignore
    except ImportError:
        logger.warning("pywebpush not installed; skipping push for user %s", user_id)
        return 0

    rows = SupabaseREST.select(
        "push_subscriptions",
        "*",
        {"user_id": str(user_id), "revoked_at": None},
        limit=20,
    )
    if not rows:
        return 0

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url or "/",
            "tag": tag,
            "icon": icon or "/images/logo.png",
        }
    )

    sent = 0
    for row in rows:
        try:
            webpush(
                subscription_info=_serialize_subscription(row),
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            SupabaseREST.update(
                "push_subscriptions",
                {"last_used_at": datetime.utcnow().isoformat()},
                {"id": row["id"]},
            )
            sent += 1
        except WebPushException as exc:  # type: ignore[misc]
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in (404, 410):
                SupabaseREST.update(
                    "push_subscriptions",
                    {"revoked_at": datetime.utcnow().isoformat()},
                    {"id": row["id"]},
                )
                logger.info("Push subscription %s revoked by client.", row["id"])
            else:
                logger.warning(
                    "Push send to user %s failed (%s): %s",
                    user_id,
                    status_code or "?",
                    exc,
                )
        except Exception as exc:  # pragma: no cover — pywebpush internals
            logger.warning("Push send error for user %s: %s", user_id, exc)
    return sent


def list_user_subscriptions(user_id: str) -> List[Dict[str, Any]]:
    """Return active subscriptions for a user (used by the settings page)."""
    return SupabaseREST.select(
        "push_subscriptions",
        "id, endpoint, user_agent, last_used_at, created_at",
        {"user_id": str(user_id), "revoked_at": None},
        limit=50,
    )
