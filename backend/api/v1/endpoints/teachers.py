from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Form, Body
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, asc, String, text
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, date, timezone
from uuid import UUID
import json
import io
import csv
import pandas as pd
import logging
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

from database.database import get_db
from database.models import User, UserRole
from database.teacher_models import (
    TeacherProfile, Subject, TeacherSubject, Course, CourseContent,
    LiveSession, SessionParticipant, CourseEnrollment, StudentProgress,
    Payment, Review, Examination, DashboardMetric, Event, EventRegistration,
    SponsorshipRequest
)
from schemas.teacher_schemas import (
    TeacherProfileCreate, TeacherProfileUpdate, TeacherProfile as TeacherProfileSchema,
    TeacherDashboardStats, TeacherProfileResponse, Subject as SubjectSchema,
    TeacherSubjectCreate, TeacherSubjectUpdate, TeacherSubjectResponse,
    CourseCreate, CourseUpdate, CourseContentCreate, CourseContentUpdate, 
    LiveSessionCreate, LiveSessionUpdate, CourseEnrollmentUpdate, ReviewCreate, 
    ExaminationCreate, TeacherCoursesResponse, TeacherSessionsResponse, 
    TeacherStudentsResponse, TeacherEarningsResponse, TeacherAnalyticsResponse, 
    PaginationParams, CourseFilter, SessionFilter, StudentFilter, ContentFilter, 
    FileUploadResponse, EventCreate, EventUpdate, EventResponse, 
    EventRegistrationCreate, EventRegistrationResponse, TeacherEventsResponse,
    SponsorshipRequestCreate, SponsorshipRequestUpdate, SponsorshipRequestResponse,
    TeacherSponsorshipResponse, DetailedCourseEnrollment, StudentInfo, StudentProfile, CourseInfo
)
from core.security import get_current_active_user
from database.supabase_client import SupabaseREST
from database.supabase_async import SupabaseRESTAsync

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/profile/rest")
async def get_teacher_profile_rest(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher profile using REST API (fallback endpoint)"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        import asyncio

        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "*", {"user_id": user_id})

        if not teacher_profile:
            teacher_profile = {
                "user_id": user_id,
                "total_students": 0,
                "total_reviews": 0,
                "average_rating": 0,
                "experience_years": 0,
                "hourly_rate": 0
            }

        tid = teacher_profile.get("id")
        if tid:
            user_profile, courses, enrollments, sessions = await asyncio.gather(
                SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name,avatar_url", {"user_id": user_id}),
                SupabaseRESTAsync.select("courses", "id", {"teacher_id": tid}),
                SupabaseRESTAsync.select("course_enrollments", "student_id", {"teacher_id": tid}),
                SupabaseRESTAsync.select("live_sessions", "id,status", {"teacher_id": tid}),
            )
        else:
            user_profile = await SupabaseRESTAsync.select_one("user_profiles", "first_name,last_name,avatar_url", {"user_id": user_id})
            courses, enrollments, sessions = [], [], []

        total_courses = len(courses)

        unique_students = set([e.get("student_id") for e in enrollments if e.get("student_id")])
        total_students = len(unique_students)

        active_sessions = len([s for s in sessions if s.get("status") in ["scheduled", "live"]])
        completed_sessions = len([s for s in sessions if s.get("status") == "completed"])

        return {
            "success": True,
            "profile": {
                "id": teacher_profile.get("id"),
                "user_id": user_id,
                "name": f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip() if user_profile else "Teacher",
                "avatar_url": user_profile.get("avatar_url") if user_profile else None,
                "experience_years": teacher_profile.get("experience_years", 0),
                "hourly_rate": teacher_profile.get("hourly_rate", 0),
                "average_rating": teacher_profile.get("average_rating", 0),
                "total_reviews": teacher_profile.get("total_reviews", 0),
                "is_verified": teacher_profile.get("is_verified", False),
                "specialization": teacher_profile.get("specialization", "General")
            },
            "stats": {
                "total_students": total_students or teacher_profile.get("total_students", 0),
                "total_courses": total_courses,
                "active_sessions": active_sessions,
                "completed_sessions": completed_sessions,
                "total_earnings": 0,
                "monthly_earnings": 0,
                "this_month_earnings": 0,
                "average_rating": float(teacher_profile.get("average_rating", 0) or 0),
                "total_reviews": teacher_profile.get("total_reviews", 0)
            },
            "subjects": [],
            "recent_reviews": []
        }

    except Exception as e:
        logger.error(f"REST teacher profile error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get teacher profile: {str(e)}"
        )


@router.get("/sessions/rest")
async def get_teacher_sessions_rest(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher sessions using REST API (fallback endpoint)"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": user_id})
        teacher_id = teacher_profile.get("id") if teacher_profile else None

        sessions = []
        if teacher_id:
            sessions = await SupabaseRESTAsync.select(
                "live_sessions",
                "*",
                {"teacher_id": teacher_id},
                order="scheduled_start.desc",
                limit=50
            )

        return {
            "success": True,
            "sessions": sessions,
            "total_count": len(sessions),
            "upcoming_count": len([s for s in sessions if s.get("status") == "scheduled"]),
            "completed_count": len([s for s in sessions if s.get("status") == "completed"])
        }

    except Exception as e:
        logger.error(f"REST teacher sessions error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get teacher sessions: {str(e)}"
        )


@router.get("/courses/rest")
async def get_teacher_courses_rest(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher courses using REST API (fallback endpoint)"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": user_id})
        teacher_id = teacher_profile.get("id") if teacher_profile else None

        courses = []
        if teacher_id:
            courses = await SupabaseRESTAsync.select(
                "courses",
                "*",
                {"teacher_id": teacher_id},
                order="created_at.desc",
                limit=100
            )

        published_count = len([c for c in courses if c.get("status") == "published"])
        draft_count = len([c for c in courses if c.get("status") == "draft"])
        archived_count = len([c for c in courses if c.get("status") == "archived"])

        formatted_courses = []
        for course in courses:
            formatted_courses.append({
                "id": course.get("id"),
                "title": course.get("title", "Untitled Course"),
                "description": course.get("description", ""),
                "status": course.get("status", "draft"),
                "price": float(course.get("price", 0) or 0),
                "thumbnail_url": course.get("thumbnail_url"),
                "level": course.get("level", "beginner"),
                "duration_hours": course.get("duration_hours", 0),
                "is_featured": course.get("is_featured", False),
                "created_at": course.get("created_at"),
                "updated_at": course.get("updated_at"),
                "total_lessons": course.get("total_lessons", 0),
                "total_students": course.get("total_students", 0),
                "average_rating": float(course.get("average_rating", 0) or 0),
                "total_reviews": course.get("total_reviews", 0)
            })

        return {
            "success": True,
            "courses": formatted_courses,
            "total_count": len(courses),
            "active_count": published_count,
            "draft_count": draft_count,
            "published_count": published_count,
            "archived_count": archived_count
        }

    except Exception as e:
        logger.error(f"REST teacher courses error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get teacher courses: {str(e)}"
        )


@router.get("/notifications")
async def get_teacher_notifications_rest(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher notifications using REST API (fallback endpoint)"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        notifications = await SupabaseRESTAsync.select(
            "notifications",
            "*",
            {"user_id": user_id},
            order="created_at.desc",
            limit=50
        )

        formatted_notifications = []
        for notif in notifications:
            formatted_notifications.append({
                "id": notif.get("id"),
                "title": notif.get("title", "Notification"),
                "message": notif.get("message", ""),
                "type": notif.get("type", "info"),
                "is_read": notif.get("is_read", False),
                "created_at": notif.get("created_at"),
                "data": notif.get("data", {})
            })

        unread_count = len([n for n in notifications if not n.get("is_read", False)])

        return {
            "success": True,
            "notifications": formatted_notifications,
            "total_count": len(notifications),
            "unread_count": unread_count
        }

    except Exception as e:
        logger.error(f"REST teacher notifications error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get teacher notifications: {str(e)}"
        )


@router.get("/students/rest")
async def get_teacher_students_rest(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher's students using REST API (fallback endpoint)"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": user_id})
        teacher_id = teacher_profile.get("id") if teacher_profile else None

        students = []
        if teacher_id:
            enrollments = await SupabaseRESTAsync.select(
                "course_enrollments",
                "*",
                {"teacher_id": teacher_id},
                order="enrolled_at.desc",
                limit=100
            )

            student_ids = list(set([e.get("student_id") for e in enrollments if e.get("student_id")]))

            users_rows = await SupabaseRESTAsync.select_in("users", "id", student_ids, "id,email")
            user_by_id = {str(u.get("id")): u for u in users_rows}

            profiles_rows = await SupabaseRESTAsync.select_in("user_profiles", "user_id", student_ids, "*")
            profile_by_uid = {str(p.get("user_id")): p for p in profiles_rows}

            course_ids = list({e.get("course_id") for e in enrollments if e.get("course_id")})
            courses_rows = await SupabaseRESTAsync.select_in("courses", "id", course_ids, "id,title,level")
            course_by_id = {str(c.get("id")): c for c in courses_rows}

            for student_id in student_ids:
                user_info = user_by_id.get(str(student_id))
                if not user_info:
                    continue

                profile = profile_by_uid.get(str(student_id))

                student_enrollments = [e for e in enrollments if e.get("student_id") == student_id]

                courses_enrolled = []
                for enrollment in student_enrollments:
                    course_id = enrollment.get("course_id")
                    course = course_by_id.get(str(course_id)) if course_id else None
                    if course:
                        courses_enrolled.append({
                            "id": course.get("id"),
                            "title": course.get("title", "Unknown Course"),
                            "level": course.get("level", "beginner"),
                            "progress": enrollment.get("progress_percentage", 0),
                            "status": enrollment.get("status", "active"),
                            "enrolled_at": enrollment.get("enrolled_at")
                        })

                total_progress = sum([c.get("progress", 0) for c in courses_enrolled])
                avg_progress = total_progress / len(courses_enrolled) if courses_enrolled else 0

                students.append({
                    "id": student_id,
                    "email": user_info.get("email", ""),
                    "first_name": profile.get("first_name", "") if profile else "",
                    "last_name": profile.get("last_name", "") if profile else "",
                    "avatar_url": profile.get("avatar_url") if profile else None,
                    "location": profile.get("location") if profile else None,
                    "university": profile.get("university") if profile else None,
                    "courses": courses_enrolled,
                    "total_courses": len(courses_enrolled),
                    "average_progress": round(avg_progress, 1),
                    "status": "active" if any(c.get("status") == "active" for c in courses_enrolled) else "inactive",
                    "enrolled_at": student_enrollments[0].get("enrolled_at") if student_enrollments else None
                })

        active_count = len([s for s in students if s.get("status") == "active"])
        inactive_count = len([s for s in students if s.get("status") != "active"])

        return {
            "success": True,
            "students": students,
            "total_count": len(students),
            "active_count": active_count,
            "inactive_count": inactive_count,
            "page": 1,
            "limit": 100,
            "total_pages": 1
        }

    except Exception as e:
        logger.error(f"REST teacher students error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get teacher students: {str(e)}"
        )


@router.get("/schedule/rest")
async def get_teacher_schedule_rest(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher schedule using REST API (fallback endpoint)"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": user_id})
        teacher_id = teacher_profile.get("id") if teacher_profile else None

        appointments = []
        availability_blocks = []
        regular_sessions = []

        if teacher_id:
            sessions = await SupabaseRESTAsync.select(
                "live_sessions",
                "*",
                {"teacher_id": teacher_id},
                order="scheduled_start.desc",
                limit=100
            )

            for session in sessions:
                session_data = {
                    "id": session.get("id"),
                    "title": session.get("title", "Untitled Session"),
                    "description": session.get("description", ""),
                    "type": session.get("session_type", "live_session"),
                    "mode": session.get("session_mode", "online"),
                    "start_time": session.get("scheduled_start"),
                    "end_time": session.get("scheduled_end"),
                    "status": session.get("status", "scheduled"),
                    "meeting_link": session.get("meeting_link"),
                    "location": session.get("location"),
                    "max_participants": session.get("max_participants", 10),
                    "current_participants": session.get("current_participants", 0),
                    "is_recurring": session.get("is_recurring", False),
                    "course_id": session.get("course_id"),
                    "created_at": session.get("created_at")
                }

                status = session.get("status", "scheduled")
                if status in ["scheduled", "live"]:
                    appointments.append(session_data)
                elif status == "completed":
                    regular_sessions.append(session_data)

        total_appointments = len(appointments)
        upcoming_appointments = len([a for a in appointments if a.get("status") == "scheduled"])
        completed_appointments = len(regular_sessions)

        return {
            "success": True,
            "appointments": appointments,
            "availability_blocks": availability_blocks,
            "regular_sessions": regular_sessions,
            "templates": [
                {
                    "id": "template_default",
                    "name": "Standard Week",
                    "description": "Default availability template",
                    "is_default": True
                }
            ],
            "analytics": {
                "total_appointments": total_appointments,
                "upcoming_appointments": upcoming_appointments,
                "completed_appointments": completed_appointments,
                "cancelled_appointments": 0,
                "available_time_blocks": len(availability_blocks),
                "booked_time_blocks": total_appointments,
                "utilization_rate": 0.0,
                "average_appointment_duration": 60.0
            }
        }

    except Exception as e:
        logger.error(f"REST teacher schedule error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get teacher schedule: {str(e)}"
        )


@router.get("/payments/rest")
async def get_teacher_payments_rest(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher's payment history using REST API (fallback endpoint)"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        payments = await SupabaseRESTAsync.select(
            "payments",
            "*",
            {"user_id": user_id},
            order="created_at.desc",
            limit=limit
        )

        payment_list = []
        total_paid = 0
        total_pending = 0
        total_overdue = 0

        for p in payments:
            status = p.get("status", "pending")
            amount = float(p.get("amount", 0) or 0)

            if status in ["paid", "completed"]:
                total_paid += amount
            elif status == "pending":
                total_pending += amount
            elif status == "overdue":
                total_overdue += amount

            payment_list.append({
                "id": p.get("id"),
                "transactionId": p.get("transaction_id") or p.get("id"),
                "amount": amount,
                "currency": p.get("currency", "LKR"),
                "type": p.get("payment_type", "other"),
                "description": p.get("description", ""),
                "status": status,
                "paymentMethod": p.get("payment_method", ""),
                "date": p.get("created_at", ""),
                "dueDate": p.get("processed_at", ""),
                "receiptUrl": None
            })

        total_count = len(payments)

        return {
            "success": True,
            "data": {
                "payments": payment_list,
                "summary": {
                    "totalPaid": total_paid,
                    "totalPending": total_pending,
                    "totalOverdue": total_overdue,
                    "totalPayments": total_count
                },
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total_count,
                    "pages": max(1, (total_count + limit - 1) // limit)
                }
            }
        }

    except Exception as e:
        logger.error(f"REST teacher payments error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get teacher payments: {str(e)}"
        )


@router.get("/health")
async def teacher_health_check():
    """Simple health check to verify teacher routes are working"""
    return {"status": "healthy", "service": "teachers", "message": "Teacher routes are working!"}

async def get_teacher_profile(current_user: User, db: AsyncSession) -> TeacherProfile:
    """Get teacher profile for current user, ensuring they are a teacher"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )
    
    result = await db.execute(
        select(TeacherProfile)
        .options(selectinload(TeacherProfile.teacher_subjects).selectinload(TeacherSubject.subject))
        .where(TeacherProfile.user_id == current_user.id)
    )
    teacher_profile = result.scalar_one_or_none()
    
    if not teacher_profile:
        try:
            teacher_profile = TeacherProfile(
                user_id=current_user.id,
                title="New Teacher",
                experience_years=0,
                hourly_rate=0.0,
                total_students=0,
                total_reviews=0,
                average_rating=0.0,
                is_verified=False,
                is_online_available=True,
                is_physical_available=True,
                availability_status="Available"
            )
            db.add(teacher_profile)
            await db.commit()
            await db.refresh(teacher_profile)
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Database error creating teacher profile: {e}")
        raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create teacher profile"
        )
    
    return teacher_profile


@router.get("/profile")
async def get_teacher_profile_endpoint(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher profile using REST API (works when DB connection fails)"""
    return await get_teacher_profile_rest(current_user)

