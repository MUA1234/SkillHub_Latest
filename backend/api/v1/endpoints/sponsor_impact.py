"""
Phase M1 — Sponsor impact summary.

Sponsor-scoped analytics: which students *this sponsor* funded, their
completion outcomes, geographic spread, and the disability breakdown of
the cohort.

Data flows:
  - The sponsor owns `scholarships` rows (filter on `sponsor_id`).
  - Each approved `scholarship_application` mints a
    `student_funding_grants` row; that's the funded-student set.
  - For each funded student we pull `course_enrollments` to derive
    completion rate, `user_profiles.location` for geo, and
    `student_disability_profiles.disability_types` for the breakdown.

Designed to be cheap for a single sponsor with <50 scholarships. A
larger sponsor would warrant a proper view + index pass.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()


def _role_value(user: User) -> str:
    return getattr(getattr(user, "role", None), "value", None) or str(
        getattr(user, "role", "") or ""
    )


def _require_sponsor(user: User) -> None:
    if _role_value(user) != "sponsor":
        raise HTTPException(status_code=403, detail="Sponsor account required.")


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


@router.get("/sponsors/impact-summary")
async def sponsor_impact_summary(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_sponsor(current_user)
    sponsor_id = str(current_user.id)

    scholarships = SupabaseREST.select(
        "scholarships",
        "id,title,total_amount_lkr,slots_available,slots_filled,status,target_locations,target_disability_types,created_at",
        {"sponsor_id": sponsor_id},
    ) or []
    total_funded_lkr = sum(float(s.get("total_amount_lkr") or 0) for s in scholarships)
    total_slots = sum(int(s.get("slots_available") or 0) for s in scholarships)
    total_filled = sum(int(s.get("slots_filled") or 0) for s in scholarships)

    scholarship_ids = [str(s["id"]) for s in scholarships]

    funded_student_ids: set[str] = set()
    grant_total_lkr = 0.0
    grants_by_month: Dict[str, int] = defaultdict(int)
    for sid in scholarship_ids[:200]:
        grants = SupabaseREST.select(
            "student_funding_grants",
            "student_id,amount_lkr,created_at,status",
            {"scholarship_id": sid},
        ) or []
        for g in grants:
            student_id = str(g.get("student_id") or "")
            if student_id:
                funded_student_ids.add(student_id)
            grant_total_lkr += float(g.get("amount_lkr") or 0)
            created = _parse_dt(g.get("created_at")) or datetime.now(timezone.utc)
            grants_by_month[created.strftime("%Y-%m")] += 1

    funded_count = len(funded_student_ids)

    completed_count = 0
    active_count = 0
    for student_id in list(funded_student_ids)[:500]:
        enrollments = SupabaseREST.select(
            "course_enrollments",
            "status",
            {"student_id": student_id},
        ) or []
        if any(e.get("status") == "completed" for e in enrollments):
            completed_count += 1
        elif enrollments:
            active_count += 1
    completion_rate = (completed_count / funded_count) if funded_count else None

    location_counts: Dict[str, int] = defaultdict(int)
    for student_id in list(funded_student_ids)[:500]:
        p = SupabaseREST.select_one(
            "user_profiles", "location", {"user_id": student_id}
        ) or {}
        loc = (p.get("location") or "").strip()
        if loc:
            location_counts[loc] += 1
    top_locations = sorted(
        location_counts.items(), key=lambda kv: kv[1], reverse=True
    )[:10]

    disability_counts: Dict[str, int] = defaultdict(int)
    for student_id in list(funded_student_ids)[:500]:
        rows = SupabaseREST.select(
            "student_disability_profiles",
            "disability_types",
            {"user_id": student_id},
        ) or []
        for r in rows:
            for d in r.get("disability_types") or []:
                if d:
                    disability_counts[d] += 1

    funded_trend = [
        {"month": k, "count": grants_by_month[k]}
        for k in sorted(grants_by_month.keys())[-12:]
    ]

    return {
        "success": True,
        "scholarships": {
            "count": len(scholarships),
            "total_funded_lkr": round(total_funded_lkr, 2),
            "slots_total": total_slots,
            "slots_filled": total_filled,
        },
        "students_funded": {
            "count": funded_count,
            "completed_at_least_one_course": completed_count,
            "currently_active": active_count,
            "completion_rate": (
                round(completion_rate, 2) if completion_rate is not None else None
            ),
            "grant_total_lkr": round(grant_total_lkr, 2),
        },
        "funded_trend": funded_trend,
        "geography": [
            {"name": k, "count": v} for k, v in top_locations
        ],
        "disability_breakdown": [
            {"type": k, "count": v}
            for k, v in sorted(
                disability_counts.items(), key=lambda kv: kv[1], reverse=True
            )
        ],
    }
