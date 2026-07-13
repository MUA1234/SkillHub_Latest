"""
Scholarships & access codes — Phase E endpoints.

Sponsors open `scholarships` rows (a budget + eligibility criteria), students
apply, the sponsor reviews. Approving an application mints a
`student_funding_grants` row that the payments endpoint can consume to satisfy
a session price for free. Access codes are a parallel, lighter-weight path:
a sponsor pre-prints one-time codes that any student can redeem to get the
same kind of grant immediately.

All money is in LKR. Auto-matching lives in `services/scholarship_matcher.py`
and is invoked when a scholarship transitions `draft` → `open`.

The module owns both `/sponsors/...` and `/students/...` paths so the routes
stay close to one another and shared helpers don't need to be exported. It's
mounted with no prefix in `main.py`.
"""

from datetime import datetime, timedelta, date as date_type
from typing import Any, Dict, List, Optional
import logging
import secrets
import string
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()




def _role_value(user: User) -> str:
    """Normalize the role enum / string so callers can `_role_value(u) == 'x'`.

    The auth layer sometimes hands us an enum and sometimes a string depending
    on the path used to load the user — this guard hides the difference.
    """
    return getattr(getattr(user, "role", None), "value", None) or str(getattr(user, "role", "") or "")


def _require_sponsor(user: User) -> Dict[str, Any]:
    """Raise unless the caller has a sponsor profile, then return that row."""
    if _role_value(user) != "sponsor":
        raise HTTPException(status_code=403, detail="Sponsor account required.")
    profile = SupabaseREST.select_one(
        "sponsor_profiles", "*", {"user_id": str(user.id)}
    )
    if not profile:
        raise HTTPException(
            status_code=400,
            detail="Sponsor profile not set up. Complete /sponsors/profile/setup first.",
        )
    return profile


def _require_student(user: User) -> None:
    if _role_value(user) != "student":
        raise HTTPException(status_code=403, detail="Student account required.")


