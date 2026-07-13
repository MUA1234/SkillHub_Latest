"""PayHere gateway adapter (Phase D follow-up — credential-gated).

This is the "only missing piece" the README's Phase D scope note referred to:
the real-gateway adapter that sits behind the existing demo checkout. It does
**nothing** unless `PAYHERE_MERCHANT_ID` + `PAYHERE_MERCHANT_SECRET` are set,
so the platform stays on the demo flow by default and the owner can switch to
live PayHere by configuring those env vars (plus `BACKEND_URL` so PayHere can
reach the notify webhook, and `PAYHERE_SANDBOX=false` to go live).

PayHere checkout flow (server-side responsibilities):
  1. We build a checkout payload and a `hash` and hand it to the frontend,
     which POSTs it as a form to PayHere's checkout page.
  2. The user pays on PayHere's hosted page.
  3. PayHere calls our `notify_url` server-to-server with the result and an
     `md5sig`. We recompute that signature and only trust the callback if it
     matches — this is the authoritative "payment completed" signal, never
     the browser redirect (which a user could forge).

Hash specs (per PayHere docs):
  checkout hash =
    UPPER( md5( merchant_id + order_id + amount + currency
                + UPPER(md5(merchant_secret)) ) )
  notify sig    =
    UPPER( md5( merchant_id + order_id + payhere_amount + payhere_currency
                + status_code + UPPER(md5(merchant_secret)) ) )

Amounts must be formatted to 2 decimals with no thousands separator
("1500.00"), and the same string used in the checkout must match what
PayHere echoes back in `payhere_amount`.
"""

from __future__ import annotations

import hashlib
from typing import Dict, Optional

from config import settings


def is_enabled() -> bool:
    """True only when real merchant credentials are configured."""
    return settings.payhere_enabled


def _md5_upper(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest().upper()


def format_amount(amount: float) -> str:
    """Format an amount the way PayHere expects: 2dp, no grouping."""
    return f"{float(amount):.2f}"


def _secret_hash() -> str:
    return _md5_upper((settings.payhere_merchant_secret or ""))


def generate_checkout_hash(order_id: str, amount: float, currency: str) -> str:
    """Build the `hash` field the frontend submits with the checkout form."""
    merchant_id = (settings.payhere_merchant_id or "")
    raw = f"{merchant_id}{order_id}{format_amount(amount)}{currency.upper()}{_secret_hash()}"
    return _md5_upper(raw)


def build_checkout_payload(
    *,
    order_id: str,
    amount: float,
    currency: str,
    items: str,
    return_url: str,
    cancel_url: str,
    notify_url: str,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    phone: str = "",
    address: str = "",
    city: str = "",
    country: str = "Sri Lanka",
) -> Dict[str, str]:
    """Assemble the full form payload (including `hash` + `action` URL) the
    frontend POSTs to PayHere. Caller is responsible for persisting a pending
    payment row keyed by `order_id` before redirecting."""
    currency = currency.upper()
    return {
        "action": settings.payhere_checkout_url,
        "sandbox": "true" if settings.payhere_sandbox else "false",
        "merchant_id": settings.payhere_merchant_id or "",
        "order_id": order_id,
        "items": items,
        "amount": format_amount(amount),
        "currency": currency,
        "hash": generate_checkout_hash(order_id, amount, currency),
        "return_url": return_url,
        "cancel_url": cancel_url,
        "notify_url": notify_url,
        "first_name": first_name or "",
        "last_name": last_name or "",
        "email": email or "",
        "phone": phone or "",
        "address": address or "",
        "city": city or "",
        "country": country or "Sri Lanka",
    }


def verify_notification(
    *,
    merchant_id: str,
    order_id: str,
    payhere_amount: str,
    payhere_currency: str,
    status_code: str,
    received_sig: str,
) -> bool:
    """Recompute the notify signature and constant-time compare it.

    Returns False on any mismatch — including a merchant_id that isn't ours,
    which guards against a spoofed callback aimed at a different merchant.
    """
    if not received_sig:
        return False
    if (merchant_id or "") != (settings.payhere_merchant_id or ""):
        return False
    raw = (
        f"{merchant_id}{order_id}{payhere_amount}{payhere_currency}"
        f"{status_code}{_secret_hash()}"
    )
    expected = _md5_upper(raw)
    import hmac
    return hmac.compare_digest(expected, (received_sig or "").upper())


STATUS_SUCCESS = "2"
STATUS_PENDING = "0"
STATUS_CANCELED = "-1"
STATUS_FAILED = "-2"
STATUS_CHARGEDBACK = "-3"


def status_to_payment_state(status_code: str) -> str:
    """Map a PayHere status_code to our `live_session_payments.payment_status`.

    Constrained to the values the table's CHECK allows
    ('pending','processing','completed','failed','refunded'). A user-canceled
    payment is folded into 'failed' (both mean "not paid") since the schema
    has no distinct 'canceled' state.
    """
    return {
        STATUS_SUCCESS: "completed",
        STATUS_PENDING: "pending",
        STATUS_CANCELED: "failed",
        STATUS_FAILED: "failed",
        STATUS_CHARGEDBACK: "refunded",
    }.get(str(status_code), "failed")
