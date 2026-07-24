"""
Accessibility track matching — the coarse grouping that drives the
teacher↔student data wall and dashboard routing.

Only two tracks exist in this phase: `visual` and `hearing`. Any other
disability leaves the student outside a track (normal dashboard; adaptations
still apply client-side).

Two DisabilityType vocabularies flow through the app and both are stored in
`student_disability_profiles.disability_types` (a plain text[]):
  - coarse (assessment):  'visual_impairment', 'hearing_impairment', 'color_vision_deficiency'
  - granular (profile):   'visual_impairment_low_vision', 'hearing_impairment_deaf',
                          'color_vision_protanopia', ...
Prefix matching below covers BOTH, so callers can pass either.

Enforcement note: the FastAPI backend talks to Supabase with the service-role
key, which bypasses RLS. Segregation therefore MUST be applied here, in the
application layer, at every endpoint where students and teachers meet.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Set

from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)

Track = str  # 'visual' | 'hearing'
TRACKS: List[Track] = ["visual", "hearing"]


def track_for_disability(disability_type: Optional[str]) -> Optional[Track]:
    """Map a single disability type (either vocabulary) to a track, or None."""
    if not disability_type:
        return None
    t = str(disability_type).lower()
    if t.startswith("visual_impairment") or t.startswith("color_vision"):
        return "visual"
    if t.startswith("hearing_impairment"):
        return "hearing"
    return None


def tracks_for_disabilities(types: Optional[Sequence[Optional[str]]]) -> List[Track]:
    """All tracks a set of disability types belongs to (deduped, stable order)."""
    if not types:
        return []
    found: Set[Track] = set()
    for t in types:
        track = track_for_disability(t)
        if track:
            found.add(track)
    return [tr for tr in TRACKS if tr in found]


def primary_track(
    types: Optional[Sequence[Optional[str]]],
    primary_disability: Optional[str] = None,
) -> Optional[Track]:
    """The primary track — decides the student's landing dashboard."""
    from_primary = track_for_disability(primary_disability)
    if from_primary:
        return from_primary
    all_tracks = tracks_for_disabilities(types)
    return all_tracks[0] if all_tracks else None


def tracks_overlap(a: Optional[Sequence[str]], b: Optional[Sequence[str]]) -> bool:
    """Do two track sets overlap? (the hard-wall predicate)."""
    if not a or not b:
        return False
    return bool(set(a) & set(b))


# ---------------------------------------------------------------------------
# DB-backed lookups
# ---------------------------------------------------------------------------

def get_student_tracks(user_id: str) -> List[Track]:
    """A student's tracks — prefers the stored `tracks` column, falls back to
    recomputing from `disability_types` for rows written before migration 021."""
    prof = SupabaseREST.select_one(
        "student_disability_profiles",
        "tracks, disability_types, has_disability",
        {"user_id": user_id},
    )
    if not prof:
        return []
    stored = prof.get("tracks")
    if stored:
        return [t for t in stored if t in TRACKS]
    return tracks_for_disabilities(prof.get("disability_types"))


def get_teacher_tracks(teacher_id: str) -> List[Track]:
    """A teacher's teaching tracks — prefers stored `teaching_tracks`, falls
    back to recomputing from `disability_experience`.

    `teacher_id` here is the user id; `teacher_specializations.teacher_id`
    references `teacher_profiles(id)`, so we hop through the profile first.
    """
    prof = SupabaseREST.select_one(
        "teacher_profiles", "id", {"user_id": teacher_id}
    )
    if not prof:
        return []
    spec = SupabaseREST.select_one(
        "teacher_specializations",
        "teaching_tracks, disability_experience",
        {"teacher_id": prof["id"]},
    )
    if not spec:
        return []
    stored = spec.get("teaching_tracks")
    if stored:
        return [t for t in stored if t in TRACKS]
    return tracks_for_disabilities(spec.get("disability_experience"))


def get_student_primary_track(user_id: str) -> Optional[Track]:
    """The student's primary track (drives the landing dashboard), or None."""
    prof = SupabaseREST.select_one(
        "student_disability_profiles",
        "primary_track, tracks, disability_types, primary_disability",
        {"user_id": user_id},
    )
    if not prof:
        return None
    stored = prof.get("primary_track")
    if stored in TRACKS:
        return stored
    return primary_track(prof.get("disability_types"), prof.get("primary_disability"))


def get_teacher_specialist_status(user_id: str) -> Dict[str, Any]:
    """{'teaching_tracks': [...], 'verified_specialist': bool} for a teacher.
    Empty tracks + False when the teacher has no specialization row."""
    prof = SupabaseREST.select_one(
        "teacher_profiles", "id", {"user_id": user_id}
    )
    if not prof:
        return {"teaching_tracks": [], "verified_specialist": False}
    spec = SupabaseREST.select_one(
        "teacher_specializations",
        "teaching_tracks, disability_experience, verified_specialist",
        {"teacher_id": prof["id"]},
    )
    if not spec:
        return {"teaching_tracks": [], "verified_specialist": False}
    stored = spec.get("teaching_tracks")
    tracks = (
        [t for t in stored if t in TRACKS]
        if stored
        else tracks_for_disabilities(spec.get("disability_experience"))
    )
    return {
        "teaching_tracks": tracks,
        "verified_specialist": bool(spec.get("verified_specialist")),
    }