@router.put("/profile", response_model=TeacherProfileSchema)
async def update_teacher_profile(
    profile_data: TeacherProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update teacher profile"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    for field, value in profile_data.model_dump(exclude_unset=True).items():
        setattr(teacher_profile, field, value)
    
    await db.commit()
    await db.refresh(teacher_profile)
    
    return teacher_profile

@router.post("/profile/avatar")
async def upload_teacher_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload teacher avatar"""
    from services.storage_service import AvatarService
    
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        upload_result = await AvatarService.upload_avatar(
            file=file,
            user_id=str(current_user.id)
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Avatar upload failed: {str(e)}"
        )
    
    if current_user.profile:
        current_user.profile.avatar_url = upload_result["file_url"]
        await db.commit()
    
    return {
        "message": "Avatar uploaded successfully",
        "avatar_url": upload_result["file_url"]
    }


@router.get("/subjects", response_model=List[TeacherSubjectResponse])
async def get_teacher_subjects(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get subjects taught by current teacher"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    result = await db.execute(
        select(TeacherSubject)
        .options(joinedload(TeacherSubject.subject))
        .where(TeacherSubject.teacher_id == teacher_profile.id)
        .order_by(TeacherSubject.created_at)
    )
    
    return result.scalars().all()

@router.post("/subjects")
async def add_teacher_subject(
    subject_data: TeacherSubjectCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a subject to teacher profile"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    existing = await db.execute(
        select(TeacherSubject)
        .where(
            and_(
                TeacherSubject.teacher_id == teacher_profile.id,
                TeacherSubject.subject_id == subject_data.subject_id
            )
        )
    )
    
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject already added to your profile"
        )
    
    teacher_subject = TeacherSubject(
        teacher_id=teacher_profile.id,
        subject_id=subject_data.subject_id,
        proficiency_level=subject_data.proficiency_level
    )
    
    db.add(teacher_subject)
    await db.commit()
    
    return {"message": "Subject added successfully"}

@router.delete("/subjects/{subject_id}")
async def remove_teacher_subject(
    subject_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a subject from teacher profile"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    result = await db.execute(
        select(TeacherSubject)
        .where(
            and_(
                TeacherSubject.teacher_id == teacher_profile.id,
                TeacherSubject.subject_id == subject_id
            )
        )
    )
    
    teacher_subject = result.scalar_one_or_none()
    if not teacher_subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found in your profile"
        )
    
    await db.delete(teacher_subject)
    await db.commit()
    
    return {"message": "Subject removed successfully"}


@router.get("/courses")
async def get_teacher_courses(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher's courses using REST API (works when DB connection fails)"""
    return await get_teacher_courses_rest(current_user)
    
    query = select(Course).where(Course.teacher_id == teacher_profile.id)
    
    if course_filter.status:
        query = query.where(Course.status == course_filter.status)
    if course_filter.subject_id:
        query = query.where(Course.subject_id == course_filter.subject_id)
    if course_filter.level:
        query = query.where(Course.level == course_filter.level)
    if course_filter.is_featured is not None:
        query = query.where(Course.is_featured == course_filter.is_featured)
    
    status_counts = await db.execute(
        select(
            Course.status,
            func.count(Course.id)
        )
        .where(Course.teacher_id == teacher_profile.id)
        .group_by(Course.status)
    )
    
    counts = {row[0]: row[1] for row in status_counts}
    
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total_count = total_result.scalar()
    
    query = query.order_by(desc(Course.created_at))
    query = query.offset((pagination.page - 1) * pagination.limit).limit(pagination.limit)
    query = query.options(joinedload(Course.subject))
    
    result = await db.execute(query)
    courses = result.scalars().all()
    
    return TeacherCoursesResponse(
        courses=courses,
        total_count=total_count,
        active_count=counts.get('published', 0),
        draft_count=counts.get('draft', 0),
        published_count=counts.get('published', 0)
    )

@router.post("/courses")
async def create_course(
    course_data: CourseCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Create a new course using REST API"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        user_id = str(current_user.id)

        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": user_id})
        teacher_id = teacher_profile.get("id") if teacher_profile else None

        if not teacher_id:
            logger.info(f"Creating teacher profile for user {user_id}")
            try:
                new_profile = {
                    "user_id": user_id,
                    "title": "New Teacher",
                    "experience_years": 0,
                    "hourly_rate": 0,
                    "total_students": 0,
                    "total_reviews": 0,
                    "average_rating": 0,
                    "is_verified": False,
                    "is_online_available": True,
                    "is_physical_available": True,
                    "availability_status": "Available",
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat()
                }
                created_profile = await SupabaseRESTAsync.insert("teacher_profiles", new_profile)
                
                if created_profile:
                    teacher_id = created_profile.get("id") if isinstance(created_profile, dict) else created_profile[0].get("id") if isinstance(created_profile, list) else None
                
                if not teacher_id:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create teacher profile"
                    )
                
                logger.info(f"Successfully created teacher profile with id {teacher_id}")
            except Exception as profile_error:
                logger.error(f"Error creating teacher profile: {profile_error}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create teacher profile: {str(profile_error)}"
                )

        course_dict = course_data.model_dump()
        course_dict["teacher_id"] = teacher_id
        course_dict["created_at"] = datetime.utcnow().isoformat()
        course_dict["updated_at"] = datetime.utcnow().isoformat()
        
        for key, value in course_dict.items():
            if value is not None:
                if hasattr(value, '__class__') and value.__class__.__name__ == 'UUID':
                    course_dict[key] = str(value)
                elif hasattr(value, '__class__') and value.__class__.__name__ == 'Decimal':
                    course_dict[key] = float(value)
        
        logger.info(f"Creating course with data: {course_dict}")

        result = await SupabaseRESTAsync.insert("courses", course_dict)
        
        logger.info(f"Insert result: {result}")

        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create course"
            )

        return {
            "success": True,
            "message": "Course created successfully",
            "course_id": result.get("id") if isinstance(result, dict) else result[0].get("id") if isinstance(result, list) else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create course: {str(e)}"
        )


@router.get("/content")
async def get_course_content(
    course_id: UUID = Query(...),
    pagination: PaginationParams = Depends(),
    content_filter: ContentFilter = Depends(),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get course content with filtering and pagination"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    course_result = await db.execute(
        select(Course)
        .where(
            and_(
                Course.id == course_id,
                Course.teacher_id == teacher_profile.id
            )
        )
    )
    course = course_result.scalar_one_or_none()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or you don't have permission to access it"
        )
    
    query = select(CourseContent).where(CourseContent.course_id == course_id)
    
    if content_filter.content_type:
        query = query.where(CourseContent.content_type == content_filter.content_type)
    if content_filter.access_level:
        query = query.where(CourseContent.access_level == content_filter.access_level)
    
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total_count = total_result.scalar()
    
    query = query.order_by(CourseContent.order_index, CourseContent.created_at)
    query = query.offset((pagination.page - 1) * pagination.limit).limit(pagination.limit)
    
    result = await db.execute(query)
    content_items = result.scalars().all()
    
    return {
        "content_items": content_items,
        "total_count": total_count,
        "course": course
    }

@router.post("/content/upload")
async def upload_course_content(
    course_id: UUID = Form(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    content_type: str = Form(...),
    access_level: str = Form("free"),
    order_index: Optional[int] = Form(None),
    is_downloadable: bool = Form(False),
    file: UploadFile = File(...),
    target_disability_types: Optional[str] = Form("[]"),
    is_accessible_for_all: bool = Form(True),
    requires_vision: bool = Form(True),
    requires_hearing: bool = Form(True),
    cognitive_level: int = Form(3),
    has_captions: bool = Form(False),
    has_transcripts: bool = Form(False),
    has_audio_description: bool = Form(False),
    has_sign_language: bool = Form(False),
    current_user: User = Depends(get_current_active_user)
):
    """Upload course content file with accessibility tagging using REST API"""
    from services.storage_service import StorageService
    import json as json_lib
    
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )
    
    try:
        user_id = str(current_user.id)
        course_id_str = str(course_id)
        
        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": user_id})
        teacher_id = teacher_profile.get("id") if teacher_profile else None
        
        if not teacher_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher profile not found"
            )
        
        course = await SupabaseRESTAsync.select_one("courses", "*", {"id": course_id_str, "teacher_id": teacher_id})
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found or you don't have permission to access it"
            )
        
        try:
            upload_result = await StorageService.upload_file(
                file=file,
                user_id=str(teacher_id),
                content_type="course_content"
            )
        except HTTPException as e:
            raise e
        except Exception as e:
            logger.error(f"File upload failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"File upload failed: {str(e)}"
            )
        
        try:
            disability_types_list = json_lib.loads(target_disability_types)
        except:
            disability_types_list = []
        
        content_data = {
            "course_id": course_id_str,
            "title": title,
            "description": description,
            "content_type": content_type,
            "content_url": upload_result["file_url"],
            "file_size": str(upload_result["file_size"]),
            "access_level": access_level,
            "order_index": order_index,
            "is_downloadable": is_downloadable,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "target_disability_types": disability_types_list,
            "is_accessible_for_all": is_accessible_for_all,
            "requires_vision": requires_vision,
            "requires_hearing": requires_hearing,
            "cognitive_level": cognitive_level,
            "caption_url": "pending" if has_captions else None,
            "transcript_url": "pending" if has_transcripts else None,
            "audio_description_url": "pending" if has_audio_description else None,
            "sign_language_video_url": "pending" if has_sign_language else None,
        }
        
        result = await SupabaseRESTAsync.insert("course_content", content_data)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create content item"
            )
        
        content_id = result.get("id") if isinstance(result, dict) else result[0].get("id") if isinstance(result, list) else None
        
        return {
            "message": "Content uploaded successfully with accessibility features", 
            "content_id": str(content_id),
            "file_url": upload_result["file_url"],
            "accessibility": {
                "target_disability_types": disability_types_list,
                "is_accessible_for_all": is_accessible_for_all,
                "cognitive_level": cognitive_level,
                "has_captions": has_captions,
                "has_transcripts": has_transcripts,
                "has_audio_description": has_audio_description,
                "has_sign_language": has_sign_language
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading content: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload content: {str(e)}"
        )



@router.post("/accessibility-tracks/upload")
async def upload_accessibility_track(
    track_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """Upload a captions / transcript / audio-description / sign-language
    asset to Supabase Storage and return its public URL.

    The /teachers/accessibility-tracks page accepted URLs only — teachers
    had to host the .vtt / .mp3 / .mp4 somewhere else first. This endpoint
    closes that gap. We validate `track_type` so a sneaky .exe doesn't
    sail through the generic content uploader, and tag the storage path
    with the track type so files are organisable later.
    """
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(status_code=403, detail="Only teachers can upload accessibility tracks.")

    track_type = (track_type or "").lower().strip()
    type_to_mime = {
        "caption":     {"text/vtt", "application/x-subrip", "text/plain"},
        "transcript":  {"text/plain", "text/html", "application/pdf"},
        "audio":       {"audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg"},
        "sign_video":  {"video/mp4", "video/webm", "video/quicktime"},
    }
    if track_type not in type_to_mime:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid track_type. Use one of: {sorted(type_to_mime)}",
        )

    allowed_mimes = type_to_mime[track_type] | {"application/octet-stream"}
    if file.content_type and file.content_type not in allowed_mimes:
        raise HTTPException(
            status_code=400,
            detail=f"Expected {sorted(type_to_mime[track_type])} for track_type='{track_type}', "
                   f"got '{file.content_type}'.",
        )

    from services.storage_service import StorageService
    folder_hint = "accessibility/" + track_type
    result = await StorageService.upload_file(
        file=file,
        user_id=str(current_user.id),
        content_type=folder_hint,
    )
    return {
        "success": True,
        "url": result.get("file_url"),
        "filename": result.get("original_filename"),
        "size": result.get("file_size"),
    }


@router.patch("/content/{content_id}/accessibility-tracks")
async def update_content_accessibility_tracks(
    content_id: str,
    payload: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
):
    """Update the URLs of the secondary accessibility tracks on a piece
    of content. Verifies the content belongs to the calling teacher."""
    from database.supabase_client import SupabaseREST

    content = await SupabaseRESTAsync.select_one(
        "course_content", "id,course_id", {"id": content_id}
    )
    if not content:
        raise HTTPException(status_code=404, detail="Content not found.")

    course = await SupabaseRESTAsync.select_one(
        "courses", "teacher_id", {"id": str(content["course_id"])}
    ) or {}
    tp = await SupabaseRESTAsync.select_one(
        "teacher_profiles", "id", {"user_id": str(current_user.id)}
    )
    if not tp or str(course.get("teacher_id")) != str(tp.get("id")):
        raise HTTPException(status_code=403, detail="Not your content.")

    allowed = {
        "caption_url",
        "transcript_url",
        "audio_description_url",
        "sign_language_video_url",
    }
    updates: dict = {}
    for k in allowed:
        if k in payload:
            v = payload.get(k)
            updates[k] = v.strip() if isinstance(v, str) and v.strip() else None

    if not updates:
        return {"success": True, "updated": 0}

    derived = {}
    if "caption_url" in updates:
        derived["has_captions"] = bool(updates["caption_url"])
    if "transcript_url" in updates:
        derived["has_transcripts"] = bool(updates["transcript_url"])
    if "audio_description_url" in updates:
        derived["has_audio_description"] = bool(updates["audio_description_url"])
    if "sign_language_video_url" in updates:
        derived["has_sign_language"] = bool(updates["sign_language_video_url"])

    await SupabaseRESTAsync.update(
        "course_content",
        {**updates, **derived, "updated_at": datetime.utcnow().isoformat()},
        {"id": content_id},
    )
    return {"success": True, "updated": len(updates)}



@router.get("/sessions")
async def get_teacher_sessions(
    current_user: User = Depends(get_current_active_user)
):
    """Get teacher's sessions using REST API (works when DB connection fails)"""
    return await get_teacher_sessions_rest(current_user)
    
    try:
        from sqlalchemy import text
        
        sessions_sql = text("""
            SELECT ls.*, c.title as course_title, c.level as course_level, s.name as subject_name
            FROM live_sessions ls
            LEFT JOIN courses c ON ls.course_id = c.id
            LEFT JOIN subjects s ON c.subject_id = s.id
            WHERE ls.teacher_id = :teacher_id
            AND ls.session_type IN ('workshop', 'practical_session', 'lab', 'meeting', 'consultation', 'live_session')
            AND ls.session_mode IN ('online', 'in_person', 'hybrid')
            AND ls.status IN ('scheduled', 'live', 'completed', 'cancelled')
            ORDER BY ls.scheduled_start DESC
            LIMIT :limit OFFSET :offset
        """)
        
        count_sql = text("""
            SELECT COUNT(*) as total_count
            FROM live_sessions 
            WHERE teacher_id = :teacher_id
            AND session_type IN ('workshop', 'practical_session', 'lab', 'meeting', 'consultation', 'live_session')
            AND session_mode IN ('online', 'in_person', 'hybrid')
            AND status IN ('scheduled', 'live', 'completed', 'cancelled')
        """)
        
        status_count_sql = text("""
            SELECT status, COUNT(*) as count
            FROM live_sessions 
            WHERE teacher_id = :teacher_id
            AND session_type IN ('workshop', 'practical_session', 'lab', 'meeting', 'consultation', 'live_session')
            AND session_mode IN ('online', 'in_person', 'hybrid')
            AND status IN ('scheduled', 'live', 'completed', 'cancelled')
            GROUP BY status
        """)
        
        params = {
            'teacher_id': str(teacher_profile.id),
            'limit': pagination.limit,
            'offset': (pagination.page - 1) * pagination.limit
        }
        
        sessions_result = await db.execute(sessions_sql, params)
        count_result = await db.execute(count_sql, params)
        status_result = await db.execute(status_count_sql, params)
        
        sessions_data = sessions_result.mappings().fetchall()
        total_count = count_result.scalar()
        status_counts = status_result.mappings().fetchall()
        
        counts = {row.status: row.count for row in status_counts}
        
        sessions = []
        for row in sessions_data:
            session_obj = type('Session', (), {
                'id': row.id,
                'teacher_id': row.teacher_id,
                'course_id': row.course_id,
                'title': row.title,
                'description': row.description,
                'session_type': row.session_type,
                'session_mode': row.session_mode,
                'scheduled_start': row.scheduled_start,
                'scheduled_end': row.scheduled_end,
                'actual_start': row.actual_start,
                'actual_end': row.actual_end,
                'status': row.status,
                'meeting_link': row.meeting_link,
                'location': row.location,
                'max_participants': row.max_participants,
                'current_participants': row.current_participants,
                'recording_enabled': row.recording_enabled,
                'recording_url': row.recording_url,
                'recording_expires_at': row.recording_expires_at,
                'is_recurring': row.is_recurring,
                'recurrence_pattern': row.recurrence_pattern,
                'created_at': row.created_at,
                'course': type('Course', (), {
                    'title': row.course_title,
                    'level': row.course_level,
                    'subject': type('Subject', (), {'name': row.subject_name})() if row.subject_name else None
                })() if row.course_title else None
            })()
            sessions.append(session_obj)
        
    except Exception as db_error:
        logger = logging.getLogger(__name__)
        logger.warning(f"Database query failed in get_teacher_sessions: {db_error}")
        sessions = []
        total_count = 0
        counts = {}
    
    try:
        return TeacherSessionsResponse(
            sessions=sessions,
            total_count=total_count,
            upcoming_count=counts.get('scheduled', 0),
            live_count=counts.get('live', 0),
            completed_count=counts.get('completed', 0)
        )
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Error creating sessions response: {e}")
        return TeacherSessionsResponse(
            sessions=[],
            total_count=0,
            upcoming_count=0,
            live_count=0,
            completed_count=0
        )

@router.post("/sessions")
async def create_session(
    session_data: LiveSessionCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Create a new live session using REST API"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create sessions"
        )
    
    try:
        import requests
        from config import settings
        import uuid
        
        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": str(current_user.id)})
        
        if not teacher_profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher profile not found"
            )
        
        teacher_id = teacher_profile.get("id")
        
        if session_data.scheduled_end <= session_data.scheduled_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End time must be after start time"
            )
        
        session_dict = session_data.model_dump()
        
        if hasattr(session_dict['scheduled_start'], 'isoformat'):
            session_dict['scheduled_start'] = session_dict['scheduled_start'].isoformat()
        if hasattr(session_dict['scheduled_end'], 'isoformat'):
            session_dict['scheduled_end'] = session_dict['scheduled_end'].isoformat()
        
        session_dict['teacher_id'] = teacher_id
        session_dict['status'] = 'scheduled'
        session_dict['current_participants'] = 0
        session_dict['id'] = str(uuid.uuid4())
        
        url = f"{settings.supabase_url}/rest/v1/live_sessions"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        response = requests.post(url, json=session_dict, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            result = response.json()
            session_id = result[0]['id'] if isinstance(result, list) else result['id']

            try:
                course_id = session_dict.get("course_id")
                if course_id:
                    enrollments = await SupabaseRESTAsync.select(
                        "course_enrollments",
                        "student_id",
                        {"course_id": course_id, "status": "active"},
                        limit=500,
                    )
                    title = session_dict.get("title") or "a new live session"
                    notify_url = f"/students/live-sessions"
                    for enroll in enrollments:
                        student_id = enroll.get("student_id")
                        if not student_id:
                            continue
                        try:
                            await SupabaseRESTAsync.insert("notifications", {
                                "id": str(uuid.uuid4()),
                                "user_id": student_id,
                                "type": "live_session_scheduled",
                                "title": "New live session scheduled",
                                "message": f"'{title}' is now open for enrollment.",
                                "link_url": notify_url,
                                "related_entity_type": "live_session",
                                "related_entity_id": session_id,
                                "priority": "normal",
                            })
                        except Exception:
                            continue
            except Exception as exc:
                logger.warning(f"Failed to fan out session notifications: {exc}")

            return {"message": "Session created successfully", "session_id": session_id}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to create session: {response.text}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create session: {str(e)}"
        )