def _generate_access_code(length: int = 10) -> str:
    """Generate an unambiguous code (no 0/O/1/I) safe to dictate by phone.

    `secrets.choice` is the right primitive here — `random.choice` is fine for
    UI shuffle but leaks predictability we don't want when the code is the
    sole thing standing between a stranger and free LKR-denominated credit.
    """
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _serialize_scholarship(row: Dict[str, Any]) -> Dict[str, Any]:
    if not row:
        return row
    return {
        "id": row.get("id"),
        "sponsor_id": row.get("sponsor_id"),
        "title": row.get("title"),
        "description": row.get("description"),
        "total_amount_lkr": float(row.get("total_amount_lkr") or 0),
        "currency": row.get("currency") or "LKR",
        "eligibility_criteria": row.get("eligibility_criteria") or {},
        "target_disability_types": row.get("target_disability_types") or [],
        "target_locations": row.get("target_locations") or [],
        "slots_available": row.get("slots_available") or 0,
        "slots_filled": row.get("slots_filled") or 0,
        "status": row.get("status"),
        "start_date": row.get("start_date"),
        "end_date": row.get("end_date"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _notify(user_id: str, type_: str, title: str, message: str, link_url: str = "",
            related_entity_type: Optional[str] = None,
            related_entity_id: Optional[str] = None,
            priority: str = "normal") -> None:
    """Best-effort notification insert; never raises into the caller.

    Also fans out to Web Push (Phase F3) so a student gets a system
    notification even when the SkillHub tab is closed. Push delivery is
    swallowed by `services.push_service` if VAPID isn't configured or the
    user has no active subscriptions — the realtime + bell paths still work.
    """
    try:
        SupabaseREST.insert("notifications", {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": type_,
            "title": title,
            "message": message,
            "link_url": link_url,
            "related_entity_type": related_entity_type,
            "related_entity_id": related_entity_id,
            "priority": priority,
        })
    except Exception as exc:
        logger.warning("Notification insert failed for user %s: %s", user_id, exc)

    try:
        from services.push_service import send_push_to_user
        send_push_to_user(user_id, title, message, url=link_url or "/", tag=type_)
    except Exception as exc:
        logger.debug("Push fan-out skipped for user %s: %s", user_id, exc)


def _email_scholarship_status(
    student_id: str,
    *,
    scholarship_title: str,
    approved: bool,
    amount_lkr: float = 0.0,
    reviewer_notes: Optional[str] = None,
) -> None:
    """Best-effort email of the approve/reject decision. Never raises."""
    try:
        import asyncio
        from services.email_service import send_scholarship_status_email
        user = SupabaseREST.select_one(
            "users", "email", {"id": str(student_id)}
        ) or {}
        prof = SupabaseREST.select_one(
            "user_profiles", "first_name", {"user_id": str(student_id)}
        ) or {}
        lang_row = SupabaseREST.select_one(
            "language_preferences", "preferred_language",
            {"user_id": str(student_id)},
        ) or {}
        email = (user.get("email") or "").strip()
        if not email:
            return
        asyncio.create_task(
            send_scholarship_status_email(
                to_email=email,
                first_name=prof.get("first_name"),
                scholarship_title=scholarship_title,
                approved=approved,
                amount_lkr=amount_lkr,
                reviewer_notes=reviewer_notes,
                lang=lang_row.get("preferred_language"),
            )
        )
    except Exception as exc:
        logger.debug("Scholarship email fan-out skipped for %s: %s", student_id, exc)


def _sms_to_user(user_id: str, body: str) -> None:
    """Phase J4 — best-effort SMS fan-out for high-signal notifications.
    No-ops when SMS isn't configured or the user has no phone on file.
    Never raises."""
    try:
        from services.sms_service import send_sms
        profile = SupabaseREST.select_one(
            "user_profiles", "phone", {"user_id": str(user_id)}
        ) or {}
        phone = (profile.get("phone") or "").strip()
        if phone:
            send_sms(phone, body)
    except Exception as exc:
        logger.debug("SMS fan-out skipped for user %s: %s", user_id, exc)




class ScholarshipCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: Optional[str] = None
    total_amount_lkr: float = Field(ge=0)
    eligibility_criteria: Dict[str, Any] = Field(default_factory=dict)
    target_disability_types: List[str] = Field(default_factory=list)
    target_locations: List[str] = Field(default_factory=list)
    slots_available: int = Field(default=1, ge=1, le=10000)
    status: str = Field(default="draft")
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None


class ScholarshipUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=255)
    description: Optional[str] = None
    total_amount_lkr: Optional[float] = Field(default=None, ge=0)
    eligibility_criteria: Optional[Dict[str, Any]] = None
    target_disability_types: Optional[List[str]] = None
    target_locations: Optional[List[str]] = None
    slots_available: Optional[int] = Field(default=None, ge=1, le=10000)
    status: Optional[str] = None
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None


class ScholarshipApplicationCreate(BaseModel):
    statement_of_need: Optional[str] = Field(default=None, max_length=4000)
    family_income_lkr: Optional[float] = Field(default=None, ge=0)
    school: Optional[str] = Field(default=None, max_length=255)
    grade: Optional[str] = Field(default=None, max_length=50)


class ApplicationReviewPayload(BaseModel):
    action: str
    reviewer_notes: Optional[str] = None
    grant_amount_lkr: Optional[float] = Field(default=None, ge=0)


class AccessCodeCreate(BaseModel):
    value_lkr: float = Field(ge=0)
    quantity: int = Field(default=1, ge=1, le=500)
    max_uses: int = Field(default=1, ge=1, le=1000)
    label: Optional[str] = Field(default=None, max_length=255)
    expires_at: Optional[datetime] = None


class RedeemAccessCodePayload(BaseModel):
    code: str = Field(min_length=4, max_length=64)




@router.get("/sponsors/scholarships")
async def list_my_scholarships(
    status_filter: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_active_user),
):
    """Return all scholarships owned by the calling sponsor."""
    profile = _require_sponsor(current_user)
    filters: Dict[str, Any] = {"sponsor_id": profile["id"]}
    if status_filter:
        filters["status"] = status_filter
    rows = SupabaseREST.select(
        "scholarships", "*", filters, order="created_at.desc", limit=200
    )
    return {"scholarships": [_serialize_scholarship(r) for r in rows]}


