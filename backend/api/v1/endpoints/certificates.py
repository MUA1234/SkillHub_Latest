"""
Phase I4 — Certificates endpoints.

A student earns a certificate once their `course_enrollments.status` flips
to `completed`. We don't precompute or cache the PDF — generation is fast
and the source data (name / course title / teacher) is small. Re-fetching
also means a name change on the student profile flows into the next
download without a backfill job.

Two endpoints:

  - `GET /students/certificates` — list every completed enrollment with the
    metadata needed to render a download card.
  - `GET /students/courses/{enrollment_id}/certificate` — stream a freshly
    rendered PDF for one completed enrollment. 404 if the enrollment isn't
    completed or doesn't belong to the caller.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST
from services.certificate_service import generate_certificate_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _resolve_teacher_name(teacher_user_id: Optional[str]) -> str:
    if not teacher_user_id:
        return "SkillHub Teacher"
    profile = SupabaseREST.select_one(
        "user_profiles",
        "first_name,last_name",
        {"user_id": str(teacher_user_id)},
    ) or {}
    name = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
    if name:
        return name
    user = SupabaseREST.select_one("users", "email", {"id": str(teacher_user_id)})
    return (user or {}).get("email") or "SkillHub Teacher"


def _resolve_student_name(user_id: str) -> str:
    profile = SupabaseREST.select_one(
        "user_profiles",
        "first_name,last_name",
        {"user_id": str(user_id)},
    ) or {}
    name = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
    if name:
        return name
    user = SupabaseREST.select_one("users", "email", {"id": str(user_id)})
    return (user or {}).get("email") or "SkillHub Student"


@router.get("/students/certificates")
async def list_my_certificates(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Return every completed enrollment for the calling student plus the
    teacher / course metadata the download card needs to render."""
    user_id = str(current_user.id)

    enrollments = SupabaseREST.select(
        "course_enrollments",
        "id,course_id,status,completed_at,progress_percentage",
        {"student_id": user_id, "status": "completed"},
        order="completed_at.desc.nullslast",
    ) or []

    certificates: List[Dict[str, Any]] = []
    for e in enrollments:
        course = SupabaseREST.select_one(
            "courses",
            "id,title,teacher_id",
            {"id": str(e["course_id"])},
        ) or {}
        teacher_name = _resolve_teacher_name(course.get("teacher_id"))
        certificates.append(
            {
                "enrollment_id": str(e["id"]),
                "course_id": course.get("id"),
                "course_title": course.get("title") or "Untitled Course",
                "teacher_name": teacher_name,
                "completed_at": e.get("completed_at"),
                "progress_percentage": e.get("progress_percentage"),
            }
        )

    return {"success": True, "certificates": certificates}


@router.get("/students/courses/{enrollment_id}/certificate")
async def download_certificate(
    enrollment_id: str,
    lang: str = Query("en", description="Certificate language (en/si/ta)"),
    current_user: User = Depends(get_current_active_user),
) -> Response:
    """Generate and stream the certificate PDF.

    The `lang` query param picks the cert chrome; if omitted we honor the
    user's language_preferences row, falling back to English. We always
    re-render server-side (no storage caching) so a profile rename flows
    through immediately and there's no stale-asset issue.
    """
    user_id = str(current_user.id)

    enrollment = SupabaseREST.select_one(
        "course_enrollments",
        "id,course_id,student_id,status,completed_at",
        {"id": str(enrollment_id)},
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found.")
    if str(enrollment.get("student_id")) != user_id:
        raise HTTPException(status_code=403, detail="Not your enrollment.")
    if enrollment.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Course is not yet completed.",
        )

    course = SupabaseREST.select_one(
        "courses",
        "id,title,teacher_id",
        {"id": str(enrollment["course_id"])},
    ) or {}

    student_name = _resolve_student_name(user_id)
    teacher_name = _resolve_teacher_name(course.get("teacher_id"))
    completed_at = _parse_dt(enrollment.get("completed_at")) or datetime.utcnow()

    if lang == "en":
        lp = SupabaseREST.select_one(
            "language_preferences",
            "preferred_language",
            {"user_id": user_id},
        ) or {}
        lang = (lp.get("preferred_language") or "en")[:2]
    if lang not in {"en", "si", "ta"}:
        lang = "en"

    cert_id = f"SH-{str(enrollment_id).replace('-', '').upper()[:12]}"

    try:
        pdf = generate_certificate_pdf(
            student_name=student_name,
            course_title=course.get("title") or "Course",
            teacher_name=teacher_name,
            completion_date=completed_at,
            lang=lang,
            certificate_id=cert_id,
        )
    except Exception as exc:
        logger.error("Certificate generation failed for %s: %s", enrollment_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Could not generate certificate. Please try again.",
        )

    safe_title = (course.get("title") or "course").replace(" ", "-")[:60]
    filename = f"skillhub-certificate-{safe_title}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