@router.put("/sessions/{session_id}")
async def update_session(
    session_id: UUID,
    session_data: LiveSessionUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing live session"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found or you don't have permission to edit it"
            )
        
        update_fields = []
        update_values = {'session_id': str(session_id)}
        
        if session_data.title is not None:
            update_fields.append("title = :title")
            update_values['title'] = session_data.title
            
        if session_data.description is not None:
            update_fields.append("description = :description")
            update_values['description'] = session_data.description
            
        if session_data.session_type is not None:
            update_fields.append("session_type = :session_type")
            update_values['session_type'] = session_data.session_type
            
        if session_data.session_mode is not None:
            update_fields.append("session_mode = :session_mode")
            update_values['session_mode'] = session_data.session_mode
            
        if session_data.scheduled_start is not None:
            update_fields.append("scheduled_start = :scheduled_start")
            scheduled_start = session_data.scheduled_start
            if scheduled_start.tzinfo is not None:
                scheduled_start = scheduled_start.astimezone(timezone.utc).replace(tzinfo=None)
            update_values['scheduled_start'] = scheduled_start
            
        if session_data.scheduled_end is not None:
            update_fields.append("scheduled_end = :scheduled_end")
            scheduled_end = session_data.scheduled_end
            if scheduled_end.tzinfo is not None:
                scheduled_end = scheduled_end.astimezone(timezone.utc).replace(tzinfo=None)
            update_values['scheduled_end'] = scheduled_end
            
        if session_data.status is not None:
            update_fields.append("status = :status")
            update_values['status'] = session_data.status
            
        if session_data.meeting_link is not None:
            update_fields.append("meeting_link = :meeting_link")
            update_values['meeting_link'] = session_data.meeting_link
            
        if session_data.location is not None:
            update_fields.append("location = :location")
            update_values['location'] = session_data.location
            
        if session_data.max_participants is not None:
            update_fields.append("max_participants = :max_participants")
            update_values['max_participants'] = session_data.max_participants
            
        if session_data.recording_enabled is not None:
            update_fields.append("recording_enabled = :recording_enabled")
            update_values['recording_enabled'] = session_data.recording_enabled
            
        if session_data.is_recurring is not None:
            update_fields.append("is_recurring = :is_recurring")
            update_values['is_recurring'] = session_data.is_recurring
            
        if session_data.recurrence_pattern is not None:
            update_fields.append("recurrence_pattern = :recurrence_pattern")
            update_values['recurrence_pattern'] = session_data.recurrence_pattern
        
        if session_data.scheduled_start and session_data.scheduled_end:
            if session_data.scheduled_end <= session_data.scheduled_start:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End time must be after start time"
                )
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        update_query = text(f"""
            UPDATE live_sessions 
            SET {', '.join(update_fields)}
            WHERE id = :session_id
        """)
        
        await db.execute(update_query, update_values)
        await db.commit()
        
        return {"message": "Session updated successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update session: {str(e)}"
        )

