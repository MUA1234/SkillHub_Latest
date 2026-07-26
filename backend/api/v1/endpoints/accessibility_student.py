"""
Track-scoped endpoints for differently-abled students (Visual / Hearing).

Mounted under `/students`, so the frontend reaches them at
`/api/v1/students/accessibility/*`. Every endpoint is walled to the CALLER'S OWN
track (services/track_matching): a student only ever sees content and
specialists for the track they belong to. Media persisted with the
`r2://<object-key>` convention is resolved to a short-lived presigned GET URL
here, so the browser receives ready-to-play links and large media never streams
through the API server.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel

from core.security import get_current_active_user
from database.models import User
from database.supabase_async import SupabaseRESTAsync
from services import r2_storage, track_matching
from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

TRACK_LABELS = {"visual": "Visual", "hearing": "Hearing"}
_OPEN_STATUSES = ("requested", "accepted")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _resolve_media(url: Optional[str]) -> Optional[str]:
    """Resolve an `r2://<key>` marker to a presigned GET URL; pass plain URLs
    through unchanged. Returns None for empty input or when R2 is unavailable."""
    if not url or not isinstance(url, str):
        return None
    if url.startswith("r2://"):
        if not settings.r2_enabled:
            return None
        try:
            return r2_storage.presign_get(url[len("r2://"):])
        except Exception as exc:  # pragma: no cover - best effort
            logger.warning("R2 presign failed for %s: %s", url, exc)
            return None
    return url


def _require_track(current_user: User) -> str:
    """Return the caller's accessibility track, or 403 if they aren't in one.
    These endpoints are only for Visual / Hearing track students."""
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students only.")
    track = track_matching.get_student_primary_track(str(current_user.id))
    if track not in ("visual", "hearing"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This area is for Visual or Hearing track students.",
        )
    return track


def _content_matches_track(item: Dict[str, Any], track: str) -> bool:
    if track == "visual":
        return bool(item.get("audio_url") or item.get("audio_description_url"))
    return bool(
        item.get("caption_url")
        or item.get("transcript_url")
        or item.get("sign_language_video_url")
    )


async def _teacher_names(teacher_profile_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """teacher_profiles.id -> {name, avatar_url, user_id} (batched)."""
    ids = [t for t in teacher_profile_ids if t]
    if not ids:
        return {}
    profs = await SupabaseRESTAsync.select_in(
        "teacher_profiles", "id", ids, select_cols="id,user_id"
    )
    user_ids = [p.get("user_id") for p in profs if p.get("user_id")]
    uprofs = await SupabaseRESTAsync.select_in(
        "user_profiles", "user_id", user_ids,
        select_cols="user_id,first_name,last_name,avatar_url",
    )
    uprof_by_uid = {u.get("user_id"): u for u in uprofs}
    out: Dict[str, Dict[str, Any]] = {}
    for p in profs:
        up = uprof_by_uid.get(p.get("user_id"), {})
        name = f"{up.get('first_name', '')} {up.get('last_name', '')}".strip() or "Specialist teacher"
        out[p["id"]] = {"name": name, "avatar_url": up.get("avatar_url"), "user_id": p.get("user_id")}
    return out


async def _matched_specialists(track: str) -> List[Dict[str, Any]]:
    """Specialist teachers whose teaching tracks include `track`, enriched with
    profile + name. The track overlap is the wall — a student never sees a
    specialist outside their track."""
    specs = await SupabaseRESTAsync.select("teacher_specializations", "*", None, limit=500)
    matched = []
    for s in specs or []:
        tracks = s.get("teaching_tracks") or track_matching.tracks_for_disabilities(
            s.get("disability_experience")
        )
        if track in (tracks or []):
            matched.append(s)
    if not matched:
        return []

    profile_ids = [s.get("teacher_id") for s in matched if s.get("teacher_id")]
    profs = await SupabaseRESTAsync.select_in("teacher_profiles", "id", profile_ids, select_cols="*")
    prof_by_id = {p["id"]: p for p in profs}
    names = await _teacher_names(profile_ids)

    out: List[Dict[str, Any]] = []
    for s in matched:
        pid = s.get("teacher_id")
        prof = prof_by_id.get(pid)
        if not prof:
            continue
        meta = names.get(pid, {})
        out.append({
            "teacher_profile_id": pid,
            "teacher_user_id": prof.get("user_id"),
            "name": meta.get("name", "Specialist teacher"),
            "avatar_url": meta.get("avatar_url"),
            "bio": prof.get("bio"),
            "hourly_rate": float(prof.get("hourly_rate") or 0),
            "average_rating": float(prof.get("average_rating") or 0),
            "total_students": prof.get("total_students") or 0,
            "years_experience": prof.get("years_experience") or 0,
            "verified_specialist": bool(s.get("verified_specialist")),
        })
    # Verified specialists first, then by rating.
    out.sort(key=lambda t: (t["verified_specialist"], t["average_rating"]), reverse=True)
    return out


# ---------------------------------------------------------------------------
# dashboard extras
# ---------------------------------------------------------------------------

@router.get("/accessibility/dashboard")
async def accessibility_dashboard(current_user: User = Depends(get_current_active_user)):
    """Track-specific extras for the Visual / Hearing dashboards: how much
    tailored content exists, which specialists match, and the student's open
    bookings. The generic stats/courses/sessions still come from /dashboard."""
    track = _require_track(current_user)
    student_id = str(current_user.id)

    # Library counts for this track.
    courses = await SupabaseRESTAsync.select("courses", "id", {"status": "published"}, limit=300)
    course_ids = [c.get("id") for c in courses]
    content = await SupabaseRESTAsync.select_in(
        "course_content", "course_id", course_ids, select_cols="*"
    ) if course_ids else []

    lib_total = 0
    lib_audio = lib_captioned = lib_signed = 0
    for it in content:
        if not _content_matches_track(it, track):
            continue
        lib_total += 1
        if it.get("audio_url") or it.get("audio_description_url"):
            lib_audio += 1
        if it.get("caption_url") or it.get("transcript_url"):
            lib_captioned += 1
        if it.get("sign_language_video_url"):
            lib_signed += 1

    # Specialists for this track (+ small preview).
    specialists = await _matched_specialists(track)

    # Open bookings.
    bookings = await SupabaseRESTAsync.select(
        "accessibility_specialist_bookings", "*", {"student_id": student_id}
    )
    open_bookings = [b for b in (bookings or []) if b.get("status") in _OPEN_STATUSES]

    return {
        "success": True,
        "data": {
            "track": track,
            "track_label": TRACK_LABELS[track],
            "library": {
                "total": lib_total,
                "audio": lib_audio,
                "captioned": lib_captioned,
                "signed": lib_signed,
            },
            "specialists": {
                "available": len(specialists),
                "preview": specialists[:3],
            },
            "bookings": {
                "open": len(open_bookings),
                "total": len(bookings or []),
            },
        },
    }


# ---------------------------------------------------------------------------
# track content library
# ---------------------------------------------------------------------------

@router.get("/accessibility/library")
async def accessibility_library(
    feature: str = Query("", description="Sub-filter: audio|audio_description|captions|transcript|sign_language"),
    subject: str = Query("", description="Filter by subject name"),
    search: str = Query("", description="Search titles/descriptions"),
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
):
    """The differently-abled student's tailored content library. Visual track
    surfaces audio / audio-described lessons; Hearing track surfaces captioned,
    transcribed and signed lessons. All media is presigned for direct playback."""
    track = _require_track(current_user)

    courses = await SupabaseRESTAsync.select("courses", "*", {"status": "published"}, limit=300)
    course_by_id = {c.get("id"): c for c in courses}
    course_ids = [c.get("id") for c in courses]
    content = await SupabaseRESTAsync.select_in(
        "course_content", "course_id", course_ids, select_cols="*"
    ) if course_ids else []

    # Subject names (batched).
    subject_ids = [c.get("subject_id") for c in courses if c.get("subject_id")]
    subjects_rows = await SupabaseRESTAsync.select_in(
        "subjects", "id", subject_ids, select_cols="id,name,category"
    ) if subject_ids else []
    subject_by_id = {s.get("id"): s for s in subjects_rows}

    # Teacher names (batched).
    teacher_profile_ids = [c.get("teacher_id") for c in courses if c.get("teacher_id")]
    names = await _teacher_names(teacher_profile_ids)

    feature_key = (feature or "").strip().lower()
    search_q = (search or "").strip().lower()
    subject_q = (subject or "").strip().lower()

    items: List[Dict[str, Any]] = []
    for it in content:
        if not _content_matches_track(it, track):
            continue

        # Optional sub-filter.
        if feature_key == "audio" and not it.get("audio_url"):
            continue
        if feature_key == "audio_description" and not it.get("audio_description_url"):
            continue
        if feature_key == "captions" and not it.get("caption_url"):
            continue
        if feature_key == "transcript" and not it.get("transcript_url"):
            continue
        if feature_key == "sign_language" and not it.get("sign_language_video_url"):
            continue

        course = course_by_id.get(it.get("course_id"), {})
        subj = subject_by_id.get(course.get("subject_id"), {})

        if subject_q and (subj.get("name", "") or "").lower() != subject_q:
            continue
        if search_q:
            hay = f"{it.get('title', '')} {it.get('description', '')}".lower()
            if search_q not in hay:
                continue

        meta = names.get(course.get("teacher_id"), {})
        items.append({
            "id": str(it.get("id")),
            "title": it.get("title"),
            "description": it.get("description"),
            "duration": it.get("duration"),
            "content_type": it.get("content_type"),
            "course_id": str(course.get("id")) if course.get("id") else None,
            "course_title": course.get("title"),
            "subject_name": subj.get("name") or "General",
            "teacher_name": meta.get("name", "Teacher"),
            "teacher_avatar": meta.get("avatar_url"),
            "thumbnail_url": _resolve_media(course.get("thumbnail_url")),
            "media": {
                "content_url": _resolve_media(it.get("content_url")),
                "audio_url": _resolve_media(it.get("audio_url")),
                "audio_description_url": _resolve_media(it.get("audio_description_url")),
                "caption_url": _resolve_media(it.get("caption_url")),
                "transcript_url": _resolve_media(it.get("transcript_url")),
                "sign_language_video_url": _resolve_media(it.get("sign_language_video_url")),
            },
            "features": {
                "has_audio": bool(it.get("audio_url")),
                "has_audio_description": bool(it.get("audio_description_url")),
                "has_captions": bool(it.get("caption_url")),
                "has_transcripts": bool(it.get("transcript_url")),
                "has_sign_language": bool(it.get("sign_language_video_url")),
            },
        })

    total = len(items)
    offset = (page - 1) * limit
    items = items[offset:offset + limit]

    return {
        "success": True,
        "data": {
            "track": track,
            "track_label": TRACK_LABELS[track],
            "items": items,
            "pagination": {
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": (total + limit - 1) // limit if limit else 1,
            },
        },
    }


# ---------------------------------------------------------------------------
# specialist matching + booking
# ---------------------------------------------------------------------------

@router.get("/accessibility/specialists")
async def accessibility_specialists(current_user: User = Depends(get_current_active_user)):
    """Verified (and pending) specialists whose track matches the caller's, with
    the caller's existing booking status attached for de-duplication."""
    track = _require_track(current_user)
    student_id = str(current_user.id)

    specialists = await _matched_specialists(track)

    my_bookings = await SupabaseRESTAsync.select(
        "accessibility_specialist_bookings", "teacher_id,status", {"student_id": student_id}
    )
    status_by_teacher: Dict[str, str] = {}
    for b in my_bookings or []:
        if b.get("status") in _OPEN_STATUSES:
            status_by_teacher[b.get("teacher_id")] = b.get("status")

    for s in specialists:
        s["my_booking_status"] = status_by_teacher.get(s.get("teacher_user_id"))

    return {
        "success": True,
        "data": {"track": track, "track_label": TRACK_LABELS[track], "specialists": specialists},
    }


