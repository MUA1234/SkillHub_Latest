"""
Phase I3 — Quizzes / examinations endpoints.

Teacher side (`/teachers/exams*`):
  - CRUD on the question bank (stored as `examinations.questions` jsonb)
  - Publish / unpublish
  - Review submissions (auto-graded MCQ + true/false; short-answer flagged
    `needs_review` so the teacher can score it manually)

Student side (`/students/exams*`):
  - List published exams for courses the student is enrolled in
  - Start an attempt (creates an `in_progress` examination_results row,
    snapshotting the student's accommodations)
  - Submit answers (auto-grades the auto-gradable parts, returns the
    score + per-question feedback, stamps `submitted_at`)
  - Fetch prior attempts and results

We never return the `correct_answer` field to students — the
`_sanitize_for_student` helper strips it before serialization.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()




def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        raise HTTPException(
            status_code=404,
            detail="Teacher profile not set up yet.",
        )
    return tp


def _require_student(user: User) -> None:
    if _role_value(user) != "student":
        raise HTTPException(status_code=403, detail="Student account required.")


def _sanitize_for_student(exam: Dict[str, Any]) -> Dict[str, Any]:
    """Strip teacher-only fields and the `correct_answer` from each
    question so a curious student can't read the answer key from the
    DOM / network response."""
    questions = exam.get("questions") or []
    safe_questions = []
    for q in questions:
        cleaned = {
            "id": q.get("id"),
            "type": q.get("type"),
            "prompt": q.get("prompt"),
            "marks": q.get("marks"),
        }
        if q.get("options"):
            cleaned["options"] = q.get("options")
        safe_questions.append(cleaned)
    return {
        "id": exam.get("id"),
        "course_id": exam.get("course_id"),
        "title": exam.get("title"),
        "description": exam.get("description"),
        "instructions": exam.get("instructions"),
        "duration_minutes": exam.get("duration_minutes"),
        "total_marks": exam.get("total_marks"),
        "passing_marks": exam.get("passing_marks"),
        "attempts_allowed": exam.get("attempts_allowed", 1),
        "available_from": exam.get("available_from"),
        "available_until": exam.get("available_until"),
        "randomize_questions": exam.get("randomize_questions"),
        "questions": safe_questions,
    }


def _grade_attempt(
    questions: List[Dict[str, Any]], answers: Dict[str, Any]
) -> Dict[str, Any]:
    """Auto-grade the parts we can. Returns marks_obtained + per-question
    feedback. Short-answer is flagged `needs_review` rather than scored.
    """
    total_marks = 0
    obtained = 0
    needs_review = False
    feedback: List[Dict[str, Any]] = []

    for q in questions:
        qid = q.get("id")
        qmarks = int(q.get("marks") or 0)
        total_marks += qmarks
        student = answers.get(qid)
        qtype = q.get("type")

        if qtype in ("mcq", "true_false"):
            correct = q.get("correct_answer")
            is_correct = False
            if isinstance(correct, list):
                if isinstance(student, list):
                    is_correct = sorted(map(str, student)) == sorted(map(str, correct))
            else:
                is_correct = str(student or "").strip() == str(correct or "").strip()
            if is_correct:
                obtained += qmarks
            feedback.append(
                {
                    "question_id": qid,
                    "correct": is_correct,
                    "marks_awarded": qmarks if is_correct else 0,
                    "explanation": q.get("explanation"),
                }
            )
        elif qtype == "short_answer":
            needs_review = True
            feedback.append(
                {
                    "question_id": qid,
                    "needs_review": True,
                    "marks_awarded": 0,
                    "explanation": q.get("explanation"),
                }
            )
        else:
            feedback.append({"question_id": qid, "skipped": True})

    percentage = round((obtained / total_marks) * 100, 2) if total_marks else 0.0
    return {
        "total_marks": total_marks,
        "marks_obtained": obtained,
        "percentage": percentage,
        "needs_review": needs_review,
        "feedback": feedback,
    }




class QuestionModel(BaseModel):
    id: str
    type: str = Field(..., pattern="^(mcq|short_answer|true_false)$")
    prompt: str
    marks: int = Field(ge=0)
    options: Optional[List[str]] = None
    correct_answer: Optional[Any] = None
    explanation: Optional[str] = None


class CreateExamPayload(BaseModel):
    course_id: str
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    duration_minutes: Optional[int] = 30
    passing_marks: Optional[int] = None
    attempts_allowed: int = 1
    randomize_questions: bool = False
    accepts_short_answer: bool = False
    available_from: Optional[str] = None
    available_until: Optional[str] = None
    questions: List[QuestionModel] = []


class UpdateExamPayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    duration_minutes: Optional[int] = None
    passing_marks: Optional[int] = None
    attempts_allowed: Optional[int] = None
    randomize_questions: Optional[bool] = None
    accepts_short_answer: Optional[bool] = None
    available_from: Optional[str] = None
    available_until: Optional[str] = None
    questions: Optional[List[QuestionModel]] = None
    is_published: Optional[bool] = None
    status: Optional[str] = None


class SubmitAttemptPayload(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict)




@router.get("/teachers/exams")
async def list_teacher_exams(
    course_id: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    tp = _require_teacher(current_user)
    filters: Dict[str, Any] = {"teacher_id": str(tp["id"])}
    if course_id:
        filters["course_id"] = course_id
    rows = SupabaseREST.select(
        "examinations", "*", filters, order="created_at.desc"
    ) or []
    return {"success": True, "exams": rows}


@router.post("/teachers/exams")
async def create_exam(
    payload: CreateExamPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    tp = _require_teacher(current_user)
    now = _now_iso()
    exam_date = payload.available_from or now

    questions_payload = [q.dict() for q in payload.questions]
    total_marks = sum(int(q.get("marks") or 0) for q in questions_payload)

    inserted = SupabaseREST.insert(
        "examinations",
        {
            "course_id": payload.course_id,
            "teacher_id": str(tp["id"]),
            "title": payload.title,
            "description": payload.description,
            "instructions": payload.instructions,
            "exam_date": exam_date,
            "duration_minutes": payload.duration_minutes or 30,
            "total_marks": total_marks,
            "passing_marks": payload.passing_marks,
            "attempts_allowed": payload.attempts_allowed,
            "randomize_questions": payload.randomize_questions,
            "accepts_short_answer": payload.accepts_short_answer,
            "available_from": payload.available_from,
            "available_until": payload.available_until,
            "questions": questions_payload,
            "is_published": False,
            "status": "draft",
            "created_at": now,
        },
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Could not create exam.")
    return {"success": True, "exam": inserted}


@router.get("/teachers/exams/{exam_id}")
async def get_teacher_exam(
    exam_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    tp = _require_teacher(current_user)
    exam = SupabaseREST.select_one("examinations", "*", {"id": exam_id})
    if not exam or str(exam.get("teacher_id")) != str(tp["id"]):
        raise HTTPException(status_code=404, detail="Exam not found.")
    return {"success": True, "exam": exam}


@router.patch("/teachers/exams/{exam_id}")
async def update_exam(
    exam_id: str,
    payload: UpdateExamPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    tp = _require_teacher(current_user)
    exam = SupabaseREST.select_one("examinations", "*", {"id": exam_id})
    if not exam or str(exam.get("teacher_id")) != str(tp["id"]):
        raise HTTPException(status_code=404, detail="Exam not found.")

    updates: Dict[str, Any] = {}
    data = payload.dict(exclude_unset=True)
    if "questions" in data and data["questions"] is not None:
        qs = [q.dict() if hasattr(q, "dict") else q for q in data["questions"]]
        updates["questions"] = qs
        updates["total_marks"] = sum(int(q.get("marks") or 0) for q in qs)
    for k, v in data.items():
        if k == "questions":
            continue
        updates[k] = v

    if "is_published" in updates and updates["is_published"]:
        updates["status"] = "published"
    elif "is_published" in updates and not updates["is_published"]:
        updates["status"] = "draft"

    updates["updated_at"] = _now_iso()
    SupabaseREST.update("examinations", updates, {"id": exam_id})
    return {"success": True}


@router.delete("/teachers/exams/{exam_id}")
async def delete_exam(
    exam_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    tp = _require_teacher(current_user)
    exam = SupabaseREST.select_one("examinations", "id,teacher_id", {"id": exam_id})
    if not exam or str(exam.get("teacher_id")) != str(tp["id"]):
        raise HTTPException(status_code=404, detail="Exam not found.")
    SupabaseREST.delete("examinations", {"id": exam_id})
    return {"success": True}


@router.get("/teachers/exams/{exam_id}/submissions")
async def list_submissions(
    exam_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    tp = _require_teacher(current_user)
    exam = SupabaseREST.select_one("examinations", "id,teacher_id", {"id": exam_id})
    if not exam or str(exam.get("teacher_id")) != str(tp["id"]):
        raise HTTPException(status_code=404, detail="Exam not found.")
    rows = SupabaseREST.select(
        "examination_results",
        "*",
        {"exam_id": exam_id},
        order="submitted_at.desc.nullslast",
    ) or []
    for r in rows:
        sid = r.get("student_id")
        if sid:
            p = SupabaseREST.select_one(
                "user_profiles", "first_name,last_name", {"user_id": str(sid)}
            ) or {}
            r["student_name"] = (
                f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
                or "Student"
            )
    return {"success": True, "submissions": rows}




@router.get("/students/exams")
async def list_student_exams(
    course_id: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """List published exams across all courses the student is enrolled in.
    If `course_id` is provided, the list is narrowed to that course."""
    _require_student(current_user)
    user_id = str(current_user.id)

    enrollments = SupabaseREST.select(
        "course_enrollments",
        "course_id,status",
        {"student_id": user_id},
    ) or []
    course_ids = [
        str(e["course_id"])
        for e in enrollments
        if e.get("course_id") and e.get("status") in (None, "active", "completed")
    ]
    if course_id and course_id not in course_ids:
        return {"success": True, "exams": []}
    if course_id:
        course_ids = [course_id]
    if not course_ids:
        return {"success": True, "exams": []}

    exams: List[Dict[str, Any]] = []
    for cid in course_ids:
        rows = SupabaseREST.select(
            "examinations",
            "id,course_id,title,description,duration_minutes,total_marks,"
            "passing_marks,attempts_allowed,available_from,available_until,"
            "is_published,status",
            {"course_id": cid, "is_published": True},
            order="created_at.desc",
        ) or []
        exams.extend(rows)
    return {"success": True, "exams": exams}


@router.get("/students/exams/{exam_id}")
async def get_student_exam(
    exam_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Return the student-safe exam payload (correct_answer stripped) +
    the student's accommodations for the exam's course."""
    _require_student(current_user)
    user_id = str(current_user.id)

    exam = SupabaseREST.select_one("examinations", "*", {"id": exam_id})
    if not exam or not exam.get("is_published"):
        raise HTTPException(status_code=404, detail="Exam not found.")

    enrol = SupabaseREST.select_one(
        "course_enrollments",
        "id,status",
        {"student_id": user_id, "course_id": str(exam["course_id"])},
    )
    if not enrol:
        raise HTTPException(status_code=403, detail="Not enrolled in this course.")

    accom = SupabaseREST.select_one(
        "student_course_accommodations",
        "*",
        {"student_id": user_id, "course_id": str(exam["course_id"])},
    ) or {}

    prior = SupabaseREST.select(
        "examination_results",
        "id,attempt_number,status,marks_obtained,percentage,submitted_at",
        {"exam_id": exam_id, "student_id": user_id},
        order="attempt_number.desc",
    ) or []

    return {
        "success": True,
        "exam": _sanitize_for_student(exam),
        "accommodations": {
            "extended_time_percentage": accom.get("extended_time_percentage", 0),
            "large_print": bool(accom.get("large_print")),
            "audio_version": bool(accom.get("audio_version")),
            "simplified_content": bool(accom.get("simplified_content")),
        },
        "prior_attempts": prior,
        "attempts_allowed": exam.get("attempts_allowed", 1),
    }