@router.put("/sessions/{session_id}/status")
async def update_session_status(
    session_id: UUID,
    status_update: str = Query(..., description="Status: scheduled, live, completed, cancelled"),
    current_user: User = Depends(get_current_active_user)
):
    """Update session status (start, complete, cancel) using REST API"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can update session status"
        )
    
    try:
        import requests
        from config import settings
        from datetime import datetime
        
        valid_statuses = ['scheduled', 'live', 'completed', 'cancelled']
        if status_update not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            )
        
        teacher_profile = await SupabaseRESTAsync.select_one("teacher_profiles", "id", {"user_id": str(current_user.id)})
        
        if not teacher_profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher profile not found"
            )
        
        teacher_id = teacher_profile.get("id")
        
        session = await SupabaseRESTAsync.select_one("live_sessions", "*", {"id": str(session_id), "teacher_id": teacher_id})
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        url = f"{settings.supabase_url}/rest/v1/live_sessions"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        update_data = {"status": status_update}
        if status_update == "live":
            update_data["actual_start"] = datetime.utcnow().isoformat()
        elif status_update in ["completed", "cancelled"]:
            update_data["actual_end"] = datetime.utcnow().isoformat()
        
        response = requests.patch(
            url,
            params={"id": f"eq.{str(session_id)}"},
            json=update_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return {"message": f"Session status updated to {status_update}"}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to update session: {response.text}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update session status: {str(e)}"
        )

@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a live session"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        if session.get('status') == 'live':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete a live session. Please end it first."
            )
        
        delete_query = text("""
            DELETE FROM live_sessions WHERE id = :session_id
        """)
        
        await db.execute(delete_query, {'session_id': str(session_id)})
        await db.commit()
        
        return {"message": "Session deleted successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session: {str(e)}"
        )

@router.get("/sessions/{session_id}/participants")
async def get_session_participants(
    session_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all participants for a session"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        participants_query = text("""
            SELECT sp.*,
                   u.email as student_email,
                   up.first_name, up.last_name, up.avatar_url
            FROM session_participants sp
            LEFT JOIN users u ON sp.student_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE sp.session_id = :session_id
            ORDER BY sp.joined_at DESC
        """)
        
        result = await db.execute(participants_query, {'session_id': str(session_id)})
        participants_data = result.mappings().fetchall()
        
        participants = []
        for row in participants_data:
            participants.append({
                'id': str(row.get('id')),
                'student_id': str(row.get('student_id')),
                'student_email': row.get('student_email'),
                'student_name': f"{row.get('first_name', '')} {row.get('last_name', '')}".strip(),
                'avatar_url': row.get('avatar_url'),
                'joined_at': row.get('joined_at'),
                'left_at': row.get('left_at'),
                'attendance_duration_minutes': row.get('attendance_duration_minutes', 0),
                'is_currently_joined': row.get('left_at') is None and row.get('joined_at') is not None
            })
        
        return {
            'participants': participants,
            'total_count': len(participants),
            'currently_joined': len([p for p in participants if p['is_currently_joined']])
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session participants: {str(e)}"
        )

@router.post("/sessions/{session_id}/participants/{student_id}")
async def add_session_participant(
    session_id: UUID,
    student_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a participant to a session"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        student_query = text("SELECT * FROM users WHERE id = :student_id AND role = 'student'")
        result = await db.execute(student_query, {'student_id': str(student_id)})
        student = result.mappings().fetchone()
        
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        existing_query = text("""
            SELECT * FROM session_participants 
            WHERE session_id = :session_id AND student_id = :student_id
        """)
        result = await db.execute(existing_query, {
            'session_id': str(session_id),
            'student_id': str(student_id)
        })
        existing = result.mappings().fetchone()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is already a participant"
            )
        
        insert_query = text("""
            INSERT INTO session_participants (id, session_id, student_id, created_at)
            VALUES (uuid_generate_v4(), :session_id, :student_id, CURRENT_TIMESTAMP)
        """)
        
        await db.execute(insert_query, {
            'session_id': str(session_id),
            'student_id': str(student_id)
        })
        await db.commit()
        
        return {"message": "Participant added successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add participant: {str(e)}"
        )

@router.delete("/sessions/{session_id}/participants/{student_id}")
async def remove_session_participant(
    session_id: UUID,
    student_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a participant from a session"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        delete_query = text("""
            DELETE FROM session_participants 
            WHERE session_id = :session_id AND student_id = :student_id
        """)
        
        result = await db.execute(delete_query, {
            'session_id': str(session_id),
            'student_id': str(student_id)
        })
        await db.commit()
        
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Participant not found"
            )
        
        return {"message": "Participant removed successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove participant: {str(e)}"
        )

@router.put("/sessions/{session_id}/recording")
async def update_session_recording(
    session_id: UUID,
    recording_url: str = Form(...),
    recording_expires_at: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update session recording details"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        expires_at = None
        if recording_expires_at:
            try:
                expires_at = datetime.fromisoformat(recording_expires_at)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date format for recording_expires_at"
                )
        
        update_query = text("""
            UPDATE live_sessions 
            SET recording_url = :recording_url,
                recording_expires_at = :recording_expires_at
            WHERE id = :session_id
        """)
        
        await db.execute(update_query, {
            'session_id': str(session_id),
            'recording_url': recording_url,
            'recording_expires_at': expires_at
        })
        await db.commit()
        
        return {"message": "Recording details updated successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update recording: {str(e)}"
        )

@router.delete("/sessions/{session_id}/recording")
async def delete_session_recording(
    session_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete session recording"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        update_query = text("""
            UPDATE live_sessions 
            SET recording_url = NULL,
                recording_expires_at = NULL
            WHERE id = :session_id
        """)
        
        await db.execute(update_query, {'session_id': str(session_id)})
        await db.commit()
        
        return {"message": "Recording deleted successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete recording: {str(e)}"
        )

@router.put("/sessions/{session_id}/participants/{student_id}/join")
async def mark_student_joined(
    session_id: UUID,
    student_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a student as joined to track attendance"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        update_query = text("""
            INSERT INTO session_participants (id, session_id, student_id, joined_at, created_at)
            VALUES (uuid_generate_v4(), :session_id, :student_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (session_id, student_id) DO UPDATE 
            SET joined_at = CURRENT_TIMESTAMP,
                left_at = NULL
        """)
        
        await db.execute(update_query, {
            'session_id': str(session_id),
            'student_id': str(student_id)
        })
        
        count_query = text("""
            UPDATE live_sessions 
            SET current_participants = (
                SELECT COUNT(*) FROM session_participants 
                WHERE session_id = :session_id AND joined_at IS NOT NULL AND left_at IS NULL
            )
            WHERE id = :session_id
        """)
        
        await db.execute(count_query, {'session_id': str(session_id)})
        await db.commit()
        
        return {"message": "Student marked as joined"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark student as joined: {str(e)}"
        )

@router.put("/sessions/{session_id}/participants/{student_id}/leave")
async def mark_student_left(
    session_id: UUID,
    student_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a student as left and calculate attendance duration"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        participant_query = text("""
            SELECT sp.*, ls.teacher_id
            FROM session_participants sp
            JOIN live_sessions ls ON sp.session_id = ls.id
            WHERE sp.session_id = :session_id 
            AND sp.student_id = :student_id 
            AND ls.teacher_id = :teacher_id
        """)
        result = await db.execute(participant_query, {
            'session_id': str(session_id),
            'student_id': str(student_id),
            'teacher_id': str(teacher_profile.id)
        })
        participant = result.mappings().fetchone()
        
        if not participant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session or participant not found"
            )
        
        duration_minutes = 0
        if participant.get('joined_at'):
            joined_at = participant.get('joined_at')
            if isinstance(joined_at, str):
                joined_at = datetime.fromisoformat(joined_at)
            duration_minutes = int((datetime.now() - joined_at).total_seconds() / 60)
        
        update_query = text("""
            UPDATE session_participants 
            SET left_at = CURRENT_TIMESTAMP,
                attendance_duration_minutes = :duration_minutes
            WHERE session_id = :session_id AND student_id = :student_id
        """)
        
        await db.execute(update_query, {
            'session_id': str(session_id),
            'student_id': str(student_id),
            'duration_minutes': duration_minutes
        })
        
        count_query = text("""
            UPDATE live_sessions 
            SET current_participants = (
                SELECT COUNT(*) FROM session_participants 
                WHERE session_id = :session_id AND joined_at IS NOT NULL AND left_at IS NULL
            )
            WHERE id = :session_id
        """)
        
        await db.execute(count_query, {'session_id': str(session_id)})
        await db.commit()
        
        return {
            "message": "Student marked as left",
            "attendance_duration_minutes": duration_minutes
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark student as left: {str(e)}"
        )

@router.get("/sessions/{session_id}/analytics")
async def get_session_analytics(
    session_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed analytics for a session"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_query = text("""
            SELECT * FROM live_sessions 
            WHERE id = :session_id AND teacher_id = :teacher_id
        """)
        result = await db.execute(session_query, {
            'session_id': str(session_id),
            'teacher_id': str(teacher_profile.id)
        })
        session = result.mappings().fetchone()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        analytics_query = text("""
            SELECT 
                COUNT(*) as total_participants,
                COUNT(CASE WHEN joined_at IS NOT NULL THEN 1 END) as attended_participants,
                AVG(CASE WHEN attendance_duration_minutes > 0 THEN attendance_duration_minutes END) as avg_attendance_duration,
                MAX(attendance_duration_minutes) as max_attendance_duration,
                MIN(CASE WHEN attendance_duration_minutes > 0 THEN attendance_duration_minutes END) as min_attendance_duration
            FROM session_participants 
            WHERE session_id = :session_id
        """)
        
        result = await db.execute(analytics_query, {'session_id': str(session_id)})
        analytics_data = result.mappings().fetchone()
        
        session_duration = None
        if session.get('actual_start') and session.get('actual_end'):
            start = session.get('actual_start')
            end = session.get('actual_end')
            if isinstance(start, str):
                start = datetime.fromisoformat(start)
            if isinstance(end, str):
                end = datetime.fromisoformat(end)
            session_duration = int((end - start).total_seconds() / 60)
        
        return {
            'session_id': str(session_id),
            'session_title': session.get('title'),
            'session_duration_minutes': session_duration,
            'total_registered': analytics_data.get('total_participants', 0),
            'actually_attended': analytics_data.get('attended_participants', 0),
            'attendance_rate': (
                (analytics_data.get('attended_participants', 0) / max(analytics_data.get('total_participants', 1), 1)) * 100
            ),
            'average_attendance_duration': analytics_data.get('avg_attendance_duration', 0),
            'max_attendance_duration': analytics_data.get('max_attendance_duration', 0),
            'min_attendance_duration': analytics_data.get('min_attendance_duration', 0)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session analytics: {str(e)}"
        )


@router.get("/students", response_model=TeacherStudentsResponse)
async def get_teacher_students(
    pagination: PaginationParams = Depends(),
    student_filter: StudentFilter = Depends(),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get teacher's enrolled students"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        from sqlalchemy import text
        
        enrollments_sql = text("""
            SELECT ce.*, 
                   u.email as student_email,
                   up.first_name, up.last_name, up.avatar_url, up.location, up.university,
                   c.title as course_title, c.level as course_level, c.price as course_price, c.thumbnail_url
            FROM course_enrollments ce
            LEFT JOIN users u ON ce.student_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN courses c ON ce.course_id = c.id
            WHERE ce.teacher_id = :teacher_id
            AND ce.status IN ('pending', 'active', 'completed', 'cancelled')
            ORDER BY ce.enrolled_at DESC
            LIMIT :limit OFFSET :offset
        """)
        
        count_sql = text("""
            SELECT COUNT(*) as total_count
            FROM course_enrollments 
            WHERE teacher_id = :teacher_id
            AND status IN ('pending', 'active', 'completed', 'cancelled')
        """)
        
        active_count_sql = text("""
            SELECT COUNT(*) as active_count
            FROM course_enrollments 
            WHERE teacher_id = :teacher_id
            AND status = 'active'
        """)
        
        completed_count_sql = text("""
            SELECT COUNT(*) as completed_count
            FROM course_enrollments 
            WHERE teacher_id = :teacher_id
            AND status = 'completed'
        """)
        
        params = {
            'teacher_id': str(teacher_profile.id),
            'limit': pagination.limit,
            'offset': (pagination.page - 1) * pagination.limit
        }
        
        enrollments_result = await db.execute(enrollments_sql, params)
        count_result = await db.execute(count_sql, params)
        active_result = await db.execute(active_count_sql, params)
        completed_result = await db.execute(completed_count_sql, params)
        
        enrollments_data = enrollments_result.mappings().fetchall()
        total_count = count_result.scalar()
        active_count = active_result.scalar()
        completed_count = completed_result.scalar()
        
        enrollments = []
        for row in enrollments_data:
            student_profile = StudentProfile(
                first_name=row.get('first_name'),
                last_name=row.get('last_name'),
                avatar_url=row.get('avatar_url'),
                location=row.get('location'),
                university=row.get('university')
            )
            
            student_info = StudentInfo(
                id=row.get('student_id'),
                email=row.get('student_email') or '',
                profile=student_profile
            )
            
            course_info = CourseInfo(
                id=row.get('course_id'),
                title=row.get('course_title') or '',
                level=row.get('course_level'),
                price=row.get('course_price'),
                thumbnail_url=row.get('thumbnail_url')
            )
            
            enrollment = DetailedCourseEnrollment(
                id=row.get('id'),
                student_id=row.get('student_id'),
                course_id=row.get('course_id'),
                teacher_id=row.get('teacher_id'),
                status=row.get('status'),
                progress_percentage=row.get('progress_percentage') or 0,
                enrolled_at=row.get('enrolled_at'),
                completed_at=row.get('completed_at'),
                last_accessed=row.get('last_accessed'),
                payment_status=row.get('payment_status'),
                payment_amount=row.get('payment_amount'),
                student=student_info,
                course=course_info
            )
            
            enrollments.append(enrollment)
        
    except Exception as db_error:
        logger = logging.getLogger(__name__)
        logger.warning(f"Database query failed in get_teacher_students: {db_error}")
        enrollments = []
        total_count = 0
        active_count = 0
        completed_count = 0
    
    try:
        return TeacherStudentsResponse(
            enrollments=enrollments,
            total_students=total_count,
            active_students=active_count,
            completed_courses=completed_count
        )
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Error creating students response: {e}")
        return TeacherStudentsResponse(
            enrollments=[],
            total_students=0,
            active_students=0,
            completed_courses=0
        )


@router.get("/analytics", response_model=TeacherAnalyticsResponse)
async def get_teacher_analytics(
    period: str = Query("month", regex="^(week|month|quarter|year)$"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get teacher analytics data"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    now = datetime.now()
    if period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    elif period == "quarter":
        start_date = now - timedelta(days=90)
    else:
        start_date = now - timedelta(days=365)
    
    engagement_result = await db.execute(
        select(
            func.date(SessionParticipant.joined_at).label('date'),
            func.count(SessionParticipant.id.distinct()).label('participants'),
            func.avg(SessionParticipant.attendance_duration_minutes).label('avg_duration')
        )
        .select_from(SessionParticipant)
        .join(LiveSession, SessionParticipant.session_id == LiveSession.id)
        .where(
            and_(
                LiveSession.teacher_id == teacher_profile.id,
                SessionParticipant.joined_at >= start_date
            )
        )
        .group_by(func.date(SessionParticipant.joined_at))
        .order_by(func.date(SessionParticipant.joined_at))
    )
    
    student_engagement = []
    for row in engagement_result:
        student_engagement.append({
            'date': row.date.strftime('%Y-%m-%d'),
            'participants': row.participants,
            'avg_duration': float(row.avg_duration or 0),
            'engagement_score': min(100, (row.participants * 10) + (float(row.avg_duration or 0) / 60 * 5))
        })
    
    course_performance_result = await db.execute(
        select(
            Course.title,
            func.count(CourseEnrollment.id).label('enrollments'),
            func.avg(CourseEnrollment.progress_percentage).label('avg_progress')
        )
        .select_from(Course)
        .outerjoin(CourseEnrollment, Course.id == CourseEnrollment.course_id)
        .where(Course.teacher_id == teacher_profile.id)
        .group_by(Course.id, Course.title)
        .order_by(desc(func.count(CourseEnrollment.id)))
        .limit(10)
    )
    
    course_performance = []
    for row in course_performance_result:
        course_performance.append({
            'course': row.title,
            'enrollments': row.enrollments,
            'avg_progress': float(row.avg_progress or 0)
        })
    
    session_analytics_result = await db.execute(
        select(
            LiveSession.title,
            LiveSession.current_participants,
            func.extract('epoch', LiveSession.actual_end - LiveSession.actual_start).label('duration_minutes')
        )
        .where(
            and_(
                LiveSession.teacher_id == teacher_profile.id,
                func.cast(LiveSession.status, String) == 'completed',
                LiveSession.actual_start.isnot(None),
                LiveSession.actual_end.isnot(None)
            )
        )
        .order_by(desc(LiveSession.actual_start))
        .limit(10)
    )
    
    session_analytics = []
    for row in session_analytics_result:
        session_analytics.append({
            'session': row.title,
            'participants': row.current_participants,
            'duration': int(row.duration_minutes / 60) if row.duration_minutes else 0
        })
    
    earnings_trend_result = await db.execute(
        select(
            func.date_trunc('month', Payment.created_at).label('month'),
            func.sum(Payment.amount).label('total')
        )
        .where(
            and_(
                Payment.user_id == current_user.id,
                func.cast(Payment.status, String) == 'completed',
                Payment.created_at >= start_date
            )
        )
        .group_by(func.date_trunc('month', Payment.created_at))
        .order_by(func.date_trunc('month', Payment.created_at))
    )
    
    earnings_trend = []
    for row in earnings_trend_result:
        earnings_trend.append({
            'month': row.month.strftime('%Y-%m'),
            'earnings': float(row.total)
        })
    
    return TeacherAnalyticsResponse(
        period=period,
        student_engagement=student_engagement,
        course_performance=course_performance,
        session_analytics=session_analytics,
        earnings_trend=earnings_trend
    )


@router.get("/earnings", response_model=TeacherEarningsResponse)
async def get_teacher_earnings(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get teacher earnings data"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    total_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            and_(
                Payment.user_id == current_user.id,
                func.cast(Payment.status, String) == 'completed'
            )
        )
    )
    total_earnings = total_result.scalar()
    
    current_month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            and_(
                Payment.user_id == current_user.id,
                func.cast(Payment.status, String) == 'completed',
                Payment.created_at >= current_month_start
            )
        )
    )
    this_month_earnings = this_month_result.scalar()
    
    last_month_start = (current_month_start - timedelta(days=1)).replace(day=1)
    last_month_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            and_(
                Payment.user_id == current_user.id,
                func.cast(Payment.status, String) == 'completed',
                Payment.created_at >= last_month_start,
                Payment.created_at < current_month_start
            )
        )
    )
    last_month_earnings = last_month_result.scalar()
    
    pending_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            and_(
                Payment.user_id == current_user.id,
                Payment.status == 'pending'
            )
        )
    )
    pending_payments = pending_result.scalar()
    
    recent_payments_result = await db.execute(
        select(Payment)
        .where(Payment.user_id == current_user.id)
        .order_by(desc(Payment.created_at))
        .limit(10)
    )
    recent_payments = recent_payments_result.scalars().all()
    
    monthly_result = await db.execute(
        select(
            func.date_trunc('month', Payment.created_at).label('month'),
            func.sum(Payment.amount).label('total')
        )
        .where(
            and_(
                Payment.user_id == current_user.id,
                func.cast(Payment.status, String) == 'completed',
                Payment.created_at >= datetime.now() - timedelta(days=365)
            )
        )
        .group_by(func.date_trunc('month', Payment.created_at))
        .order_by(func.date_trunc('month', Payment.created_at))
    )
    
    monthly_breakdown = []
    for row in monthly_result:
        monthly_breakdown.append({
            'month': row.month.strftime('%Y-%m'),
            'earnings': float(row.total)
        })
    
    return TeacherEarningsResponse(
        total_earnings=total_earnings,
        this_month_earnings=this_month_earnings,
        last_month_earnings=last_month_earnings,
        pending_payments=pending_payments,
        recent_payments=recent_payments,
        monthly_breakdown=monthly_breakdown
    )

@router.get("/events", response_model=TeacherEventsResponse)
async def get_teacher_events(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get teacher's events with statistics"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        events_query = select(Event).where(Event.organizer_id == current_user.id).order_by(Event.start_date.desc())
        events_result = await db.execute(events_query)
        events = events_result.scalars().all()
        
        now = datetime.now()
        current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month_start = (current_month_start + timedelta(days=32)).replace(day=1)
        
        total_count = len(events)
        upcoming_count = len([e for e in events if e.start_date > now])
        past_count = len([e for e in events if e.end_date < now])
        this_month_count = len([e for e in events if current_month_start <= e.start_date < next_month_start])
        my_events_count = total_count
        total_participants = sum([e.current_attendees for e in events])
        
        return TeacherEventsResponse(
            events=events,
            total_count=total_count,
            upcoming_count=upcoming_count,
            past_count=past_count,
            this_month_count=this_month_count,
            my_events_count=my_events_count,
            total_participants=total_participants
        )
        
    except Exception as e:
        logger.error(f"Error fetching teacher events: {e}")
        return TeacherEventsResponse(
            events=[],
            total_count=0,
            upcoming_count=0,
            past_count=0,
            this_month_count=0,
            my_events_count=0,
            total_participants=0
        )

@router.post("/events", response_model=EventResponse)
async def create_teacher_event(
    event: EventCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        new_event = Event(
            organizer_id=current_user.id,
            **event.model_dump()
        )
        
        db.add(new_event)
        await db.commit()
        await db.refresh(new_event)
        
        return new_event
        
    except Exception as e:
        logger.error(f"Error creating event: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create event")

@router.get("/events/{event_id}", response_model=EventResponse)
async def get_teacher_event(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get specific event details"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event_query = select(Event).where(
            Event.id == event_id,
            Event.organizer_id == current_user.id
        )
        event_result = await db.execute(event_query)
        event = event_result.scalar_one_or_none()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        return event
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching event: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch event")

@router.put("/events/{event_id}", response_model=EventResponse)
async def update_teacher_event(
    event_id: UUID,
    event_update: EventUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event_query = select(Event).where(
            Event.id == event_id,
            Event.organizer_id == current_user.id
        )
        event_result = await db.execute(event_query)
        event = event_result.scalar_one_or_none()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        update_data = event_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(event, field, value)
        
        await db.commit()
        await db.refresh(event)
        
        return event
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating event: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update event")

@router.delete("/events/{event_id}")
async def delete_teacher_event(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event_query = select(Event).where(
            Event.id == event_id,
            Event.organizer_id == current_user.id
        )
        event_result = await db.execute(event_query)
        event = event_result.scalar_one_or_none()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        await db.delete(event)
        await db.commit()
        
        return {"message": "Event deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting event: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete event")


@router.get("/events/categories")
async def get_event_categories(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all event categories with counts"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        events_query = select(Event).where(Event.organizer_id == current_user.id)
        events_result = await db.execute(events_query)
        events = events_result.scalars().all()
        
        category_counts = {}
        for event in events:
            category = event.category or 'uncategorized'
            category_counts[category] = category_counts.get(category, 0) + 1
        
        categories = [
            {
                "id": "workshop",
                "name": "Workshops",
                "description": "Hands-on learning sessions",
                "color": "blue",
                "icon": "BookOpen",
                "count": category_counts.get("workshop", 0)
            },
            {
                "id": "webinar",
                "name": "Webinars",
                "description": "Online educational presentations", 
                "color": "green",
                "icon": "Monitor",
                "count": category_counts.get("webinar", 0)
            },
            {
                "id": "conference",
                "name": "Conferences",
                "description": "Large-scale educational gatherings",
                "color": "purple",
                "icon": "Users",
                "count": category_counts.get("conference", 0)
            },
            {
                "id": "bootcamp",
                "name": "Bootcamps",
                "description": "Intensive training programs",
                "color": "orange",
                "icon": "Zap",
                "count": category_counts.get("bootcamp", 0)
            },
            {
                "id": "seminar",
                "name": "Seminars",
                "description": "Academic presentations and discussions",
                "color": "teal",
                "icon": "GraduationCap",
                "count": category_counts.get("seminar", 0)
            },
            {
                "id": "networking",
                "name": "Networking",
                "description": "Professional networking events",
                "color": "pink",
                "icon": "Coffee",
                "count": category_counts.get("networking", 0)
            }
        ]
        
        return {"categories": categories, "total_events": len(events)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get categories: {str(e)}")

@router.post("/events/categories")
async def create_event_category(
    name: str = Form(...),
    description: str = Form(...),
    color: str = Form("blue"),
    icon: str = Form("Calendar"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a custom event category"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        category_id = name.lower().replace(" ", "_")
        
        new_category = {
            "id": category_id,
            "name": name,
            "description": description,
            "color": color,
            "icon": icon,
            "custom": True,
            "count": 0
        }
        
        return {"message": "Category created successfully", "category": new_category}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create category: {str(e)}")

@router.get("/events/templates")
async def get_event_templates(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get event templates for quick event creation"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        templates = [
            {
                "id": "workshop_template",
                "name": "Workshop Template",
                "description": "Standard workshop format",
                "category": "workshop",
                "duration_hours": 3,
                "max_attendees": 25,
                "is_online": False,
                "has_certificate": True,
                "price": 0,
                "template_fields": {
                    "title": "[Subject] Workshop",
                    "description": "An interactive workshop covering key concepts and practical applications.",
                    "requirements": ["Basic knowledge of subject", "Laptop required"],
                    "includes": ["Materials", "Certificate", "Refreshments"]
                }
            },
            {
                "id": "webinar_template", 
                "name": "Webinar Template",
                "description": "Online presentation format",
                "category": "webinar",
                "duration_hours": 1.5,
                "max_attendees": 100,
                "is_online": True,
                "has_certificate": False,
                "price": 0,
                "template_fields": {
                    "title": "[Topic] Webinar",
                    "description": "Join us for an informative online session.",
                    "requirements": ["Stable internet connection", "Webcam optional"],
                    "includes": ["Recording access", "Q&A session", "Resource links"]
                }
            },
            {
                "id": "bootcamp_template",
                "name": "Bootcamp Template", 
                "description": "Intensive multi-day training",
                "category": "bootcamp",
                "duration_hours": 24,
                "max_attendees": 15,
                "is_online": False,
                "has_certificate": True,
                "price": 299,
                "template_fields": {
                    "title": "[Skill] Bootcamp",
                    "description": "Intensive hands-on training program.",
                    "requirements": ["Previous experience preferred", "Laptop required"],
                    "includes": ["Materials", "Certificate", "Lunch", "Follow-up support"]
                }
            }
        ]
        
        return {"templates": templates}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get templates: {str(e)}")

@router.post("/events/from-template")
async def create_event_from_template(
    template_id: str = Form(...),
    title: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    location: Optional[str] = Form(None),
    custom_description: Optional[str] = Form(None),
    max_attendees: Optional[int] = Form(None),
    price: Optional[float] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create an event from a template"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        template_map = {
            "workshop_template": {
                "category": "workshop",
                "description": "An interactive workshop covering key concepts and practical applications.",
                "max_attendees": 25,
                "is_online": False,
                "has_certificate": True,
                "price": 0
            },
            "webinar_template": {
                "category": "webinar", 
                "description": "Join us for an informative online session.",
                "max_attendees": 100,
                "is_online": True,
                "has_certificate": False,
                "price": 0
            },
            "bootcamp_template": {
                "category": "bootcamp",
                "description": "Intensive hands-on training program.",
                "max_attendees": 15,
                "is_online": False,
                "has_certificate": True,
                "price": 299
            }
        }
        
        template = template_map.get(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format")
        
        if start_dt.tzinfo is not None:
            start_dt = start_dt.astimezone(timezone.utc).replace(tzinfo=None)
        if end_dt.tzinfo is not None:
            end_dt = end_dt.astimezone(timezone.utc).replace(tzinfo=None)
        
        new_event = Event(
            organizer_id=current_user.id,
            title=title,
            description=custom_description or template["description"],
            category=template["category"],
            start_date=start_dt,
            end_date=end_dt,
            location=location,
            is_online=template["is_online"],
            max_attendees=max_attendees or template["max_attendees"],
            current_attendees=0,
            price=price if price is not None else template["price"],
            has_certificate=template["has_certificate"],
            is_featured=False
        )
        
        db.add(new_event)
        await db.commit()
        await db.refresh(new_event)
        
        return {"message": "Event created from template successfully", "event_id": str(new_event.id)}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create event from template: {str(e)}")

@router.get("/events/{event_id}/registrations")
async def get_event_registrations(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all registrations for an event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event = await db.get(Event, event_id)
        if not event or event.organizer_id != current_user.id:
            raise HTTPException(status_code=404, detail="Event not found")
        
        registrations_query = select(EventRegistration).where(EventRegistration.event_id == event_id)
        registrations_result = await db.execute(registrations_query)
        registrations = registrations_result.scalars().all()
        
        registration_list = []
        for reg in registrations:
            user_query = select(User).where(User.id == reg.user_id)
            user_result = await db.execute(user_query)
            user = user_result.scalar_one_or_none()
            
            if user:
                profile_query = select(UserProfile).where(UserProfile.user_id == user.id)
                profile_result = await db.execute(profile_query)
                profile = profile_result.scalar_one_or_none()
                
                registration_list.append({
                    "id": str(reg.id),
                    "registered_at": reg.created_at.isoformat() if reg.created_at else None,
                    "status": "confirmed",
                    "user": {
                        "id": str(user.id),
                        "email": user.email,
                        "role": user.role,
                        "profile": {
                            "first_name": profile.first_name if profile else "",
                            "last_name": profile.last_name if profile else "",
                            "phone": profile.phone if profile else "",
                        } if profile else None
                    },
                    "notes": reg.notes or ""
                })
        
        return {
            "registrations": registration_list,
            "total_count": len(registration_list),
            "event_capacity": event.max_attendees,
            "remaining_spots": (event.max_attendees - len(registration_list)) if event.max_attendees else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get registrations: {str(e)}")

@router.post("/events/{event_id}/registrations")
async def register_for_event(
    event_id: UUID,
    user_email: str = Form(...),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Register a user for an event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event = await db.get(Event, event_id)
        if not event or event.organizer_id != current_user.id:
            raise HTTPException(status_code=404, detail="Event not found")
        
        user_query = select(User).where(User.email == user_email)
        user_result = await db.execute(user_query)
        user = user_result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        existing_query = select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.user_id == user.id
        )
        existing_result = await db.execute(existing_query)
        existing = existing_result.scalar_one_or_none()
        
        if existing:
            raise HTTPException(status_code=400, detail="User already registered for this event")
        
        if event.max_attendees:
            registrations_count_query = select(func.count(EventRegistration.id)).where(
                EventRegistration.event_id == event_id
            )
            count_result = await db.execute(registrations_count_query)
            current_count = count_result.scalar() or 0
            
            if current_count >= event.max_attendees:
                raise HTTPException(status_code=400, detail="Event is at full capacity")
        
        registration = EventRegistration(
            event_id=event_id,
            user_id=user.id,
            notes=notes
        )
        
        db.add(registration)
        
        event.current_attendees += 1
        
        await db.commit()
        await db.refresh(registration)
        
        return {"message": "Registration successful", "registration_id": str(registration.id)}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to register for event: {str(e)}")

@router.put("/events/{event_id}/status")
async def update_event_status(
    event_id: UUID,
    status: str = Form(...),
    reason: Optional[str] = Form(None),
    new_date: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update event status with notifications"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event = await db.get(Event, event_id)
        if not event or event.organizer_id != current_user.id:
            raise HTTPException(status_code=404, detail="Event not found")
        
        valid_statuses = ['active', 'cancelled', 'postponed', 'completed']
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        
        if status == 'postponed' and new_date:
            try:
                new_start = datetime.fromisoformat(new_date.replace('Z', '+00:00'))
                if new_start.tzinfo is not None:
                    new_start = new_start.astimezone(timezone.utc).replace(tzinfo=None)
                
                duration = event.end_date - event.start_date
                event.start_date = new_start
                event.end_date = new_start + duration
                
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid new date format")
        
        
        await db.commit()
        
        message = f"Event status updated to {status}"
        if reason:
            message += f". Reason: {reason}"
        
        return {"message": message}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update event status: {str(e)}")

@router.get("/events/{event_id}/analytics")
async def get_event_analytics(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed analytics for an event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event = await db.get(Event, event_id)
        if not event or event.organizer_id != current_user.id:
            raise HTTPException(status_code=404, detail="Event not found")
        
        registrations_query = text("""
            SELECT 
                er.created_at,
                u.role,
                DATE(er.created_at) as registration_date
            FROM event_registrations er
            JOIN users u ON er.user_id = u.id
            WHERE er.event_id = $1
            ORDER BY er.created_at
        """)
        
        registrations_result = await db.execute(registrations_query, (str(event_id),))
        registrations = registrations_result.mappings().fetchall()
        
        total_registrations = len(registrations)
        
        role_stats = {}
        for reg in registrations:
            role = reg.get('role', 'unknown')
            role_stats[role] = role_stats.get(role, 0) + 1
        
        now = datetime.now()
        timeline_data = []
        for i in range(7):
            day = now - timedelta(days=i)
            day_str = day.strftime('%Y-%m-%d')
            count = len([r for r in registrations if r.get('registration_date') and str(r['registration_date']) == day_str])
            timeline_data.append({
                "date": day_str,
                "registrations": count
            })
        
        capacity_used = (total_registrations / event.max_attendees * 100) if event.max_attendees else 0
        
        days_until = (event.start_date - now).days if event.start_date > now else 0
        
        return {
            "event_id": str(event_id),
            "total_registrations": total_registrations,
            "capacity_used_percent": round(capacity_used, 1),
            "days_until_event": days_until,
            "registration_by_role": role_stats,
            "registration_timeline": list(reversed(timeline_data)),
            "average_registrations_per_day": round(total_registrations / max(1, (now - event.created_at).days), 2) if event.created_at else 0,
            "peak_registration_day": max(timeline_data, key=lambda x: x['registrations'])['date'] if timeline_data else None,
            "is_sold_out": event.max_attendees and total_registrations >= event.max_attendees,
            "projected_final_count": min(event.max_attendees or float('inf'), total_registrations + (days_until * 2)) if days_until > 0 else total_registrations
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get event analytics: {str(e)}")

@router.post("/events/{event_id}/promotional-material")
async def upload_promotional_material(
    event_id: UUID,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    material_type: str = Form(...),
    file_url: str = Form(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload promotional material for an event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event = await db.get(Event, event_id)
        if not event or event.organizer_id != current_user.id:
            raise HTTPException(status_code=404, detail="Event not found")
        
        if material_type == 'banner':
            event.image_url = file_url
        
        await db.commit()
        
        return {
            "message": "Promotional material uploaded successfully",
            "material_id": f"{event_id}_{material_type}",
            "url": file_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload promotional material: {str(e)}")

@router.post("/events/{event_id}/archive")
async def archive_event(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive a completed event"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        event = await db.get(Event, event_id)
        if not event or event.organizer_id != current_user.id:
            raise HTTPException(status_code=404, detail="Event not found")
        
        if event.end_date > datetime.now():
            raise HTTPException(status_code=400, detail="Cannot archive an ongoing or future event")
        
        
        return {"message": "Event archived successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to archive event: {str(e)}")

@router.get("/sponsorship", response_model=TeacherSponsorshipResponse)
async def get_teacher_sponsorship_requests(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get teacher's sponsorship requests with statistics"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        requests_query = select(SponsorshipRequest).where(
            SponsorshipRequest.teacher_id == current_user.id
        ).order_by(SponsorshipRequest.submitted_at.desc())
        requests_result = await db.execute(requests_query)
        requests = requests_result.scalars().all()
        
        total_count = len(requests)
        pending_count = len([r for r in requests if r.status == 'pending'])
        approved_count = len([r for r in requests if r.status == 'approved'])
        rejected_count = len([r for r in requests if r.status == 'rejected'])
        total_requested = sum([float(r.amount_requested) for r in requests])
        total_approved = sum([float(r.amount_requested) for r in requests if r.status == 'approved'])
        
        return TeacherSponsorshipResponse(
            requests=requests,
            total_count=total_count,
            pending_count=pending_count,
            approved_count=approved_count,
            rejected_count=rejected_count,
            total_requested=total_requested,
            total_approved=total_approved
        )
        
    except Exception as e:
        logger.error(f"Error fetching sponsorship requests: {e}")
        return TeacherSponsorshipResponse(
            requests=[],
            total_count=0,
            pending_count=0,
            approved_count=0,
            rejected_count=0,
            total_requested=0.0,
            total_approved=0.0
        )

@router.post("/sponsorship", response_model=SponsorshipRequestResponse)
async def create_sponsorship_request(
    request: SponsorshipRequestCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new sponsorship request"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        new_request = SponsorshipRequest(
            teacher_id=current_user.id,
            **request.model_dump()
        )
        
        db.add(new_request)
        await db.commit()
        await db.refresh(new_request)
        
        return new_request
        
    except Exception as e:
        logger.error(f"Error creating sponsorship request: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create sponsorship request")

@router.get("/sponsorship/{request_id}", response_model=SponsorshipRequestResponse)
async def get_sponsorship_request(
    request_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get specific sponsorship request details"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        request_query = select(SponsorshipRequest).where(
            SponsorshipRequest.id == request_id,
            SponsorshipRequest.teacher_id == current_user.id
        )
        request_result = await db.execute(request_query)
        sponsorship_request = request_result.scalar_one_or_none()
        
        if not sponsorship_request:
            raise HTTPException(status_code=404, detail="Sponsorship request not found")
        
        return sponsorship_request
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sponsorship request: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sponsorship request")

@router.put("/sponsorship/{request_id}", response_model=SponsorshipRequestResponse)
async def update_sponsorship_request(
    request_id: UUID,
    request_update: SponsorshipRequestUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a sponsorship request"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        request_query = select(SponsorshipRequest).where(
            SponsorshipRequest.id == request_id,
            SponsorshipRequest.teacher_id == current_user.id
        )
        request_result = await db.execute(request_query)
        sponsorship_request = request_result.scalar_one_or_none()
        
        if not sponsorship_request:
            raise HTTPException(status_code=404, detail="Sponsorship request not found")
        
        if sponsorship_request.status != 'pending':
            raise HTTPException(status_code=400, detail="Cannot update approved/rejected requests")
        
        update_data = request_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field not in ['status', 'reviewer_notes']:
                setattr(sponsorship_request, field, value)
        
        await db.commit()
        await db.refresh(sponsorship_request)
        
        return sponsorship_request
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating sponsorship request: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update sponsorship request")

@router.delete("/sponsorship/{request_id}")
async def delete_sponsorship_request(
    request_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a sponsorship request"""
    try:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(status_code=403, detail="Access denied")
        
        request_query = select(SponsorshipRequest).where(
            SponsorshipRequest.id == request_id,
            SponsorshipRequest.teacher_id == current_user.id
        )
        request_result = await db.execute(request_query)
        sponsorship_request = request_result.scalar_one_or_none()
        
        if not sponsorship_request:
            raise HTTPException(status_code=404, detail="Sponsorship request not found")
        
        if sponsorship_request.status != 'pending':
            raise HTTPException(status_code=400, detail="Cannot delete approved/rejected requests")
        
        await db.delete(sponsorship_request)
        await db.commit()
        
        return {"message": "Sponsorship request deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting sponsorship request: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete sponsorship request") 


@router.post("/students/add", response_model=Dict[str, Any])
async def add_student_to_course(
    student_email: str = Form(...),
    course_id: UUID = Form(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Add/enroll a student to teacher's course"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        course_query = select(Course).where(
            and_(Course.id == course_id, Course.teacher_id == teacher_profile.id)
        )
        course_result = await db.execute(course_query)
        course = course_result.scalar()
        
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found or you don't have permission to enroll students"
            )
        
        student_query = select(User).where(
            and_(User.email == student_email, User.role == UserRole.STUDENT)
        )
        student_result = await db.execute(student_query)
        student = student_result.scalar()
        
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found. Please check the email address."
            )
        
        existing_enrollment = await db.execute(
            select(CourseEnrollment).where(
                and_(
                    CourseEnrollment.student_id == student.id,
                    CourseEnrollment.course_id == course_id,
                    CourseEnrollment.teacher_id == teacher_profile.id
                )
            )
        )
        
        if existing_enrollment.scalar():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is already enrolled in this course"
            )
        
        new_enrollment = CourseEnrollment(
            student_id=student.id,
            course_id=course_id,
            teacher_id=teacher_profile.id,
            status='pending',
            progress_percentage=0,
            payment_status='pending'
        )
        
        db.add(new_enrollment)
        await db.commit()
        await db.refresh(new_enrollment)
        
        from database.models import UserProfile
        profile_query = select(UserProfile).where(UserProfile.user_id == student.id)
        profile_result = await db.execute(profile_query)
        profile = profile_result.scalar()
        
        return {
            "success": True,
            "message": f"Successfully enrolled {profile.first_name if profile and profile.first_name else student.email} in {course.title}",
            "enrollment": {
                "id": str(new_enrollment.id),
                "student_name": f"{profile.first_name} {profile.last_name}" if profile and profile.first_name else student.email,
                "course_title": course.title,
                "status": new_enrollment.status
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error adding student to course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enroll student"
        )
    
@router.get("/payment-history")
async def get_payment_history(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    type_filter: Optional[str] = None,
    date_range: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get Teacher's payment history with filtering and pagination"""
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Teachers can access this endpoint"
        )
    
    try:
        query = """
            SELECT DISTINCT
                p.id,
                p.transaction_id,
                p.amount,
                p.currency,
                p.payment_type,
                p.status,
                p.payment_method,
                p.created_at,
                p.processed_at,
                -- Course info
                c.title as course_title,
                up_c.first_name || ' ' || up_c.last_name as course_teacher,
                -- Event info  
                e.title as event_title,
                up_e.first_name || ' ' || up_e.last_name as event_organizer,
                -- Session info
                s.title as session_title,
                up_s.first_name || ' ' || up_s.last_name as session_teacher
            FROM payments p
            LEFT JOIN courses c ON p.payment_type = 'course_enrollment' AND p.reference_id = c.id
            LEFT JOIN users u_c ON c.teacher_id = u_c.id
            LEFT JOIN user_profiles up_c ON u_c.id = up_c.user_id
            LEFT JOIN events e ON p.payment_type = 'event_registration' AND p.reference_id = e.id
            LEFT JOIN users u_e ON e.organizer_id = u_e.id
            LEFT JOIN user_profiles up_e ON u_e.id = up_e.user_id
            LEFT JOIN live_sessions s ON p.payment_type = 'session_booking' AND p.reference_id = s.id
            LEFT JOIN users u_s ON s.teacher_id = u_s.id
            LEFT JOIN user_profiles up_s ON u_s.id = up_s.user_id
            WHERE p.user_id = :user_id
            ORDER BY p.created_at DESC
        """
        
        result = await db.execute(text(query), {"user_id": str(current_user.id)})
        payments_raw = result.fetchall()
        
        payments_data = []
        for payment in payments_raw:
            frontend_status = payment.status
            if payment.status == "completed":
                frontend_status = "paid"
            elif payment.status == "pending":
                from datetime import datetime, timedelta
                if payment.created_at and payment.created_at < datetime.now() - timedelta(days=30):
                    frontend_status = "overdue"
                else:
                    frontend_status = "pending"
            
            description = "Payment"
            teacher_name = None
            service_name = None
            
            if payment.payment_type == "course_enrollment" and payment.course_title:
                description = f"{payment.course_title} - Course Fee"
                teacher_name = payment.course_teacher
                service_name = payment.course_title
            elif payment.payment_type == "event_registration" and payment.event_title:
                description = f"{payment.event_title} - Registration"
                teacher_name = payment.event_organizer
                service_name = payment.event_title
            elif payment.payment_type == "session_booking" and payment.session_title:
                description = f"Live Session - {payment.session_title}"
                teacher_name = payment.session_teacher
                service_name = payment.session_title
                
            frontend_type = "tuition"
            if payment.payment_type == "course_enrollment":
                frontend_type = "tuition"
            elif payment.payment_type == "event_registration":
                frontend_type = "extracurricular"
            elif payment.payment_type == "session_booking":
                frontend_type = "tuition"
            
            payment_data = {
                "id": str(payment.id),
                "transactionId": payment.transaction_id or f"TXN-{str(payment.id)[:8]}",
                "amount": float(payment.amount) if payment.amount else 0.0,
                "currency": payment.currency or "LKR",
                "type": frontend_type,
                "description": description,
                "teacherName": teacher_name,
                "courseName": service_name,
                "status": frontend_status,
                "paymentMethod": payment.payment_method or "Unknown",
                "date": payment.created_at.strftime("%Y-%m-%d") if payment.created_at else None,
                "receiptUrl": f"/api/v1/students/payment-history/{payment.id}/receipt" if frontend_status == "paid" else None
            }
            payments_data.append(payment_data)
        
        summary_query = """
            SELECT 
                COUNT(*) as total_payments,
                SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_paid,
                SUM(CASE WHEN status = 'pending' AND created_at >= CURRENT_DATE - INTERVAL '30 days' THEN amount ELSE 0 END) as total_pending,
                SUM(CASE WHEN status = 'pending' AND created_at < CURRENT_DATE - INTERVAL '30 days' THEN amount ELSE 0 END) as total_overdue
            FROM payments 
            WHERE user_id = :user_id
        """
        
        summary_result = await db.execute(text(summary_query), {"user_id": str(current_user.id)})
        summary = summary_result.fetchone()
        
        return {
            "success": True,
            "data": {
                "payments": payments_data,
                "summary": {
                    "totalPaid": float(summary.total_paid or 0),
                    "totalPending": float(summary.total_pending or 0),
                    "totalOverdue": float(summary.total_overdue or 0),
                    "totalPayments": summary.total_payments or 0
                }
            }
        }
        
    except Exception as e:
        print(f"Error fetching payment history: {e}")
        return {
            "success": False,
            "error": str(e),
            "data": {
                "payments": [],
                "summary": {
                    "totalPaid": 0,
                    "totalPending": 0,
                    "totalOverdue": 0,
                    "totalPayments": 0
                }
            }
        }

@router.get("/payment-history/{payment_id}/receipt")
async def get_payment_receipt(
    payment_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate and download PDF receipt for a payment"""
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access payment receipts"
        )
    
    try:
        query = """
            SELECT DISTINCT
                p.id,
                p.transaction_id,
                p.amount,
                p.currency,
                p.payment_type,
                p.status,
                p.payment_method,
                p.created_at,
                p.processed_at,
                -- Course info
                c.title as course_title,
                up_c.first_name || ' ' || up_c.last_name as course_teacher,
                -- Event info  
                e.title as event_title,
                up_e.first_name || ' ' || up_e.last_name as event_organizer,
                -- Session info
                s.title as session_title,
                up_s.first_name || ' ' || up_s.last_name as session_teacher
            FROM payments p
            LEFT JOIN courses c ON p.payment_type = 'course_enrollment' AND p.reference_id = c.id
            LEFT JOIN users u_c ON c.teacher_id = u_c.id
            LEFT JOIN user_profiles up_c ON u_c.id = up_c.user_id
            LEFT JOIN events e ON p.payment_type = 'event_registration' AND p.reference_id = e.id
            LEFT JOIN users u_e ON e.organizer_id = u_e.id
            LEFT JOIN user_profiles up_e ON u_e.id = up_e.user_id
            LEFT JOIN live_sessions s ON p.payment_type = 'session_booking' AND p.reference_id = s.id
            LEFT JOIN users u_s ON s.teacher_id = u_s.id
            LEFT JOIN user_profiles up_s ON u_s.id = up_s.user_id
            WHERE p.id = :payment_id AND p.user_id = :user_id
        """
        
        result = await db.execute(text(query), {
            "payment_id": payment_id,
            "user_id": str(current_user.id)
        })
        payment = result.fetchone()
        
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found or you don't have access to it"
            )
        
        frontend_status = payment.status
        if payment.status == "completed":
            frontend_status = "paid"
        elif payment.status == "pending":
            if payment.created_at and payment.created_at < datetime.now() - timedelta(days=30):
                frontend_status = "overdue"
            else:
                frontend_status = "pending"
        
        description = "Payment"
        teacher_name = None
        service_name = None
        
        if payment.payment_type == "course_enrollment" and payment.course_title:
            description = f"{payment.course_title} - Course Fee"
            teacher_name = payment.course_teacher
            service_name = payment.course_title
        elif payment.payment_type == "event_registration" and payment.event_title:
            description = f"{payment.event_title} - Registration"
            teacher_name = payment.event_organizer
            service_name = payment.event_title
        elif payment.payment_type == "session_booking" and payment.session_title:
            description = f"Live Session - {payment.session_title}"
            teacher_name = payment.session_teacher
            service_name = payment.session_title
            
        frontend_type = "tuition"
        if payment.payment_type == "course_enrollment":
            frontend_type = "tuition"
        elif payment.payment_type == "event_registration":
            frontend_type = "extracurricular"
        elif payment.payment_type == "session_booking":
            frontend_type = "tuition"
        
        payment_data = {
            "id": str(payment.id),
            "transactionId": payment.transaction_id or f"TXN-{str(payment.id)[:8]}",
            "amount": float(payment.amount) if payment.amount else 0.0,
            "currency": payment.currency or "LKR",
            "type": frontend_type,
            "description": description,
            "teacherName": teacher_name,
            "courseName": service_name,
            "status": frontend_status,
            "paymentMethod": payment.payment_method or "Unknown",
            "date": payment.created_at.strftime("%Y-%m-%d") if payment.created_at else None,
        }
        
        pdf_data = receipt_generator.generate_receipt(payment_data)
        
        filename = f"receipt_{payment_data['transactionId']}.pdf"
        
        return Response(
            content=pdf_data,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "application/pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating receipt: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate receipt"
        )


@router.get("/courses/list", response_model=List[Dict[str, Any]])
async def get_teacher_courses_list(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get simplified list of teacher's courses for dropdowns"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        courses_query = select(Course).where(
            Course.teacher_id == teacher_profile.id
        ).order_by(Course.title)
        
        result = await db.execute(courses_query)
        courses = result.scalars().all()
        
        return [
            {
                "id": str(course.id),
                "title": course.title,
                "level": course.level,
                "status": course.status
            }
            for course in courses
        ]
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching teacher courses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch courses"
        )


@router.post("/students/message", response_model=Dict[str, Any])
async def send_message_to_student(
    student_id: UUID = Form(...),
    message_content: str = Form(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Persist a chat message from this teacher to one of their students.

    Previously this endpoint only logged the message — students never saw
    it. The new behaviour upserts a `conversations` row and inserts a real
    `messages` record so the student's chat inbox renders it in the next
    refresh. A `notifications` row is also emitted so the bell counter
    ticks up immediately even before they open the inbox.
    """
    teacher_profile = await get_teacher_profile(current_user, db)
    student_id_str = str(student_id)

    try:
        enrollment_check = await db.execute(text("""
            SELECT 1
            FROM course_enrollments ce
            LEFT JOIN courses c ON ce.course_id = c.id
            WHERE ce.student_id = :sid
              AND (ce.teacher_id = :tid OR c.teacher_id = :tid)
            LIMIT 1
        """), {"sid": student_id_str, "tid": str(teacher_profile.id)})
        if not enrollment_check.scalar():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only message students enrolled in your courses",
            )

        teacher_user_id = str(current_user.id)

        conversation = await SupabaseRESTAsync.select_one(
            "conversations",
            "*",
            {"participant_1": teacher_user_id, "participant_2": student_id_str},
        ) or await SupabaseRESTAsync.select_one(
            "conversations",
            "*",
            {"participant_1": student_id_str, "participant_2": teacher_user_id},
        )
        if not conversation:
            convo_id = str(__import__("uuid").uuid4())
            from datetime import datetime as _dt
            await SupabaseRESTAsync.insert("conversations", {
                "id": convo_id,
                "participant_1": teacher_user_id,
                "participant_2": student_id_str,
                "last_message_at": _dt.utcnow().isoformat(),
            })
            conversation = {"id": convo_id}

        from datetime import datetime as _dt
        message_id = str(__import__("uuid").uuid4())
        await SupabaseRESTAsync.insert("messages", {
            "id": message_id,
            "conversation_id": str(conversation.get("id")),
            "sender_id": teacher_user_id,
            "content": message_content,
            "is_read": False,
            "created_at": _dt.utcnow().isoformat(),
        })
        await SupabaseRESTAsync.update(
            "conversations",
            {"last_message_at": _dt.utcnow().isoformat()},
            {"id": str(conversation.get("id"))},
        )

        try:
            await SupabaseRESTAsync.insert("notifications", {
                "id": str(__import__("uuid").uuid4()),
                "user_id": student_id_str,
                "type": "message",
                "title": "New message from your teacher",
                "message": message_content[:140],
                "link_url": "/students/chat",
                "related_entity_type": "conversation",
                "related_entity_id": str(conversation.get("id")),
                "is_read": False,
                "priority": "normal",
                "created_at": _dt.utcnow().isoformat(),
            })
        except Exception:
            pass

        from database.models import UserProfile
        profile_query = select(UserProfile).where(UserProfile.user_id == student_id)
        profile_result = await db.execute(profile_query)
        profile = profile_result.scalar()
        student_name = (
            f"{profile.first_name} {profile.last_name}"
            if profile and profile.first_name else "Student"
        )

        return {
            "success": True,
            "message": f"Message sent to {student_name}",
            "student_name": student_name,
            "conversation_id": str(conversation.get("id")),
            "message_id": message_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error sending message: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send message"
        )


@router.post("/students/email", response_model=Dict[str, Any])
async def send_email_to_student(
    student_id: UUID = Form(...),
    email_subject: str = Form(...),
    email_body: str = Form(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Send an email to a student"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        enrollment_check = await db.execute(
            select(CourseEnrollment).where(
                and_(
                    CourseEnrollment.student_id == student_id,
                    CourseEnrollment.teacher_id == teacher_profile.id
                )
            )
        )
        
        if not enrollment_check.scalar():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only email students enrolled in your courses"
            )
        
        from database.models import UserProfile
        student_query = select(User).where(User.id == student_id)
        student_result = await db.execute(student_query)
        student = student_result.scalar()
        
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found"
            )
        
        profile_query = select(UserProfile).where(UserProfile.user_id == student_id)
        profile_result = await db.execute(profile_query)
        profile = profile_result.scalar()
        
        student_name = f"{profile.first_name} {profile.last_name}" if profile and profile.first_name else student.email
        
        try:
            from services.email_service import send_email
            html = (
                f"<p>Hi {student_name},</p>"
                f"<p>{email_body.strip()}</p>"
                f"<p style='margin-top:24px;color:#6E5742'>— {current_user.email}<br/>"
                f"via SkillHub</p>"
            )
            await send_email(
                to_email=student.email,
                to_name=student_name,
                template="teacher_message",
                context={
                    "first_name": (profile.first_name if profile else "") or "",
                    "teacher_email": current_user.email,
                    "subject": email_subject,
                    "body_html": html,
                },
            )
        except Exception as exc:
            try:
                from services.email_service import send_email as _send_email
                from pathlib import Path as _Path
                outbox = _Path(__file__).resolve().parent.parent.parent / "dev_outbox"
                outbox.mkdir(exist_ok=True)
                from datetime import datetime as _dt
                stamp = _dt.utcnow().strftime("%Y%m%d-%H%M%S")
                safe = "".join(c if c.isalnum() else "-" for c in student.email)[:60]
                (outbox / f"{stamp}_teacher_email_{safe}.html").write_text(
                    f"<!-- To: {student.email}\n     Subject: {email_subject}\n -->\n"
                    f"<p>Hi {student_name},</p><p>{email_body}</p>",
                    encoding="utf-8",
                )
            except Exception:
                pass

        try:
            from datetime import datetime as _dt
            await SupabaseRESTAsync.insert("notifications", {
                "id": str(__import__("uuid").uuid4()),
                "user_id": str(student_id),
                "type": "teacher_email",
                "title": email_subject[:90] or "Email from your teacher",
                "message": email_body[:140],
                "link_url": "/students/chat",
                "related_entity_type": "user",
                "related_entity_id": str(current_user.id),
                "is_read": False,
                "priority": "normal",
                "created_at": _dt.utcnow().isoformat(),
            })
        except Exception:
            pass

        return {
            "success": True,
            "message": f"Email sent to {student_name} ({student.email})",
            "recipient_email": student.email,
            "subject": email_subject
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error sending email: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send email"
        )


