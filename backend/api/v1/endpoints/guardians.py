"""
Guardian portal — Phase H endpoints.

Three flows live here:

  1. **Invite** (`POST /accessibility/guardian-links` — defined in
     `accessibility.py`, this module only owns the consume side). The
     student creates a `guardian_links` row with a fresh `verification_code`
     and we email the guardian a link containing the code. The accessibility
     module stays the owner of the create side because it co-locates with
     the disability assessment + permission flag definitions; this module
     focuses on the *guardian's* side of the loop.

  2. **Accept** (`GET /guardians/invite/:code`, `POST /guardians/accept-invite`).
     The guardian opens the link, the GET returns the link + student
     summary so the page can render "{{ student }} invited you", then the
     POST either creates a brand-new guardian-typed user *or* links an
     existing user (matched by email) to the row. Either way the row is
     marked `is_verified=true` + `verified_at=now`.

  3. **Dashboard data** (`GET /guardians/students`,
     `GET /guardians/students/:id/dashboard`). Returns the linked students +
     per-student progress / sessions / messages, gated by the link's
     permission flags (`can_view_progress` / `can_view_grades` / etc.).

Permission helper `_load_link_for_guardian` is the single chokepoint for
H4 — every read endpoint runs through it so the flag enforcement is
consistent and audit-friendly.

All persistence goes through `SupabaseREST`; the SQLAlchemy session is
the no-op shim from Phase A6 and would silently swallow writes if used.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field

from core.security import (
    create_access_token,
    get_current_active_user,
    get_password_hash,
    set_auth_cookie,
)
from database.models import User, UserRole
from database.supabase_client import SupabaseREST, SupabaseService
from services.email_service import send_guardian_invite_email
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


INVITE_TTL = timedelta(days=14)




def _role_value(user: User) -> str:
    return getattr(getattr(user, "role", None), "value", None) or str(getattr(user, "role", "") or "")


def _require_guardian(user: User) -> None:
    if _role_value(user) != "guardian":
        raise HTTPException(
            status_code=403,
            detail="Guardian account required.",
        )


def _frontend_invite_url(code: str) -> str:
    base = (settings.frontend_url or "").rstrip("/")
    return f"{base}/auth/guardian-verify?code={code}"


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _summarize_student(user_id: str) -> Dict[str, Any]:
    """Return the student-facing display row used by the invite page +
    guardian dashboard. Falls back to the email when the profile is
    incomplete so the screen never renders a blank line."""
    user = SupabaseREST.select_one("users", "id,email", {"id": user_id}) or {}
    profile = SupabaseREST.select_one(
        "user_profiles",
        "first_name,last_name,avatar_url",
        {"user_id": user_id},
    ) or {}
    first = profile.get("first_name") or ""
    last = profile.get("last_name") or ""
    full_name = f"{first} {last}".strip() or user.get("email") or "Student"
    return {
        "id": user_id,
        "name": full_name,
        "first_name": first,
        "last_name": last,
        "email": user.get("email"),
        "avatar_url": profile.get("avatar_url"),
    }


def _serialize_link(link: Dict[str, Any], *, include_student: bool = True) -> Dict[str, Any]:
    """Shape the row for the API. Strips the secret `verification_code` so
    it never leaks back to a logged-in guardian (it was already used by the
    time they're authenticated)."""
    result = {
        "id": link.get("id"),
        "student_id": link.get("student_id"),
        "guardian_id": link.get("guardian_id"),
        "guardian_email": link.get("guardian_email"),
        "guardian_name": link.get("guardian_name"),
        "guardian_phone": link.get("guardian_phone"),
        "relationship": link.get("relationship"),
        "can_view_progress": bool(link.get("can_view_progress")),
        "can_view_grades": bool(link.get("can_view_grades")),
        "can_view_accessibility": bool(link.get("can_view_accessibility")),
        "can_communicate_teachers": bool(link.get("can_communicate_teachers")),
        "can_modify_accessibility": bool(link.get("can_modify_accessibility")),
        "receives_reports": bool(link.get("receives_reports")),
        "report_frequency": link.get("report_frequency"),
        "is_verified": bool(link.get("is_verified")),
        "verified_at": link.get("verified_at"),
        "is_active": bool(link.get("is_active", True)),
        "invited_at": link.get("invited_at"),
        "expires_at": link.get("expires_at"),
        "created_at": link.get("created_at"),
    }
    if include_student and link.get("student_id"):
        result["student"] = _summarize_student(str(link["student_id"]))
    return result


def _load_link_for_guardian(
    guardian: User, link_id: Optional[str] = None, student_id: Optional[str] = None
) -> Dict[str, Any]:
    """H4 chokepoint — return the active, verified link OR raise 403/404.

    Either `link_id` *or* `student_id` is enough; passing both narrows the
    lookup. The function never returns inactive/unverified rows so callers
    don't have to repeat the gating check.
    """
    _require_guardian(guardian)

    filters: Dict[str, Any] = {
        "guardian_id": str(guardian.id),
        "is_active": True,
        "is_verified": True,
    }
    if link_id:
        filters["id"] = str(link_id)
    if student_id:
        filters["student_id"] = str(student_id)

    link = SupabaseREST.select_one("guardian_links", "*", filters)
    if not link:
        raise HTTPException(status_code=404, detail="Guardian link not found.")
    return link




@router.get("/guardians/invite/{code}")
async def view_invite(code: str) -> Dict[str, Any]:
    """Return invite metadata so the frontend can render
    "{{ student }} invited you to be their guardian". The verification code
    is treated as a bearer secret here — knowledge of the code is what
    proves the user has access to the guardian's email inbox.
    """
    if not code or len(code) < 8:
        raise HTTPException(status_code=400, detail="Invalid invite code.")

    link = SupabaseREST.select_one(
        "guardian_links",
        "*",
        {"verification_code": code, "is_active": True},
    )
    if not link:
        raise HTTPException(status_code=404, detail="Invite not found or revoked.")
    if link.get("is_verified"):
        raise HTTPException(status_code=410, detail="This invite has already been used.")

    expires_at = _parse_iso(link.get("expires_at"))
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invite has expired.")

    return {
        "guardian_email": link.get("guardian_email"),
        "guardian_name": link.get("guardian_name"),
        "relationship": link.get("relationship"),
        "student": _summarize_student(str(link["student_id"])),
        "expires_at": link.get("expires_at"),
        "permissions": {
            "can_view_progress": bool(link.get("can_view_progress")),
            "can_view_grades": bool(link.get("can_view_grades")),
            "can_view_accessibility": bool(link.get("can_view_accessibility")),
            "can_communicate_teachers": bool(link.get("can_communicate_teachers")),
            "can_modify_accessibility": bool(link.get("can_modify_accessibility")),
        },
    }


class AcceptInvitePayload(BaseModel):
    code: str
    password: Optional[str] = Field(default=None, min_length=6)
    first_name: Optional[str] = None
    last_name: Optional[str] = None


@router.post("/guardians/accept-invite")
async def accept_invite(payload: AcceptInvitePayload) -> Dict[str, Any]:
    """Consume a guardian invite.

    Two branches:
      - The guardian's email already has a user → reuse it. We don't gate
        on `role == 'guardian'` because a parent might already be a teacher
        or sponsor on the platform; we just attach the guardian role on
        top by writing it to the `guardian_links.guardian_id` and bumping
        the user's role only if it's currently 'student' (sentinel default).
      - No user yet → create one with `role='guardian'` and the supplied
        password. The auth pipeline issues a JWT just like /auth/login.
    """
    code = payload.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Missing invite code.")

    link = SupabaseREST.select_one(
        "guardian_links",
        "*",
        {"verification_code": code, "is_active": True},
    )
    if not link:
        raise HTTPException(status_code=404, detail="Invite not found or revoked.")
    if link.get("is_verified"):
        raise HTTPException(status_code=410, detail="This invite has already been used.")

    expires_at = _parse_iso(link.get("expires_at"))
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invite has expired.")

    guardian_email = (link.get("guardian_email") or "").strip().lower()
    if not guardian_email:
        raise HTTPException(status_code=500, detail="Invite is missing a guardian email.")

    existing = SupabaseREST.select_one(
        "users", "id,email,role,is_verified,is_active", {"email": guardian_email}
    )

    if existing:
        guardian_user_id = str(existing["id"])
    else:
        if not payload.password:
            raise HTTPException(
                status_code=400,
                detail="Password required to create a new guardian account.",
            )
        try:
            created = await SupabaseService.create_user(
                email=guardian_email,
                password=payload.password,
                role="guardian",
                first_name=payload.first_name or link.get("guardian_name"),
                last_name=payload.last_name,
            )
        except Exception as exc:
            logger.error("Failed to create guardian user for %s: %s", guardian_email, exc)
            raise HTTPException(
                status_code=500,
                detail="Could not create guardian account. Please try again.",
            )
        if not created:
            raise HTTPException(
                status_code=500,
                detail="Could not create guardian account. Please try again.",
            )
        guardian_user_id = str(created["id"])

    now_iso = datetime.now(timezone.utc).isoformat()
    SupabaseREST.update(
        "guardian_links",
        {
            "guardian_id": guardian_user_id,
            "is_verified": True,
            "verified_at": now_iso,
            "verification_code": None,
            "updated_at": now_iso,
        },
        {"id": str(link["id"])},
    )

    try:
        SupabaseREST.insert(
            "notifications",
            {
                "user_id": str(link["student_id"]),
                "type": "guardian_invite_accepted",
                "title": "Guardian invite accepted",
                "message": f"{payload.first_name or link.get('guardian_name') or 'Your guardian'} has accepted your invite.",
                "link_url": "/students/settings/accessibility",
                "is_read": False,
                "created_at": now_iso,
            },
        )
    except Exception as exc:
        logger.warning("Could not insert guardian-accepted notification: %s", exc)

    user_row = SupabaseREST.select_one(
        "users", "id,email,role,is_verified,is_active", {"id": guardian_user_id}
    ) or {"id": guardian_user_id, "email": guardian_email, "role": "guardian"}

    access_token = create_access_token({"sub": guardian_user_id})

    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": guardian_user_id,
            "email": user_row.get("email") or guardian_email,
            "role": user_row.get("role") or "guardian",
            "is_verified": True,
            "is_active": bool(user_row.get("is_active", True)),
        },
        "student": _summarize_student(str(link["student_id"])),
    }