def is_differently_abled(user_id: str) -> bool:
    """True if the student sits in at least one track."""
    return len(get_student_tracks(user_id)) > 0


def teacher_can_see_student(teacher_id: str, student_id: str) -> bool:
    """The wall. A normal teacher (no tracks) may only see normal students; a
    specialist may only see students whose tracks overlap theirs."""
    teacher_tracks = get_teacher_tracks(teacher_id)
    student_tracks = get_student_tracks(student_id)
    if not student_tracks:
        # Normal student — visible only to normal teachers.
        return not teacher_tracks
    if not teacher_tracks:
        # Normal teacher — never sees a differently-abled student.
        return False
    return tracks_overlap(teacher_tracks, student_tracks)


def filter_students_for_teacher(
    student_rows: List[Dict[str, Any]],
    teacher_id: str,
    *,
    id_key: str = "id",
) -> List[Dict[str, Any]]:
    """Filter a list of student dicts down to the ones this teacher may see.

    Batches the track lookups so we don't issue one query per student.
    `id_key` is the field on each row holding the student's user_id.
    """
    if not student_rows:
        return []
    teacher_tracks = get_teacher_tracks(teacher_id)
    track_map = _student_tracks_bulk([r.get(id_key) for r in student_rows])

    out: List[Dict[str, Any]] = []
    for row in student_rows:
        sid = row.get(id_key)
        s_tracks = track_map.get(sid, [])
        if not s_tracks:
            if not teacher_tracks:
                out.append(row)  # normal student ↔ normal teacher
        elif teacher_tracks and tracks_overlap(teacher_tracks, s_tracks):
            out.append(row)
    return out


def filter_student_ids_for_teacher(
    student_ids: Sequence[Optional[str]], teacher_user_id: str
) -> List[str]:
    """Subset of `student_ids` this teacher is allowed to see (the wall)."""
    ids = [i for i in student_ids if i]
    if not ids:
        return []
    teacher_tracks = get_teacher_tracks(teacher_user_id)
    track_map = _student_tracks_bulk(ids)
    out: List[str] = []
    for sid in ids:
        s_tracks = track_map.get(sid, [])
        if not s_tracks:
            if not teacher_tracks:
                out.append(sid)
        elif teacher_tracks and tracks_overlap(teacher_tracks, s_tracks):
            out.append(sid)
    return out


def filter_teachers_for_student(
    teacher_rows: List[Dict[str, Any]],
    student_id: str,
    *,
    id_key: str = "id",
) -> List[Dict[str, Any]]:
    """Filter teacher dicts down to the ones this student may be matched with.

    A differently-abled student sees only specialists whose tracks overlap
    theirs; a normal student sees only normal teachers.
    """
    if not teacher_rows:
        return []
    student_tracks = get_student_tracks(student_id)
    track_map = _teacher_tracks_bulk([r.get(id_key) for r in teacher_rows])

    out: List[Dict[str, Any]] = []
    for row in teacher_rows:
        tid = row.get(id_key)
        t_tracks = track_map.get(tid, [])
        if not student_tracks:
            if not t_tracks:
                out.append(row)  # normal student ↔ normal teacher
        elif t_tracks and tracks_overlap(student_tracks, t_tracks):
            out.append(row)
    return out


# ---------------------------------------------------------------------------
# Bulk helpers — one `IN (...)` query per call (via SupabaseREST.select_in),
# then resolved in Python. Rows missing a profile simply don't appear ⇒ no
# tracks ⇒ treated as a normal student/teacher.
# ---------------------------------------------------------------------------

def _student_tracks_bulk(ids: Sequence[Optional[str]]) -> Dict[str, List[Track]]:
    wanted = [i for i in ids if i]
    if not wanted:
        return {}
    rows = SupabaseREST.select_in(
        "student_disability_profiles",
        "user_id",
        wanted,
        select_cols="user_id, tracks, disability_types",
    )
    out: Dict[str, List[Track]] = {}
    for row in rows:
        uid = row.get("user_id")
        stored = row.get("tracks")
        out[uid] = (
            [t for t in stored if t in TRACKS]
            if stored
            else tracks_for_disabilities(row.get("disability_types"))
        )
    return out


def _teacher_tracks_bulk(ids: Sequence[Optional[str]]) -> Dict[str, List[Track]]:
    """user_id → tracks. teacher_specializations keys on teacher_profiles(id),
    so resolve user_id → profile id first, then look specializations up by that.
    """
    wanted = [i for i in ids if i]
    if not wanted:
        return {}
    profs = SupabaseREST.select_in(
        "teacher_profiles", "user_id", wanted, select_cols="id, user_id"
    )
    profile_to_user = {p["id"]: p["user_id"] for p in profs if p.get("id")}
    if not profile_to_user:
        return {}
    specs = SupabaseREST.select_in(
        "teacher_specializations",
        "teacher_id",
        list(profile_to_user.keys()),
        select_cols="teacher_id, teaching_tracks, disability_experience",
    )
    out: Dict[str, List[Track]] = {}
    for row in specs:
        uid = profile_to_user.get(row.get("teacher_id"))
        if not uid:
            continue
        stored = row.get("teaching_tracks")
        out[uid] = (
            [t for t in stored if t in TRACKS]
            if stored
            else tracks_for_disabilities(row.get("disability_experience"))
        )
    return out