@router.post("/sponsors/scholarships")
async def create_scholarship(
    payload: ScholarshipCreate,
    current_user: User = Depends(get_current_active_user),
):
    profile = _require_sponsor(current_user)

    if payload.status not in {"draft", "open"}:
        raise HTTPException(
            status_code=400, detail="New scholarships must start as 'draft' or 'open'."
        )

    now_iso = datetime.utcnow().isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "sponsor_id": profile["id"],
        "title": payload.title,
        "description": payload.description,
        "total_amount_lkr": payload.total_amount_lkr,
        "currency": "LKR",
        "eligibility_criteria": payload.eligibility_criteria,
        "target_disability_types": payload.target_disability_types,
        "target_locations": payload.target_locations,
        "slots_available": payload.slots_available,
        "slots_filled": 0,
        "status": payload.status,
        "start_date": payload.start_date.isoformat() if payload.start_date else None,
        "end_date": payload.end_date.isoformat() if payload.end_date else None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    inserted = SupabaseREST.insert("scholarships", record)
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create scholarship.")

    if payload.status == "open":
        _kick_off_matching(inserted["id"])

    return {"scholarship": _serialize_scholarship(inserted)}


@router.get("/sponsors/scholarships/{scholarship_id}")
async def get_my_scholarship(
    scholarship_id: str,
    current_user: User = Depends(get_current_active_user),
):
    profile = _require_sponsor(current_user)
    row = SupabaseREST.select_one(
        "scholarships", "*", {"id": scholarship_id, "sponsor_id": profile["id"]}
    )
    if not row:
        raise HTTPException(status_code=404, detail="Scholarship not found.")
    return {"scholarship": _serialize_scholarship(row)}


@router.patch("/sponsors/scholarships/{scholarship_id}")
async def update_scholarship(
    scholarship_id: str,
    payload: ScholarshipUpdate,
    current_user: User = Depends(get_current_active_user),
):
    profile = _require_sponsor(current_user)
    existing = SupabaseREST.select_one(
        "scholarships", "*", {"id": scholarship_id, "sponsor_id": profile["id"]}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Scholarship not found.")

    data = payload.model_dump(exclude_none=True)
    if "status" in data:
        legal: Dict[str, set] = {
            "draft":    {"draft", "open", "archived"},
            "open":     {"open", "closed", "archived"},
            "closed":   {"closed", "archived"},
            "archived": {"archived"},
        }
        current_status = existing["status"]
        target = data["status"]
        if target not in legal.get(current_status, set()):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot move scholarship from {current_status} → {target}.",
            )

    if data.get("start_date"):
        data["start_date"] = data["start_date"].isoformat()
    if data.get("end_date"):
        data["end_date"] = data["end_date"].isoformat()
    data["updated_at"] = datetime.utcnow().isoformat()

    updated = SupabaseREST.update("scholarships", data, {"id": scholarship_id})
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update scholarship.")

    if data.get("status") == "open" and existing["status"] != "open":
        _kick_off_matching(scholarship_id)

    return {"scholarship": _serialize_scholarship(updated)}