@router.post("/students/report")
async def generate_student_report(
    report_type: str = Form(...),
    format: str = Form(...),
    date_from: Optional[str] = Form(None),
    date_to: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate and download a report file for teacher's students"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        if format not in ['pdf', 'excel', 'csv']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid format. Use 'pdf', 'excel', or 'csv'"
            )
            
        if report_type not in ['progress', 'attendance', 'assignments', 'full_academic']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid report type. Use 'progress', 'attendance', 'assignments', or 'full_academic'"
            )
        
        start_date = None
        end_date = None
        if date_from:
            try:
                start_date = datetime.strptime(date_from, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date_from format. Use YYYY-MM-DD"
                )
        if date_to:
            try:
                end_date = datetime.strptime(date_to, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid date_to format. Use YYYY-MM-DD"
                )
        
        enrollments_query = text("""
            SELECT ce.*, 
                   u.email as student_email,
                   up.first_name, up.last_name, up.university,
                   c.title as course_title, c.level as course_level
            FROM course_enrollments ce
            LEFT JOIN users u ON ce.student_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN courses c ON ce.course_id = c.id
            WHERE ce.teacher_id = :teacher_id
            AND ce.status IN ('pending', 'active', 'completed', 'cancelled')
            ORDER BY ce.enrolled_at DESC
        """)
        
        result = await db.execute(enrollments_query, {'teacher_id': str(teacher_profile.id)})
        enrollments_data = result.mappings().fetchall()
        
        if not enrollments_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No student data found for report generation"
            )
        
        report_title = ""
        table_data = []
        
        if report_type == 'progress':
            report_title = "Student Progress Report"
            table_data = [['Name', 'Email', 'Course', 'Progress %', 'Status', 'University', 'Enrolled Date']]
            
            for enrollment in enrollments_data:
                name = f"{enrollment.get('first_name', '')} {enrollment.get('last_name', '')}".strip() or enrollment.get('student_email', 'Unknown')
                row = [
                    name,
                    enrollment.get('student_email', 'N/A'),
                    enrollment.get('course_title', 'N/A'),
                    f"{enrollment.get('progress_percentage', 0)}",
                    enrollment.get('status', 'N/A'),
                    enrollment.get('university', 'N/A'),
                    str(enrollment.get('enrolled_at', ''))[:10] if enrollment.get('enrolled_at') else 'N/A'
                ]
                table_data.append(row)
                
        elif report_type == 'attendance':
            report_title = "Student Attendance Report"
            table_data = [['Name', 'Email', 'Course', 'Attendance Status', 'University']]
            
            for enrollment in enrollments_data:
                name = f"{enrollment.get('first_name', '')} {enrollment.get('last_name', '')}".strip() or enrollment.get('student_email', 'Unknown')
                attendance_status = "Present" if enrollment.get('status') == 'active' else "Absent"
                row = [
                    name,
                    enrollment.get('student_email', 'N/A'),
                    enrollment.get('course_title', 'N/A'),
                    attendance_status,
                    enrollment.get('university', 'N/A')
                ]
                table_data.append(row)
                
        elif report_type == 'assignments':
            report_title = "Student Assignments Report"
            table_data = [['Name', 'Email', 'Course', 'Assignment Score', 'Status', 'Submission Date']]
            
            for enrollment in enrollments_data:
                name = f"{enrollment.get('first_name', '')} {enrollment.get('last_name', '')}".strip() or enrollment.get('student_email', 'Unknown')
                score = f"{enrollment.get('progress_percentage', 0)}/100"
                row = [
                    name,
                    enrollment.get('student_email', 'N/A'),
                    enrollment.get('course_title', 'N/A'),
                    score,
                    enrollment.get('status', 'N/A'),
                    str(enrollment.get('enrolled_at', ''))[:10] if enrollment.get('enrolled_at') else 'N/A'
                ]
                table_data.append(row)
                
        elif report_type == 'full_academic':
            report_title = "Full Academic Report"
            table_data = [['Name', 'Email', 'Course', 'Progress %', 'Status', 'University', 'Performance', 'Grade']]
            
            for enrollment in enrollments_data:
                name = f"{enrollment.get('first_name', '')} {enrollment.get('last_name', '')}".strip() or enrollment.get('student_email', 'Unknown')
                progress = enrollment.get('progress_percentage', 0)
                if progress >= 90:
                    grade = 'A'
                    performance = 'Excellent'
                elif progress >= 80:
                    grade = 'B'
                    performance = 'Good'
                elif progress >= 70:
                    grade = 'C'
                    performance = 'Average'
                elif progress >= 60:
                    grade = 'D'
                    performance = 'Below Average'
                else:
                    grade = 'F'
                    performance = 'Needs Improvement'
                    
                row = [
                    name,
                    enrollment.get('student_email', 'N/A'),
                    enrollment.get('course_title', 'N/A'),
                    f"{progress}",
                    enrollment.get('status', 'N/A'),
                    enrollment.get('university', 'N/A'),
                    performance,
                    grade
                ]
                table_data.append(row)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{report_title.replace(' ', '_')}_{timestamp}"
        
        if format == 'csv':
            return generate_csv_report(table_data, filename)
        elif format == 'excel':
            return generate_excel_report(table_data, report_title, filename)
        elif format == 'pdf':
            return generate_pdf_report(table_data, report_title, filename, current_user.email)
        
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error generating report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate report: {str(e)}"
        )


