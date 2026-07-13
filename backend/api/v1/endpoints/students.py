from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, Body
from fastapi.responses import Response
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import uuid

from database.models import User
from database.supabase_client import SupabaseREST
from database.supabase_async import SupabaseRESTAsync
from core.security import get_current_active_user
from services.receipt_service import receipt_generator
from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/dashboard")
async def get_student_dashboard(
    current_user: User = Depends(get_current_active_user)
):
    """Get comprehensive student dashboard data"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        enrollments = await SupabaseRESTAsync.select(
            "course_enrollments",
            "*",
            {"student_id": user_id},
            order="enrolled_at.desc",
            limit=10
        )

        course_ids = [e.get("course_id") for e in enrollments if e.get("course_id")]
        courses = await SupabaseRESTAsync.select_in("courses", "id", course_ids)
        courses_by_id = {str(c.get("id")): c for c in courses}

        teacher_pids = [c.get("teacher_id") for c in courses if c.get("teacher_id")]
        tprofiles = await SupabaseRESTAsync.select_in(
            "teacher_profiles", "id", teacher_pids, "id,user_id"
        )
        tprofile_by_id = {str(t.get("id")): t for t in tprofiles}

        tuser_ids = [t.get("user_id") for t in tprofiles if t.get("user_id")]
        uprofiles = await SupabaseRESTAsync.select_in(
            "user_profiles", "user_id", tuser_ids, "user_id,first_name,last_name"
        )
        uprofile_by_uid = {str(u.get("user_id")): u for u in uprofiles}

        subject_ids = [c.get("subject_id") for c in courses if c.get("subject_id")]
        subjects = await SupabaseRESTAsync.select_in("subjects", "id", subject_ids, "id,name")
        subject_by_id = {str(s.get("id")): s for s in subjects}

        def _teacher_name(course: Dict[str, Any]) -> str:
            tp = tprofile_by_id.get(str(course.get("teacher_id")))
            if not tp:
                return "Unknown Teacher"
            up = uprofile_by_uid.get(str(tp.get("user_id")))
            if not up:
                return "Unknown Teacher"
            return f"{up.get('first_name', '')} {up.get('last_name', '')}".strip() or "Unknown Teacher"

        enrolled_courses = []
        for enrollment in enrollments:
            course = courses_by_id.get(str(enrollment.get("course_id")))
            if not course:
                continue
            subject = subject_by_id.get(str(course.get("subject_id"))) if course.get("subject_id") else None
            enrolled_courses.append({
                "id": str(course.get("id")),
                "title": course.get("title"),
                "teacher_name": _teacher_name(course),
                "subject": subject.get("name") if subject else "General",
                "progress_percentage": enrollment.get("progress_percentage", 0) or 0,
                "status": enrollment.get("status"),
                "enrolled_at": enrollment.get("enrolled_at"),
                "last_accessed": enrollment.get("last_accessed")
            })

        total_courses = len(enrollments)
        active_courses = len([e for e in enrollments if e.get("status") == "active"])
        completed_courses = len([e for e in enrollments if e.get("status") == "completed"])

        notifications = await SupabaseRESTAsync.select(
            "notifications",
            "*",
            {"user_id": user_id},
            order="created_at.desc",
            limit=5
        )

        recent_notifications = [
            {
                "id": str(n.get("id")),
                "title": n.get("title"),
                "message": n.get("message"),
                "type": n.get("type"),
                "is_read": n.get("is_read"),
                "created_at": n.get("created_at")
            }
            for n in notifications
        ]

        upcoming_sessions: List[Dict[str, Any]] = []
        try:
            approved_reqs = await SupabaseRESTAsync.select(
                "live_live_session_enrollment_requests",
                "session_id,status,enrolled_at",
                {"student_id": user_id, "status": "approved"},
                limit=50,
            )
            session_ids = [r.get("session_id") for r in approved_reqs if r.get("session_id")]

            now_iso = datetime.utcnow().isoformat()

            sessions_rows = await SupabaseRESTAsync.select_in("live_sessions", "id", session_ids)
            sessions_by_id = {str(s.get("id")): s for s in sessions_rows}

            sess_teacher_pids = [s.get("teacher_id") for s in sessions_rows if s.get("teacher_id")]
            sess_tprofiles = await SupabaseRESTAsync.select_in(
                "teacher_profiles", "id", sess_teacher_pids, "id,user_id"
            )
            sess_tprofile_by_id = {str(t.get("id")): t for t in sess_tprofiles}

            sess_tuser_ids = [t.get("user_id") for t in sess_tprofiles if t.get("user_id")]
            sess_uprofiles = await SupabaseRESTAsync.select_in(
                "user_profiles", "user_id", sess_tuser_ids, "user_id,first_name,last_name"
            )
            sess_uprofile_by_uid = {str(u.get("user_id")): u for u in sess_uprofiles}

            sess_course_ids = [s.get("course_id") for s in sessions_rows if s.get("course_id")]
            sess_courses = await SupabaseRESTAsync.select_in("courses", "id", sess_course_ids, "id,title")
            sess_course_by_id = {str(c.get("id")): c for c in sess_courses}

            for sid in session_ids:
                session = sessions_by_id.get(str(sid))
                if not session:
                    continue
                status_value = (session.get("status") or "").lower()
                scheduled_end = session.get("scheduled_end") or ""
                if status_value in ("ended", "completed", "cancelled") and scheduled_end and scheduled_end < now_iso:
                    continue

                teacher_name = "Your teacher"
                teacher_id = session.get("teacher_id")
                if teacher_id:
                    teacher_profile = sess_tprofile_by_id.get(str(teacher_id))
                    if teacher_profile and teacher_profile.get("user_id"):
                        user_profile = sess_uprofile_by_uid.get(str(teacher_profile["user_id"]))
                        if user_profile:
                            full = f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip()
                            if full:
                                teacher_name = full

                course_title = ""
                course_id = session.get("course_id")
                if course_id:
                    course = sess_course_by_id.get(str(course_id))
                    if course:
                        course_title = course.get("title") or ""
                if not course_title:
                    course_title = (session.get("session_type") or "Live session").replace("_", " ").title()

                session_id_str = str(session.get("id"))
                upcoming_sessions.append({
                    "id": session_id_str,
                    "title": session.get("title") or "Live session",
                    "description": session.get("description") or "",
                    "course_title": course_title,
                    "teacher_name": teacher_name,
                    "scheduled_start": session.get("scheduled_start"),
                    "scheduled_end": session.get("scheduled_end"),
                    "session_type": session.get("session_type") or "online",
                    "status": session.get("status") or "scheduled",
                    "meeting_link": f"/students/meeting-room/{session_id_str}",
                    "recording_url": session.get("recording_url"),
                })

            past_with_recording: List[Dict[str, Any]] = []
            future_or_live: List[Dict[str, Any]] = []
            for s in upcoming_sessions:
                end = s.get("scheduled_end") or ""
                state = (s.get("status") or "").lower()
                if (state in ("ended", "completed") or (end and end < now_iso)) and s.get("recording_url"):
                    past_with_recording.append(s)
                else:
                    future_or_live.append(s)

            future_or_live.sort(key=lambda s: s.get("scheduled_start") or "")
            upcoming_sessions = future_or_live[:10]

            past_with_recording.sort(key=lambda s: s.get("scheduled_end") or "", reverse=True)
            recent_recordings = past_with_recording[:6]
        except Exception as e:
            logger.warning(f"Could not load upcoming sessions: {e}")
            upcoming_sessions = []
            recent_recordings: List[Dict[str, Any]] = []

        dashboard_data = {
            "stats": {
                "enrolled_courses": total_courses,
                "active_courses": active_courses,
                "completed_courses": completed_courses,
                "total_study_hours": 0,
                "study_streak_days": 0
            },
            "enrolled_courses": enrolled_courses[:5],
            "upcoming_sessions": upcoming_sessions,
            "recent_recordings": recent_recordings,
            "recent_notifications": recent_notifications
        }

        return {"success": True, "data": dashboard_data}

    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard data: {str(e)}"
        )


@router.get("/profile")
async def get_student_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Get student profile information"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        profile = await SupabaseRESTAsync.select_one("user_profiles", "*", {"user_id": user_id})

        if not profile:
            profile_data = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "reputation_score": 0,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            profile = await SupabaseRESTAsync.insert("user_profiles", profile_data)
            if not profile:
                profile = profile_data

        user = await SupabaseRESTAsync.select_one("users", "email,is_verified,created_at", {"id": user_id})

        enrollments = await SupabaseRESTAsync.select("course_enrollments", "status,progress_percentage", {"student_id": user_id})
        total_enrollments = len(enrollments)
        active_enrollments = len([e for e in enrollments if e.get("status") == "active"])
        completed_enrollments = len([e for e in enrollments if e.get("status") == "completed"])
        avg_progress = sum(e.get("progress_percentage", 0) or 0 for e in enrollments) / max(total_enrollments, 1)

        return {
            "success": True,
            "data": {
                "id": str(profile.get("id", "")),
                "user_id": user_id,
                "email": user.get("email") if user else current_user.email,
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
                "gpa": float(profile.get("gpa")) if profile.get("gpa") else None,
                "reputation_score": profile.get("reputation_score", 0) or 0,
                "is_verified": user.get("is_verified") if user else False,
                "member_since": user.get("created_at") if user else None,
                "stats": {
                    "total_enrollments": total_enrollments,
                    "active_enrollments": active_enrollments,
                    "completed_enrollments": completed_enrollments,
                    "avg_progress": round(avg_progress, 1)
                }
            }
        }

    except Exception as e:
        logger.error(f"Profile error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch profile data: {str(e)}"
        )


@router.put("/profile")
async def update_student_profile(
    profile_data: dict,
    current_user: User = Depends(get_current_active_user)
):
    """Update student profile information"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        allowed_fields = [
            'first_name', 'last_name', 'phone', 'date_of_birth',
            'location', 'bio', 'avatar_url', 'university',
            'student_id', 'major', 'year', 'gpa'
        ]

        update_data = {k: v for k, v in profile_data.items() if k in allowed_fields}

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields provided for update"
            )

        update_data["updated_at"] = datetime.utcnow().isoformat()

        updated = await SupabaseRESTAsync.update("user_profiles", update_data, {"user_id": user_id})

        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )

        return {
            "success": True,
            "message": "Profile updated successfully",
            "data": updated
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update profile error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update profile: {str(e)}"
        )


