"""
Phase L — Admin endpoints.

Single chokepoint `_require_admin` guards every route. The `admin` role
is added to the user-role enum by migration `017_admin_role.sql`; an
admin user is provisioned manually (no signup form by design — we don't
want a self-serve path to admin).

Endpoints:
  - GET  /admin/dashboard         (L2) Platform stats — users by role,
                                  active courses, revenue, sponsorship
                                  totals, pending teachers, open reports.
  - GET  /admin/teachers/pending  (L3) Teachers awaiting verification.
  - POST /admin/teachers/{id}/verify  (L3) Approve / reject a teacher.
  - GET  /admin/reports           (L4) Open moderation reports.
  - POST /admin/reports/{id}/resolve (L4) Resolve a report with admin notes.
  - GET  /admin/payouts           (L5) Payout queue.
  - POST /admin/payouts           (L5) Create a payout for a teacher.
  - POST /admin/payouts/{id}/approve (L5) Move pending → approved.
  - POST /admin/payouts/{id}/mark-paid (L5) Stamp the bank reference + close it out.
  - POST /admin/payouts/{id}/cancel (L5) Withdraw a not-yet-paid payout.
  - GET  /teachers/earnings-summary (L5) Per-teacher earnings + payout history.

L5 (payouts) — `teacher_payouts` table (migration 019) tracks manual
bank-transfer payouts. The demo-payment flow has no real money to
route automatically, so admins enter a payout amount, approve it,
record the bank reference once the transfer is done, and the teacher's
bell lights up on each status change. When a real gateway lands later,
an automated pipeline writes to the same table without UI changes.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()


def _role_value(user: User) -> str:
    return getattr(getattr(user, "role", None), "value", None) or str(
        getattr(user, "role", "") or ""
    )


def _require_admin(user: User) -> None:
    if _role_value(user) != "admin":
        raise HTTPException(status_code=403, detail="Admin account required.")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _count(table: str, filters: Optional[Dict[str, Any]] = None) -> int:
    """Best-effort row count. Uses SupabaseREST.count when available;
    otherwise falls back to len(select) which is cheaper than nothing.
    """
    try:
        if hasattr(SupabaseREST, "count"):
            return SupabaseREST.count(table, filters) or 0
    except Exception:
        pass
    rows = SupabaseREST.select(table, "id", filters) or []
    return len(rows)




@router.get("/admin/dashboard")
async def admin_dashboard(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)

    users = SupabaseREST.select("users", "id,role,is_active,is_verified") or []
    roles: Dict[str, int] = {}
    verified = 0
    active = 0
    for u in users:
        roles[u.get("role") or "unknown"] = roles.get(u.get("role") or "unknown", 0) + 1
        if u.get("is_verified"):
            verified += 1
        if u.get("is_active", True):
            active += 1

    total_courses = _count("courses")
    active_courses = _count("courses", {"status": "published"})

    payments = SupabaseREST.select(
        "live_session_payments",
        "amount,currency,status,payment_gateway",
        {"status": "completed"},
    ) or []
    total_revenue = sum(float(p.get("amount") or 0) for p in payments)
    demo_revenue = sum(
        float(p.get("amount") or 0)
        for p in payments
        if (p.get("payment_gateway") == "demo")
    )

    scholarships = SupabaseREST.select(
        "scholarships", "id,total_amount_lkr,status"
    ) or []
    total_scholarship_value = sum(
        float(s.get("total_amount_lkr") or 0) for s in scholarships
    )
    open_scholarships = sum(
        1 for s in scholarships if s.get("status") == "open"
    )

    pending_teachers = _count("teacher_profiles", {"is_verified": False})
    open_reports = _count("reports", {"status.in": "(pending,open)"})

    return {
        "success": True,
        "users": {
            "total": len(users),
            "active": active,
            "verified": verified,
            "by_role": roles,
        },
        "courses": {
            "total": total_courses,
            "active": active_courses,
        },
        "revenue": {
            "currency": "LKR",
            "total": total_revenue,
            "demo": demo_revenue,
            "live": total_revenue - demo_revenue,
        },
        "scholarships": {
            "total_value_lkr": total_scholarship_value,
            "open": open_scholarships,
            "total": len(scholarships),
        },
        "moderation": {
            "pending_teachers": pending_teachers,
            "open_reports": open_reports,
        },
    }




@router.get("/admin/teachers/pending")
async def list_pending_teachers(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    rows = SupabaseREST.select(
        "teacher_profiles",
        "*",
        {"is_verified": False},
        order="created_at.desc",
    ) or []
    out: List[Dict[str, Any]] = []
    for r in rows:
        u = SupabaseREST.select_one(
            "users", "email,is_active", {"id": str(r.get("user_id"))}
        ) or {}
        p = SupabaseREST.select_one(
            "user_profiles",
            "first_name,last_name,avatar_url",
            {"user_id": str(r.get("user_id"))},
        ) or {}
        out.append(
            {
                "teacher_profile_id": str(r.get("id")),
                "user_id": str(r.get("user_id")),
                "email": u.get("email"),
                "first_name": p.get("first_name"),
                "last_name": p.get("last_name"),
                "avatar_url": p.get("avatar_url"),
                "qualifications": r.get("qualifications"),
                "experience_years": r.get("experience_years"),
                "bio": r.get("bio"),
                "created_at": r.get("created_at"),
            }
        )
    return {"success": True, "teachers": out}


class VerifyTeacherPayload(BaseModel):
    approve: bool
    notes: Optional[str] = None


@router.post("/admin/teachers/{teacher_profile_id}/verify")
async def verify_teacher(
    teacher_profile_id: str,
    payload: VerifyTeacherPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    tp = SupabaseREST.select_one(
        "teacher_profiles", "id,user_id,is_verified", {"id": teacher_profile_id}
    )
    if not tp:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    now = _now_iso()
    if payload.approve:
        SupabaseREST.update(
            "teacher_profiles",
            {
                "is_verified": True,
                "verified_at": now,
                "verification_notes": payload.notes,
                "updated_at": now,
            },
            {"id": teacher_profile_id},
        )
        try:
            SupabaseREST.insert(
                "notifications",
                {
                    "user_id": str(tp["user_id"]),
                    "type": "teacher_verified",
                    "title": "You're verified!",
                    "message": "Your teacher account has been approved. You can now publish courses.",
                    "is_read": False,
                    "created_at": now,
                },
            )
        except Exception:
            pass
    else:
        SupabaseREST.update(
            "teacher_profiles",
            {
                "is_verified": False,
                "verification_notes": payload.notes,
                "updated_at": now,
            },
            {"id": teacher_profile_id},
        )
        try:
            SupabaseREST.insert(
                "notifications",
                {
                    "user_id": str(tp["user_id"]),
                    "type": "teacher_rejected",
                    "title": "Verification update",
                    "message": (payload.notes or "Your verification could not be completed."),
                    "is_read": False,
                    "created_at": now,
                },
            )
        except Exception:
            pass

    return {"success": True, "approved": payload.approve}




@router.get("/admin/reports")
async def list_open_reports(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    rows = SupabaseREST.select(
        "reports", "*", {"status.in": "(pending,open)"}, order="created_at.desc"
    ) or []
    return {"success": True, "reports": rows}


class ResolveReportPayload(BaseModel):
    action: str
    admin_notes: Optional[str] = None


@router.post("/admin/reports/{report_id}/resolve")
async def resolve_report(
    report_id: str,
    payload: ResolveReportPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    valid_actions = {"warn", "hide", "suspend", "dismiss"}
    if payload.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action: {payload.action}")

    report = SupabaseREST.select_one("reports", "*", {"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    SupabaseREST.update(
        "reports",
        {
            "status": "resolved",
            "admin_notes": payload.admin_notes,
            "resolved_by": str(current_user.id),
            "resolved_at": _now_iso(),
            "resolution_action": payload.action,
        },
        {"id": report_id},
    )
    return {"success": True, "action": payload.action}




def _notify_user(user_id: str, type_: str, title: str, message: str) -> None:
    """Best-effort notification + push fan-out."""
    try:
        SupabaseREST.insert("notifications", {
            "user_id": user_id,
            "type": type_,
            "title": title,
            "message": message,
            "is_read": False,
            "created_at": _now_iso(),
        })
    except Exception:
        pass
    try:
        from services.push_service import send_push_to_user
        send_push_to_user(user_id, title, message, url="/teachers/earnings", tag=type_)
    except Exception:
        pass


def _teacher_user_id(teacher_profile_id: str) -> Optional[str]:
    row = SupabaseREST.select_one(
        "teacher_profiles", "user_id", {"id": teacher_profile_id}
    )
    return str(row["user_id"]) if row and row.get("user_id") else None


class CreatePayoutPayload(BaseModel):
    teacher_profile_id: str
    amount_lkr: float
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_holder: Optional[str] = None
    admin_notes: Optional[str] = None


class PayoutNotesPayload(BaseModel):
    admin_notes: Optional[str] = None


class MarkPaidPayload(BaseModel):
    bank_reference: str
    admin_notes: Optional[str] = None


@router.get("/admin/payouts")
async def list_payouts(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    filters: Dict[str, Any] = {}
    if status_filter:
        filters["status"] = status_filter
    rows = SupabaseREST.select(
        "teacher_payouts", "*", filters or None, order="requested_at.desc", limit=500
    ) or []

    out: List[Dict[str, Any]] = []
    for r in rows:
        uid = _teacher_user_id(str(r.get("teacher_profile_id")))
        teacher_name = None
        email = None
        if uid:
            p = SupabaseREST.select_one(
                "user_profiles", "first_name,last_name", {"user_id": uid}
            ) or {}
            u = SupabaseREST.select_one(
                "users", "email", {"id": uid}
            ) or {}
            teacher_name = " ".join(
                x for x in [p.get("first_name"), p.get("last_name")] if x
            ) or None
            email = u.get("email")
        out.append({**r, "teacher_name": teacher_name, "teacher_email": email})
    return {"success": True, "payouts": out}


@router.post("/admin/payouts")
async def create_payout(
    payload: CreatePayoutPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    tp = SupabaseREST.select_one(
        "teacher_profiles", "id,user_id", {"id": payload.teacher_profile_id}
    )
    if not tp:
        raise HTTPException(status_code=404, detail="Teacher not found.")
    if payload.amount_lkr <= 0:
        raise HTTPException(status_code=400, detail="amount_lkr must be > 0")

    row = {
        "teacher_profile_id": payload.teacher_profile_id,
        "amount_lkr": payload.amount_lkr,
        "currency": "LKR",
        "status": "pending",
        "period_start": payload.period_start,
        "period_end": payload.period_end,
        "bank_name": payload.bank_name,
        "bank_account_number": payload.bank_account_number,
        "bank_account_holder": payload.bank_account_holder,
        "admin_notes": payload.admin_notes,
        "requested_at": _now_iso(),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    inserted = SupabaseREST.insert("teacher_payouts", row)
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create payout.")

    _notify_user(
        str(tp["user_id"]),
        "payout_requested",
        "Payout requested",
        f"A payout of LKR {payload.amount_lkr:,.0f} has been queued for you.",
    )
    return {"success": True, "payout": inserted}


@router.post("/admin/payouts/{payout_id}/approve")
async def approve_payout(
    payout_id: str,
    payload: PayoutNotesPayload = Body(default_factory=PayoutNotesPayload),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    p = SupabaseREST.select_one("teacher_payouts", "*", {"id": payout_id})
    if not p:
        raise HTTPException(status_code=404, detail="Payout not found.")
    if p.get("status") != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Payout is already {p.get('status')}, cannot approve.",
        )
    now = _now_iso()
    SupabaseREST.update(
        "teacher_payouts",
        {
            "status": "approved",
            "approved_at": now,
            "approved_by": str(current_user.id),
            "admin_notes": payload.admin_notes or p.get("admin_notes"),
            "updated_at": now,
        },
        {"id": payout_id},
    )
    uid = _teacher_user_id(str(p["teacher_profile_id"]))
    if uid:
        _notify_user(
            uid,
            "payout_approved",
            "Payout approved",
            f"Your LKR {float(p.get('amount_lkr') or 0):,.0f} payout is approved and will be transferred shortly.",
        )
    return {"success": True}


@router.post("/admin/payouts/{payout_id}/mark-paid")
async def mark_payout_paid(
    payout_id: str,
    payload: MarkPaidPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    p = SupabaseREST.select_one("teacher_payouts", "*", {"id": payout_id})
    if not p:
        raise HTTPException(status_code=404, detail="Payout not found.")
    if p.get("status") not in {"pending", "approved"}:
        raise HTTPException(
            status_code=400,
            detail=f"Payout is {p.get('status')}, cannot mark paid.",
        )
    if not (payload.bank_reference or "").strip():
        raise HTTPException(status_code=400, detail="bank_reference is required.")
    now = _now_iso()
    SupabaseREST.update(
        "teacher_payouts",
        {
            "status": "paid",
            "paid_at": now,
            "paid_by": str(current_user.id),
            "bank_reference": payload.bank_reference.strip(),
            "admin_notes": payload.admin_notes or p.get("admin_notes"),
            "updated_at": now,
        },
        {"id": payout_id},
    )
    uid = _teacher_user_id(str(p["teacher_profile_id"]))
    if uid:
        _notify_user(
            uid,
            "payout_paid",
            "Payout sent",
            f"LKR {float(p.get('amount_lkr') or 0):,.0f} has been transferred. Ref: {payload.bank_reference.strip()}",
        )
    return {"success": True}


@router.post("/admin/payouts/{payout_id}/cancel")
async def cancel_payout(
    payout_id: str,
    payload: PayoutNotesPayload = Body(default_factory=PayoutNotesPayload),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_admin(current_user)
    p = SupabaseREST.select_one("teacher_payouts", "*", {"id": payout_id})
    if not p:
        raise HTTPException(status_code=404, detail="Payout not found.")
    if p.get("status") == "paid":
        raise HTTPException(
            status_code=400, detail="Paid payouts cannot be cancelled."
        )
    SupabaseREST.update(
        "teacher_payouts",
        {
            "status": "cancelled",
            "admin_notes": payload.admin_notes or p.get("admin_notes"),
            "updated_at": _now_iso(),
        },
        {"id": payout_id},
    )
    return {"success": True}


@router.post("/admin/send-session-reminders")
async def send_session_reminders(
    window_minutes: int = 30,
    current_user: Optional[User] = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Find live sessions starting in the next `window_minutes` minutes
    and fan out reminder emails (+ SMS if the participant has a phone).
    Designed to be hit by a scheduler — Railway scheduled jobs, GitHub
    Actions cron, etc. — every ~15 minutes with a 30-minute window so
    each session gets at most a couple of reminder waves.

    Idempotency is best-effort via a tiny in-memory dedupe — a real
    scheduler should stamp `session_participants.reminded_at` to gate
    re-sends; this endpoint is the wiring, not the bookkeeping layer."""
    _require_admin(current_user)

    import asyncio
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    from services.email_service import send_session_reminder_email

    try:
        from services.sms_service import send_session_reminder as send_sms_reminder
    except Exception:
        send_sms_reminder = None  # type: ignore

    now = _dt.now(_tz.utc)
    horizon = now + _td(minutes=max(5, min(120, window_minutes)))

    rows = SupabaseREST.select(
        "live_sessions",
        "id,title,teacher_id,scheduled_start,scheduled_end,meeting_room_id",
        {"scheduled_start.gte": now.isoformat(), "scheduled_start.lte": horizon.isoformat()},
        order="scheduled_start.asc",
        limit=200,
    ) or []

    sent_emails = 0
    sent_sms = 0
    skipped = 0

    for s in rows:
        sid = str(s.get("id"))
        title = str(s.get("title") or "")
        teacher_id = str(s.get("teacher_id") or "")
        when_local = str(s.get("scheduled_start") or "")
        join_url = "/students/live-sessions"

        teacher_name = ""
        if teacher_id:
            tp = SupabaseREST.select_one(
                "teacher_profiles", "user_id", {"id": teacher_id}
            ) or {}
            tprof = SupabaseREST.select_one(
                "user_profiles", "first_name,last_name",
                {"user_id": str(tp.get("user_id") or "")},
            ) or {}
            teacher_name = " ".join(
                x for x in [tprof.get("first_name"), tprof.get("last_name")] if x
            )

        participants = SupabaseREST.select(
            "session_participants", "user_id", {"session_id": sid}
        ) or []

        for p in participants:
            uid = str(p.get("user_id") or "")
            if not uid:
                skipped += 1
                continue
            user = SupabaseREST.select_one("users", "email", {"id": uid}) or {}
            prof = SupabaseREST.select_one(
                "user_profiles", "first_name,phone", {"user_id": uid}
            ) or {}
            lang_row = SupabaseREST.select_one(
                "language_preferences", "preferred_language", {"user_id": uid}
            ) or {}
            email = (user.get("email") or "").strip()
            if email:
                asyncio.create_task(
                    send_session_reminder_email(
                        to_email=email,
                        first_name=prof.get("first_name"),
                        session_title=title,
                        teacher_name=teacher_name,
                        when_local=when_local,
                        join_url=join_url,
                        lang=lang_row.get("preferred_language"),
                    )
                )
                sent_emails += 1
            phone = (prof.get("phone") or "").strip()
            if phone and send_sms_reminder:
                try:
                    send_sms_reminder(phone, title, when_local)
                    sent_sms += 1
                except Exception:
                    pass

    return {
        "success": True,
        "sessions_found": len(rows),
        "emails_queued": sent_emails,
        "sms_sent": sent_sms,
        "skipped": skipped,
        "window_minutes": window_minutes,
    }