def generate_csv_report(data, filename):
    """Generate CSV report"""
    output = io.StringIO()
    writer = csv.writer(output)
    for row in data:
        writer.writerow(row)
    
    output.seek(0)
    content = output.getvalue()
    
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8')),
        media_type='text/csv',
        headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
    )


def generate_excel_report(data, title, filename):
    """Generate Excel report"""
    df = pd.DataFrame(data[1:], columns=data[0])
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name=title[:30], index=False)
    
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"}
    )


def generate_pdf_report(data, title, filename, teacher_email):
    """Generate PDF report"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=18,
        textColor=colors.darkblue,
        spaceAfter=20
    )
    elements.append(Paragraph(title, title_style))
    
    meta_style = styles['Normal']
    elements.append(Paragraph(f"<b>Generated by:</b> {teacher_email}", meta_style))
    elements.append(Paragraph(f"<b>Generated on:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", meta_style))
    elements.append(Paragraph(f"<b>Total Records:</b> {len(data) - 1}", meta_style))
    elements.append(Spacer(1, 20))
    
    table = Table(data)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    
    elements.append(table)
    doc.build(elements)
    
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type='application/pdf',
        headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
    )

@router.put("/students/{student_id}/progress")
async def update_student_progress(
    student_id: str,
    progress_percentage: int = Form(...),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update student progress for a specific enrollment"""
    try:
        teacher_profile = await get_teacher_profile(current_user, db)
        
        enrollment_query = text("""
            SELECT ce.id, ce.progress_percentage
            FROM course_enrollments ce
            WHERE ce.student_id = :student_id 
            AND ce.teacher_id = :teacher_id
            LIMIT 1
        """)
        
        enrollment_result = await db.execute(enrollment_query, {
            "student_id": student_id,
            "teacher_id": teacher_profile.id
        })
        enrollment_data = enrollment_result.mappings().fetchone()
        
        if not enrollment_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student enrollment not found or not authorized"
            )
        
        if not (0 <= progress_percentage <= 100):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Progress percentage must be between 0 and 100"
            )
        
        update_query = text("""
            UPDATE course_enrollments 
            SET progress_percentage = :progress_percentage,
                last_accessed = NOW()
            WHERE student_id = :student_id 
            AND teacher_id = :teacher_id
        """)
        
        await db.execute(update_query, {
            "progress_percentage": progress_percentage,
            "student_id": student_id,
            "teacher_id": teacher_profile.id
        })
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Student progress updated successfully",
            "data": {
                "student_id": student_id,
                "progress_percentage": progress_percentage,
                "updated_at": datetime.now().isoformat()
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update student progress: {str(e)}"
        )

