"""
Payment receipt PDF generator.

Renders a portrait-A4 PDF on demand using reportlab. Mirrors the structure
of certificate_service.py — single entry point, in-memory output, no
filesystem caching — so receipts stay fresh as profile data changes.

The frontend payment-history pages (student + teacher) trigger a download
via /payment-history/{id}/receipt; this generator is the producer. Earlier
the module was a `NotImplementedError`-throwing stub, which silently broke
both endpoints — student returned JSON masquerading as PDF, teacher 500'd.

The shape passed in matches the `payment_data` dict that teachers.py
already builds; students.py was patched in the same change to construct
an equivalent dict before calling here.
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)


_ESPRESSO = HexColor("#2B1F18")
_CREAM = HexColor("#FAF1DD")
_CREAM_300 = HexColor("#EBD8B4")
_TERRACOTTA = HexColor("#E97A3C")
_FOREST = HexColor("#7A9B5C")
_MUTED = HexColor("#6E5742")


def _format_amount(amount: float, currency: str) -> str:
    """Format a monetary amount with thousand-separators and currency code."""
    try:
        return f"{currency.upper()} {float(amount):,.2f}"
    except (TypeError, ValueError):
        return f"{currency} {amount}"


def _parse_date(value: Optional[str]) -> datetime:
    if not value:
        return datetime.utcnow()
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        try:
            return datetime.strptime(str(value), "%Y-%m-%d")
        except (TypeError, ValueError):
            return datetime.utcnow()


def _draw_label_value(
    c: canvas.Canvas,
    x: float,
    y: float,
    label: str,
    value: str,
    *,
    value_size: int = 11,
    value_color: HexColor = _ESPRESSO,
) -> None:
    """Two-line label/value row used throughout the body of the receipt."""
    c.setFillColor(_MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, label.upper())
    c.setFillColor(value_color)
    c.setFont("Helvetica-Bold", value_size)
    c.drawString(x, y - 14, value)


def generate_receipt(payment: Dict[str, Any]) -> bytes:
    """Generate a PDF receipt from a payment dict.

    The accepted dict shape is intentionally loose — both the student and
    teacher endpoints build it slightly differently. We pull keys with
    `.get` everywhere so a missing field degrades to a blank line rather
    than raising.

    Returns the PDF bytes, ready to be streamed as a `Response` with
    `application/pdf`.
    """
    buf = io.BytesIO()
    width, height = A4
    c = canvas.Canvas(buf, pagesize=A4)

    c.setFillColor(_ESPRESSO)
    c.rect(0, height - 32 * mm, width, 32 * mm, stroke=0, fill=1)

    c.setFillColor(_CREAM)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, height - 18 * mm, "SkillHub")
    c.setFont("Helvetica", 9)
    c.setFillColor(_CREAM_300)
    c.drawString(20 * mm, height - 24 * mm, "Inclusive education for every learner")

    c.setFillColor(_TERRACOTTA)
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(width - 20 * mm, height - 18 * mm, "Payment Receipt")
    c.setFillColor(_CREAM_300)
    c.setFont("Helvetica", 9)
    transaction_id = str(payment.get("transactionId") or payment.get("transaction_id") or payment.get("id") or "—")
    c.drawRightString(width - 20 * mm, height - 25 * mm, f"#{transaction_id}")

    card_top = height - 38 * mm
    card_h = 36 * mm
    c.setFillColor(_CREAM)
    c.setStrokeColor(_ESPRESSO)
    c.setLineWidth(1.2)
    c.roundRect(15 * mm, card_top - card_h, width - 30 * mm, card_h, 4 * mm, stroke=1, fill=1)

    status = str(payment.get("status") or "paid").lower()
    status_label = status.upper()
    status_color = {
        "paid": _FOREST,
        "completed": _FOREST,
        "pending": _TERRACOTTA,
        "overdue": HexColor("#E85A4F"),
        "refunded": _MUTED,
        "cancelled": _MUTED,
    }.get(status, _MUTED)

    amount_text = _format_amount(
        payment.get("amount", 0),
        str(payment.get("currency") or "LKR"),
    )
    c.setFillColor(_ESPRESSO)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(22 * mm, card_top - 16 * mm, amount_text)

    c.setFillColor(_MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(22 * mm, card_top - 22 * mm, "AMOUNT PAID")

    pill_text = status_label
    c.setFillColor(status_color)
    pill_w = c.stringWidth(pill_text, "Helvetica-Bold", 9) + 14
    pill_h = 9 * mm
    pill_x = width - 20 * mm - pill_w
    pill_y = card_top - 14 * mm
    c.roundRect(pill_x, pill_y, pill_w, pill_h, pill_h / 2, stroke=0, fill=1)
    c.setFillColor(_CREAM)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(pill_x + pill_w / 2, pill_y + 2.5 * mm, pill_text)

    date_text = _parse_date(payment.get("date") or payment.get("created_at")).strftime("%d %b %Y")
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawRightString(width - 22 * mm, card_top - 23 * mm, date_text)

    grid_top = card_top - card_h - 12 * mm
    left_x = 22 * mm
    right_x = width / 2 + 4 * mm

    description = str(payment.get("description") or payment.get("courseName") or "Payment")
    teacher_name = str(payment.get("teacherName") or payment.get("teacher_name") or "—")
    payment_method = str(payment.get("paymentMethod") or payment.get("payment_method") or "—")
    payment_type = str(payment.get("type") or payment.get("payment_type") or "—").replace("_", " ").title()

    _draw_label_value(c, left_x, grid_top, "Description", description, value_size=12)
    _draw_label_value(c, right_x, grid_top, "Type", payment_type, value_size=12)

    _draw_label_value(c, left_x, grid_top - 22 * mm, "Teacher / Organizer", teacher_name)
    _draw_label_value(c, right_x, grid_top - 22 * mm, "Payment method", payment_method)

    _draw_label_value(c, left_x, grid_top - 44 * mm, "Transaction ID", transaction_id)
    _draw_label_value(c, right_x, grid_top - 44 * mm, "Currency", str(payment.get("currency") or "LKR").upper())

    totals_top = grid_top - 66 * mm
    c.setStrokeColor(_CREAM_300)
    c.setLineWidth(0.8)
    c.line(20 * mm, totals_top, width - 20 * mm, totals_top)

    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(22 * mm, totals_top - 10 * mm, "Subtotal")
    c.drawString(22 * mm, totals_top - 18 * mm, "Processing fee")
    c.setFillColor(_ESPRESSO)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(22 * mm, totals_top - 28 * mm, "Total paid")

    c.setFillColor(_ESPRESSO)
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 22 * mm, totals_top - 10 * mm, amount_text)
    c.drawRightString(width - 22 * mm, totals_top - 18 * mm, _format_amount(0, str(payment.get("currency") or "LKR")))
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(_TERRACOTTA)
    c.drawRightString(width - 22 * mm, totals_top - 28 * mm, amount_text)

    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(
        20 * mm,
        18 * mm,
        "Thank you for learning with SkillHub Sri Lanka. "
        "Questions about this charge? Email support@skillhub.lk.",
    )
    c.setFont("Helvetica", 7)
    c.drawString(
        20 * mm,
        12 * mm,
        f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · "
        f"This is an electronic receipt — no signature required.",
    )

    c.showPage()
    c.save()
    pdf = buf.getvalue()
    buf.close()
    return pdf


class _ReceiptGenerator:
    """Compatibility shim for the existing teachers.py callsite.

    The legacy code calls ``receipt_generator.generate_receipt(payment)``;
    new code can also call :func:`generate_receipt` directly.
    """

    def generate_receipt(self, payment: Dict[str, Any]) -> bytes:
        return generate_receipt(payment)

    def generate(self, payment: Dict[str, Any]) -> bytes:
        return generate_receipt(payment)

    def __call__(self, payment: Dict[str, Any]) -> bytes:
        return generate_receipt(payment)


receipt_generator = _ReceiptGenerator()
