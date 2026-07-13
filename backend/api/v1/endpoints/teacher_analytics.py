"""
Phase M2 — Teacher analytics.

The legacy `/teachers/analytics` endpoint uses the no-op SQLAlchemy
shim and returns nothing in production. Rather than rewriting that
large handler in-place (which would also reshape its response and
break consumers I haven't audited), this module ships a *new*
`/teachers/analytics-summary` endpoint that goes through SupabaseREST
and returns the small payload the new analytics page actually needs.
The legacy endpoint stays untouched.

Returned shape:
  {
    hours_taught: number,
    students_taught: number,        # distinct
    completed_sessions: number,
    avg_rating: number | null,
    total_earnings_lkr: number,
    earnings_trend: [{ month: 'YYYY-MM', amount: number }, ...],
    student_retention: number | null,  # share of students with 2+ sessions
  }
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()


def _role_value(user: User) -> str:
    return getattr(getattr(user, "role", None), "value", None) or str(
        getattr(user, "role", "") or ""
    )


def _require_teacher(user: User) -> Dict[str, Any]:
    if _role_value(user) != "teacher":
        raise HTTPException(status_code=403, detail="Teacher account required.")
    tp = SupabaseREST.select_one(
        "teacher_profiles", "id,user_id", {"user_id": str(user.id)}
    )
    if not tp:
        raise HTTPException(status_code=404, detail="Teacher profile not set up.")
    return tp


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


@router.get("/teachers/analytics-summary")
async def teacher_analytics_summary(
    period: str = Query("month", pattern="^(week|month|quarter|year)$"),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    tp = _require_teacher(current_user)
    teacher_profile_id = str(tp["id"])

    now = datetime.now(timezone.utc)
    days = {"week": 7, "month": 30, "quarter": 90, "year": 365}[period]
    since = now - timedelta(days=days)
    since_iso = since.isoformat()

    sessions = SupabaseREST.select(
        "live_sessions",
        "id,scheduled_start,scheduled_end,duration_minutes,status",
        {"teacher_id": teacher_profile_id},
    ) or []
    completed_sessions = 0
    hours_taught_minutes = 0
    for s in sessions:
        start = _parse_dt(s.get("scheduled_start"))
        if not start or start < since:
            continue
        if s.get("status") == "completed":
            completed_sessions += 1
            hours_taught_minutes += int(s.get("duration_minutes") or 0)

    session_ids = [str(s["id"]) for s in sessions]
    participant_counts: Dict[str, int] = defaultdict(int)
    for sid in session_ids[:200]:
        rows = SupabaseREST.select(
            "session_participants", "user_id", {"session_id": sid}
        ) or []
        for r in rows:
            uid = str(r.get("user_id") or "")
            if uid:
                participant_counts[uid] += 1
    students_taught = len(participant_counts)
    repeat_students = sum(1 for c in participant_counts.values() if c >= 2)
    retention = (repeat_students / students_taught) if students_taught else None

    payments = SupabaseREST.select(
        "live_session_payments",
        "amount,currency,status,payment_gateway,session_id,created_at",
        {"status": "completed"},
    ) or []
    teacher_session_ids = set(session_ids)
    total_earnings = 0.0
    monthly: Dict[str, float] = defaultdict(float)
    for p in payments:
        if str(p.get("session_id") or "") not in teacher_session_ids:
            continue
        amount = float(p.get("amount") or 0)
        total_earnings += amount
        created = _parse_dt(p.get("created_at")) or now
        key = created.strftime("%Y-%m")
        monthly[key] += amount

    earnings_trend = [
        {"month": k, "amount": round(monthly[k], 2)}
        for k in sorted(monthly.keys())[-12:]
    ]

    reviews = SupabaseREST.select(
        "reviews",
        "rating,target_id,target_type",
        {"target_id": teacher_profile_id},
    ) or []
    rating_vals = [
        float(r.get("rating"))
        for r in reviews
        if r.get("rating") is not None
    ]
    avg_rating = round(sum(rating_vals) / len(rating_vals), 2) if rating_vals else None

    return {
        "success": True,
        "period": period,
        "hours_taught": round(hours_taught_minutes / 60, 1),
        "students_taught": students_taught,
        "completed_sessions": completed_sessions,
        "avg_rating": avg_rating,
        "review_count": len(rating_vals),
        "total_earnings_lkr": round(total_earnings, 2),
        "earnings_trend": earnings_trend,
        "student_retention": (
            round(retention, 2) if retention is not None else None
        ),
    }