@router.get("/notifications")
async def get_teacher_notifications(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get teacher notifications"""
    try:
        teacher_profile = await get_teacher_profile(current_user, db)
        
        notifications_query = text("""
            SELECT 
                n.id,
                n.type,
                n.title,
                n.message,
                n.is_read,
                n.created_at
            FROM notifications n
            WHERE n.user_id = :user_id
            ORDER BY n.created_at DESC
            LIMIT :limit
        """)
        
        notifications_result = await db.execute(notifications_query, {
            "user_id": current_user.id,
            "limit": limit
        })
        notifications_data = notifications_result.mappings().fetchall()
        
        notifications = []
        for row in notifications_data:
            notifications.append({
                "id": str(row.get('id')),
                "type": row.get('type'),
                "title": row.get('title'),
                "message": row.get('message'),
                "created_at": row.get('created_at').isoformat() if row.get('created_at') else None,
                "read": row.get('is_read', False)
            })
        
        return {
            "success": True,
            "notifications": notifications,
            "total_count": len(notifications),
            "unread_count": len([n for n in notifications if not n["read"]])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get notifications: {str(e)}"
        )

@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a specific notification as read"""
    try:
        update_query = text("""
            UPDATE notifications 
            SET is_read = true
            WHERE id = :notification_id 
            AND user_id = :user_id
        """)
        
        result = await db.execute(update_query, {
            "notification_id": notification_id,
            "user_id": current_user.id
        })
        
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found or access denied"
            )
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Notification marked as read"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark notification as read: {str(e)}"
        )

