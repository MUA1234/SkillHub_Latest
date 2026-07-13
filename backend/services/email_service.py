"""
SMTP email delivery + multilingual template rendering.

Templates live in `backend/templates/email/{lang}/{name}.html` (with a `.subject.txt`
sibling for the subject line). Languages: `en`, `si`, `ta`. Falls back to
English when the requested language is missing a template.

Sending is best-effort: if SMTP credentials are missing or the relay errors
out, we log and return False so callers can decide how to react. Auth flows
should still record the underlying token even when the email failed, so the
user can request a resend.
"""

from __future__ import annotations

import logging
import ssl
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable, Optional

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from config import settings

logger = logging.getLogger(__name__)

TEMPLATE_ROOT = Path(__file__).resolve().parent.parent / "templates" / "email"
SUPPORTED_LANGS = ("en", "si", "ta")
DEFAULT_LANG = "en"

_jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_ROOT)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _normalize_lang(lang: Optional[str]) -> str:
    if not lang:
        return DEFAULT_LANG
    base = lang.split("-")[0].lower()
    return base if base in SUPPORTED_LANGS else DEFAULT_LANG


def _render(template_name: str, lang: str, context: dict) -> tuple[str, str]:
    """Return (subject, html_body) for the given template + language."""
    candidates: Iterable[str] = (lang, DEFAULT_LANG)
    last_error: Optional[Exception] = None
    for candidate in candidates:
        try:
            html = _jinja_env.get_template(f"{candidate}/{template_name}.html").render(**context)
            subject_template = _jinja_env.get_template(f"{candidate}/{template_name}.subject.txt")
            subject = subject_template.render(**context).strip()
            return subject, html
        except Exception as exc:  # pragma: no cover - covered by happy path tests
            last_error = exc
            continue
    raise RuntimeError(f"Email template '{template_name}' not found for any language") from last_error


def _emails_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_password)


async def send_email(
    *,
    to_email: str,
    template: str,
    context: dict,
    lang: Optional[str] = None,
    to_name: Optional[str] = None,
) -> bool:
    """Render a template and send it. Returns True on successful delivery."""
    if not to_email:
        logger.warning("Email send skipped: no recipient address")
        return False

    resolved_lang = _normalize_lang(lang)
    subject, html_body = _render(template, resolved_lang, context)

    if not _emails_configured():
        try:
            outbox = Path(__file__).resolve().parent.parent / "dev_outbox"
            outbox.mkdir(exist_ok=True)
            stamp = __import__("datetime").datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            safe = "".join(c if c.isalnum() else "-" for c in to_email)[:60]
            path = outbox / f"{stamp}_{template}_{safe}.html"
            header = (
                f"<!-- To: {to_email}\n"
                f"     Subject: {subject}\n"
                f"     Template: {template} (lang={resolved_lang}) -->\n"
            )
            path.write_text(header + html_body, encoding="utf-8")
            logger.info(
                "📧 [dev outbox] %s -> %s | template=%s lang=%s | file=%s",
                settings.emails_from_email, to_email, template, resolved_lang, path.name,
            )
        except Exception as exc:
            logger.warning("dev outbox write failed: %s", exc)
        return True

    message = EmailMessage()
    message["From"] = f"{settings.emails_from_name} <{settings.emails_from_email}>"
    message["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    message["Subject"] = subject
    message.set_content(_html_to_plain(html_body))
    message.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=settings.smtp_tls,
            tls_context=ssl.create_default_context() if settings.smtp_tls else None,
            timeout=20,
        )
        logger.info("📧 Sent %s email to %s (lang=%s)", template, to_email, resolved_lang)
        return True
    except Exception as exc:
        logger.error("❌ Failed to send %s email to %s: %s", template, to_email, exc)
        return False


def _html_to_plain(html: str) -> str:
    """Cheap HTML→text fallback. Good enough for transactional emails."""
    import re
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()



async def send_verification_email(
    *, to_email: str, verification_url: str, first_name: Optional[str] = None,
    lang: Optional[str] = None,
) -> bool:
    return await send_email(
        to_email=to_email,
        to_name=first_name,
        template="verify",
        lang=lang,
        context={
            "first_name": first_name or "",
            "verification_url": verification_url,
            "from_name": settings.emails_from_name,
        },
    )