@router.get("/find-teachers")
async def find_teachers(
    search: str = Query("", description="Search by teacher name or specialization"),
    subject: str = Query("", description="Filter by subject"),
    disability_specialization: str = Query("", description="Filter by disability specialization"),
    filter_by_my_disability: bool = Query(True, description="Auto-filter by student's disability"),
    min_rating: float = Query(0, description="Minimum rating filter"),
    max_rate: float = Query(0, description="Maximum hourly rate filter"),
    online_only: bool = Query(False, description="Show only online teachers"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_active_user)
):
    """Find teachers with search, filter, and disability specialization matching"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        from collections import defaultdict
        import asyncio
        offset = (page - 1) * limit

        student_disability_types = []
        if filter_by_my_disability:
            disability_profile = await SupabaseRESTAsync.select_one(
                "student_disability_profiles",
                "disability_types,has_disability",
                {"user_id": str(current_user.id)}
            )
            if disability_profile and disability_profile.get("has_disability"):
                student_disability_types = disability_profile.get("disability_types", [])

        filters = {}
        if online_only:
            filters["is_available"] = True

        teachers = await SupabaseRESTAsync.select(
            "teacher_profiles",
            "*",
            filters if filters else None,
            order="average_rating.desc.nullslast",
            limit=200
        )

        teacher_pids = [tp.get("id") for tp in teachers if tp.get("id")]
        teacher_uids = [tp.get("user_id") for tp in teachers if tp.get("user_id")]

        uprofiles, tsubjects, specs_rows = await asyncio.gather(
            SupabaseRESTAsync.select_in("user_profiles", "user_id", teacher_uids, "*"),
            SupabaseRESTAsync.select_in("teacher_subjects", "teacher_id", teacher_pids, "teacher_id,subject_id"),
            SupabaseRESTAsync.select_in("teacher_disability_specializations", "teacher_id", teacher_uids, "*"),
        )
        uprofile_by_uid = {str(u.get("user_id")): u for u in uprofiles}

        subject_ids_by_teacher = defaultdict(list)
        all_subject_ids = set()
        for ts in tsubjects:
            subject_ids_by_teacher[str(ts.get("teacher_id"))].append(ts.get("subject_id"))
            if ts.get("subject_id"):
                all_subject_ids.add(ts.get("subject_id"))

        subjects_rows = await SupabaseRESTAsync.select_in("subjects", "id", list(all_subject_ids), "id,name")
        subject_name_by_id = {str(s.get("id")): s.get("name") for s in subjects_rows}

        specs_by_teacher_uid = defaultdict(list)
        for s in specs_rows:
            specs_by_teacher_uid[str(s.get("teacher_id"))].append(s)

        teacher_list = []
        for tp in teachers:
            if min_rating > 0 and (tp.get("average_rating") or 0) < min_rating:
                continue

            if max_rate > 0 and (tp.get("hourly_rate") or 0) > max_rate:
                continue

            user_profile = uprofile_by_uid.get(str(tp.get("user_id")))
            if not user_profile:
                continue

            full_name = f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip()

            if search:
                search_lower = search.lower()
                if search_lower not in full_name.lower() and search_lower not in (tp.get("specialization") or "").lower():
                    continue

            subject_names = [
                subject_name_by_id[str(sid)]
                for sid in subject_ids_by_teacher.get(str(tp.get("id")), [])
                if str(sid) in subject_name_by_id
            ]

            if subject and subject not in subject_names:
                continue

            specializations = specs_by_teacher_uid.get(str(tp.get("user_id")), [])

            specialization_types = [s.get("disability_type") for s in specializations]
            
            if disability_specialization and disability_specialization not in specialization_types:
                continue
            
            if filter_by_my_disability and student_disability_types:
                has_relevant_specialization = any(dt in specialization_types for dt in student_disability_types)
                if not has_relevant_specialization and len(specialization_types) > 0:
                    continue
            
            match_score = 0
            if student_disability_types and specialization_types:
                matches = sum(1 for dt in student_disability_types if dt in specialization_types)
                match_score = (matches / len(student_disability_types)) * 100

            teacher_list.append({
                "id": str(tp.get("id")),
                "user_id": str(tp.get("user_id")),
                "name": full_name or "Unknown Teacher",
                "avatar_url": user_profile.get("avatar_url"),
                "specialization": tp.get("specialization"),
                "bio": user_profile.get("bio"),
                "hourly_rate": float(tp.get("hourly_rate", 0)) if tp.get("hourly_rate") else 0,
                "average_rating": float(tp.get("average_rating", 0)) if tp.get("average_rating") else 0,
                "total_reviews": tp.get("total_reviews", 0) or 0,
                "total_students": tp.get("total_students", 0) or 0,
                "years_experience": tp.get("years_experience", 0) or 0,
                "is_available": tp.get("is_available", False),
                "subjects": subject_names[:5],
                "university": user_profile.get("university"),
                "location": user_profile.get("location"),
                "disability_specializations": [
                    {
                        "disability_type": s.get("disability_type"),
                        "specialization_level": s.get("specialization_level"),
                        "certified": s.get("certified", False),
                        "years_experience": s.get("years_experience", 0)
                    }
                    for s in specializations
                ],
                "specialization_match_score": round(match_score, 1) if match_score > 0 else None
            })

        teacher_list.sort(key=lambda x: (x["specialization_match_score"] or 0, x["average_rating"] or 0), reverse=True)
        
        total = len(teacher_list)
        teacher_list = teacher_list[offset:offset + limit]

        return {
            "success": True,
            "data": {
                "teachers": teacher_list,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Find teachers error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch teachers: {str(e)}"
        )


@router.get("/subjects")
async def get_subjects_for_students(
    current_user: User = Depends(get_current_active_user)
):
    """Get all subjects with teacher counts for student search"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        from collections import Counter
        subjects = await SupabaseRESTAsync.select(
            "subjects",
            "*",
            {"is_active": True},
            order="name.asc"
        )

        subject_ids = [s.get("id") for s in subjects if s.get("id")]
        ts_rows = await SupabaseRESTAsync.select_in("teacher_subjects", "subject_id", subject_ids, "subject_id")
        teacher_counts = Counter(str(r.get("subject_id")) for r in ts_rows)
        course_rows = await SupabaseRESTAsync.select_in(
            "courses", "subject_id", subject_ids, "subject_id", {"status": "published"}
        )
        course_counts = Counter(str(r.get("subject_id")) for r in course_rows)

        subjects_data = []
        for subject in subjects:
            sid = str(subject.get("id"))
            subjects_data.append({
                "id": sid,
                "name": subject.get("name"),
                "description": subject.get("description"),
                "category": subject.get("category"),
                "teacher_count": teacher_counts.get(sid, 0),
                "course_count": course_counts.get(sid, 0)
            })

        subjects_data.sort(key=lambda x: x["teacher_count"], reverse=True)

        return {
            "success": True,
            "data": subjects_data
        }

    except Exception as e:
        logger.error(f"Subjects error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subjects: {str(e)}"
        )


