"""
Phase M4 — Public impact page data.

Unauthenticated endpoint surfacing aggregate platform stats for the
public `/impact` landing page. No PII, no per-user data — just the
top-line numbers that drive sponsor acquisition: students helped,
total funded LKR, geographic spread, disability-type breakdown.

We deliberately don't expose a `users` count without filtering to active
ones, because a raw signup number is gameable and tells a misleading
story. The page is meant to be honest.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter

from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/impact")
async def public_impact() -> Dict[str, Any]:
    """Aggregate stats for the public impact page. Unauthenticated."""

    students = SupabaseREST.select(
        "users", "id,role,is_active", {"role": "student"}
    ) or []
    active_students = sum(1 for s in students if s.get("is_active", True))

    teachers = SupabaseREST.select(
        "teacher_profiles", "id,is_verified", {"is_verified": True}
    ) or []

    scholarships = SupabaseREST.select(
        "scholarships", "total_amount_lkr,slots,slots_filled,status,target_locations,target_disability_types"
    ) or []
    total_funded = sum(float(s.get("total_amount_lkr") or 0) for s in scholarships)
    students_funded = sum(int(s.get("slots_filled") or 0) for s in scholarships)
    open_scholarships = sum(1 for s in scholarships if s.get("status") == "open")

    location_counts: Dict[str, int] = {}
    for s in scholarships:
        for loc in s.get("target_locations") or []:
            if loc:
                location_counts[loc] = location_counts.get(loc, 0) + 1
    try:
        profiles = SupabaseREST.select("user_profiles", "location") or []
        for p in profiles:
            loc = (p.get("location") or "").strip()
            if loc:
                location_counts[loc] = location_counts.get(loc, 0) + 1
    except Exception:
        pass
    top_locations = sorted(
        location_counts.items(), key=lambda kv: kv[1], reverse=True
    )[:10]

    disability_counts: Dict[str, int] = {}
    try:
        profiles = SupabaseREST.select(
            "student_disability_profiles", "disability_types"
        ) or []
        for r in profiles:
            for d in r.get("disability_types") or []:
                if d:
                    disability_counts[d] = disability_counts.get(d, 0) + 1
    except Exception:
        pass

    courses = SupabaseREST.select("courses", "id,status") or []
    published_courses = sum(1 for c in courses if c.get("status") == "published")
    completed = SupabaseREST.select(
        "course_enrollments", "id", {"status": "completed"}
    ) or []

    return {
        "success": True,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "students": {
            "total": len(students),
            "active": active_students,
            "funded_via_scholarships": students_funded,
        },
        "teachers": {
            "verified": len(teachers),
        },
        "scholarships": {
            "total_funded_lkr": total_funded,
            "total_count": len(scholarships),
            "open": open_scholarships,
        },
        "courses": {
            "published": published_courses,
            "completions": len(completed),
        },
        "geography": {
            "top_locations": [{"name": k, "count": v} for k, v in top_locations],
        },
        "disability_breakdown": [
            {"type": k, "count": v}
            for k, v in sorted(
                disability_counts.items(), key=lambda kv: kv[1], reverse=True
            )
        ],
    }
