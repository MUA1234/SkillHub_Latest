"""
Phase J4 — SMS companion service.

Outbound SMS delivery via Twilio (the only SDK we declare a dep on)
with a graceful degradation path: when `TWILIO_*` env vars aren't set
the service no-ops and returns `False`, so every caller can fire-and-
forget without conditionally checking config. Mirrors the Phase F3
push pattern of "missing config = degrade silently, never break the
calling flow."

Sri Lankan local gateway integrations (Dialog SDP, Mobitel) are
intentionally pluggable via a `_send_via_*` strategy — the public
`send_sms` picks the configured one. For the MVP only Twilio's path
is implemented because it's the global option and useful for
end-to-end testing; a Dialog/Mobitel adapter can land alongside the
operator-supplied credentials.

Inbound (the spec's "PROGRESS COURSEID" reply) is out of scope here:
it needs a webhook endpoint + a parsed-message router. Easy follow-up
once outbound is in production.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)


_PHONE_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


def _normalize_phone(phone: str) -> Optional[str]:
    """E.164-ish normalization. Strips spaces / dashes / parens; tolerates
    leading 0 by prepending the country code when one is configured."""
    if not phone:
        return None
    cleaned = re.sub(r"[\s\-()]", "", phone)
    if cleaned.startswith("0"):
        default_cc = getattr(settings, "default_country_code", "+94")
        cleaned = default_cc + cleaned[1:]
    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    return cleaned if _PHONE_RE.match(cleaned) else None


def is_configured() -> bool:
    """True when the SMS pipeline has the credentials it needs to send."""
    sid = getattr(settings, "twilio_account_sid", None)
    token = getattr(settings, "twilio_auth_token", None)
    sender = getattr(settings, "twilio_sender", None)
    return bool(sid and token and sender)


def send_sms(to_phone: str, body: str) -> bool:
    """Send a single SMS. Returns True on accepted-for-delivery, False on
    config-missing or transport error. Never raises into the caller's
    notification path — SMS is best-effort.

    Body is truncated to 320 chars (~2 segments) to avoid runaway charges
    on a noisy notification.
    """
    if not is_configured():
        logger.debug("SMS not configured — skipping send to %s", to_phone)
        return False

    e164 = _normalize_phone(to_phone)
    if not e164:
        logger.warning("Invalid SMS recipient: %s", to_phone)
        return False

    text = (body or "").strip()[:320]
    if not text:
        return False

    try:
        from twilio.rest import Client  # type: ignore

        client = Client(
            settings.twilio_account_sid,
            settings.twilio_auth_token,
        )
        client.messages.create(
            to=e164,
            from_=settings.twilio_sender,
            body=text,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("SMS send failed to %s: %s", e164, exc)
        return False




def send_session_reminder(to_phone: str, session_title: str, when_human: str) -> bool:
    return send_sms(
        to_phone,
        f"SkillHub: '{session_title}' starts {when_human}. Open the app to join.",
    )


def send_payment_confirmation(
    to_phone: str, session_title: str, amount_lkr: float
) -> bool:
    return send_sms(
        to_phone,
        f"SkillHub: Payment of LKR {amount_lkr:,.0f} for '{session_title}' received. Thank you.",
    )


def send_scholarship_status(
    to_phone: str, scholarship_title: str, status: str
) -> bool:
    return send_sms(
        to_phone,
        f"SkillHub scholarship '{scholarship_title}': {status}. Check the app for details.",
    )
