"""
Phase M3 — Student progress report PDF.

A weekly / monthly snapshot for the student (and their guardian, when
linked). Reuses the font-registration logic from
`certificate_service.py` so non-Latin script renders correctly when a
Noto TTF is installed.

The body is concise on purpose — a wall of metrics is less useful than
a few honest numbers.
"""

from __future__ import annotations

import io
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from services.certificate_service import _register_unicode_font, _FONT_NAME, _FONT_NAME_BOLD


def generate_progress_report_pdf(
    *,
    student_name: str,
    period_label: str,
    sessions_attended: int,
    hours_studied: float,
    courses_active: int,
    courses_completed_this_period: int,
    avg_quiz_percentage: Optional[float] = None,
    upcoming_sessions: Optional[List[Dict[str, Any]]] = None,
    generated_at: Optional[datetime] = None,
) -> bytes:
    """Render a single-page progress report PDF."""
    _register_unicode_font()
    from services.certificate_service import _FONT_NAME as font, _FONT_NAME_BOLD as font_bold

    upcoming_sessions = upcoming_sessions or []
    generated_at = generated_at or datetime.utcnow()

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    c.setFillColor(HexColor("#1e3a8a"))
    c.rect(0, height - 28 * mm, width, 28 * mm, stroke=0, fill=1)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont(font_bold, 18)
    c.drawString(20 * mm, height - 15 * mm, "Progress Report")
    c.setFont(font, 10)
    c.drawString(20 * mm, height - 22 * mm, f"SkillHub Sri Lanka · {period_label}")

    y = height - 40 * mm
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(font_bold, 14)
    c.drawString(20 * mm, y, student_name)
    y -= 8 * mm
    c.setFont(font, 10)
    c.setFillColor(HexColor("#475569"))
    c.drawString(
        20 * mm, y, f"Generated {generated_at.strftime('%d %B %Y')}"
    )

    y -= 14 * mm
    kpis = [
        ("Sessions attended", str(sessions_attended)),
        ("Hours studied", f"{hours_studied:.1f}"),
        ("Active courses", str(courses_active)),
        ("Courses completed this period", str(courses_completed_this_period)),
        (
            "Quiz average",
            f"{avg_quiz_percentage:.1f}%" if avg_quiz_percentage is not None else "—",
        ),
    ]
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(font_bold, 12)
    c.drawString(20 * mm, y, "Highlights")
    y -= 8 * mm

    c.setStrokeColor(HexColor("#e5e7eb"))
    for label, val in kpis:
        c.setFont(font, 10)
        c.setFillColor(HexColor("#475569"))
        c.drawString(22 * mm, y, label)
        c.setFont(font_bold, 11)
        c.setFillColor(HexColor("#0f172a"))
        c.drawRightString(width - 22 * mm, y, val)
        c.line(22 * mm, y - 1.5 * mm, width - 22 * mm, y - 1.5 * mm)
        y -= 8 * mm

    if upcoming_sessions:
        y -= 6 * mm
        c.setFont(font_bold, 12)
        c.setFillColor(HexColor("#0f172a"))
        c.drawString(20 * mm, y, "Upcoming this week")
        y -= 8 * mm
        c.setFont(font, 10)
        c.setFillColor(HexColor("#475569"))
        for s in upcoming_sessions[:6]:
            title = (s.get("title") or "Session")[:60]
            when = s.get("scheduled_start") or ""
            try:
                when_dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
                when_str = when_dt.strftime("%a %d %b · %H:%M")
            except Exception:
                when_str = when or ""
            c.drawString(22 * mm, y, f"• {title}")
            c.drawRightString(width - 22 * mm, y, when_str)
            y -= 6 * mm

    c.setFont(font, 8)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawCentredString(
        width / 2,
        15 * mm,
        "Keep going — small consistent progress beats big bursts.",
    )

    c.showPage()
    c.save()
    return buf.getvalue()