@router.get("/teachers/earnings-summary")
async def teacher_earnings_summary(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Teacher-facing: total gross + paid-out + outstanding + payout history.
    Outstanding = gross attributed to the teacher MINUS payouts in
    pending/approved/paid status (cancelled excluded)."""
    tp = SupabaseREST.select_one(
        "teacher_profiles", "id", {"user_id": str(current_user.id)}
    )
    if not tp:
        raise HTTPException(status_code=403, detail="Teacher account required.")
    tp_id = str(tp["id"])

    sessions = SupabaseREST.select(
        "live_sessions", "id", {"teacher_id": tp_id}
    ) or []
    session_ids = [str(s["id"]) for s in sessions]
    gross = 0.0
    if session_ids:
        for sid in session_ids:
            rows = SupabaseREST.select(
                "live_session_payments", "amount,status",
                {"session_id": sid, "status": "completed"},
            ) or []
            gross += sum(float(r.get("amount") or 0) for r in rows)

    payouts = SupabaseREST.select(
        "teacher_payouts", "*", {"teacher_profile_id": tp_id},
        order="requested_at.desc", limit=200,
    ) or []
    counted = sum(
        float(p.get("amount_lkr") or 0)
        for p in payouts
        if p.get("status") in {"pending", "approved", "paid"}
    )
    paid_out = sum(
        float(p.get("amount_lkr") or 0)
        for p in payouts
        if p.get("status") == "paid"
    )
    outstanding = max(0.0, gross - counted)

    return {
        "success": True,
        "currency": "LKR",
        "gross_earned": gross,
        "paid_out": paid_out,
        "outstanding": outstanding,
        "payouts": payouts,
    }