@router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all notifications as read for the current user"""
    try:
        update_query = text("""
            UPDATE notifications 
            SET is_read = true
            WHERE user_id = :user_id 
            AND is_read = false
        """)
        
        result = await db.execute(update_query, {
            "user_id": current_user.id
        })
        
        await db.commit()
        
        return {
            "success": True,
            "message": f"Marked {result.rowcount} notifications as read"
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark all notifications as read: {str(e)}"
        ) 


@router.get("/schedule/simple")
async def get_teacher_schedule_simple(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Simple schedule endpoint for testing - just returns basic data"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    return {
        "appointments": [],
        "availability_blocks": [],
        "regular_sessions": [],
        "templates": [
            {
                "id": "template_1",
                "name": "Standard Week",
                "description": "Monday-Friday 9AM-5PM availability",
                "is_default": True
            }
        ],
        "analytics": {
            "total_appointments": 0,
            "upcoming_appointments": 0,
            "completed_appointments": 0,
            "cancelled_appointments": 0,
            "available_time_blocks": 0,
            "booked_time_blocks": 0,
            "utilization_rate": 0.0,
            "average_appointment_duration": 0.0
        }
    }

@router.get("/schedule")
async def get_teacher_schedule(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive teacher schedule including appointments, availability, and templates"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        logger.info(f"🔍 Getting schedule for teacher: {teacher_profile.id}")
        
        sessions_sql = text("""
            SELECT
                ls.id, ls.teacher_id, ls.course_id, ls.title, ls.description,
                ls.session_type, ls.session_mode, ls.scheduled_start, ls.scheduled_end,
                ls.actual_start, ls.actual_end, ls.status, ls.meeting_link, ls.location,
                ls.max_participants, ls.current_participants, ls.recording_enabled,
                ls.is_recurring, ls.created_at,
                c.title as course_title, c.level as course_level,
                s.name as subject_name
            FROM live_sessions ls
            LEFT JOIN courses c ON ls.course_id = c.id
            LEFT JOIN subjects s ON c.subject_id = s.id
            WHERE ls.teacher_id = :teacher_id
            AND ls.status IN ('scheduled', 'live', 'starting', 'completed', 'cancelled', 'ended')
            ORDER BY ls.scheduled_start DESC
            LIMIT 200
        """)
        
        logger.info("📊 Executing sessions query...")
        sessions_result = await db.execute(sessions_sql, {'teacher_id': str(teacher_profile.id)})
        sessions_raw = sessions_result.mappings().fetchall()
        logger.info(f"✅ Found {len(sessions_raw)} sessions")
        
        appointments = []
        availability_blocks = []
        regular_sessions = []
        
        for row in sessions_raw:
            session = {
                'id': str(row.id),
                'teacher_id': str(row.teacher_id),
                'course_id': str(row.course_id) if row.course_id else None,
                'title': row.title,
                'description': row.description,
                'session_type': row.session_type,
                'session_mode': row.session_mode,
                'scheduled_start': row.scheduled_start.isoformat() if row.scheduled_start else None,
                'scheduled_end': row.scheduled_end.isoformat() if row.scheduled_end else None,
                'actual_start': row.actual_start.isoformat() if row.actual_start else None,
                'actual_end': row.actual_end.isoformat() if row.actual_end else None,
                'status': row.status,
                'meeting_link': row.meeting_link,
                'location': row.location,
                'max_participants': row.max_participants,
                'current_participants': row.current_participants,
                'recording_enabled': row.recording_enabled,
                'is_recurring': row.is_recurring,
                'created_at': row.created_at.isoformat() if row.created_at else None,
                'updated_at': row.created_at.isoformat() if row.created_at else None,
                'course': {
                    'title': row.course_title,
                    'level': row.course_level,
                    'subject': {'name': row.subject_name}
                } if row.course_title else None
            }
            
            session_type = (session.get('session_type') or '').lower()
            if session_type in ['consultation', 'meeting', '1on1', 'one_on_one_tutoring']:
                appointments.append(session)
            elif session_type == 'workshop':
                availability_blocks.append(session)
            else:
                regular_sessions.append(session)
        
        logger.info("📈 Calculating schedule analytics...")
        analytics = await calculate_schedule_analytics(teacher_profile.id, db)
        logger.info("✅ Analytics calculated successfully")
        
        logger.info("📋 Getting schedule templates...")
        templates = await get_schedule_templates(teacher_profile.id, db)
        logger.info("✅ Templates retrieved successfully")
        
        logger.info("🎯 Preparing final response...")
        response = {
            'appointments': appointments,
            'availability_blocks': availability_blocks,
            'regular_sessions': regular_sessions,
            'templates': templates,
            'analytics': analytics
        }
        logger.info(f"✅ Schedule endpoint successful - returning {len(appointments)} appointments, {len(availability_blocks)} blocks, {len(regular_sessions)} sessions")
        return response
        
    except Exception as e:
        logger.error(f"❌ Schedule endpoint failed: {str(e)}")
        import traceback
        logger.error(f"❌ Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get schedule: {str(e)}")

async def calculate_schedule_analytics(teacher_id: UUID, db: AsyncSession) -> dict:
    """Calculate comprehensive schedule analytics"""
    try:
        appointments_query = text("""
            SELECT 
                COUNT(*) as total_appointments,
                COUNT(CASE WHEN status IN ('scheduled') THEN 1 END) as upcoming_appointments,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments,
                AVG(EXTRACT(EPOCH FROM (scheduled_end - scheduled_start))/60) as avg_duration
            FROM live_sessions 
            WHERE teacher_id = :teacher_id 
            AND session_type IN ('consultation', 'meeting')
        """)
        
        result = await db.execute(appointments_query, {'teacher_id': str(teacher_id)})
        apt_stats = result.mappings().fetchone()
        
        availability_query = text("""
            SELECT 
                COUNT(*) as total_blocks,
                COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as available_blocks,
                COUNT(CASE WHEN status = 'live' THEN 1 END) as booked_blocks
            FROM live_sessions 
            WHERE teacher_id = :teacher_id 
            AND session_type = 'workshop'
        """)
        
        result = await db.execute(availability_query, {'teacher_id': str(teacher_id)})
        avail_stats = result.mappings().fetchone()
        
        total_apt = apt_stats.get('total_appointments', 0) or 0
        completed_apt = apt_stats.get('completed_appointments', 0) or 0
        avg_duration = apt_stats.get('avg_duration', 0) or 0
        available_blocks = avail_stats.get('available_blocks', 0) or 0
        booked_blocks = avail_stats.get('booked_blocks', 0) or 0
        
        utilization_rate = (booked_blocks / available_blocks * 100) if available_blocks > 0 else 0
        
        return {
            'total_appointments': total_apt,
            'upcoming_appointments': apt_stats.get('upcoming_appointments', 0) or 0,
            'completed_appointments': completed_apt,
            'cancelled_appointments': apt_stats.get('cancelled_appointments', 0) or 0,
            'available_time_blocks': available_blocks,
            'booked_time_blocks': booked_blocks,
            'utilization_rate': float(utilization_rate),
            'average_appointment_duration': float(avg_duration),
            'busiest_day': 'Monday',
            'peak_hours': '10:00-12:00'
        }
        
    except Exception as e:
        return {
            'total_appointments': 0,
            'upcoming_appointments': 0,
            'completed_appointments': 0,
            'cancelled_appointments': 0,
            'available_time_blocks': 0,
            'booked_time_blocks': 0,
            'utilization_rate': 0.0,
            'average_appointment_duration': 0.0,
            'busiest_day': None,
            'peak_hours': None
        }

async def get_schedule_templates(teacher_id: UUID, db: AsyncSession) -> list:
    """Get schedule templates for a teacher"""
    return [
        {
            'id': 'template_1',
            'name': 'Standard Week',
            'description': 'Monday-Friday 9AM-5PM availability',
            'pattern': {
                'monday': [{'start': '09:00', 'end': '17:00'}],
                'tuesday': [{'start': '09:00', 'end': '17:00'}],
                'wednesday': [{'start': '09:00', 'end': '17:00'}],
                'thursday': [{'start': '09:00', 'end': '17:00'}],
                'friday': [{'start': '09:00', 'end': '17:00'}]
            },
            'is_default': True
        },
        {
            'id': 'template_2',
            'name': 'Flexible Hours',
            'description': 'Morning and evening availability',
            'pattern': {
                'monday': [{'start': '08:00', 'end': '12:00'}, {'start': '18:00', 'end': '21:00'}],
                'wednesday': [{'start': '08:00', 'end': '12:00'}, {'start': '18:00', 'end': '21:00'}],
                'friday': [{'start': '08:00', 'end': '12:00'}, {'start': '18:00', 'end': '21:00'}]
            },
            'is_default': False
        }
    ]


@router.post("/appointments")
async def create_appointment(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    student_email: str = Form(...),
    scheduled_start: str = Form(...),
    scheduled_end: str = Form(...),
    location: Optional[str] = Form(None),
    is_online: bool = Form(True),
    meeting_link: Optional[str] = Form(None),
    appointment_type: str = Form('consultation'),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new appointment with a student"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        student_query = text("SELECT id FROM users WHERE email = :email AND role = 'student'")
        student_result = await db.execute(student_query, {'email': student_email})
        student = student_result.mappings().fetchone()
        
        if not student:
            raise HTTPException(status_code=404, detail=f"Student with email {student_email} not found")
        
        try:
            start_dt = datetime.fromisoformat(scheduled_start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(scheduled_end.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format")
        
        if start_dt.tzinfo is not None:
            start_dt = start_dt.astimezone(timezone.utc).replace(tzinfo=None)
        if end_dt.tzinfo is not None:
            end_dt = end_dt.astimezone(timezone.utc).replace(tzinfo=None)
        
        if end_dt <= start_dt:
            raise HTTPException(status_code=400, detail="End time must be after start time")
        
        conflict_result = await check_schedule_conflicts(
            teacher_profile.id, start_dt, end_dt, None, db
        )
        
        if conflict_result['has_conflicts']:
            conflicts_summary = ', '.join([f"{c['title']} ({c['type']})" for c in conflict_result['conflicts']])
            raise HTTPException(
                status_code=400, 
                detail=f"Time slot conflicts with: {conflicts_summary}"
            )
        
        new_appointment = LiveSession(
            teacher_id=teacher_profile.id,
            title=title,
            description=description,
            session_type=appointment_type,
            session_mode='online' if is_online else 'in_person',
            scheduled_start=start_dt,
            scheduled_end=end_dt,
            location=location,
            meeting_link=meeting_link,
            max_participants=1,
            recording_enabled=False,
            is_recurring=False
        )
        
        db.add(new_appointment)
        await db.commit()
        await db.refresh(new_appointment)
        
        participant = SessionParticipant(
            session_id=new_appointment.id,
            student_id=UUID(student['id'])
        )
        
        db.add(participant)
        await db.commit()
        
        return {"message": "Appointment created successfully", "appointment_id": str(new_appointment.id)}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create appointment: {str(e)}")

@router.put("/appointments/{appointment_id}")
async def update_appointment(
    appointment_id: UUID,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    scheduled_start: Optional[str] = Form(None),
    scheduled_end: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    meeting_link: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing appointment"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        appointment = await db.get(LiveSession, appointment_id)
        if not appointment or appointment.teacher_id != teacher_profile.id:
            raise HTTPException(status_code=404, detail="Appointment not found")
        
        if appointment.session_type not in ['consultation', 'meeting']:
            raise HTTPException(status_code=400, detail="Not a valid appointment")
        
        update_data = {}
        
        if title is not None:
            update_data['title'] = title
        if description is not None:
            update_data['description'] = description
        if location is not None:
            update_data['location'] = location
        if meeting_link is not None:
            update_data['meeting_link'] = meeting_link
        if status is not None:
            update_data['status'] = status
            
        if scheduled_start is not None:
            try:
                start_dt = datetime.fromisoformat(scheduled_start.replace('Z', '+00:00'))
                if start_dt.tzinfo is not None:
                    start_dt = start_dt.astimezone(timezone.utc).replace(tzinfo=None)
                update_data['scheduled_start'] = start_dt
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start time format")
                
        if scheduled_end is not None:
            try:
                end_dt = datetime.fromisoformat(scheduled_end.replace('Z', '+00:00'))
                if end_dt.tzinfo is not None:
                    end_dt = end_dt.astimezone(timezone.utc).replace(tzinfo=None)
                update_data['scheduled_end'] = end_dt
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end time format")
        
        if 'scheduled_start' in update_data and 'scheduled_end' in update_data:
            if update_data['scheduled_end'] <= update_data['scheduled_start']:
                raise HTTPException(status_code=400, detail="End time must be after start time")
        
        if 'scheduled_start' in update_data or 'scheduled_end' in update_data:
            start_check = update_data.get('scheduled_start', appointment.scheduled_start)
            end_check = update_data.get('scheduled_end', appointment.scheduled_end)
            
            conflict_result = await check_schedule_conflicts(
                teacher_profile.id, start_check, end_check, appointment_id, db
            )
            
            if conflict_result['has_conflicts']:
                conflicts_summary = ', '.join([f"{c['title']} ({c['type']})" for c in conflict_result['conflicts']])
                raise HTTPException(
                    status_code=400, 
                    detail=f"Time slot conflicts with: {conflicts_summary}"
                )
        
        for field, value in update_data.items():
            setattr(appointment, field, value)
        
        await db.commit()
        await db.refresh(appointment)
        
        return {"message": "Appointment updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update appointment: {str(e)}")

@router.delete("/appointments/{appointment_id}")
async def delete_appointment(
    appointment_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an appointment"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        appointment = await db.get(LiveSession, appointment_id)
        if not appointment or appointment.teacher_id != teacher_profile.id:
            raise HTTPException(status_code=404, detail="Appointment not found")
        
        if appointment.session_type not in ['consultation', 'meeting']:
            raise HTTPException(status_code=400, detail="Not a valid appointment")
        
        participants_query = text("DELETE FROM session_participants WHERE session_id = :session_id")
        await db.execute(participants_query, {'session_id': str(appointment_id)})
        
        await db.delete(appointment)
        await db.commit()
        
        return {"message": "Appointment deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete appointment: {str(e)}")


@router.post("/availability")
async def create_availability_block(
    title: str = Form(...),
    day_of_week: str = Form(...),
    start_time: str = Form(...),
    end_time: str = Form(...),
    is_recurring: bool = Form(True),
    specific_date: Optional[str] = Form(None),
    buffer_minutes: int = Form(15),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create availability time block"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        if specific_date:
            try:
                date_obj = datetime.strptime(specific_date, '%Y-%m-%d').date()
                start_datetime = datetime.combine(date_obj, datetime.strptime(start_time, '%H:%M').time())
                end_datetime = datetime.combine(date_obj, datetime.strptime(end_time, '%H:%M').time())
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date or time format")
        else:
            today = datetime.now().date()
            days_mapping = {'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3, 
                          'friday': 4, 'saturday': 5, 'sunday': 6}
            
            if day_of_week.lower() not in days_mapping:
                raise HTTPException(status_code=400, detail="Invalid day of week")
            
            target_weekday = days_mapping[day_of_week.lower()]
            days_ahead = target_weekday - today.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            
            target_date = today + timedelta(days=days_ahead)
            start_datetime = datetime.combine(target_date, datetime.strptime(start_time, '%H:%M').time())
            end_datetime = datetime.combine(target_date, datetime.strptime(end_time, '%H:%M').time())
        
        start_datetime = start_datetime.replace(tzinfo=timezone.utc).replace(tzinfo=None)
        end_datetime = end_datetime.replace(tzinfo=timezone.utc).replace(tzinfo=None)
        
        if end_datetime <= start_datetime:
            raise HTTPException(status_code=400, detail="End time must be after start time")
        
        availability_block = LiveSession(
            teacher_id=teacher_profile.id,
            title=f"Available: {title}",
            description=notes,
            session_type='workshop',
            session_mode='online',
            scheduled_start=start_datetime,
            scheduled_end=end_datetime,
            status='scheduled',
            max_participants=5,
            recording_enabled=False,
            is_recurring=is_recurring
        )
        
        db.add(availability_block)
        await db.commit()
        await db.refresh(availability_block)
        
        return {"message": "Availability block created successfully", "block_id": str(availability_block.id)}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create availability block: {str(e)}")

@router.put("/availability/{block_id}")
async def update_availability_block(
    block_id: UUID,
    title: Optional[str] = Form(None),
    start_time: Optional[str] = Form(None),
    end_time: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update availability block"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        block = await db.get(LiveSession, block_id)
        if not block or block.teacher_id != teacher_profile.id:
            raise HTTPException(status_code=404, detail="Availability block not found")
        
        if block.session_type != 'workshop':
            raise HTTPException(status_code=400, detail="Not a valid availability block")
        
        update_data = {}
        
        if title is not None:
            update_data['title'] = f"Available: {title}"
        if notes is not None:
            update_data['description'] = notes
        if status is not None:
            if status not in ['scheduled', 'live', 'completed', 'cancelled']:
                raise HTTPException(status_code=400, detail="Invalid status")
            update_data['status'] = status
        
        if start_time is not None or end_time is not None:
            current_date = block.scheduled_start.date()
            
            if start_time is not None:
                try:
                    new_start = datetime.combine(current_date, datetime.strptime(start_time, '%H:%M').time())
                    update_data['scheduled_start'] = new_start.replace(tzinfo=timezone.utc).replace(tzinfo=None)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid start time format")
            
            if end_time is not None:
                try:
                    new_end = datetime.combine(current_date, datetime.strptime(end_time, '%H:%M').time())
                    update_data['scheduled_end'] = new_end.replace(tzinfo=timezone.utc).replace(tzinfo=None)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid end time format")
        
        for field, value in update_data.items():
            setattr(block, field, value)
        
        await db.commit()
        await db.refresh(block)
        
        return {"message": "Availability block updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update availability block: {str(e)}")

@router.delete("/availability/{block_id}")
async def delete_availability_block(
    block_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete availability block"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        block = await db.get(LiveSession, block_id)
        if not block or block.teacher_id != teacher_profile.id:
            raise HTTPException(status_code=404, detail="Availability block not found")
        
        if block.session_type != 'workshop':
            raise HTTPException(status_code=400, detail="Not a valid availability block")
        
        await db.delete(block)
        await db.commit()
        
        return {"message": "Availability block deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete availability block: {str(e)}")


async def check_schedule_conflicts(
    teacher_id: UUID, 
    start_time: datetime, 
    end_time: datetime, 
    exclude_session_id: Optional[UUID] = None,
    db: AsyncSession = None
) -> dict:
    """Check for scheduling conflicts across all session types"""
    try:
        conflict_query = text("""
            SELECT id, title, session_type, scheduled_start, scheduled_end, status
            FROM live_sessions 
            WHERE teacher_id = :teacher_id 
            AND status NOT IN ('cancelled', 'completed')
            AND (
                (scheduled_start <= :start_time AND scheduled_end > :start_time) OR
                (scheduled_start < :end_time AND scheduled_end >= :end_time) OR
                (scheduled_start >= :start_time AND scheduled_end <= :end_time)
            )
            AND (:exclude_id IS NULL OR id != :exclude_id)
        """)
        
        result = await db.execute(conflict_query, {
            'teacher_id': str(teacher_id),
            'start_time': start_time,
            'end_time': end_time,
            'exclude_id': str(exclude_session_id) if exclude_session_id else None
        })
        
        conflicts = result.mappings().fetchall()
        
        conflict_list = []
        for conflict in conflicts:
            conflict_list.append({
                'id': str(conflict.get('id')),
                'title': conflict.get('title'),
                'type': conflict.get('session_type'),
                'start_time': conflict.get('scheduled_start').isoformat() if conflict.get('scheduled_start') else None,
                'end_time': conflict.get('scheduled_end').isoformat() if conflict.get('scheduled_end') else None,
                'status': conflict.get('status')
            })
        
        return {
            'has_conflicts': len(conflict_list) > 0,
            'conflicts': conflict_list
        }
        
    except Exception as e:
        return {
            'has_conflicts': False,
            'conflicts': []
        }

@router.get("/schedule/conflicts")
async def check_conflicts_endpoint(
    start_time: str = Query(..., description="Start time in ISO format"),
    end_time: str = Query(..., description="End time in ISO format"),
    exclude_session_id: Optional[str] = Query(None, description="Session ID to exclude from conflict check"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Check for schedule conflicts in a given time range"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
        
        if start_dt.tzinfo is not None:
            start_dt = start_dt.astimezone(timezone.utc).replace(tzinfo=None)
        if end_dt.tzinfo is not None:
            end_dt = end_dt.astimezone(timezone.utc).replace(tzinfo=None)
        
        exclude_id = UUID(exclude_session_id) if exclude_session_id else None
        
        result = await check_schedule_conflicts(teacher_profile.id, start_dt, end_dt, exclude_id, db)
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check conflicts: {str(e)}")


@router.post("/schedule/bulk-apply-template")
async def bulk_apply_schedule_template(
    template_id: str = Form(...),
    start_date: str = Form(...),
    weeks_count: int = Form(4),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Apply a schedule template to create multiple availability blocks"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        templates = await get_schedule_templates(teacher_profile.id, db)
        template = next((t for t in templates if t['id'] == template_id), None)
        
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        try:
            start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start date format")
        
        created_blocks = []
        days_mapping = {'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3, 
                       'friday': 4, 'saturday': 5, 'sunday': 6}
        
        for week in range(weeks_count):
            week_start = start_date_obj + timedelta(weeks=week)
            
            for day_name, time_slots in template['pattern'].items():
                if day_name.lower() in days_mapping:
                    target_weekday = days_mapping[day_name.lower()]
                    days_ahead = target_weekday - week_start.weekday()
                    if days_ahead < 0:
                        days_ahead += 7
                    
                    target_date = week_start + timedelta(days=days_ahead)
                    
                    for slot in time_slots:
                        start_time = datetime.strptime(slot['start'], '%H:%M').time()
                        end_time = datetime.strptime(slot['end'], '%H:%M').time()
                        
                        start_datetime = datetime.combine(target_date, start_time)
                        end_datetime = datetime.combine(target_date, end_time)
                        
                        start_datetime = start_datetime.replace(tzinfo=timezone.utc).replace(tzinfo=None)
                        end_datetime = end_datetime.replace(tzinfo=timezone.utc).replace(tzinfo=None)
                        
                        conflict_result = await check_schedule_conflicts(
                            teacher_profile.id, start_datetime, end_datetime, None, db
                        )
                        
                        if not conflict_result['has_conflicts']:
                            availability_block = LiveSession(
                                teacher_id=teacher_profile.id,
                                title=f"Available: {template['name']}",
                                description=f"Auto-generated from {template['name']} template",
                                session_type='workshop',
                                session_mode='online',
                                scheduled_start=start_datetime,
                                scheduled_end=end_datetime,
                                status='scheduled',
                                max_participants=5,
                                recording_enabled=False,
                                is_recurring=False
                            )
                            
                            db.add(availability_block)
                            created_blocks.append({
                                'date': target_date.isoformat(),
                                'start_time': slot['start'],
                                'end_time': slot['end']
                            })
        
        await db.commit()
        
        return {
            "message": f"Template applied successfully",
            "created_blocks": len(created_blocks),
            "blocks": created_blocks
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to apply template: {str(e)}")

@router.post("/schedule/bulk-reschedule")
async def bulk_reschedule_appointments(
    session_ids: List[str] = Form(...),
    time_offset_hours: int = Form(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Bulk reschedule multiple appointments/sessions"""
    teacher_profile = await get_teacher_profile(current_user, db)
    
    try:
        session_uuids = []
        for session_id in session_ids:
            try:
                session_uuids.append(UUID(session_id))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid session ID: {session_id}")
        
        update_query = text("""
            UPDATE live_sessions 
            SET 
                scheduled_start = scheduled_start + INTERVAL ':offset hours',
                scheduled_end = scheduled_end + INTERVAL ':offset hours'
            WHERE id = ANY(:ids) AND teacher_id = :teacher_id
            RETURNING id, title
        """)
        
        result = await db.execute(update_query, {
            'offset': time_offset_hours,
            'ids': [str(sid) for sid in session_uuids],
            'teacher_id': str(teacher_profile.id)
        })
        
        updated_sessions = result.mappings().fetchall()
        await db.commit()
        
        return {
            "message": "Bulk reschedule completed successfully",
            "updated_sessions": len(updated_sessions),
            "sessions": [{'id': str(s['id']), 'title': s['title']} for s in updated_sessions]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to bulk reschedule: {str(e)}")

@router.get("/payments")
async def get_teacher_payments(
    search: str = Query("", description="Search in description or transactionId"),
    status_filter: str = Query("all", description="Filter by payment status"),
    type_filter: str = Query("all", description="Filter by payment type"),
    date_range: str = Query("all", description="Filter by date range"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get teacher's payment history with filters and pagination"""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(status_code=403, detail="Access denied")

    query = select(Payment).where(Payment.user_id == current_user.id)

    if search:
        query = query.where(or_(
            Payment.description.ilike(f"%{search}%"),
            Payment.id.ilike(f"%{search}%")
        ))
    if status_filter != "all":
        query = query.where(Payment.status == status_filter)
    if type_filter != "all":
        query = query.where(Payment.payment_type == type_filter)
    from datetime import datetime, timedelta
    now = datetime.now()
    if date_range == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.where(Payment.created_at >= start)
    elif date_range == "week":
        start = now - timedelta(days=now.weekday())
        query = query.where(Payment.created_at >= start)
    elif date_range == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.where(Payment.created_at >= start)
    elif date_range == "quarter":
        month = (now.month - 1) // 3 * 3 + 1
        start = now.replace(month=month, day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.where(Payment.created_at >= start)
    elif date_range == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        query = query.where(Payment.created_at >= start)

    total_query = query.with_only_columns(func.count()).order_by(None)
    total_count = (await db.execute(total_query)).scalar()

    query = query.order_by(desc(Payment.created_at)).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    payments = result.scalars().all()

    payment_list = []
    total_paid = 0
    total_pending = 0
    total_overdue = 0
    for p in payments:
        if p.status == 'paid' or p.status == 'completed':
            total_paid += float(p.amount)
        elif p.status == 'pending':
            total_pending += float(p.amount)
        elif p.status == 'overdue':
            total_overdue += float(p.amount)
        payment_list.append({
            "id": str(p.id),
            "transactionId": str(p.id),
            "amount": float(p.amount),
            "currency": p.currency or 'LKR',
            "type": p.payment_type,
            "description": p.description or '',
            "status": p.status,
            "paymentMethod": p.payment_method or '',
            "date": p.created_at.isoformat() if p.created_at else '',
            "dueDate": p.processed_at.isoformat() if p.processed_at else '',
            "receiptUrl": None,
        })
    summary = {
        "totalPaid": total_paid,
        "totalPending": total_pending,
        "totalOverdue": total_overdue,
        "totalPayments": total_count
    }
    return {
        "success": True,
        "data": {
            "payments": payment_list,
            "summary": summary,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total_count,
                "pages": (total_count + limit - 1) // limit
            }
        }
    }