class BookingRequest(BaseModel):
    message: Optional[str] = None


@router.post("/accessibility/specialists/{teacher_user_id}/book")
async def book_specialist(
    teacher_user_id: str,
    payload: BookingRequest = Body(default=BookingRequest()),
    current_user: User = Depends(get_current_active_user),
):
    """Book a specialist for the caller's track. The teacher must actually be a
    specialist whose tracks include the caller's — validated here, in the
    application layer (the authoritative wall)."""
    track = _require_track(current_user)
    student_id = str(current_user.id)

    if teacher_user_id == student_id:
        raise HTTPException(status_code=400, detail="You can't book yourself.")

    teacher_tracks = track_matching.get_teacher_tracks(teacher_user_id)
    if track not in teacher_tracks:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That teacher isn't a specialist for your track.",
        )

    existing = await SupabaseRESTAsync.select(
        "accessibility_specialist_bookings", "id,status",
        {"student_id": student_id, "teacher_id": teacher_user_id},
    )
    if any(e.get("status") in _OPEN_STATUSES for e in (existing or [])):
        raise HTTPException(status_code=409, detail="You already have an open request with this specialist.")

    row = await SupabaseRESTAsync.insert(
        "accessibility_specialist_bookings",
        {
            "student_id": student_id,
            "teacher_id": teacher_user_id,
            "track": track,
            "status": "requested",
            "message": (payload.message or None),
        },
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not create the booking. The bookings table may not be migrated yet.",
        )
    return {"success": True, "data": row}


@router.get("/accessibility/bookings")
async def my_bookings(current_user: User = Depends(get_current_active_user)):
    """The caller's specialist bookings, newest first, with specialist names."""
    _require_track(current_user)
    student_id = str(current_user.id)

    rows = await SupabaseRESTAsync.select(
        "accessibility_specialist_bookings", "*",
        {"student_id": student_id}, order="requested_at.desc",
    )
    rows = rows or []

    teacher_ids = [r.get("teacher_id") for r in rows if r.get("teacher_id")]
    uprofs = await SupabaseRESTAsync.select_in(
        "user_profiles", "user_id", teacher_ids,
        select_cols="user_id,first_name,last_name,avatar_url",
    ) if teacher_ids else []
    name_by_uid = {
        u.get("user_id"): (f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or "Specialist teacher")
        for u in uprofs
    }
    avatar_by_uid = {u.get("user_id"): u.get("avatar_url") for u in uprofs}

    for r in rows:
        tid = r.get("teacher_id")
        r["teacher_name"] = name_by_uid.get(tid, "Specialist teacher")
        r["teacher_avatar"] = avatar_by_uid.get(tid)

    return {"success": True, "data": {"bookings": rows}}