@router.post("/students/exams/{exam_id}/start")
async def start_exam_attempt(
    exam_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Open a new in-progress submission row. We snapshot the
    accommodations at start time so a mid-attempt change can't add or
    revoke time the student already planned around.
    """
    _require_student(current_user)
    user_id = str(current_user.id)

    exam = SupabaseREST.select_one("examinations", "*", {"id": exam_id})
    if not exam or not exam.get("is_published"):
        raise HTTPException(status_code=404, detail="Exam not found.")

    enrol = SupabaseREST.select_one(
        "course_enrollments",
        "id",
        {"student_id": user_id, "course_id": str(exam["course_id"])},
    )
    if not enrol:
        raise HTTPException(status_code=403, detail="Not enrolled in this course.")

    prior = SupabaseREST.select(
        "examination_results",
        "id,attempt_number,status",
        {"exam_id": exam_id, "student_id": user_id},
    ) or []
    completed_attempts = sum(
        1 for p in prior if p.get("status") in ("submitted", "graded")
    )
    if completed_attempts >= int(exam.get("attempts_allowed") or 1):
        raise HTTPException(status_code=400, detail="No attempts remaining.")

    accom = SupabaseREST.select_one(
        "student_course_accommodations",
        "*",
        {"student_id": user_id, "course_id": str(exam["course_id"])},
    ) or {}
    snapshot = {
        "extended_time_percentage": accom.get("extended_time_percentage", 0),
        "large_print": bool(accom.get("large_print")),
        "audio_version": bool(accom.get("audio_version")),
        "simplified_content": bool(accom.get("simplified_content")),
    }

    now = _now_iso()
    row = SupabaseREST.insert(
        "examination_results",
        {
            "exam_id": exam_id,
            "student_id": user_id,
            "status": "in_progress",
            "attempt_number": completed_attempts + 1,
            "started_at": now,
            "accommodations_applied": snapshot,
            "student_answers": {},
            "created_at": now,
        },
    )
    return {
        "success": True,
        "attempt": row,
        "accommodations": snapshot,
    }


@router.post("/students/exams/{exam_id}/submit")
async def submit_exam(
    exam_id: str,
    payload: SubmitAttemptPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Grade the auto-gradable parts, persist, return the result."""
    _require_student(current_user)
    user_id = str(current_user.id)

    exam = SupabaseREST.select_one("examinations", "*", {"id": exam_id})
    if not exam or not exam.get("is_published"):
        raise HTTPException(status_code=404, detail="Exam not found.")

    attempts = SupabaseREST.select(
        "examination_results",
        "*",
        {"exam_id": exam_id, "student_id": user_id, "status": "in_progress"},
        order="started_at.desc",
        limit=1,
    ) or []
    if not attempts:
        attempts = [
            SupabaseREST.insert(
                "examination_results",
                {
                    "exam_id": exam_id,
                    "student_id": user_id,
                    "status": "in_progress",
                    "attempt_number": 1,
                    "started_at": _now_iso(),
                    "accommodations_applied": {},
                    "student_answers": {},
                    "created_at": _now_iso(),
                },
            )
        ]
    attempt = attempts[0]

    grade = _grade_attempt(exam.get("questions") or [], payload.answers)
    passing = int(exam.get("passing_marks") or 0)
    is_passed = grade["marks_obtained"] >= passing if passing else None

    started = attempt.get("started_at")
    elapsed = None
    if started:
        try:
            started_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
            elapsed = int(
                (datetime.now(timezone.utc) - started_dt).total_seconds()
            )
        except Exception:
            elapsed = None

    SupabaseREST.update(
        "examination_results",
        {
            "student_answers": payload.answers,
            "marks_obtained": grade["marks_obtained"],
            "percentage": grade["percentage"],
            "is_passed": is_passed,
            "status": "needs_review" if grade["needs_review"] else "graded",
            "submitted_at": _now_iso(),
            "time_taken_seconds": elapsed,
        },
        {"id": str(attempt["id"])},
    )

    return {
        "success": True,
        "result": {
            "attempt_id": str(attempt["id"]),
            "total_marks": grade["total_marks"],
            "marks_obtained": grade["marks_obtained"],
            "percentage": grade["percentage"],
            "is_passed": is_passed,
            "needs_review": grade["needs_review"],
            "feedback": grade["feedback"],
        },
    }


@router.get("/students/exams/{exam_id}/results")
async def get_my_exam_results(
    exam_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    _require_student(current_user)
    rows = SupabaseREST.select(
        "examination_results",
        "*",
        {"exam_id": exam_id, "student_id": str(current_user.id)},
        order="attempt_number.desc",
    ) or []
    return {"success": True, "attempts": rows}