@router.post("/contact-teacher")
async def contact_teacher(
    teacher_id: str = Form(..., description="Teacher ID to contact"),
    message: str = Form(..., description="Message content"),
    subject: str = Form("General Inquiry", description="Message subject"),
    current_user: User = Depends(get_current_active_user)
):
    """Send a message to a teacher"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "*", {"id": teacher_id})
        if not teacher_profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher not found"
            )

        teacher_user_id = str(teacher_profile.get("user_id"))

        conversations = await SupabaseRESTAsync.select(
            "conversations",
            "*",
            {"participant_1": user_id, "participant_2": teacher_user_id}
        )

        if not conversations:
            conversations = await SupabaseRESTAsync.select(
                "conversations",
                "*",
                {"participant_1": teacher_user_id, "participant_2": user_id}
            )

        if conversations:
            conversation_id = conversations[0].get("id")
        else:
            new_conversation = await SupabaseRESTAsync.insert("conversations", {
                "id": str(uuid.uuid4()),
                "participant_1": user_id,
                "participant_2": teacher_user_id,
                "created_at": datetime.utcnow().isoformat()
            })
            conversation_id = new_conversation.get("id") if new_conversation else None

        if not conversation_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create conversation"
            )

        message_data = {
            "id": str(uuid.uuid4()),
            "conversation_id": str(conversation_id),
            "sender_id": user_id,
            "content": f"Subject: {subject}\n\n{message}",
            "created_at": datetime.utcnow().isoformat()
        }

        created_message = await SupabaseRESTAsync.insert("messages", message_data)

        await SupabaseRESTAsync.update(
            "conversations",
            {"last_message_at": datetime.utcnow().isoformat()},
            {"id": str(conversation_id)}
        )

        teacher_user_profile = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name", {"user_id": teacher_user_id})
        teacher_name = "Teacher"
        if teacher_user_profile:
            teacher_name = f"{teacher_user_profile.get('first_name', '')} {teacher_user_profile.get('last_name', '')}".strip() or "Teacher"

        return {
            "success": True,
            "message": f"Message sent to {teacher_name}",
            "data": {
                "conversation_id": str(conversation_id),
                "message_id": created_message.get("id") if created_message else message_data.get("id")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Contact teacher error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send message: {str(e)}"
        )


@router.get("/campaigns")
async def list_active_campaigns_for_student(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
):
    """Active sponsor campaigns visible to students.

    Sponsors created the campaign feature on their side (CRUD lives under
    `/api/v1/sponsors/campaigns`), but there was no way for students to
    discover them. This endpoint scopes the listing to campaigns whose
    status is "active" / "launched" and whose end_date has not passed, then
    enriches each row with the sponsor display name so the card reads
    "Funded by Acme Inc." without an extra round-trip from the frontend.

    The endpoint is intentionally permissive on auth — any signed-in user
    can read it, not just students — so guardians and teachers can also
    surface campaigns when relevant. The role check below keeps it
    student-first but doesn't 403 the others; we'd rather show data than
    hide it from a guardian browsing on behalf of a student.
    """
    try:
        offset = (page - 1) * limit
        now_iso = datetime.utcnow().date().isoformat()

        campaigns_active = await SupabaseRESTAsync.select(
            "sponsor_campaigns",
            "*",
            {"status": "active"},
            order="created_at.desc",
            limit=200,
        ) or []
        campaigns_launched = await SupabaseRESTAsync.select(
            "sponsor_campaigns",
            "*",
            {"status": "launched"},
            order="created_at.desc",
            limit=200,
        ) or []
        all_rows = campaigns_active + campaigns_launched

        live_rows = []
        for row in all_rows:
            end_date = row.get("end_date")
            if end_date and isinstance(end_date, str) and end_date < now_iso:
                continue
            live_rows.append(row)

        sponsor_ids = list({r.get("sponsor_id") for r in live_rows if r.get("sponsor_id")})
        sponsor_profiles = await SupabaseRESTAsync.select_in(
            "sponsor_profiles", "id", sponsor_ids, "id,user_id,organization_name"
        )
        sp_by_id = {str(s.get("id")): s for s in sponsor_profiles}
        need_user_ids = [s.get("user_id") for s in sponsor_profiles
                         if not s.get("organization_name") and s.get("user_id")]
        sponsor_user_profiles = await SupabaseRESTAsync.select_in(
            "user_profiles", "user_id", need_user_ids, "user_id,first_name,last_name"
        )
        up_by_uid = {str(u.get("user_id")): u for u in sponsor_user_profiles}

        def resolve_sponsor_name(sid: str) -> str:
            sp = sp_by_id.get(str(sid))
            if not sp:
                return "A sponsor"
            org = sp.get("organization_name")
            if org:
                return org
            up = up_by_uid.get(str(sp.get("user_id")))
            if up:
                full = f"{up.get('first_name', '')} {up.get('last_name', '')}".strip()
                if full:
                    return full
            return "A sponsor"

        formatted: List[Dict[str, Any]] = []
        for row in live_rows:
            sponsor_id = row.get("sponsor_id") or ""
            budget_val = float(row.get("budget", 0) or 0)
            formatted.append({
                "id": str(row.get("id")),
                "title": row.get("title") or row.get("name") or "Campaign",
                "description": row.get("description") or "",
                "sponsor_name": resolve_sponsor_name(sponsor_id) if sponsor_id else "A sponsor",
                "budget_lkr": budget_val,
                "students_reached": int(row.get("students_reached") or 0),
                "completion_percentage": float(row.get("completion_percentage") or 0),
                "start_date": row.get("start_date"),
                "end_date": row.get("end_date"),
                "created_at": row.get("created_at"),
            })

        formatted.sort(key=lambda c: (-c["completion_percentage"], c.get("created_at") or ""), reverse=False)

        total = len(formatted)
        page_slice = formatted[offset:offset + limit]

        return {
            "success": True,
            "data": {
                "campaigns": page_slice,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "pages": max(1, (total + limit - 1) // limit),
                },
            },
        }

    except Exception as e:
        logger.error(f"Student campaigns error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch campaigns: {str(e)}",
        )


@router.get("/live-sessions")
async def get_live_sessions(
    status_filter: str = Query("", description="Filter by session status"),
    filter_by_disability: bool = Query(True, description="Filter by student's disability profile"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get live sessions for the student with disability-based filtering"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        student_disability_types = []
        if filter_by_disability:
            disability_profile = await SupabaseRESTAsync.select_one(
                "student_disability_profiles",
                "disability_types,has_disability",
                {"user_id": user_id}
            )
            if disability_profile and disability_profile.get("has_disability"):
                student_disability_types = disability_profile.get("disability_types", [])

        all_sessions = await SupabaseRESTAsync.select(
            "live_sessions",
            "*",
            {},
            order="scheduled_start.desc",
            limit=200
        )

        course_ids = [s.get("course_id") for s in all_sessions if s.get("course_id")]
        teacher_ids = [s.get("teacher_id") for s in all_sessions if s.get("teacher_id")]
        course_rows = await SupabaseRESTAsync.select_in("courses", "id", course_ids, select_cols="id,title")
        course_by_id = {c.get("id"): c for c in course_rows}
        teacher_profile_rows = await SupabaseRESTAsync.select_in("teacher_profiles", "id", teacher_ids, select_cols="id,user_id")
        teacher_profile_by_id = {t.get("id"): t for t in teacher_profile_rows}
        teacher_user_ids = [t.get("user_id") for t in teacher_profile_rows if t.get("user_id")]
        user_profile_rows = await SupabaseRESTAsync.select_in(
            "user_profiles", "user_id", teacher_user_ids,
            select_cols="user_id,first_name,last_name,avatar_url",
        )
        user_profile_by_user_id = {u.get("user_id"): u for u in user_profile_rows}

        sessions_data = []
        for session in all_sessions:
            if not session:
                continue

            if status_filter and session.get("status") != status_filter:
                continue

            if filter_by_disability and student_disability_types:
                session_target_types = session.get("target_disability_types", [])
                if session_target_types and len(session_target_types) > 0:
                    has_match = any(dt in session_target_types for dt in student_disability_types)
                    if not has_match:
                        continue

            course = course_by_id.get(session.get("course_id"))

            teacher_name = "Unknown Teacher"
            teacher_avatar = None
            if session.get("teacher_id"):
                tp = teacher_profile_by_id.get(session.get("teacher_id"))
                if tp:
                    up = user_profile_by_user_id.get(tp.get("user_id"))
                    if up:
                        teacher_name = f"{up.get('first_name', '')} {up.get('last_name', '')}".strip() or "Unknown Teacher"
                        teacher_avatar = up.get("avatar_url")

            relevance_score = 0
            if student_disability_types and session.get("target_disability_types"):
                session_target_types = session.get("target_disability_types", [])
                if session_target_types:
                    matches = sum(1 for dt in student_disability_types if dt in session_target_types)
                    relevance_score = (matches / len(student_disability_types)) * 100

            sessions_data.append({
                "id": str(session.get("id")),
                "title": session.get("title"),
                "description": session.get("description"),
                "course_title": course.get("title") if course else None,
                "teacher_name": teacher_name,
                "teacher_avatar": teacher_avatar,
                "scheduled_start": session.get("scheduled_start"),
                "scheduled_end": session.get("scheduled_end"),
                "session_type": session.get("session_type"),
                "meeting_link": session.get("meeting_link"),
                "status": session.get("status"),
                "max_participants": session.get("max_participants"),
                "current_participants": session.get("current_participants", 0),
                "price": session.get("price", 0),
                "requires_payment": session.get("requires_payment", False),
                "accessibility": {
                    "target_disability_types": session.get("target_disability_types", []),
                    "has_live_captions": session.get("has_live_captions", False),
                    "has_sign_language_interpreter": session.get("has_sign_language_interpreter", False),
                    "accessibility_level": session.get("accessibility_level", 3),
                    "relevance_score": round(relevance_score, 1) if relevance_score > 0 else None
                }
            })

        sessions_data.sort(key=lambda x: (x["accessibility"]["relevance_score"] or 0, x["scheduled_start"]), reverse=True)

        total_count = len(sessions_data)
        sessions_data = sessions_data[offset:offset + limit]

        return {
            "success": True,
            "data": {
                "sessions": sessions_data,
                "student_disability_types": student_disability_types,
                "filter_applied": filter_by_disability,
                "pagination": {
                    "total": total_count,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total_count + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Live sessions error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch live sessions: {str(e)}"
        )


@router.get("/content-library")
async def get_content_library(
    search: str = Query("", description="Search in title, description, or tags"),
    category: str = Query("", description="Filter by subject category"),
    content_type: str = Query("", description="Filter by content type"),
    access_level: str = Query("", description="Filter by access level"),
    filter_by_disability: bool = Query(True, description="Filter content by student's disability profile"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Number of items per page"),
    current_user: User = Depends(get_current_active_user)
):
    """Get content library for students with disability-based filtering and search"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        student_disability_types = []
        if filter_by_disability:
            disability_profile = await SupabaseRESTAsync.select_one(
                "student_disability_profiles",
                "disability_types,has_disability",
                {"user_id": user_id}
            )
            if disability_profile and disability_profile.get("has_disability"):
                student_disability_types = disability_profile.get("disability_types", [])

        courses = await SupabaseRESTAsync.select(
            "courses",
            "*",
            {"status": "published"},
            limit=100
        )

        enrollments = await SupabaseRESTAsync.select("course_enrollments", "course_id", {"student_id": user_id, "status": "active"})
        enrolled_course_ids = {e.get("course_id") for e in enrollments}

        if not courses:
            return {"success": True, "data": {"content": [], "pagination": {"total": 0, "page": page, "limit": limit, "total_pages": 0}}}

        course_ids = [c.get("id") for c in courses]
        subject_ids = [c.get("subject_id") for c in courses if c.get("subject_id")]
        teacher_profile_ids = [c.get("teacher_id") for c in courses if c.get("teacher_id")]

        all_content = await SupabaseRESTAsync.select_in(
            "course_content", "course_id", course_ids, select_cols="*"
        )
        subjects_rows = await SupabaseRESTAsync.select_in("subjects", "id", subject_ids, select_cols="id,name,category")
        subjects_by_id = {s.get("id"): s for s in subjects_rows}

        teacher_profiles_rows = await SupabaseRESTAsync.select_in(
            "teacher_profiles", "id", teacher_profile_ids, select_cols="id,user_id,average_rating"
        )
        teacher_profile_by_id = {t.get("id"): t for t in teacher_profiles_rows}
        teacher_user_ids = [t.get("user_id") for t in teacher_profiles_rows if t.get("user_id")]
        user_profile_rows = await SupabaseRESTAsync.select_in(
            "user_profiles", "user_id", teacher_user_ids,
            select_cols="user_id,first_name,last_name,avatar_url",
        )
        user_profile_by_user_id = {u.get("user_id"): u for u in user_profile_rows}

        content_by_course: Dict[str, List[Dict]] = {}
        for c in all_content:
            content_by_course.setdefault(c.get("course_id"), []).append(c)
        for items in content_by_course.values():
            items.sort(key=lambda x: x.get("order_index") or 0)

        content_data = []

        for course in courses:
            content_items = content_by_course.get(course.get("id"), [])[:10]

            subject = subjects_by_id.get(course.get("subject_id"))
            if category and subject and (subject.get("category") or "").lower() != category.lower():
                continue
            teacher_name = "Unknown Teacher"
            teacher_avatar = None
            teacher_rating = 0
            if course.get("teacher_id"):
                tp = teacher_profile_by_id.get(course.get("teacher_id"))
                if tp:
                    teacher_rating = tp.get("average_rating") or 0
                    up = user_profile_by_user_id.get(tp.get("user_id"))
                    if up:
                        teacher_name = f"{up.get('first_name', '')} {up.get('last_name', '')}".strip() or "Unknown Teacher"
                        teacher_avatar = up.get("avatar_url")

            for item in content_items:
                if filter_by_disability and student_disability_types:
                    content_target_types = item.get("target_disability_types", [])
                    is_accessible_for_all = item.get("is_accessible_for_all", True)
                    if not is_accessible_for_all and content_target_types:
                        has_match = any(dt in content_target_types for dt in student_disability_types)
                        if not has_match:
                            continue

                if content_type and item.get("content_type") != content_type:
                    continue
                if access_level and item.get("access_level") != access_level:
                    continue
                if search:
                    search_lower = search.lower()
                    if search_lower not in (item.get("title") or "").lower() and search_lower not in (item.get("description") or "").lower():
                        continue

                has_access = course.get("id") in enrolled_course_ids

                accessibility_score = 0
                if student_disability_types:
                    content_target_types = item.get("target_disability_types", [])
                    if content_target_types:
                        matches = sum(1 for dt in student_disability_types if dt in content_target_types)
                        accessibility_score = (matches / len(student_disability_types)) * 100

                content_data.append({
                    "id": str(item.get("id")),
                    "title": item.get("title"),
                    "description": item.get("description"),
                    "content_type": item.get("content_type"),
                    "access_level": item.get("access_level"),
                    "duration": item.get("duration"),
                    "file_size": item.get("file_size"),
                    "content_url": item.get("content_url"),
                    "is_downloadable": item.get("is_downloadable", False),
                    "created_at": item.get("created_at"),
                    "order_index": item.get("order_index"),
                    "course_id": str(course.get("id")),
                    "course_title": course.get("title"),
                    "course_price": float(course.get("price", 0)) if course.get("price") else 0,
                    "teacher_id": str(course.get("teacher_id")) if course.get("teacher_id") else None,
                    "teacher_name": teacher_name,
                    "teacher_avatar": teacher_avatar,
                    "teacher_rating": float(teacher_rating) if teacher_rating else 0,
                    "subject_name": subject.get("name") if subject else None,
                    "subject_category": subject.get("category") if subject else None,
                    "has_access": has_access,
                    "progress_percentage": 0,
                    "time_spent_minutes": 0,
                    "is_completed": False,
                    "last_accessed_at": None,
                    "total_enrollments": 0,
                    "thumbnail_url": f"https://ui-avatars.com/api/?name={(item.get('title') or 'Content').replace(' ', '+')}&background=3b82f6&color=ffffff&size=400x300",
                    "accessibility": {
                        "has_captions": bool(item.get("caption_url")),
                        "has_transcript": bool(item.get("transcript_url")),
                        "has_audio_description": bool(item.get("audio_description_url")),
                        "has_sign_language": bool(item.get("sign_language_video_url")),
                        "target_disability_types": item.get("target_disability_types", []),
                        "is_accessible_for_all": item.get("is_accessible_for_all", True),
                        "requires_vision": item.get("requires_vision", True),
                        "requires_hearing": item.get("requires_hearing", True),
                        "cognitive_level": item.get("cognitive_level", 3),
                        "accessibility_score": round(accessibility_score, 1) if accessibility_score > 0 else None
                    }
                })

        total_count = len(content_data)
        content_data = content_data[offset:offset + limit]

        return {
            "success": True,
            "data": {
                "content": content_data,
                "pagination": {
                    "total": total_count,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total_count + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Content library error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch content library: {str(e)}"
        )


@router.get("/pre-recorded-lessons")
async def get_pre_recorded_lessons(
    disability_type: str = Query("", description="Filter by specific disability type"),
    has_captions: bool = Query(False, description="Filter for content with captions"),
    has_transcripts: bool = Query(False, description="Filter for content with transcripts"),
    has_audio_description: bool = Query(False, description="Filter for audio descriptions"),
    subject: str = Query("", description="Filter by subject"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get pre-recorded video lessons filtered by accessibility features"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        disability_profile = await SupabaseRESTAsync.select_one(
            "student_disability_profiles",
            "*",
            {"user_id": user_id}
        )

        student_disability_types = []
        if disability_profile and disability_profile.get("has_disability"):
            student_disability_types = disability_profile.get("disability_types", [])

        courses = await SupabaseRESTAsync.select(
            "courses",
            "*",
            {"status": "published"},
            limit=200
        )

        lessons_data = []

        for course in courses:
            content_items = await SupabaseRESTAsync.select(
                "course_content",
                "*",
                {"course_id": course.get("id"), "content_type": "video"},
                order="order_index.asc"
            )

            for item in content_items:
                if has_captions and not item.get("caption_url"):
                    continue
                if has_transcripts and not item.get("transcript_url"):
                    continue
                if has_audio_description and not item.get("audio_description_url"):
                    continue

                content_target_types = item.get("target_disability_types", [])
                if disability_type and disability_type not in content_target_types:
                    if not item.get("is_accessible_for_all", True):
                        continue

                if not disability_type and student_disability_types and content_target_types:
                    has_match = any(dt in content_target_types for dt in student_disability_types)
                    if not has_match and not item.get("is_accessible_for_all", True):
                        continue

                subject_info = await SupabaseRESTAsync.select_one(
                    "subjects",
                    "*",
                    {"id": course.get("subject_id")}
                ) if course.get("subject_id") else None

                if subject and subject_info and subject_info.get("name", "").lower() != subject.lower():
                    continue

                teacher_name = "Unknown Teacher"
                teacher_avatar = None
                if course.get("teacher_id"):
                    teacher_profile = await SupabaseRESTAsync.select_one(
                        "teacher_profiles",
                        "user_id",
                        {"id": course.get("teacher_id")}
                    )
                    if teacher_profile:
                        user_profile = await SupabaseRESTAsync.select_one(
                            "user_profiles",
                            "first_name,last_name,avatar_url",
                            {"user_id": teacher_profile.get("user_id")}
                        )
                        if user_profile:
                            teacher_name = f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip() or "Unknown"
                            teacher_avatar = user_profile.get("avatar_url")

                relevance_score = 0
                if student_disability_types and content_target_types:
                    matches = sum(1 for dt in student_disability_types if dt in content_target_types)
                    relevance_score = (matches / len(student_disability_types)) * 100

                lessons_data.append({
                    "id": str(item.get("id")),
                    "title": item.get("title"),
                    "description": item.get("description"),
                    "duration": item.get("duration"),
                    "thumbnail_url": course.get("thumbnail_url") or f"https://ui-avatars.com/api/?name={item.get('title', 'Lesson').replace(' ', '+')}&background=3b82f6&color=ffffff&size=400",
                    "course_id": str(course.get("id")),
                    "course_title": course.get("title"),
                    "teacher_name": teacher_name,
                    "teacher_avatar": teacher_avatar,
                    "subject_name": subject_info.get("name") if subject_info else "General",
                    "subject_category": subject_info.get("category") if subject_info else None,
                    "accessibility_features": {
                        "has_captions": bool(item.get("caption_url")),
                        "has_transcripts": bool(item.get("transcript_url")),
                        "has_audio_description": bool(item.get("audio_description_url")),
                        "has_sign_language": bool(item.get("sign_language_video_url")),
                        "caption_url": item.get("caption_url"),
                        "transcript_url": item.get("transcript_url"),
                        "audio_description_url": item.get("audio_description_url"),
                        "target_disability_types": content_target_types,
                        "cognitive_level": item.get("cognitive_level", 3),
                        "relevance_score": round(relevance_score, 1) if relevance_score > 0 else None
                    },
                    "created_at": item.get("created_at")
                })

        lessons_data.sort(key=lambda x: x["accessibility_features"]["relevance_score"] or 0, reverse=True)

        total_count = len(lessons_data)
        lessons_data = lessons_data[offset:offset + limit]

        return {
            "success": True,
            "data": {
                "lessons": lessons_data,
                "student_disability_types": student_disability_types,
                "filters_applied": {
                    "has_captions": has_captions,
                    "has_transcripts": has_transcripts,
                    "has_audio_description": has_audio_description,
                    "disability_type": disability_type or "auto"
                },
                "pagination": {
                    "total": total_count,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total_count + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Pre-recorded lessons error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch pre-recorded lessons: {str(e)}"
        )


@router.get("/content-categories")
async def get_content_categories(
    current_user: User = Depends(get_current_active_user)
):
    """Get available content categories and types"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        subjects = await SupabaseRESTAsync.select("subjects", "category", {"is_active": True})
        categories = list(set([s.get("category") for s in subjects if s.get("category")]))

        content_types = [
            {"value": "video", "label": "Video", "icon": "video"},
            {"value": "document", "label": "Document", "icon": "file-text"},
            {"value": "quiz", "label": "Quiz", "icon": "help-circle"},
            {"value": "assignment", "label": "Assignment", "icon": "edit"},
            {"value": "presentation", "label": "Presentation", "icon": "monitor"}
        ]

        access_levels = [
            {"value": "free", "label": "Free", "description": "Available to all students"},
            {"value": "enrolled", "label": "Enrolled Only", "description": "Requires course enrollment"},
            {"value": "premium", "label": "Premium", "description": "Requires premium subscription"}
        ]

        return {
            "success": True,
            "data": {
                "categories": [{"value": c, "label": c.title()} for c in sorted(categories)],
                "content_types": content_types,
                "access_levels": access_levels
            }
        }

    except Exception as e:
        logger.error(f"Content categories error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch content categories: {str(e)}"
        )


@router.get("/content/{content_id}")
async def get_content_detail(
    content_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get detailed content information"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        content = await SupabaseRESTAsync.select_one("course_content", "*", {"id": content_id})

        if not content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Content not found"
            )

        course = await SupabaseRESTAsync.select_one("courses", "*", {"id": content.get("course_id")})

        user_id = str(current_user.id)
        enrollment = await SupabaseRESTAsync.select_one("course_enrollments", "*", {
            "student_id": user_id,
            "course_id": content.get("course_id"),
            "status": "active"
        })

        has_access = enrollment is not None or content.get("access_level") == "free"

        return {
            "success": True,
            "data": {
                "id": str(content.get("id")),
                "title": content.get("title"),
                "description": content.get("description"),
                "content_type": content.get("content_type"),
                "access_level": content.get("access_level"),
                "duration": content.get("duration"),
                "content_url": content.get("content_url") if has_access else None,
                "is_downloadable": content.get("is_downloadable"),
                "course_id": str(course.get("id")) if course else None,
                "course_title": course.get("title") if course else None,
                "has_access": has_access
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Content detail error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch content: {str(e)}"
        )


@router.post("/content/{content_id}/progress")
async def update_content_progress(
    content_id: str,
    progress_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user)
):
    """Update student's progress on content"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        content = await SupabaseRESTAsync.select_one("course_content", "*", {"id": content_id})
        if not content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Content not found"
            )

        enrollment = await SupabaseRESTAsync.select_one("course_enrollments", "*", {
            "student_id": user_id,
            "course_id": content.get("course_id")
        })

        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enrolled in this course"
            )

        progress = await SupabaseRESTAsync.select_one("student_progress", "*", {
            "enrollment_id": enrollment.get("id"),
            "content_id": content_id
        })

        progress_update = {
            "progress_percentage": progress_data.get("progress_percentage", 0),
            "time_spent_minutes": progress_data.get("time_spent_minutes", 0),
            "is_completed": progress_data.get("is_completed", False),
            "last_accessed": datetime.utcnow().isoformat()
        }

        if progress:
            await SupabaseRESTAsync.update("student_progress", progress_update, {"id": progress.get("id")})
        else:
            progress_update.update({
                "id": str(uuid.uuid4()),
                "enrollment_id": str(enrollment.get("id")),
                "content_id": content_id,
                "created_at": datetime.utcnow().isoformat()
            })
            await SupabaseRESTAsync.insert("student_progress", progress_update)

        return {
            "success": True,
            "message": "Progress updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update progress error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update progress: {str(e)}"
        )


@router.get("/conversations")
async def get_conversations(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get student's conversations"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        conversations_1 = await SupabaseRESTAsync.select(
            "conversations",
            "*",
            {"participant_1": user_id},
            order="last_message_at.desc.nullslast",
            limit=limit,
            offset=offset
        )

        conversations_2 = await SupabaseRESTAsync.select(
            "conversations",
            "*",
            {"participant_2": user_id},
            order="last_message_at.desc.nullslast",
            limit=limit,
            offset=offset
        )

        all_conversations = conversations_1 + conversations_2

        all_conversations.sort(key=lambda x: x.get("last_message_at") or "", reverse=True)
        all_conversations = all_conversations[:limit]

        conversations_data = []
        for conv in all_conversations:
            other_user_id = conv.get("participant_2") if conv.get("participant_1") == user_id else conv.get("participant_1")

            other_profile = await SupabaseRESTAsync.select_one("user_profiles", "*", {"user_id": other_user_id})
            other_name = "Unknown User"
            avatar_url = f"https://ui-avatars.com/api/?name=Unknown&background=3b82f6&color=ffffff"
            if other_profile:
                other_name = f"{other_profile.get('first_name', '')} {other_profile.get('last_name', '')}".strip() or "Unknown User"
                avatar_url = other_profile.get("avatar_url") or f"https://ui-avatars.com/api/?name={other_name.replace(' ', '+')}&background=3b82f6&color=ffffff"

            teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "*", {"user_id": other_user_id})
            subject = "General"
            rating = 0.0
            response_time = "a few hours"
            is_online = False

            if teacher_profile:
                subject = teacher_profile.get("specialization") or "General"
                rating = float(teacher_profile.get("average_rating", 0) or 0)
                is_online = teacher_profile.get("is_available", False)
                response_time = "Quick response" if is_online else "Usually within a day"

            messages = await SupabaseRESTAsync.select(
                "messages",
                "*",
                {"conversation_id": conv.get("id")},
                order="created_at.desc",
                limit=1
            )
            last_message = messages[0] if messages else None
            last_message_from_me = last_message.get("sender_id") == user_id if last_message else False

            last_message_at = conv.get("last_message_at")
            if last_message_at:
                try:
                    from datetime import datetime
                    msg_time = datetime.fromisoformat(last_message_at.replace('Z', '+00:00'))
                    now = datetime.utcnow().replace(tzinfo=msg_time.tzinfo)
                    diff = now - msg_time
                    if diff.days > 0:
                        last_seen = f"{diff.days} days ago"
                    elif diff.seconds >= 3600:
                        last_seen = f"{diff.seconds // 3600} hours ago"
                    elif diff.seconds >= 60:
                        last_seen = f"{diff.seconds // 60} minutes ago"
                    else:
                        last_seen = "Just now"
                except:
                    last_seen = "Recently"
            else:
                last_seen = "No messages yet"

            unread = await SupabaseRESTAsync.select(
                "messages",
                "id,sender_id",
                {"conversation_id": conv.get("id"), "is_read": False}
            )
            unread_count = len([m for m in unread if m.get("sender_id") != user_id])

            conversations_data.append({
                "id": str(conv.get("id")),
                "teacher_id": other_user_id,
                "teacher_name": other_name,
                "subject": subject,
                "avatar": avatar_url,
                "is_online": is_online,
                "last_seen": last_seen,
                "rating": rating,
                "response_time": response_time,
                "unread_count": unread_count,
                "last_message": last_message.get("content")[:100] if last_message else None,
                "last_message_time": last_message_at,
                "last_message_from_me": last_message_from_me
            })

        return {
            "success": True,
            "data": conversations_data
        }

    except Exception as e:
        logger.error(f"Conversations error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch conversations: {str(e)}"
        )


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get messages for a conversation"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        conversation = await SupabaseRESTAsync.select_one("conversations", "*", {"id": conversation_id})
        if not conversation or (conversation.get("participant_1") != user_id and conversation.get("participant_2") != user_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found"
            )

        messages = await SupabaseRESTAsync.select(
            "messages",
            "*",
            {"conversation_id": conversation_id},
            order="created_at.desc",
            limit=limit,
            offset=offset
        )

        messages_data = []
        for msg in messages:
            sender_profile = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name,avatar_url", {"user_id": msg.get("sender_id")})
            sender_name = "Unknown"
            if sender_profile:
                sender_name = f"{sender_profile.get('first_name', '')} {sender_profile.get('last_name', '')}".strip() or "Unknown"

            created_at = msg.get("created_at")
            timestamp = ""
            if created_at:
                try:
                    from datetime import datetime
                    msg_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    timestamp = msg_time.strftime("%I:%M %p")
                except:
                    timestamp = ""

            messages_data.append({
                "id": str(msg.get("id")),
                "conversation_id": conversation_id,
                "sender_id": msg.get("sender_id"),
                "sender_name": sender_name,
                "sender_role": "student" if msg.get("sender_id") == user_id else "teacher",
                "content": msg.get("content"),
                "attachments": [],
                "is_read": msg.get("is_read", False),
                "created_at": created_at,
                "is_from_me": msg.get("sender_id") == user_id,
                "timestamp": timestamp
            })

        for msg in messages:
            if msg.get("sender_id") != user_id and not msg.get("is_read"):
                await SupabaseRESTAsync.update("messages", {"is_read": True}, {"id": msg.get("id")})

        return {
            "success": True,
            "data": {
                "messages": messages_data[::-1],
                "pagination": {
                    "total": len(messages),
                    "page": page,
                    "limit": limit
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Messages error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch messages: {str(e)}"
        )


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    message_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user)
):
    """Send a message in a conversation"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        conversation = await SupabaseRESTAsync.select_one("conversations", "*", {"id": conversation_id})
        if not conversation or (conversation.get("participant_1") != user_id and conversation.get("participant_2") != user_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found"
            )

        new_message = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "sender_id": user_id,
            "content": message_data.get("content", ""),
            "is_read": False,
            "created_at": datetime.utcnow().isoformat()
        }

        created = await SupabaseRESTAsync.insert("messages", new_message)

        await SupabaseRESTAsync.update("conversations", {"last_message_at": datetime.utcnow().isoformat()}, {"id": conversation_id})

        return {
            "success": True,
            "data": {
                "id": created.get("id") if created else new_message.get("id"),
                "content": new_message.get("content"),
                "created_at": new_message.get("created_at")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Send message error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send message: {str(e)}"
        )


@router.post("/conversations")
async def create_conversation(
    conversation_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new conversation"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        other_user_id = conversation_data.get("user_id")

        if not other_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="user_id is required"
            )

        existing = await SupabaseRESTAsync.select(
            "conversations",
            "*",
            {"participant_1": user_id, "participant_2": other_user_id}
        )
        if not existing:
            existing = await SupabaseRESTAsync.select(
                "conversations",
                "*",
                {"participant_1": other_user_id, "participant_2": user_id}
            )

        if existing:
            return {
                "success": True,
                "data": {"id": str(existing[0].get("id"))},
                "message": "Conversation already exists"
            }

        new_conversation = {
            "id": str(uuid.uuid4()),
            "participant_1": user_id,
            "participant_2": other_user_id,
            "created_at": datetime.utcnow().isoformat()
        }

        created = await SupabaseRESTAsync.insert("conversations", new_conversation)

        return {
            "success": True,
            "data": {"id": created.get("id") if created else new_conversation.get("id")},
            "message": "Conversation created"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create conversation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create conversation: {str(e)}"
        )


@router.get("/enrolled-courses")
async def get_enrolled_courses(
    current_user: User = Depends(get_current_active_user)
):
    """Get student's enrolled courses"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        enrollments = await SupabaseRESTAsync.select(
            "course_enrollments",
            "*",
            {"student_id": user_id},
            order="enrolled_at.desc"
        )

        courses_data = []
        for enrollment in enrollments:
            course = await SupabaseRESTAsync.select_one("courses", "*", {"id": enrollment.get("course_id")})
            if not course:
                continue

            courses_data.append({
                "id": str(course.get("id")),
                "title": course.get("title"),
                "description": course.get("description"),
                "progress_percentage": enrollment.get("progress_percentage", 0) or 0,
                "status": enrollment.get("status"),
                "enrolled_at": enrollment.get("enrolled_at")
            })

        return {
            "success": True,
            "data": courses_data
        }

    except Exception as e:
        logger.error(f"Enrolled courses error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch enrolled courses: {str(e)}"
        )


@router.get("/payment-history")
async def get_payment_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get student's payment history"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        payments = await SupabaseRESTAsync.select(
            "payments",
            "*",
            {"user_id": user_id},
            order="created_at.desc",
            limit=limit,
            offset=offset
        )

        payments_data = []
        for payment in payments:
            course = None
            if payment.get("course_id"):
                course = await SupabaseRESTAsync.select_one("courses", "title", {"id": payment.get("course_id")})

            payments_data.append({
                "id": str(payment.get("id")),
                "amount": float(payment.get("amount", 0)) if payment.get("amount") else 0,
                "currency": payment.get("currency", "LKR"),
                "status": payment.get("status"),
                "payment_method": payment.get("payment_method"),
                "paymentMethod": payment.get("payment_method"),
                "payment_gateway": payment.get("payment_gateway"),
                "paymentGateway": payment.get("payment_gateway"),
                "course_title": course.get("title") if course else None,
                "created_at": payment.get("created_at"),
                "receipt_url": payment.get("receipt_url")
            })

        total = await SupabaseRESTAsync.count("payments", {"user_id": user_id})

        return {
            "success": True,
            "data": {
                "payments": payments_data,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Payment history error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch payment history: {str(e)}"
        )


@router.get("/payment-history/{payment_id}/receipt")
async def get_payment_receipt(
    payment_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Stream a PDF receipt for one of the student's payments.

    The endpoint previously returned a JSON metadata blob — the frontend
    set `link.download = '.pdf'` on it, producing a corrupt download.
    We now build the same `payment` dict shape the teacher endpoint uses
    and pipe it through `services.receipt_service.generate_receipt`,
    returning a real `application/pdf` body.
    """
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        payment = await SupabaseRESTAsync.select_one("payments", "*", {"id": payment_id, "user_id": user_id})

        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found"
            )

        description = "Payment"
        teacher_name: Optional[str] = None
        service_name: Optional[str] = None
        ref_id = payment.get("reference_id")
        ptype = payment.get("payment_type")

        if ref_id and ptype:
            if ptype == "course_enrollment":
                course = await SupabaseRESTAsync.select_one("courses", "title,teacher_id", {"id": ref_id})
                if course:
                    service_name = course.get("title")
                    description = f"{course.get('title')} - Course Fee"
                    if course.get("teacher_id"):
                        tp = await SupabaseRESTAsync.select_one("teacher_profiles", "user_id", {"id": course["teacher_id"]})
                        if tp and tp.get("user_id"):
                            up = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name", {"user_id": tp["user_id"]})
                            if up:
                                teacher_name = f"{up.get('first_name', '')} {up.get('last_name', '')}".strip() or None
            elif ptype == "session_booking":
                session_row = await SupabaseRESTAsync.select_one("live_sessions", "title,teacher_id", {"id": ref_id})
                if session_row:
                    service_name = session_row.get("title")
                    description = f"Live Session - {session_row.get('title')}"
                    if session_row.get("teacher_id"):
                        tp = await SupabaseRESTAsync.select_one("teacher_profiles", "user_id", {"id": session_row["teacher_id"]})
                        if tp and tp.get("user_id"):
                            up = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name", {"user_id": tp["user_id"]})
                            if up:
                                teacher_name = f"{up.get('first_name', '')} {up.get('last_name', '')}".strip() or None
            elif ptype == "event_registration":
                event = await SupabaseRESTAsync.select_one("events", "title", {"id": ref_id})
                if event:
                    service_name = event.get("title")
                    description = f"{event.get('title')} - Registration"

        payment_data = {
            "id": str(payment.get("id")),
            "transactionId": payment.get("transaction_id") or f"TXN-{str(payment_id)[:8]}",
            "amount": float(payment.get("amount") or 0),
            "currency": payment.get("currency") or "LKR",
            "type": (ptype or "tuition").replace("_", " "),
            "description": description,
            "teacherName": teacher_name,
            "courseName": service_name,
            "status": payment.get("status") or "paid",
            "paymentMethod": payment.get("payment_method") or "—",
            "date": payment.get("created_at"),
        }

        from services.receipt_service import generate_receipt
        pdf = generate_receipt(payment_data)
        filename = f"receipt_{payment_data['transactionId']}.pdf"
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Receipt error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch receipt: {str(e)}"
        )


@router.get("/events")
async def get_events(
    search: str = Query("", description="Search events"),
    category: str = Query("", description="Filter by category"),
    event_type: str = Query("", description="Filter by type"),
    is_free: bool = Query(None, description="Filter by free events"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get available events for students"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        filters = {"status": "published"}
        if is_free is not None:
            filters["is_free"] = is_free

        events = await SupabaseRESTAsync.select(
            "events",
            "*",
            filters,
            order="start_date.asc",
            limit=limit,
            offset=offset
        )

        registrations = await SupabaseRESTAsync.select("event_registrations", "event_id", {"user_id": user_id})
        registered_event_ids = [r.get("event_id") for r in registrations]

        bookmarks = await SupabaseRESTAsync.select("event_bookmarks", "event_id", {"user_id": user_id})
        bookmarked_event_ids = [b.get("event_id") for b in bookmarks]

        events_data = []
        for event in events:
            if search:
                search_lower = search.lower()
                if search_lower not in (event.get("title") or "").lower() and search_lower not in (event.get("description") or "").lower():
                    continue

            if category and event.get("category") != category:
                continue

            if event_type and event.get("event_type") != event_type:
                continue

            organizer_name = "Unknown"
            if event.get("organizer_id"):
                organizer_profile = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name", {"user_id": event.get("organizer_id")})
                if organizer_profile:
                    organizer_name = f"{organizer_profile.get('first_name', '')} {organizer_profile.get('last_name', '')}".strip() or "Unknown"

            events_data.append({
                "id": str(event.get("id")),
                "title": event.get("title"),
                "description": event.get("description"),
                "event_type": event.get("event_type"),
                "category": event.get("category"),
                "start_date": event.get("start_date"),
                "end_date": event.get("end_date"),
                "location": event.get("location"),
                "is_online": event.get("is_online", False),
                "meeting_link": event.get("meeting_link"),
                "max_attendees": event.get("max_attendees"),
                "current_attendees": event.get("current_attendees", 0),
                "is_free": event.get("is_free", True),
                "price": float(event.get("price", 0)) if event.get("price") else 0,
                "image_url": event.get("image_url"),
                "organizer_name": organizer_name,
                "is_registered": event.get("id") in registered_event_ids,
                "is_bookmarked": event.get("id") in bookmarked_event_ids
            })

        total = await SupabaseRESTAsync.count("events", filters)

        return {
            "success": True,
            "data": {
                "events": events_data,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Events error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch events: {str(e)}"
        )


@router.get("/events/categories")
async def get_event_categories(
    current_user: User = Depends(get_current_active_user)
):
    """Get available event categories"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        events = await SupabaseRESTAsync.select("events", "category", {"status": "published"})
        categories = list(set([e.get("category") for e in events if e.get("category")]))

        return {
            "success": True,
            "data": [{"value": c, "label": c.title()} for c in sorted(categories)]
        }

    except Exception as e:
        logger.error(f"Event categories error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch event categories: {str(e)}"
        )


@router.post("/events/{event_id}/register")
async def register_for_event(
    event_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Register for an event"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        event = await SupabaseRESTAsync.select_one("events", "*", {"id": event_id})
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )

        existing = await SupabaseRESTAsync.select_one("event_registrations", "*", {"event_id": event_id, "user_id": user_id})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Already registered for this event"
            )

        registration = {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "user_id": user_id,
            "status": "confirmed",
            "created_at": datetime.utcnow().isoformat()
        }

        created = await SupabaseRESTAsync.insert("event_registrations", registration)

        return {
            "success": True,
            "message": "Successfully registered for event",
            "data": {"registration_id": created.get("id") if created else registration.get("id")}
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Event registration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register for event: {str(e)}"
        )


@router.delete("/events/{event_id}/register")
async def unregister_from_event(
    event_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Unregister from an event"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        deleted = await SupabaseRESTAsync.delete("event_registrations", {"event_id": event_id, "user_id": user_id})

        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found"
            )

        return {
            "success": True,
            "message": "Successfully unregistered from event"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Event unregistration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unregister from event: {str(e)}"
        )


@router.post("/events/{event_id}/bookmark")
async def bookmark_event(
    event_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Bookmark an event"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        existing = await SupabaseRESTAsync.select_one("event_bookmarks", "*", {"event_id": event_id, "user_id": user_id})
        if existing:
            return {
                "success": True,
                "message": "Event already bookmarked"
            }

        bookmark = {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat()
        }

        await SupabaseRESTAsync.insert("event_bookmarks", bookmark)

        return {
            "success": True,
            "message": "Event bookmarked successfully"
        }

    except Exception as e:
        logger.error(f"Bookmark event error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bookmark event: {str(e)}"
        )


@router.delete("/events/{event_id}/bookmark")
async def remove_event_bookmark(
    event_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Remove event bookmark"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        deleted = await SupabaseRESTAsync.delete("event_bookmarks", {"event_id": event_id, "user_id": user_id})

        return {
            "success": True,
            "message": "Bookmark removed" if deleted else "Bookmark not found"
        }

    except Exception as e:
        logger.error(f"Remove bookmark error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove bookmark: {str(e)}"
        )


@router.get("/forum/posts")
async def get_forum_posts(
    search: str = Query("", description="Search posts"),
    category: str = Query("", description="Filter by category"),
    sort: str = Query("recent", description="Sort by: recent, popular, unanswered"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get forum posts"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        offset = (page - 1) * limit

        filters = {}
        if category:
            filters["category"] = category

        order = "created_at.desc"
        if sort == "popular":
            order = "upvotes.desc"

        posts = await SupabaseRESTAsync.select(
            "forum_posts",
            "*",
            filters if filters else None,
            order=order,
            limit=limit,
            offset=offset
        )

        author_ids = [p.get("author_id") for p in posts if p.get("author_id")]
        post_ids = [p.get("id") for p in posts]
        author_rows = await SupabaseRESTAsync.select_in(
            "user_profiles", "user_id", author_ids,
            select_cols="user_id,first_name,last_name,avatar_url,reputation_score",
        )
        author_by_id = {a.get("user_id"): a for a in author_rows}
        reply_rows = await SupabaseRESTAsync.select_in("forum_replies", "post_id", post_ids, select_cols="post_id")
        reply_count_by_post: Dict[str, int] = {}
        for r in reply_rows:
            reply_count_by_post[r.get("post_id")] = reply_count_by_post.get(r.get("post_id"), 0) + 1

        posts_data = []
        for post in posts:
            if search:
                search_lower = search.lower()
                if search_lower not in (post.get("title") or "").lower() and search_lower not in (post.get("content") or "").lower():
                    continue

            author_profile = author_by_id.get(post.get("author_id"))
            author_name = "Anonymous"
            author_avatar = "https://ui-avatars.com/api/?name=Anonymous&background=random"
            author_reputation = 0
            if author_profile:
                author_name = f"{author_profile.get('first_name', '')} {author_profile.get('last_name', '')}".strip() or "Anonymous"
                author_avatar = author_profile.get("avatar_url") or f"https://ui-avatars.com/api/?name={author_name.replace(' ', '+')}&background=random"
                author_reputation = author_profile.get("reputation_score", 0) or 0

            reply_count = reply_count_by_post.get(post.get("id"), 0)

            tags = post.get("tags", []) or []
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]

            posts_data.append({
                "id": str(post.get("id")),
                "title": post.get("title"),
                "content": post.get("content")[:200] + "..." if len(post.get("content", "")) > 200 else post.get("content"),
                "category": post.get("category"),
                "tags": tags,
                "author": {
                    "name": author_name,
                    "avatar": author_avatar,
                    "role": "Student",
                    "reputation": author_reputation
                },
                "upvotes": post.get("upvotes", 0) or 0,
                "downvotes": post.get("downvotes", 0) or 0,
                "replies": reply_count,
                "views": post.get("views", 0) or 0,
                "isPinned": post.get("is_pinned", False) or False,
                "isSolved": post.get("is_answered", False) or False,
                "hasImage": post.get("has_image", False) or False,
                "imageUrl": post.get("image_url"),
                "accessibilityTags": post.get("accessibility_tags") or [],
                "hasPoll": post.get("has_poll", False) or False,
                "createdAt": post.get("created_at")
            })

        total = await SupabaseRESTAsync.count("forum_posts", filters if filters else None)

        return {
            "success": True,
            "data": {
                "posts": posts_data,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Forum posts error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch forum posts: {str(e)}"
        )


@router.get("/forum/categories")
async def get_forum_categories(
    current_user: User = Depends(get_current_active_user)
):
    """Get forum categories"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        posts = await SupabaseRESTAsync.select("forum_posts", "category")
        categories = list(set([p.get("category") for p in posts if p.get("category")]))

        categories_data = []

        default_categories = [
            {"id": "all", "name": "All Posts"},
            {"id": "questions", "name": "Questions"},
            {"id": "discussions", "name": "Discussions"},
            {"id": "tips", "name": "Tips & Tricks"},
            {"id": "announcements", "name": "Announcements"},
            {"id": "solved", "name": "Solved"}
        ]

        for cat_info in default_categories:
            cat_id = cat_info["id"]
            if cat_id == "all":
                count = len(posts)
            elif cat_id == "solved":
                solved_posts = await SupabaseRESTAsync.select("forum_posts", "id", {"is_answered": True})
                count = len(solved_posts)
            else:
                count = len([p for p in posts if p.get("category") == cat_id])

            categories_data.append({
                "id": cat_id,
                "name": cat_info["name"],
                "count": count
            })

        return {
            "success": True,
            "data": categories_data
        }

    except Exception as e:
        logger.error(f"Forum categories error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch forum categories: {str(e)}"
        )


@router.get("/forum/stats")
async def get_forum_stats(
    current_user: User = Depends(get_current_active_user)
):
    """Get forum statistics"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        all_posts = await SupabaseRESTAsync.select("forum_posts", "id,author_id,is_answered")
        total_posts = len(all_posts)

        solved_posts = len([p for p in all_posts if p.get("is_answered") == True])

        unique_authors = set([p.get("author_id") for p in all_posts if p.get("author_id")])
        active_users = len(unique_authors)

        return {
            "success": True,
            "data": {
                "totalPosts": total_posts,
                "activeUsers": active_users,
                "solvedQuestions": solved_posts
            }
        }

    except Exception as e:
        logger.error(f"Forum stats error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch forum stats: {str(e)}"
        )


@router.get("/forum/posts/{post_id}")
async def get_forum_post_detail(
    post_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get forum post detail"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        post = await SupabaseRESTAsync.select_one("forum_posts", "*", {"id": post_id})

        if not post:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post not found"
            )

        author_profile = await SupabaseRESTAsync.select_one("user_profiles", "*", {"user_id": post.get("author_id")})
        author_name = "Anonymous"
        if author_profile:
            author_name = f"{author_profile.get('first_name', '')} {author_profile.get('last_name', '')}".strip() or "Anonymous"

        replies = await SupabaseRESTAsync.select(
            "forum_replies",
            "*",
            {"post_id": post_id},
            order="created_at.asc"
        )

        replies_data = []
        for reply in replies:
            reply_author = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name,avatar_url", {"user_id": reply.get("author_id")})
            reply_author_name = "Anonymous"
            if reply_author:
                reply_author_name = f"{reply_author.get('first_name', '')} {reply_author.get('last_name', '')}".strip() or "Anonymous"

            replies_data.append({
                "id": str(reply.get("id")),
                "content": reply.get("content"),
                "author_id": reply.get("author_id"),
                "author_name": reply_author_name,
                "author_avatar": reply_author.get("avatar_url") if reply_author else None,
                "upvotes": reply.get("upvotes", 0),
                "is_accepted": reply.get("is_accepted", False),
                "created_at": reply.get("created_at")
            })

        return {
            "success": True,
            "data": {
                "id": str(post.get("id")),
                "title": post.get("title"),
                "content": post.get("content"),
                "category": post.get("category"),
                "author_id": post.get("author_id"),
                "author_name": author_name,
                "author_avatar": author_profile.get("avatar_url") if author_profile else None,
                "upvotes": post.get("upvotes", 0),
                "downvotes": post.get("downvotes", 0),
                "is_answered": post.get("is_answered", False),
                "created_at": post.get("created_at"),
                "replies": replies_data
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forum post detail error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch post: {str(e)}"
        )


@router.post("/forum/posts")
async def create_forum_post(
    post_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new forum post"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        raw_tags = post_data.get("tags") or []
        if isinstance(raw_tags, str):
            raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        raw_a11y_tags = post_data.get("accessibility_tags") or []
        if isinstance(raw_a11y_tags, str):
            raw_a11y_tags = [t.strip() for t in raw_a11y_tags.split(",") if t.strip()]
        image_url = (post_data.get("image_url") or "").strip() or None

        new_post = {
            "id": str(uuid.uuid4()),
            "title": post_data.get("title"),
            "content": post_data.get("content"),
            "category": post_data.get("category", "general"),
            "author_id": user_id,
            "tags": raw_tags,
            "accessibility_tags": raw_a11y_tags,
            "image_url": image_url,
            "has_image": bool(image_url),
            "upvotes": 0,
            "downvotes": 0,
            "is_answered": False,
            "created_at": datetime.utcnow().isoformat()
        }

        created = await SupabaseRESTAsync.insert("forum_posts", new_post)

        return {
            "success": True,
            "message": "Post created successfully",
            "data": {"id": created.get("id") if created else new_post.get("id")}
        }

    except Exception as e:
        logger.error(f"Create post error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create post: {str(e)}"
        )


@router.post("/forum/posts/{post_id}/vote")
async def vote_forum_post(
    post_id: str,
    vote_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user)
):
    """Vote on a forum post"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        vote_type = vote_data.get("vote_type", "up")

        post = await SupabaseRESTAsync.select_one("forum_posts", "upvotes,downvotes", {"id": post_id})
        if not post:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post not found"
            )

        if vote_type == "up":
            await SupabaseRESTAsync.update("forum_posts", {"upvotes": (post.get("upvotes", 0) or 0) + 1}, {"id": post_id})
        else:
            await SupabaseRESTAsync.update("forum_posts", {"downvotes": (post.get("downvotes", 0) or 0) + 1}, {"id": post_id})

        return {
            "success": True,
            "message": "Vote recorded"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Vote error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to vote: {str(e)}"
        )


@router.post("/forum/posts/{post_id}/replies")
async def create_forum_reply(
    post_id: str,
    reply_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user)
):
    """Create a reply to a forum post"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        post = await SupabaseRESTAsync.select_one("forum_posts", "*", {"id": post_id})
        if not post:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post not found"
            )

        new_reply = {
            "id": str(uuid.uuid4()),
            "post_id": post_id,
            "author_id": user_id,
            "content": reply_data.get("content"),
            "upvotes": 0,
            "is_accepted": False,
            "created_at": datetime.utcnow().isoformat()
        }

        created = await SupabaseRESTAsync.insert("forum_replies", new_reply)

        return {
            "success": True,
            "message": "Reply created successfully",
            "data": {"id": created.get("id") if created else new_reply.get("id")}
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create reply error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create reply: {str(e)}"
        )


@router.get("/session-recordings")
async def get_session_recordings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get session recordings for student"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        offset = (page - 1) * limit

        participations = await SupabaseRESTAsync.select("session_participants", "session_id", {"student_id": user_id})
        session_ids = [p.get("session_id") for p in participations]

        recordings_data = []
        for session_id in session_ids:
            recordings = await SupabaseRESTAsync.select("session_recordings", "*", {"session_id": session_id})

            for rec in recordings:
                session = await SupabaseRESTAsync.select_one("live_sessions", "title", {"id": session_id})

                recordings_data.append({
                    "id": str(rec.get("id")),
                    "session_id": session_id,
                    "session_title": session.get("title") if session else "Unknown Session",
                    "recording_url": rec.get("recording_url"),
                    "duration": rec.get("duration"),
                    "created_at": rec.get("created_at")
                })

        total = len(recordings_data)
        recordings_data = recordings_data[offset:offset + limit]

        return {
            "success": True,
            "data": {
                "recordings": recordings_data,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }
        }

    except Exception as e:
        logger.error(f"Session recordings error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch session recordings: {str(e)}"
        )


@router.post("/join-session/{session_id}")
async def join_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Join a live session"""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        session = await SupabaseRESTAsync.select_one("live_sessions", "*", {"id": session_id})
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )

        existing = await SupabaseRESTAsync.select_one("session_participants", "*", {"session_id": session_id, "student_id": user_id})

        if not existing:
            participation = {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "student_id": user_id,
                "joined_at": datetime.utcnow().isoformat(),
                "status": "joined"
            }
            await SupabaseRESTAsync.insert("session_participants", participation)
        else:
            await SupabaseRESTAsync.update("session_participants", {
                "joined_at": datetime.utcnow().isoformat(),
                "status": "joined"
            }, {"id": existing.get("id")})

        return {
            "success": True,
            "message": "Successfully joined session",
            "data": {
                "meeting_link": session.get("meeting_link"),
                "session_title": session.get("title")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Join session error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to join session: {str(e)}"
        )


@router.post("/set-reminder/{session_id}")
async def set_session_reminder(
    session_id: str,
    reminder_data: dict = Body(default={}),
    current_user: User = Depends(get_current_active_user)
):
    """Subscribe the calling student to reminders for a session.

    Two side effects, both idempotent:
      1) Insert a "reminder set" notification so the in-app bell shows
         confirmation.
      2) Upsert a row in `session_participants` with reminder_only=true so
         the cron in `/admin/send-session-reminders` can iterate it. Without
         this row the reminder cron would never see the student — it scans
         participants, not notifications.
    """
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        session = await SupabaseRESTAsync.select_one("live_sessions", "*", {"id": session_id})
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )

        already_notified = await SupabaseRESTAsync.select(
            "notifications",
            "id",
            {
                "user_id": user_id,
                "type": "reminder",
                "related_entity_type": "live_session",
                "related_entity_id": session_id,
            },
            limit=1,
        )
        if not already_notified:
            await SupabaseRESTAsync.insert("notifications", {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "title": f"Session reminder set: {session.get('title')}",
                "message": (
                    f"We'll email you before '{session.get('title')}' starts."
                ),
                "type": "reminder",
                "related_entity_type": "live_session",
                "related_entity_id": session_id,
                "link_url": f"/students/meeting-room/{session_id}",
                "is_read": False,
                "priority": "normal",
                "created_at": datetime.utcnow().isoformat(),
            })

        existing_part = await SupabaseRESTAsync.select_one(
            "session_participants",
            "id",
            {"session_id": session_id, "user_id": user_id},
        )
        if not existing_part:
            try:
                await SupabaseRESTAsync.insert("session_participants", {
                    "id": str(uuid.uuid4()),
                    "session_id": session_id,
                    "user_id": user_id,
                    "role": "reminder_only",
                    "joined_at": None,
                    "created_at": datetime.utcnow().isoformat(),
                })
            except Exception as exc:
                logger.warning(f"session_participants insert skipped: {exc}")

        return {
            "success": True,
            "message": "Reminder set successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Set reminder error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set reminder: {str(e)}"
        )



@router.get("/wishlist")
async def get_student_wishlist(
    current_user: User = Depends(get_current_active_user)
):
    """Return the student's saved courses, newest first."""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        items = await SupabaseRESTAsync.select(
            "student_wishlist",
            "*",
            {"student_id": user_id},
            order="created_at.desc"
        ) or []

        wishlist = []
        for item in items:
            course = await SupabaseRESTAsync.select_one("courses", "*", {"id": item.get("course_id")})
            if not course:
                continue

            teacher_name = "Unknown Teacher"
            teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "user_id", {"id": course.get("teacher_id")}) if course.get("teacher_id") else None
            if teacher_profile:
                up = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name", {"user_id": teacher_profile.get("user_id")})
                if up:
                    teacher_name = f"{up.get('first_name', '')} {up.get('last_name', '')}".strip() or teacher_name

            subject = await SupabaseRESTAsync.select_one("subjects", "name", {"id": course.get("subject_id")}) if course.get("subject_id") else None

            wishlist.append({
                "wishlist_id": str(item.get("id")),
                "course_id": str(course.get("id")),
                "title": course.get("title"),
                "description": course.get("description"),
                "thumbnail_url": course.get("thumbnail_url"),
                "price": course.get("price"),
                "teacher_name": teacher_name,
                "subject": subject.get("name") if subject else "General",
                "added_at": item.get("created_at"),
            })

        return {"success": True, "data": wishlist}

    except Exception as e:
        logger.error(f"Get wishlist error: {e}")
        return {"success": True, "data": []}


@router.post("/wishlist")
async def add_to_wishlist(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_active_user)
):
    """Add a course to the student's wishlist (idempotent)."""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    course_id = str(payload.get("course_id") or "").strip()
    if not course_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="course_id is required"
        )

    try:
        user_id = str(current_user.id)

        course = await SupabaseRESTAsync.select_one("courses", "id", {"id": course_id})
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        existing = await SupabaseRESTAsync.select_one(
            "student_wishlist", "id", {"student_id": user_id, "course_id": course_id}
        )
        if existing:
            return {"success": True, "message": "Already in wishlist", "id": str(existing.get("id"))}

        row = await SupabaseRESTAsync.insert("student_wishlist", {
            "id": str(uuid.uuid4()),
            "student_id": user_id,
            "course_id": course_id,
            "created_at": datetime.utcnow().isoformat(),
        })

        return {
            "success": True,
            "message": "Added to wishlist",
            "id": str(row.get("id")) if row else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add to wishlist error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add to wishlist: {str(e)}"
        )


@router.delete("/wishlist/{course_id}")
async def remove_from_wishlist(
    course_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Remove a course from the student's wishlist."""
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    try:
        user_id = str(current_user.id)
        await SupabaseRESTAsync.delete("student_wishlist", {"student_id": user_id, "course_id": course_id})
        return {"success": True, "message": "Removed from wishlist"}

    except Exception as e:
        logger.error(f"Remove from wishlist error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove from wishlist: {str(e)}"
        )
