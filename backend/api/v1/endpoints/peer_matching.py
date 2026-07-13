"""
Phase K3 — Peer matching.

`GET /students/peer-matches` returns candidate study-buddies ranked by
a simple compatibility score:

  +3  shared course (same `course_enrollments.course_id`)
  +2  matching disability type (solidarity OR sighted-helper signal —
        we include both, the UI can filter)
  +1  matching language preference
  +1  same general location

Only active students are considered. The caller's own row is excluded.
Top 20 returned. The score model is intentionally simple — a future
collaborative-filtering pass can replace this once we have engagement
data, but for the initial UX a transparent rule set is more useful
because users can reason about why a match was suggested.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Set

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


def _require_student(user: User) -> None:
    if _role_value(user) != "student":
        raise HTTPException(status_code=403, detail="Student account required.")


@router.get("/students/peer-matches")
async def peer_matches(
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_student(current_user)
    user_id = str(current_user.id)

    my_courses: Set[str] = {
        str(e.get("course_id"))
        for e in (
            SupabaseREST.select(
                "course_enrollments",
                "course_id,status",
                {"student_id": user_id},
            ) or []
        )
        if e.get("course_id")
    }
    my_disability_types: Set[str] = set()
    rows = SupabaseREST.select(
        "student_disability_profiles", "disability_types", {"user_id": user_id}
    ) or []
    for r in rows:
        for d in r.get("disability_types") or []:
            if d:
                my_disability_types.add(d)
    my_lang = (
        (
            SupabaseREST.select_one(
                "language_preferences", "preferred_language", {"user_id": user_id}
            ) or {}
        ).get("preferred_language")
        or "en"
    )[:2]
    my_profile = SupabaseREST.select_one(
        "user_profiles", "location", {"user_id": user_id}
    ) or {}
    my_location = (my_profile.get("location") or "").strip().lower()

    students = SupabaseREST.select(
        "users", "id,role,is_active", {"role": "student", "is_active": True}
    ) or []
    candidate_ids = [
        str(s["id"]) for s in students if str(s["id"]) != user_id
    ]
    candidate_ids = candidate_ids[:500]

    scores: Dict[str, Dict[str, Any]] = {}

    for cid in my_courses:
        rows = SupabaseREST.select(
            "course_enrollments", "student_id", {"course_id": cid}
        ) or []
        for r in rows:
            sid = str(r.get("student_id") or "")
            if sid and sid != user_id and sid in set(candidate_ids):
                entry = scores.setdefault(sid, {"score": 0, "reasons": [], "shared_course_ids": set()})
                entry["score"] += 3
                entry["shared_course_ids"].add(cid)

    for sid in candidate_ids:
        if my_disability_types:
            rows = SupabaseREST.select(
                "student_disability_profiles",
                "disability_types",
                {"user_id": sid},
            ) or []
            their_types: Set[str] = set()
            for r in rows:
                for d in r.get("disability_types") or []:
                    if d:
                        their_types.add(d)
            shared_dis = my_disability_types & their_types
            if shared_dis:
                entry = scores.setdefault(sid, {"score": 0, "reasons": []})
                entry["score"] += 2 * len(shared_dis)
                entry["reasons"].append(
                    f"shares accessibility profile ({', '.join(sorted(shared_dis))})"
                )

        lang_row = SupabaseREST.select_one(
            "language_preferences", "preferred_language", {"user_id": sid}
        ) or {}
        their_lang = (lang_row.get("preferred_language") or "en")[:2]
        if their_lang == my_lang:
            entry = scores.setdefault(sid, {"score": 0, "reasons": []})
            entry["score"] += 1
            entry["reasons"].append(f"speaks {their_lang}")

        if my_location:
            p = SupabaseREST.select_one(
                "user_profiles", "location", {"user_id": sid}
            ) or {}
            their_loc = (p.get("location") or "").strip().lower()
            if their_loc and (
                my_location in their_loc or their_loc in my_location
            ):
                entry = scores.setdefault(sid, {"score": 0, "reasons": []})
                entry["score"] += 1
                entry["reasons"].append(f"near {p.get('location')}")

    ranked = []
    for sid, entry in scores.items():
        if entry["score"] <= 0:
            continue
        if entry.get("shared_course_ids"):
            shared = entry.pop("shared_course_ids")
            entry["reasons"].insert(
                0,
                f"shares {len(shared)} course{'s' if len(shared) != 1 else ''}",
            )
        p = SupabaseREST.select_one(
            "user_profiles",
            "first_name,last_name,avatar_url,location",
            {"user_id": sid},
        ) or {}
        name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "Peer"
        ranked.append(
            {
                "user_id": sid,
                "name": name,
                "avatar_url": p.get("avatar_url"),
                "location": p.get("location"),
                "score": entry["score"],
                "reasons": entry["reasons"][:3],
            }
        )

    ranked.sort(key=lambda r: r["score"], reverse=True)
    return {"success": True, "matches": ranked[:limit]}
