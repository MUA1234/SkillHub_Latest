"""
Scholarship matcher.

When a sponsor opens a new scholarship (or transitions an existing one
draft → open), this module finds the students who likely qualify and pings
them with a notification so they don't have to discover the scholarship
themselves.

Matching is intentionally lenient: a student who *might* qualify gets a
notification, and the application form re-asks for income / school / grade
so the sponsor still has the final say. We'd rather over-notify than miss
a student who would have been eligible.

The matcher reads from these sources, in priority order:
  1. `target_disability_types` (typed array on the scholarship row) →
     joined with `student_disability_profiles.disability_types`.
  2. `target_locations` (typed array) → joined with
     `user_profiles.location` (substring match — locations are stored as
     "Colombo, Sri Lanka" style strings).
  3. `eligibility_criteria` jsonb keys we recognize:
       - `max_family_income_lkr` (number) — a soft hint; we don't have
         monthly income on the user record, so this is just used to limit
         broadcast volume in the future. For now it's a no-op.
       - `min_grade` / `max_grade` (string)  — same caveat.
       - `province` (string) — alias for target_locations[0] when set.

Kept synchronous and small: this is a few SELECTs and a few INSERTS into
notifications. No celery, no queue.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Set
import uuid

from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)


_MAX_NOTIFICATIONS = 200


def notify_eligible_students(scholarship_id: str) -> int:
    """Notify candidate students about a newly-opened scholarship.

    Returns the number of notifications written. Caller (the API endpoint)
    swallows exceptions — never raise into a sponsor's create-scholarship
    response just because matching had a hiccup.
    """
    scholarship = SupabaseREST.select_one("scholarships", "*", {"id": scholarship_id})
    if not scholarship:
        logger.info("Matcher: scholarship %s not found, skipping.", scholarship_id)
        return 0

    candidate_ids = _find_candidates(scholarship)
    if not candidate_ids:
        logger.info("Matcher: 0 candidates for scholarship %s.", scholarship_id)
        return 0

    capped = candidate_ids[:_MAX_NOTIFICATIONS]
    title = scholarship.get("title") or "a new scholarship"
    amount = float(scholarship.get("total_amount_lkr") or 0)
    notification_url = "/students/scholarships"

    sent = 0
    for student_id in capped:
        try:
            SupabaseREST.insert("notifications", {
                "id": str(uuid.uuid4()),
                "user_id": student_id,
                "type": "scholarship_match",
                "title": "You may qualify for a scholarship",
                "message": (
                    f"'{title}' (LKR {amount:,.0f}) is open and matches your "
                    "profile. Tap to review and apply."
                ),
                "link_url": notification_url,
                "related_entity_type": "scholarship",
                "related_entity_id": scholarship_id,
                "priority": "normal",
            })
            sent += 1
        except Exception as exc:
            logger.warning("Matcher: failed to notify student %s: %s", student_id, exc)

    logger.info("Matcher: notified %d students for scholarship %s.", sent, scholarship_id)
    return sent




def _find_candidates(scholarship: Dict[str, Any]) -> List[str]:
    """Return a deduped list of student `user_id`s likely to qualify.

    Strategy: start from a possibly-large universe (all student users), then
    narrow by the cheapest filters first (typed arrays, indexed fields).
    `target_locations` and `target_disability_types` get applied at the
    Supabase REST layer where we can; the rest happens in Python because
    SupabaseREST's filter dialect doesn't expose array overlap or jsonb
    contains directly.
    """
    target_disabilities: Set[str] = set(scholarship.get("target_disability_types") or [])
    target_locations: List[str] = list(scholarship.get("target_locations") or [])
    criteria: Dict[str, Any] = scholarship.get("eligibility_criteria") or {}

    if target_disabilities:
        ids = _candidates_by_disability(target_disabilities)
    else:
        ids = _all_student_ids()

    if not ids:
        return []

    if target_locations:
        ids = _filter_by_location(ids, target_locations)

    province = criteria.get("province")
    if province and isinstance(province, str) and not target_locations:
        ids = _filter_by_location(ids, [province])

    min_grade = criteria.get("min_grade")
    max_grade = criteria.get("max_grade")
    if min_grade or max_grade:
        ids = _filter_by_grade(ids, min_grade, max_grade)

    return list(dict.fromkeys(ids))


def _candidates_by_disability(target: Set[str]) -> List[str]:
    """Students whose disability profile overlaps the target set."""
    profiles = SupabaseREST.select(
        "student_disability_profiles", "user_id, disability_types",
        limit=2000,
    )
    out: List[str] = []
    for row in profiles:
        types = set(row.get("disability_types") or [])
        if types & target:
            out.append(row["user_id"])
    return out


def _all_student_ids() -> List[str]:
    """Every student user_id, bounded for safety."""
    rows = SupabaseREST.select(
        "users", "id, role", {"role": "student"}, limit=5000,
    )
    return [r["id"] for r in rows if r.get("id")]


def _filter_by_location(ids: List[str], locations: List[str]) -> List[str]:
    """Keep only students whose user_profiles.location matches any target."""
    if not ids:
        return []
    needles = [loc.strip().lower() for loc in locations if loc and loc.strip()]
    if not needles:
        return ids
    out: List[str] = []
    for sid in ids:
        prof = SupabaseREST.select_one(
            "user_profiles", "location", {"user_id": sid}
        )
        loc = (prof or {}).get("location") or ""
        if any(needle in loc.lower() for needle in needles):
            out.append(sid)
    return out


def _filter_by_grade(ids: List[str], min_grade: Any, max_grade: Any) -> List[str]:
    """Best-effort grade filter. Treats grades as ints when castable."""
    def _as_int(value: Any) -> Any:
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return None

    lo = _as_int(min_grade)
    hi = _as_int(max_grade)
    if lo is None and hi is None:
        return ids

    out: List[str] = []
    for sid in ids:
        prof = SupabaseREST.select_one(
            "student_disability_profiles", "grade_level", {"user_id": sid}
        )
        grade = _as_int((prof or {}).get("grade_level")) if prof else None
        if grade is None:
            out.append(sid)
            continue
        if lo is not None and grade < lo:
            continue
        if hi is not None and grade > hi:
            continue
        out.append(sid)
    return out
