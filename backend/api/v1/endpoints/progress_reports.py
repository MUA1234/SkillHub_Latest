"""
Phase M3 — Student progress report endpoint.

`GET /students/progress-report?period=week|month` streams a PDF
summary. The data assembly is small enough to do inline; no caching
needed (re-runs cost nothing for the user and the source data should
flow through without a stale-asset table).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST
from services.progress_report_service import generate_progress_report_pdf
from services.accessibility_report_service import generate_accessibility_report_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


def _role_value(user: User) -> str:
    return getattr(getattr(user, "role", None), "value", None) or str(
        getattr(user, "role", "") or ""
    )


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


@router.get("/students/progress-report")
async def download_progress_report(
    period: str = Query("week", pattern="^(week|month)$"),
    current_user: User = Depends(get_current_active_user),
) -> Response:
    if _role_value(current_user) != "student":
        raise HTTPException(status_code=403, detail="Student account required.")
    user_id = str(current_user.id)

    now = datetime.now(timezone.utc)
    days = 7 if period == "week" else 30
    since = now - timedelta(days=days)
    since_iso = since.isoformat()

    profile = SupabaseREST.select_one(
        "user_profiles", "first_name,last_name", {"user_id": user_id}
    ) or {}
    first = profile.get("first_name") or ""
    last = profile.get("last_name") or ""
    student_name = f"{first} {last}".strip()
    if not student_name:
        u = SupabaseREST.select_one("users", "email", {"id": user_id}) or {}
        student_name = u.get("email") or "Student"

    participants = SupabaseREST.select(
        "session_participants",
        "session_id,joined_at,attendance_duration_minutes",
        {"user_id": user_id},
    ) or []
    attended_session_ids: List[str] = []
    hours_minutes = 0
    for p in participants:
        joined = _parse_dt(p.get("joined_at"))
        if not joined or joined < since:
            continue
        sid = p.get("session_id")
        if sid:
            attended_session_ids.append(str(sid))
            hours_minutes += int(p.get("attendance_duration_minutes") or 0)

    enrollments = SupabaseREST.select(
        "course_enrollments",
        "id,course_id,status,completed_at",
        {"student_id": user_id},
    ) or []
    active_courses = sum(
        1 for e in enrollments if e.get("status") in (None, "active")
    )
    completed_this_period = 0
    for e in enrollments:
        if e.get("status") != "completed":
            continue
        ts = _parse_dt(e.get("completed_at"))
        if ts and ts >= since:
            completed_this_period += 1

    results = SupabaseREST.select(
        "examination_results",
        "percentage,submitted_at,status",
        {"student_id": user_id},
    ) or []
    pcts = [
        float(r["percentage"])
        for r in results
        if r.get("percentage") is not None
        and (_parse_dt(r.get("submitted_at")) or now) >= since
    ]
    avg_pct = round(sum(pcts) / len(pcts), 1) if pcts else None

    in_seven = (now + timedelta(days=7)).isoformat()
    upcoming: List[Dict[str, Any]] = []
    sess_part = SupabaseREST.select(
        "session_participants", "session_id", {"user_id": user_id}, limit=100
    ) or []
    seen_session_ids: set[str] = set()
    for sp in sess_part:
        sid = str(sp.get("session_id") or "")
        if not sid or sid in seen_session_ids:
            continue
        seen_session_ids.add(sid)
        sess = SupabaseREST.select_one(
            "live_sessions",
            "id,title,scheduled_start,scheduled_end,status",
            {"id": sid},
        )
        if (
            sess
            and (sess.get("scheduled_start") or "") >= now.isoformat()
            and (sess.get("scheduled_start") or "") <= in_seven
        ):
            upcoming.append(sess)
    upcoming.sort(key=lambda s: s.get("scheduled_start") or "")

    try:
        pdf = generate_progress_report_pdf(
            student_name=student_name,
            period_label="Past 7 days" if period == "week" else "Past 30 days",
            sessions_attended=len(attended_session_ids),
            hours_studied=hours_minutes / 60.0,
            courses_active=active_courses,
            courses_completed_this_period=completed_this_period,
            avg_quiz_percentage=avg_pct,
            upcoming_sessions=upcoming,
            generated_at=now,
        )
    except Exception as exc:
        logger.error("Progress report generation failed for %s: %s", user_id, exc)
        raise HTTPException(
            status_code=500, detail="Could not generate progress report."
        )

    safe_name = student_name.replace(" ", "-")[:40]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="skillhub-progress-{safe_name}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/students/accessibility-progress-report")
async def download_accessibility_progress_report(
    period: str = Query("week", pattern="^(week|month)$"),
    current_user: User = Depends(get_current_active_user),
) -> Response:
    """PDF summary of how the student used accessibility features over
    the period. Reads from `accessibility_usage_logs` — empty period
    still returns a valid (mostly-blank) PDF so the download itself
    never fails."""
    if _role_value(current_user) != "student":
        raise HTTPException(status_code=403, detail="Student account required.")
    user_id = str(current_user.id)

    now = datetime.now(timezone.utc)
    days = 7 if period == "week" else 30
    since = now - timedelta(days=days)
    since_iso = since.isoformat()

    profile = SupabaseREST.select_one(
        "user_profiles", "first_name,last_name", {"user_id": user_id}
    ) or {}
    student_name = " ".join(
        x for x in [profile.get("first_name"), profile.get("last_name")] if x
    ) or "Student"

    rows = SupabaseREST.select(
        "accessibility_usage_logs",
        "feature_name,feature_category,action,created_at",
        {"user_id": user_id, "created_at.gte": since_iso},
        order="created_at.desc",
        limit=1000,
    ) or []

    try:
        pdf = generate_accessibility_report_pdf(
            student_name=student_name,
            period_label="Past 7 days" if period == "week" else "Past 30 days",
            usage_rows=rows,
            generated_at=now,
        )
    except Exception as exc:
        logger.error(
            "Accessibility report generation failed for %s: %s", user_id, exc
        )
        raise HTTPException(
            status_code=500, detail="Could not generate accessibility report."
        )

    safe_name = student_name.replace(" ", "-")[:40]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="skillhub-accessibility-{safe_name}.pdf"'
            ),
            "Cache-Control": "no-store",
        },
    )