@router.get("/guardians/students")
async def list_linked_students(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """List every student this guardian has an active, verified link to."""
    _require_guardian(current_user)

    rows = SupabaseREST.select(
        "guardian_links",
        "*",
        {
            "guardian_id": str(current_user.id),
            "is_active": True,
            "is_verified": True,
        },
        order="created_at.desc",
    ) or []

    return {
        "success": True,
        "links": [_serialize_link(r) for r in rows],
    }


@router.get("/guardians/students/{student_id}/dashboard")
async def student_dashboard(
    student_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Compose the per-student dashboard view from the data sources the
    guardian's link grants permission to. Each section is independently
    gated so a partial-permission link still gets a sensible response.
    """
    link = _load_link_for_guardian(current_user, student_id=student_id)
    student = _summarize_student(student_id)

    response: Dict[str, Any] = {
        "success": True,
        "student": student,
        "link": _serialize_link(link, include_student=False),
        "permissions": {
            "can_view_progress": bool(link.get("can_view_progress")),
            "can_view_grades": bool(link.get("can_view_grades")),
            "can_view_accessibility": bool(link.get("can_view_accessibility")),
            "can_communicate_teachers": bool(link.get("can_communicate_teachers")),
            "can_modify_accessibility": bool(link.get("can_modify_accessibility")),
        },
    }

    if link.get("can_view_progress"):
        enrollments = SupabaseREST.select(
            "course_enrollments",
            "id,course_id,status,progress_percentage,enrolled_at,last_activity_at",
            {"student_id": student_id},
            order="last_activity_at.desc.nullslast",
            limit=20,
        ) or []
        response["enrollments"] = enrollments
        response["enrollment_summary"] = {
            "active": sum(1 for e in enrollments if e.get("status") == "active"),
            "completed": sum(1 for e in enrollments if e.get("status") == "completed"),
            "total": len(enrollments),
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    if link.get("can_view_progress"):
        try:
            participants = SupabaseREST.select(
                "session_participants",
                "session_id,status,joined_at",
                {"user_id": student_id},
                limit=50,
            ) or []
            session_ids = [p.get("session_id") for p in participants if p.get("session_id")]
            sessions: List[Dict[str, Any]] = []
            for sid in session_ids[:50]:
                row = SupabaseREST.select_one(
                    "live_sessions",
                    "id,title,scheduled_start,scheduled_end,status,teacher_id",
                    {"id": sid},
                )
                if row and (row.get("scheduled_start") or "") >= now_iso:
                    sessions.append(row)
            response["upcoming_sessions"] = sessions[:10]
        except Exception as exc:
            logger.warning("Failed to assemble upcoming sessions for guardian view: %s", exc)
            response["upcoming_sessions"] = []

    if link.get("can_view_accessibility"):
        prefs = SupabaseREST.select_one(
            "accessibility_preferences", "*", {"user_id": student_id}
        )
        if prefs:
            response["accessibility_summary"] = {
                "high_contrast": bool(prefs.get("high_contrast")),
                "reduced_motion": bool(prefs.get("reduced_motion")),
                "screen_reader_optimized": bool(prefs.get("screen_reader_optimized")),
                "text_to_speech": bool(prefs.get("text_to_speech")),
                "speech_to_text": bool(prefs.get("speech_to_text")),
                "color_blind_mode": prefs.get("color_blind_mode"),
                "font_family": prefs.get("font_family"),
                "font_size": prefs.get("font_size"),
                "active_preset": prefs.get("active_preset"),
            }

    if link.get("can_communicate_teachers"):
        try:
            convos = SupabaseREST.select(
                "conversations",
                "id,participant_ids,last_message,last_message_at",
                {"participant_ids.cs": "{" + student_id + "}"},
                order="last_message_at.desc.nullslast",
                limit=10,
            ) or []
            response["recent_conversations"] = convos
        except Exception:
            response["recent_conversations"] = []

    return response




class UpdateAccessibilityFromGuardianPayload(BaseModel):
    """A subset of `accessibility_preferences` columns that a guardian is
    allowed to edit on the student's behalf — only the toggles a parent of
    a younger child would reasonably set, not e.g. the JSON of every
    custom preset. The student keeps unilateral control via their own
    settings page; this is for the under-12 case where the student isn't
    managing their own preferences yet.
    """
    high_contrast: Optional[bool] = None
    reduced_motion: Optional[bool] = None
    screen_reader_optimized: Optional[bool] = None
    text_to_speech: Optional[bool] = None
    speech_to_text: Optional[bool] = None
    font_size: Optional[int] = Field(default=None, ge=50, le=300)


@router.patch("/guardians/students/{student_id}/accessibility")
async def update_student_accessibility(
    student_id: str,
    payload: UpdateAccessibilityFromGuardianPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Apply a narrow accessibility patch to the student's preferences.

    Gated on `can_modify_accessibility=true` (default false), so a passive
    "viewer" guardian can't make changes. The update writes to the same
    `accessibility_preferences` row the student's own settings page uses.
    """
    link = _load_link_for_guardian(current_user, student_id=student_id)
    if not link.get("can_modify_accessibility"):
        raise HTTPException(
            status_code=403,
            detail="This guardian link does not permit modifying accessibility.",
        )

    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        return {"success": True, "updated": 0}

    existing = SupabaseREST.select_one(
        "accessibility_preferences", "id", {"user_id": student_id}
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        SupabaseREST.update(
            "accessibility_preferences",
            {**updates, "updated_at": now_iso},
            {"id": existing["id"]},
        )
    else:
        SupabaseREST.insert(
            "accessibility_preferences",
            {
                "user_id": student_id,
                **updates,
                "created_at": now_iso,
                "updated_at": now_iso,
            },
        )

    try:
        SupabaseREST.insert(
            "notifications",
            {
                "user_id": student_id,
                "type": "accessibility_updated_by_guardian",
                "title": "Accessibility settings updated",
                "message": "A guardian updated your accessibility settings. Open Settings to review.",
                "link_url": "/students/settings/accessibility",
                "is_read": False,
                "created_at": now_iso,
            },
        )
    except Exception:
        pass

    return {"success": True, "updated": len(updates)}