@router.delete("/sponsors/scholarships/{scholarship_id}")
async def delete_scholarship(
    scholarship_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Hard delete is only allowed for drafts — once a scholarship is open, archive it."""
    profile = _require_sponsor(current_user)
    existing = SupabaseREST.select_one(
        "scholarships", "*", {"id": scholarship_id, "sponsor_id": profile["id"]}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Scholarship not found.")
    if existing["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail="Open / closed scholarships must be archived, not deleted.",
        )
    if not SupabaseREST.delete("scholarships", {"id": scholarship_id}):
        raise HTTPException(status_code=500, detail="Failed to delete scholarship.")
    return {"deleted": True}


@router.get("/sponsors/scholarships/{scholarship_id}/applications")
async def list_applications(
    scholarship_id: str,
    status_filter: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_active_user),
):
    profile = _require_sponsor(current_user)
    scholarship = SupabaseREST.select_one(
        "scholarships", "id", {"id": scholarship_id, "sponsor_id": profile["id"]}
    )
    if not scholarship:
        raise HTTPException(status_code=404, detail="Scholarship not found.")

    filters: Dict[str, Any] = {"scholarship_id": scholarship_id}
    if status_filter:
        filters["status"] = status_filter
    apps = SupabaseREST.select(
        "scholarship_applications", "*", filters, order="created_at.desc", limit=500
    )

    student_ids = list({a["student_id"] for a in apps if a.get("student_id")})
    profiles_by_user: Dict[str, Dict[str, Any]] = {}
    if student_ids:
        rows = SupabaseREST.select_in(
            "user_profiles",
            "user_id",
            student_ids,
            select_cols="user_id,first_name,last_name,avatar_url",
        )
        profiles_by_user = {r["user_id"]: r for r in rows if r.get("user_id")}

    enriched = []
    for app in apps:
        prof = profiles_by_user.get(app.get("student_id"), {})
        enriched.append({
            **app,
            "student_first_name": prof.get("first_name"),
            "student_last_name": prof.get("last_name"),
            "student_avatar_url": prof.get("avatar_url"),
        })
    return {"applications": enriched}


@router.patch("/sponsors/scholarship-applications/{application_id}")
async def review_application(
    application_id: str,
    payload: ApplicationReviewPayload,
    current_user: User = Depends(get_current_active_user),
):
    """Approve or reject an application.

    Approving mints a `student_funding_grants` row sized at `grant_amount_lkr`
    (or proportional default if the sponsor didn't specify), increments
    `slots_filled`, sends notifications. Rejecting just records the reason.
    """
    profile = _require_sponsor(current_user)
    application = SupabaseREST.select_one(
        "scholarship_applications", "*", {"id": application_id}
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found.")

    scholarship = SupabaseREST.select_one(
        "scholarships",
        "*",
        {"id": application["scholarship_id"], "sponsor_id": profile["id"]},
    )
    if not scholarship:
        raise HTTPException(status_code=404, detail="Application not found.")

    if application["status"] not in {"pending"}:
        raise HTTPException(
            status_code=400,
            detail=f"Application is already {application['status']}; cannot review again.",
        )

    action = (payload.action or "").lower()
    if action not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'.")

    now_iso = datetime.utcnow().isoformat()

    if action == "reject":
        SupabaseREST.update("scholarship_applications", {
            "status": "rejected",
            "reviewer_notes": payload.reviewer_notes,
            "reviewed_by": str(current_user.id),
            "reviewed_at": now_iso,
            "updated_at": now_iso,
        }, {"id": application_id})

        _notify(
            application["student_id"],
            "scholarship_rejected",
            "Scholarship application not approved",
            f"Your application for '{scholarship['title']}' was not approved this round.",
            link_url="/students/scholarships/applications",
            related_entity_type="scholarship",
            related_entity_id=scholarship["id"],
        )
        _sms_to_user(
            application["student_id"],
            f"SkillHub scholarship '{scholarship['title']}': not approved this round. Check the app for details.",
        )
        _email_scholarship_status(
            application["student_id"],
            scholarship_title=str(scholarship.get("title") or ""),
            approved=False,
            reviewer_notes=payload.reviewer_notes,
        )
        return {"status": "rejected"}

    if (scholarship.get("slots_filled") or 0) >= (scholarship.get("slots_available") or 0):
        raise HTTPException(
            status_code=400,
            detail="No slots remaining on this scholarship — close it or add slots first.",
        )

    slots = max(1, scholarship.get("slots_available") or 1)
    default_grant = float(scholarship.get("total_amount_lkr") or 0) / slots
    grant_amount = (
        float(payload.grant_amount_lkr)
        if payload.grant_amount_lkr is not None
        else default_grant
    )

    grant_record = {
        "id": str(uuid.uuid4()),
        "scholarship_application_id": application_id,
        "student_id": application["student_id"],
        "sponsor_id": profile["id"],
        "amount_lkr": grant_amount,
        "status": "available",
        "created_at": now_iso,
        "expires_at": (datetime.utcnow() + timedelta(days=90)).isoformat(),
    }
    grant = SupabaseREST.insert("student_funding_grants", grant_record)
    if not grant:
        raise HTTPException(status_code=500, detail="Failed to mint funding grant.")

    SupabaseREST.update("scholarship_applications", {
        "status": "approved",
        "reviewer_notes": payload.reviewer_notes,
        "reviewed_by": str(current_user.id),
        "reviewed_at": now_iso,
        "updated_at": now_iso,
    }, {"id": application_id})

    SupabaseREST.update("scholarships", {
        "slots_filled": (scholarship.get("slots_filled") or 0) + 1,
        "updated_at": now_iso,
    }, {"id": scholarship["id"]})

    _notify(
        application["student_id"],
        "scholarship_approved",
        "Scholarship approved 🎉",
        (
            f"Your application for '{scholarship['title']}' was approved. "
            f"You have a grant of LKR {grant_amount:,.0f} ready to use."
        ),
        link_url="/students/scholarships/applications",
        related_entity_type="scholarship_grant",
        related_entity_id=grant["id"],
        priority="high",
    )
    _sms_to_user(
        application["student_id"],
        f"SkillHub scholarship '{scholarship['title']}': approved. Grant LKR {grant_amount:,.0f} ready to use.",
    )
    _email_scholarship_status(
        application["student_id"],
        scholarship_title=str(scholarship.get("title") or ""),
        approved=True,
        amount_lkr=float(grant_amount),
    )

    return {"status": "approved", "grant": grant}




@router.get("/sponsors/access-codes")
async def list_my_access_codes(
    current_user: User = Depends(get_current_active_user),
):
    profile = _require_sponsor(current_user)
    rows = SupabaseREST.select(
        "access_codes", "*", {"sponsor_id": profile["id"]},
        order="created_at.desc", limit=500,
    )
    return {"access_codes": rows}


@router.post("/sponsors/access-codes")
async def create_access_codes(
    payload: AccessCodeCreate,
    current_user: User = Depends(get_current_active_user),
):
    """Mint `quantity` codes in one call.

    Returns the freshly-minted codes so the sponsor can copy / print / hand
    them out. We never re-display the codes after creation: the only way to
    recover one is to look it up by ID.
    """
    profile = _require_sponsor(current_user)

    created: List[Dict[str, Any]] = []
    expires_iso = payload.expires_at.isoformat() if payload.expires_at else None
    for _ in range(payload.quantity):
        for attempt in range(5):
            candidate = _generate_access_code()
            row = SupabaseREST.insert("access_codes", {
                "id": str(uuid.uuid4()),
                "sponsor_id": profile["id"],
                "code": candidate,
                "value_lkr": payload.value_lkr,
                "max_uses": payload.max_uses,
                "uses": 0,
                "label": payload.label,
                "expires_at": expires_iso,
            })
            if row:
                created.append(row)
                break
        else:
            raise HTTPException(status_code=500, detail="Could not mint a unique code.")

    return {"access_codes": created}


@router.delete("/sponsors/access-codes/{code_id}")
async def revoke_access_code(
    code_id: str,
    current_user: User = Depends(get_current_active_user),
):
    profile = _require_sponsor(current_user)
    existing = SupabaseREST.select_one(
        "access_codes", "*", {"id": code_id, "sponsor_id": profile["id"]}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Access code not found.")
    if not SupabaseREST.delete("access_codes", {"id": code_id}):
        raise HTTPException(status_code=500, detail="Failed to revoke code.")
    return {"revoked": True}




@router.get("/students/scholarships")
async def list_open_scholarships(
    current_user: User = Depends(get_current_active_user),
):
    """Open scholarships the caller can apply to.

    We don't enforce eligibility filtering at the SQL layer — the criteria
    live in `eligibility_criteria` jsonb plus the typed array columns, and
    the frontend wants to also surface "you may not qualify" hints. So we
    return everything that is `open` and let the UI badge each one.
    """
    _require_student(current_user)
    rows = SupabaseREST.select(
        "scholarships", "*", {"status": "open"},
        order="created_at.desc", limit=200,
    )
    return {"scholarships": [_serialize_scholarship(r) for r in rows]}


@router.get("/students/scholarships/{scholarship_id}")
async def get_open_scholarship(
    scholarship_id: str,
    current_user: User = Depends(get_current_active_user),
):
    _require_student(current_user)
    row = SupabaseREST.select_one("scholarships", "*", {"id": scholarship_id})
    if not row or row.get("status") != "open":
        raise HTTPException(status_code=404, detail="Scholarship not found.")
    return {"scholarship": _serialize_scholarship(row)}


@router.post("/students/scholarships/{scholarship_id}/apply")
async def apply_to_scholarship(
    scholarship_id: str,
    payload: ScholarshipApplicationCreate,
    current_user: User = Depends(get_current_active_user),
):
    _require_student(current_user)
    scholarship = SupabaseREST.select_one("scholarships", "*", {"id": scholarship_id})
    if not scholarship or scholarship.get("status") != "open":
        raise HTTPException(status_code=404, detail="Scholarship is not open.")

    existing = SupabaseREST.select_one(
        "scholarship_applications",
        "*",
        {"scholarship_id": scholarship_id, "student_id": str(current_user.id)},
    )
    now_iso = datetime.utcnow().isoformat()
    common = {
        "statement_of_need": payload.statement_of_need,
        "family_income_lkr": payload.family_income_lkr,
        "school": payload.school,
        "grade": payload.grade,
        "updated_at": now_iso,
    }
    if existing:
        if existing["status"] not in {"withdrawn", "rejected"}:
            raise HTTPException(
                status_code=400,
                detail=f"You already have a {existing['status']} application here.",
            )
        common["status"] = "pending"
        common["reviewed_by"] = None
        common["reviewer_notes"] = None
        common["reviewed_at"] = None
        application = SupabaseREST.update(
            "scholarship_applications", common, {"id": existing["id"]}
        )
    else:
        record = {
            "id": str(uuid.uuid4()),
            "scholarship_id": scholarship_id,
            "student_id": str(current_user.id),
            "status": "pending",
            "created_at": now_iso,
            **common,
        }
        application = SupabaseREST.insert("scholarship_applications", record)

    if not application:
        raise HTTPException(status_code=500, detail="Failed to submit application.")

    sponsor_profile = SupabaseREST.select_one(
        "sponsor_profiles", "user_id", {"id": scholarship["sponsor_id"]}
    )
    if sponsor_profile and sponsor_profile.get("user_id"):
        _notify(
            sponsor_profile["user_id"],
            "scholarship_application_received",
            "New scholarship application",
            f"A student applied to '{scholarship['title']}'.",
            link_url=f"/sponsors/scholarships/{scholarship_id}/applications",
            related_entity_type="scholarship_application",
            related_entity_id=application["id"],
        )

    return {"application": application}


@router.get("/students/scholarship-applications")
async def list_my_applications(
    current_user: User = Depends(get_current_active_user),
):
    _require_student(current_user)
    rows = SupabaseREST.select(
        "scholarship_applications",
        "*",
        {"student_id": str(current_user.id)},
        order="created_at.desc",
        limit=200,
    )
    enriched = []
    for app in rows:
        sch = SupabaseREST.select_one(
            "scholarships", "id, title, status, total_amount_lkr",
            {"id": app["scholarship_id"]},
        )
        enriched.append({
            **app,
            "scholarship_title": sch.get("title") if sch else None,
            "scholarship_status": sch.get("status") if sch else None,
        })
    return {"applications": enriched}


@router.get("/students/funding-grants")
async def list_my_grants(
    current_user: User = Depends(get_current_active_user),
):
    _require_student(current_user)
    rows = SupabaseREST.select(
        "student_funding_grants",
        "*",
        {"student_id": str(current_user.id)},
        order="created_at.desc",
        limit=200,
    )
    return {"grants": rows}


@router.post("/students/redeem-access-code")
async def redeem_access_code(
    payload: RedeemAccessCodePayload,
    current_user: User = Depends(get_current_active_user),
):
    """Consume an access code → mint a `student_funding_grants` row.

    Redemption is idempotent per (code, student) pair: a student can't
    redeem the same code twice even if `max_uses` would still allow it.
    """
    _require_student(current_user)
    code_str = payload.code.strip().upper()

    code = SupabaseREST.select_one("access_codes", "*", {"code": code_str})
    if not code:
        raise HTTPException(status_code=404, detail="Code not recognized.")

    if code.get("expires_at"):
        try:
            exp = datetime.fromisoformat(code["expires_at"].replace("Z", "+00:00"))
            if exp < datetime.utcnow().replace(tzinfo=exp.tzinfo):
                raise HTTPException(status_code=400, detail="This code has expired.")
        except ValueError:
            pass

    if (code.get("uses") or 0) >= (code.get("max_uses") or 1):
        raise HTTPException(status_code=400, detail="This code has been fully redeemed.")

    already = SupabaseREST.select_one(
        "access_code_redemptions",
        "id",
        {"access_code_id": code["id"], "student_id": str(current_user.id)},
    )
    if already:
        raise HTTPException(status_code=400, detail="You've already redeemed this code.")

    now_iso = datetime.utcnow().isoformat()
    grant = SupabaseREST.insert("student_funding_grants", {
        "id": str(uuid.uuid4()),
        "student_id": str(current_user.id),
        "sponsor_id": code["sponsor_id"],
        "amount_lkr": code["value_lkr"],
        "status": "available",
        "created_at": now_iso,
        "expires_at": (datetime.utcnow() + timedelta(days=90)).isoformat(),
    })
    if not grant:
        raise HTTPException(status_code=500, detail="Failed to record grant.")

    SupabaseREST.insert("access_code_redemptions", {
        "id": str(uuid.uuid4()),
        "access_code_id": code["id"],
        "student_id": str(current_user.id),
        "grant_id": grant["id"],
        "redeemed_at": now_iso,
    })
    SupabaseREST.update("access_codes", {
        "uses": (code.get("uses") or 0) + 1,
    }, {"id": code["id"]})

    sponsor_profile = SupabaseREST.select_one(
        "sponsor_profiles", "user_id", {"id": code["sponsor_id"]}
    )
    if sponsor_profile and sponsor_profile.get("user_id"):
        _notify(
            sponsor_profile["user_id"],
            "access_code_redeemed",
            "Access code redeemed",
            f"A student redeemed code {code_str} (LKR {float(code['value_lkr']):,.0f}).",
            link_url="/sponsors/access-codes",
            related_entity_type="access_code",
            related_entity_id=code["id"],
        )

    return {"grant": grant, "value_lkr": float(code["value_lkr"])}




def _kick_off_matching(scholarship_id: str) -> None:
    """Find candidate students for a freshly-opened scholarship.

    Done synchronously here because matching is a few SELECTs and a few
    notification inserts — no heavy lifting that warrants a background queue.
    Failures are logged but never bubble to the caller; scholarship creation
    must succeed even if the matcher hits a transient Supabase glitch.
    """
    try:
        from services.scholarship_matcher import notify_eligible_students
        notify_eligible_students(scholarship_id)
    except Exception as exc:
        logger.warning("Matcher run for %s failed: %s", scholarship_id, exc)