async def send_password_reset_email(
    *, to_email: str, reset_url: str, first_name: Optional[str] = None,
    lang: Optional[str] = None,
) -> bool:
    return await send_email(
        to_email=to_email,
        to_name=first_name,
        template="reset",
        lang=lang,
        context={
            "first_name": first_name or "",
            "reset_url": reset_url,
            "from_name": settings.emails_from_name,
        },
    )


async def send_welcome_email(
    *, to_email: str, first_name: Optional[str] = None, role: Optional[str] = None,
    lang: Optional[str] = None,
) -> bool:
    return await send_email(
        to_email=to_email,
        to_name=first_name,
        template="welcome",
        lang=lang,
        context={
            "first_name": first_name or "",
            "role": role or "",
            "from_name": settings.emails_from_name,
            "frontend_url": settings.frontend_url,
        },
    )


async def send_receipt_email(
    *,
    to_email: str,
    first_name: Optional[str] = None,
    item_title: str = "SkillHub session",
    amount_lkr: float = 0.0,
    currency: str = "LKR",
    method: str = "card",
    transaction_id: str = "",
    paid_at: Optional[str] = None,
    is_demo: bool = False,
    lang: Optional[str] = None,
) -> bool:
    """Post-payment receipt. Wired from the demo-payment flow; ready for
    the real gateway when it lands."""
    return await send_email(
        to_email=to_email,
        to_name=first_name,
        template="receipt",
        lang=lang,
        context={
            "first_name": first_name or "",
            "item_title": item_title,
            "amount_formatted": f"{amount_lkr:,.0f}",
            "currency": currency,
            "method": method,
            "transaction_id": transaction_id,
            "paid_at": paid_at or "",
            "is_demo": is_demo,
            "from_name": settings.emails_from_name,
        },
    )


async def send_scholarship_status_email(
    *,
    to_email: str,
    first_name: Optional[str] = None,
    scholarship_title: str = "",
    approved: bool = False,
    amount_lkr: float = 0.0,
    currency: str = "LKR",
    reviewer_notes: Optional[str] = None,
    lang: Optional[str] = None,
) -> bool:
    return await send_email(
        to_email=to_email,
        to_name=first_name,
        template="scholarship_status",
        lang=lang,
        context={
            "first_name": first_name or "",
            "scholarship_title": scholarship_title,
            "approved": approved,
            "amount_formatted": f"{amount_lkr:,.0f}",
            "currency": currency,
            "reviewer_notes": reviewer_notes or "",
            "applications_url": f"{settings.frontend_url.rstrip('/')}/students/scholarships/applications",
            "scholarships_url": f"{settings.frontend_url.rstrip('/')}/students/scholarships",
            "from_name": settings.emails_from_name,
        },
    )


async def send_session_reminder_email(
    *,
    to_email: str,
    first_name: Optional[str] = None,
    session_title: str = "",
    teacher_name: str = "",
    when_local: str = "",
    join_url: str = "",
    lang: Optional[str] = None,
) -> bool:
    """Reminder for an upcoming live session. Fanned out by the
    `/admin/send-session-reminders` endpoint (which a Railway scheduled
    job pings every 15 minutes), so the per-recipient call site is
    intentionally just template+context."""
    return await send_email(
        to_email=to_email,
        to_name=first_name,
        template="session_reminder",
        lang=lang,
        context={
            "first_name": first_name or "",
            "session_title": session_title or "your session",
            "teacher_name": teacher_name or "",
            "when_local": when_local or "",
            "join_url": join_url or settings.frontend_url,
            "from_name": settings.emails_from_name,
        },
    )


async def send_guardian_invite_email(
    *,
    to_email: str,
    invite_url: str,
    student_name: str,
    guardian_name: Optional[str] = None,
    lang: Optional[str] = None,
) -> bool:
    """Phase H2 — invite a guardian on behalf of a student.

    The student picks the guardian's display language indirectly via their
    own preferred language; English is the safe fallback when neither side
    has specified one yet.
    """
    return await send_email(
        to_email=to_email,
        to_name=guardian_name,
        template="guardian_invite",
        lang=lang,
        context={
            "guardian_name": guardian_name or "",
            "student_name": student_name or "your student",
            "invite_url": invite_url,
            "from_name": settings.emails_from_name,
        },
    )
