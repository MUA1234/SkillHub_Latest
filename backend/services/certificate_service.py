"""
Phase I4 — Certificate of completion generator.

Renders a single-page PDF on demand using reportlab. The certificate
chrome ("Certificate of Completion", body text, date label) ships with
trilingual copy stored per-language; the *dynamic* fields (student
name, course title, teacher name) are passed through as-is so a Sinhala
or Tamil course title renders correctly assuming the chosen font carries
the glyphs.

Font caveat: reportlab's default `Helvetica` does not carry Sinhala or
Tamil glyphs. We try to locate a system-installed Noto / Lohit /
DejaVu TTF and register it; if none is found we fall back to Helvetica
and the dynamic strings degrade to whatever the font can render (Latin-1
only on default Helvetica). This is intentionally a *generator* concern
rather than a hard failure — a cert always renders, just with a font
warning logged when the locale-appropriate face isn't installed.
"""

from __future__ import annotations

import io
import logging
import os
from datetime import datetime
from typing import Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)


_COPY = {
    "en": {
        "title": "Certificate of Completion",
        "intro": "This is to certify that",
        "body": "has successfully completed the course",
        "taught_by": "Taught by",
        "issued_on": "Issued on",
        "platform": "SkillHub Sri Lanka",
        "tagline": "Inclusive education for every learner",
    },
    "si": {
        "title": "සම්පූර්ණ කිරීමේ සහතිකය",
        "intro": "මෙයින් සහතික කරනු ලබන්නේ",
        "body": "පාඨමාලාව සාර්ථකව සම්පූර්ණ කර ඇත",
        "taught_by": "ඉගැන්වූයේ",
        "issued_on": "නිකුත් කළ දිනය",
        "platform": "SkillHub ශ්‍රී ලංකා",
        "tagline": "සෑම ඉගෙනුම්කරුවෙකුට අඩංගු අධ්‍යාපනය",
    },
    "ta": {
        "title": "முடிவுச் சான்றிதழ்",
        "intro": "இது சான்றளிக்கப்படுகிறது",
        "body": "பாடநெறியை வெற்றிகரமாக முடித்துள்ளார்",
        "taught_by": "கற்பித்தவர்",
        "issued_on": "வழங்கப்பட்ட தேதி",
        "platform": "SkillHub இலங்கை",
        "tagline": "ஒவ்வொரு கற்பவருக்கும் உள்ளடக்கிய கல்வி",
    },
}


_FONT_CANDIDATES = [
    "/app/fonts/NotoSans-Regular.ttf",
    "/app/fonts/NotoSansSinhala-Regular.ttf",
    "/app/fonts/NotoSansTamil-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansSinhala-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "C:/Windows/Fonts/NotoSans-Regular.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
]

_FONT_NAME = "Helvetica"
_FONT_NAME_BOLD = "Helvetica-Bold"
_FONT_REGISTERED = False


def _register_unicode_font() -> None:
    """Register a Unicode-capable TTF the first time the generator runs.

    No-op if already registered. Silently degrades to Helvetica if no
    candidate path exists — a cert is more useful than a 500.
    """
    global _FONT_NAME, _FONT_NAME_BOLD, _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    for path in _FONT_CANDIDATES:
        if path and os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("SkillHubBody", path))
                _FONT_NAME = "SkillHubBody"
                bold_path = path.replace("-Regular", "-Bold")
                if bold_path != path and os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont("SkillHubBold", bold_path))
                    _FONT_NAME_BOLD = "SkillHubBold"
                else:
                    _FONT_NAME_BOLD = "SkillHubBody"
                logger.info("Certificate font registered: %s", path)
                _FONT_REGISTERED = True
                return
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to register %s: %s", path, exc)
                continue
    logger.info(
        "No Unicode font found; certificate body will use Helvetica "
        "(non-Latin scripts may render as boxes)."
    )
    _FONT_REGISTERED = True


def generate_certificate_pdf(
    *,
    student_name: str,
    course_title: str,
    teacher_name: str,
    completion_date: Optional[datetime] = None,
    lang: str = "en",
    certificate_id: Optional[str] = None,
) -> bytes:
    """Render a certificate PDF and return the bytes.

    Args:
        student_name: full name as it should appear on the cert.
        course_title: title of the course.
        teacher_name: lead teacher; supports "Taught by <name>".
        completion_date: when the course was completed; defaults to now.
        lang: 'en' / 'si' / 'ta' — falls back to 'en' for unknown locales.
        certificate_id: optional unique id printed in the footer for
            anti-forgery cross-reference; not validated here.
    """
    _register_unicode_font()
    copy = _COPY.get(lang) or _COPY["en"]
    completion_date = completion_date or datetime.utcnow()

    buf = io.BytesIO()
    page_size = landscape(A4)
    width, height = page_size
    c = canvas.Canvas(buf, pagesize=page_size)

    c.setStrokeColor(HexColor("#1e40af"))
    c.setLineWidth(4)
    c.rect(10 * mm, 10 * mm, width - 20 * mm, height - 20 * mm, stroke=1, fill=0)
    c.setStrokeColor(HexColor("#3b82f6"))
    c.setLineWidth(1)
    c.rect(14 * mm, 14 * mm, width - 28 * mm, height - 28 * mm, stroke=1, fill=0)

    c.setFillColor(HexColor("#1e3a8a"))
    c.setFont(_FONT_NAME_BOLD, 14)
    c.drawString(20 * mm, height - 25 * mm, copy["platform"])
    c.setFont(_FONT_NAME, 10)
    c.setFillColor(HexColor("#64748b"))
    c.drawString(20 * mm, height - 30 * mm, copy["tagline"])

    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_FONT_NAME_BOLD, 36)
    c.drawCentredString(width / 2, height - 60 * mm, copy["title"])

    c.setStrokeColor(HexColor("#f59e0b"))
    c.setLineWidth(2)
    c.line(width / 2 - 60 * mm, height - 64 * mm, width / 2 + 60 * mm, height - 64 * mm)

    c.setFont(_FONT_NAME, 14)
    c.setFillColor(HexColor("#334155"))
    c.drawCentredString(width / 2, height - 80 * mm, copy["intro"])

    c.setFont(_FONT_NAME_BOLD, 24)
    c.setFillColor(HexColor("#1e3a8a"))
    c.drawCentredString(width / 2, height - 95 * mm, student_name)

    c.setFont(_FONT_NAME, 13)
    c.setFillColor(HexColor("#334155"))
    c.drawCentredString(width / 2, height - 108 * mm, copy["body"])

    c.setFont(_FONT_NAME_BOLD, 18)
    c.setFillColor(HexColor("#0f172a"))
    c.drawCentredString(width / 2, height - 122 * mm, course_title)

    footer_y = 35 * mm
    c.setFont(_FONT_NAME, 11)
    c.setFillColor(HexColor("#475569"))
    c.drawString(
        25 * mm,
        footer_y,
        f"{copy['taught_by']}: {teacher_name}",
    )

    date_str = completion_date.strftime("%d %B %Y")
    c.drawRightString(
        width - 25 * mm,
        footer_y,
        f"{copy['issued_on']}: {date_str}",
    )

    if certificate_id:
        c.setFont(_FONT_NAME, 8)
        c.setFillColor(HexColor("#94a3b8"))
        c.drawCentredString(width / 2, 18 * mm, f"Certificate ID: {certificate_id}")

    c.showPage()
    c.save()
    return buf.getvalue()
