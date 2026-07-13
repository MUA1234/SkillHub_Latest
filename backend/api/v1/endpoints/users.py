"""Generic, role-agnostic user endpoints.

These back the frontend `lib/api.ts` methods `getUserProfile()`,
`updateUserProfile()` and `getDashboardStats()`, which hit
`/api/v1/users/*`. Previously `users.py` did not exist, so `main.py`'s
`from api.v1.endpoints.users import router` failed silently (wrapped in
try/except) and every one of those calls 404'd. This module restores them.

The profile here is intentionally role-agnostic: it reads/writes the shared
`user_profiles` table (the same table the student/teacher-specific profile
endpoints use) so a single client method works for any logged-in user. The
response is a **flat** object (not wrapped in `{success, data}`) because the
frontend types `getUserProfile()` as `Promise<UserProfile>` and consumes the
JSON directly.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from datetime import datetime
import logging
import uuid

from database.models import User
from database.supabase_client import SupabaseREST
from core.security import get_current_active_user

router = APIRouter()
logger = logging.getLogger(__name__)

_ALLOWED_PROFILE_FIELDS = [
    "first_name", "last_name", "phone", "date_of_birth",
    "location", "bio", "avatar_url", "university",
    "student_id", "major", "year", "gpa", "country", "city",
]


def _profile_payload(profile: Dict[str, Any], user: Dict[str, Any],
                     user_id: str, fallback_email: str) -> Dict[str, Any]:
    """Shape a `user_profiles` row (+ `users` row) into the flat UserProfile
    object the frontend expects."""
    gpa = profile.get("gpa")
    return {
        "id": str(profile.get("id", "")),
        "user_id": user_id,
        "email": (user or {}).get("email") or fallback_email,
        "first_name": profile.get("first_name"),
        "last_name": profile.get("last_name"),
        "phone": profile.get("phone"),
        "date_of_birth": profile.get("date_of_birth"),
        "location": profile.get("location"),
        "bio": profile.get("bio"),
        "avatar_url": profile.get("avatar_url"),
        "university": profile.get("university"),
        "student_id": profile.get("student_id"),
        "major": profile.get("major"),
        "year": profile.get("year"),
        "gpa": float(gpa) if gpa not in (None, "") else None,
        "reputation_score": profile.get("reputation_score", 0) or 0,
        "created_at": profile.get("created_at"),
        "updated_at": profile.get("updated_at"),
    }


@router.get("/profile")
async def get_user_profile(current_user: User = Depends(get_current_active_user)):
    """Return the current user's profile (role-agnostic). Creates a default
    `user_profiles` row on first access so the client always gets a stable
    shape rather than a 404."""
    try:
        user_id = str(current_user.id)

        profile = SupabaseREST.select_one("user_profiles", "*", {"user_id": user_id})
        if not profile:
            now = datetime.utcnow().isoformat()
            profile_data = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "reputation_score": 0,
                "created_at": now,
                "updated_at": now,
            }
            profile = SupabaseREST.insert("user_profiles", profile_data) or profile_data

        user = SupabaseREST.select_one("users", "email,is_verified,created_at", {"id": user_id})
        return _profile_payload(profile, user, user_id, current_user.email)

    except Exception as e:
        logger.error(f"Get user profile error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch profile: {str(e)}",
        )


@router.put("/profile")
async def update_user_profile(
    profile_data: dict,
    current_user: User = Depends(get_current_active_user),
):
    """Update the current user's profile (role-agnostic). Only whitelisted
    fields are written; returns the refreshed flat UserProfile object."""
    try:
        user_id = str(current_user.id)

        update_data = {k: v for k, v in profile_data.items() if k in _ALLOWED_PROFILE_FIELDS}
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields provided for update",
            )
        update_data["updated_at"] = datetime.utcnow().isoformat()

        existing = SupabaseREST.select_one("user_profiles", "id", {"user_id": user_id})
        if not existing:
            seed = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "reputation_score": 0,
                "created_at": datetime.utcnow().isoformat(),
            }
            seed.update(update_data)
            SupabaseREST.insert("user_profiles", seed)
        else:
            SupabaseREST.update("user_profiles", update_data, {"user_id": user_id})

        profile = SupabaseREST.select_one("user_profiles", "*", {"user_id": user_id}) or {}
        user = SupabaseREST.select_one("users", "email,is_verified,created_at", {"id": user_id})
        return _profile_payload(profile, user, user_id, current_user.email)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user profile error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update profile: {str(e)}",
        )


@router.get("/dashboard-stats")
async def get_dashboard_stats(current_user: User = Depends(get_current_active_user)):
    """Role-aware, lightweight dashboard counters for any user. Unlike the
    teacher-specific `/teachers/profile` stats, this is a generic summary the
    shared client method `getDashboardStats()` can call regardless of role."""
    try:
        user_id = str(current_user.id)
        role = current_user.role or "student"

        unread_notifications = len(SupabaseREST.select(
            "notifications", "id", {"user_id": user_id, "is_read": False}
        ) or [])

        stats: Dict[str, Any] = {
            "role": role,
            "unread_notifications": unread_notifications,
        }

        if role == "teacher":
            tp = SupabaseREST.select_one("teacher_profiles", "id", {"user_id": user_id})
            teacher_pid = tp.get("id") if tp else None
            courses = SupabaseREST.select("courses", "id,status", {"teacher_id": teacher_pid}) if teacher_pid else []
            stats.update({
                "total_courses": len(courses),
                "published_courses": len([c for c in courses if c.get("status") == "published"]),
            })
        elif role == "sponsor":
            grants = SupabaseREST.select("scholarship_grants", "id,status", {"sponsor_id": user_id}) or []
            stats.update({
                "total_grants": len(grants),
                "active_grants": len([g for g in grants if g.get("status") == "active"]),
            })
        else:
            enrollments = SupabaseREST.select(
                "course_enrollments", "status,progress_percentage", {"student_id": user_id}
            ) or []
            total = len(enrollments)
            avg = sum(e.get("progress_percentage", 0) or 0 for e in enrollments) / max(total, 1)
            stats.update({
                "total_enrollments": total,
                "active_enrollments": len([e for e in enrollments if e.get("status") == "active"]),
                "completed_enrollments": len([e for e in enrollments if e.get("status") == "completed"]),
                "avg_progress": round(avg, 1),
            })

        return {"success": True, "data": stats}

    except Exception as e:
        logger.error(f"Dashboard stats error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard stats: {str(e)}",
        )
