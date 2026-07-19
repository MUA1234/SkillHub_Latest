"""
Accessibility API Endpoints

Provides endpoints for managing accessibility preferences, disability profiles,
teacher specializations, and related accessibility features.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, text
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import json
import uuid

from database.database import get_db
from core.security import get_current_user
from database.supabase_client import SupabaseREST

router = APIRouter()



class DisabilityProfileCreate(BaseModel):
    has_disability: bool = False
    disability_types: List[str] = []
    primary_disability: Optional[str] = None
    severity_levels: Dict[str, str] = {}
    professionally_diagnosed: bool = False
    diagnosis_date: Optional[datetime] = None
    iep_status: bool = False
    accommodation_letter: bool = False
    guardian_consent: bool = False
    guardian_email: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_relationship: Optional[str] = None
    additional_needs: Optional[str] = None
    share_with_teachers: bool = True
    share_with_sponsors: bool = False
    onboarding_completed: bool = False


class DisabilityProfileUpdate(BaseModel):
    has_disability: Optional[bool] = None
    disability_types: Optional[List[str]] = None
    primary_disability: Optional[str] = None
    severity_levels: Optional[Dict[str, str]] = None
    professionally_diagnosed: Optional[bool] = None
    guardian_consent: Optional[bool] = None
    guardian_email: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_relationship: Optional[str] = None
    additional_needs: Optional[str] = None
    share_with_teachers: Optional[bool] = None
    share_with_sponsors: Optional[bool] = None


class AccessibilityPreferencesCreate(BaseModel):
    font_family: str = "system"
    font_size: int = Field(default=100, ge=50, le=300)
    font_weight: str = "normal"
    letter_spacing: float = 0
    word_spacing: float = 0
    line_height: float = 1.5

    color_scheme: str = "default"
    background_color: str = "#ffffff"
    text_color: str = "#1a1a1a"
    link_color: str = "#0066cc"
    highlight_color: str = "#ffff00"

    color_blind_mode: str = "none"
    color_blind_strength: int = Field(default=100, ge=0, le=100)

    high_contrast: bool = False
    contrast_level: int = Field(default=100, ge=50, le=200)
    brightness_level: int = Field(default=100, ge=50, le=150)
    invert_colors: bool = False

    reduced_motion: bool = False
    disable_animations: bool = False
    disable_auto_play: bool = True
    disable_parallax: bool = False

    simplified_ui: bool = False
    large_click_targets: bool = False
    sticky_navigation: bool = True
    breadcrumbs_enabled: bool = True

    reading_mode: str = "standard"
    reading_guide: bool = False
    reading_ruler: bool = False
    text_mask: bool = False
    focus_highlight: bool = False

    screen_reader_optimized: bool = False
    text_to_speech: bool = False
    tts_voice: str = "default"
    tts_speed: float = Field(default=1.0, ge=0.5, le=2.0)
    tts_pitch: float = Field(default=1.0, ge=0.5, le=2.0)
    audio_descriptions: bool = True

    auto_captions: bool = True
    sign_language_videos: bool = False
    simplified_language: bool = False
    visual_learning_mode: bool = False
    step_by_step_mode: bool = False

    focus_mode: bool = False
    break_reminders: bool = False
    break_interval_minutes: int = 25
    progress_indicators: bool = True
    chunked_content: bool = False
    cognitive_load_indicator: bool = False

    keyboard_navigation: bool = False
    voice_input: bool = False
    switch_access: bool = False
    touch_accommodations: bool = False
    extended_time_default: bool = False

    math_visualization: bool = False
    calculator_always_visible: bool = False
    number_line_helper: bool = False
    step_by_step_math: bool = False

    spell_check_enhanced: bool = True
    grammar_suggestions: bool = True
    word_prediction: bool = False
    speech_to_text: bool = False

    quiet_mode: bool = False
    notification_sounds: bool = True
    visual_notifications: bool = True
    haptic_feedback: bool = False

    active_preset: str = "custom"


class AccessibilityPreferencesUpdate(BaseModel):
    font_family: Optional[str] = None
    font_size: Optional[int] = None
    font_weight: Optional[str] = None
    letter_spacing: Optional[float] = None
    word_spacing: Optional[float] = None
    line_height: Optional[float] = None
    color_scheme: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    link_color: Optional[str] = None
    highlight_color: Optional[str] = None
    color_blind_mode: Optional[str] = None
    color_blind_strength: Optional[int] = None
    high_contrast: Optional[bool] = None
    contrast_level: Optional[int] = None
    brightness_level: Optional[int] = None
    invert_colors: Optional[bool] = None
    reduced_motion: Optional[bool] = None
    disable_animations: Optional[bool] = None
    disable_auto_play: Optional[bool] = None
    disable_parallax: Optional[bool] = None
    simplified_ui: Optional[bool] = None
    large_click_targets: Optional[bool] = None
    sticky_navigation: Optional[bool] = None
    breadcrumbs_enabled: Optional[bool] = None
    reading_mode: Optional[str] = None
    reading_guide: Optional[bool] = None
    reading_ruler: Optional[bool] = None
    text_mask: Optional[bool] = None
    focus_highlight: Optional[bool] = None
    screen_reader_optimized: Optional[bool] = None
    text_to_speech: Optional[bool] = None
    tts_voice: Optional[str] = None
    tts_speed: Optional[float] = None
    tts_pitch: Optional[float] = None
    audio_descriptions: Optional[bool] = None
    auto_captions: Optional[bool] = None
    sign_language_videos: Optional[bool] = None
    simplified_language: Optional[bool] = None
    visual_learning_mode: Optional[bool] = None
    step_by_step_mode: Optional[bool] = None
    focus_mode: Optional[bool] = None
    break_reminders: Optional[bool] = None
    break_interval_minutes: Optional[int] = None
    progress_indicators: Optional[bool] = None
    chunked_content: Optional[bool] = None
    cognitive_load_indicator: Optional[bool] = None
    keyboard_navigation: Optional[bool] = None
    voice_input: Optional[bool] = None
    switch_access: Optional[bool] = None
    touch_accommodations: Optional[bool] = None
    extended_time_default: Optional[bool] = None
    math_visualization: Optional[bool] = None
    calculator_always_visible: Optional[bool] = None
    number_line_helper: Optional[bool] = None
    step_by_step_math: Optional[bool] = None
    spell_check_enhanced: Optional[bool] = None
    grammar_suggestions: Optional[bool] = None
    word_prediction: Optional[bool] = None
    speech_to_text: Optional[bool] = None
    quiet_mode: Optional[bool] = None
    notification_sounds: Optional[bool] = None
    visual_notifications: Optional[bool] = None
    haptic_feedback: Optional[bool] = None
    active_preset: Optional[str] = None


class TeacherSpecializationCreate(BaseModel):
    specializations: List[str] = []
    disability_experience: List[str] = []
    certifications: List[Dict[str, Any]] = []
    training_completed: List[Dict[str, Any]] = []
    years_special_education: int = 0
    teaching_methods: List[str] = []
    accommodation_strategies: Dict[str, Any] = {}
    assistive_tech_proficiency: List[str] = []
    sign_language_proficiency: Optional[str] = None
    braille_proficiency: Optional[str] = None
    aac_experience: bool = False
    accepts_iep_students: bool = True
    max_special_needs_students: int = 5


class GuardianLinkCreate(BaseModel):
    guardian_email: str
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    relationship: Optional[str] = None
    can_view_progress: bool = True
    can_view_grades: bool = True
    can_view_accessibility: bool = True
    can_communicate_teachers: bool = True
    can_modify_accessibility: bool = False
    receives_reports: bool = True
    report_frequency: str = "weekly"



@router.get("/disability-profile")
async def get_disability_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the current user's disability profile."""
    try:
        rows = SupabaseREST.select(
            "student_disability_profiles", "*", {"user_id": str(current_user.id)}
        ) or []
        if not rows:
            return {
                "success": True,
                "profile": None,
                "message": "No disability profile found. Please complete onboarding.",
            }
        return {"success": True, "profile": rows[0]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch disability profile: {str(e)}"
        )


@router.post("/disability-profile")
async def create_disability_profile(
    profile_data: DisabilityProfileCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create or update a disability profile for the current user."""
    try:
        result = await db.execute(
            text("""
            SELECT id FROM student_disability_profiles
            WHERE user_id = :user_id
            """),
            {"user_id": current_user.id}
        )
        existing = result.fetchone()

        profile_dict = profile_data.dict()
        profile_dict["severity_levels"] = json.dumps(profile_dict.get("severity_levels") or {})

        if existing:
            await db.execute(
                text("""
                UPDATE student_disability_profiles
                SET has_disability = :has_disability,
                    disability_types = :disability_types,
                    primary_disability = :primary_disability,
                    severity_levels = :severity_levels,
                    professionally_diagnosed = :professionally_diagnosed,
                    iep_status = :iep_status,
                    accommodation_letter = :accommodation_letter,
                    guardian_consent = :guardian_consent,
                    guardian_email = :guardian_email,
                    guardian_phone = :guardian_phone,
                    guardian_relationship = :guardian_relationship,
                    additional_needs = :additional_needs,
                    share_with_teachers = :share_with_teachers,
                    share_with_sponsors = :share_with_sponsors,
                    onboarding_completed = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id
                """),
                {
                    "user_id": current_user.id,
                    **profile_dict
                }
            )
        else:
            await db.execute(
                text("""
                INSERT INTO student_disability_profiles (
                    user_id, has_disability, disability_types, primary_disability,
                    severity_levels, professionally_diagnosed, iep_status,
                    accommodation_letter, guardian_consent, guardian_email,
                    guardian_phone, guardian_relationship, additional_needs,
                    share_with_teachers, share_with_sponsors, onboarding_completed
                ) VALUES (
                    :user_id, :has_disability, :disability_types, :primary_disability,
                    :severity_levels, :professionally_diagnosed, :iep_status,
                    :accommodation_letter, :guardian_consent, :guardian_email,
                    :guardian_phone, :guardian_relationship, :additional_needs,
                    :share_with_teachers, :share_with_sponsors, TRUE
                )
                """),
                {
                    "user_id": current_user.id,
                    **profile_dict
                }
            )

        await db.commit()

        return {
            "success": True,
            "message": "Disability profile saved successfully"
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save disability profile: {str(e)}"
        )



@router.get("/preferences")
async def get_accessibility_preferences(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the current user's accessibility preferences."""
    try:
        rows = SupabaseREST.select(
            "accessibility_preferences", "*", {"user_id": str(current_user.id)}
        ) or []
        if not rows:
            return {
                "success": True,
                "preferences": AccessibilityPreferencesCreate().dict(),
            }
        return {"success": True, "preferences": rows[0]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch accessibility preferences: {str(e)}"
        )


@router.post("/preferences")
async def save_accessibility_preferences(
    prefs: AccessibilityPreferencesCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create or update accessibility preferences for the current user."""
    try:
        result = await db.execute(
            """
            SELECT id FROM accessibility_preferences
            WHERE user_id = :user_id
            """,
            {"user_id": current_user.id}
        )
        existing = result.fetchone()

        prefs_dict = prefs.dict()

        if existing:
            set_clauses = ", ".join([f"{k} = :{k}" for k in prefs_dict.keys()])
            await db.execute(
                f"""
                UPDATE accessibility_preferences
                SET {set_clauses}, last_modified = CURRENT_TIMESTAMP
                WHERE user_id = :user_id
                """,
                {"user_id": current_user.id, **prefs_dict}
            )
        else:
            columns = ", ".join(["user_id"] + list(prefs_dict.keys()))
            values = ", ".join([":user_id"] + [f":{k}" for k in prefs_dict.keys()])
            await db.execute(
                f"""
                INSERT INTO accessibility_preferences ({columns})
                VALUES ({values})
                """,
                {"user_id": current_user.id, **prefs_dict}
            )

        await db.commit()

        return {
            "success": True,
            "message": "Accessibility preferences saved successfully"
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save accessibility preferences: {str(e)}"
        )


@router.patch("/preferences")
async def update_accessibility_preferences(
    updates: AccessibilityPreferencesUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Partially update accessibility preferences."""
    try:
        update_data = {k: v for k, v in updates.dict().items() if v is not None}

        if not update_data:
            return {
                "success": True,
                "message": "No updates provided"
            }

        result = await db.execute(
            """
            SELECT id FROM accessibility_preferences
            WHERE user_id = :user_id
            """,
            {"user_id": current_user.id}
        )
        existing = result.fetchone()

        if existing:
            set_clauses = ", ".join([f"{k} = :{k}" for k in update_data.keys()])
            await db.execute(
                f"""
                UPDATE accessibility_preferences
                SET {set_clauses}, last_modified = CURRENT_TIMESTAMP
                WHERE user_id = :user_id
                """,
                {"user_id": current_user.id, **update_data}
            )
        else:
            columns = ", ".join(["user_id"] + list(update_data.keys()))
            values = ", ".join([":user_id"] + [f":{k}" for k in update_data.keys()])
            await db.execute(
                f"""
                INSERT INTO accessibility_preferences ({columns})
                VALUES ({values})
                """,
                {"user_id": current_user.id, **update_data}
            )

        await db.commit()

        for key, value in update_data.items():
            await db.execute(
                """
                INSERT INTO accessibility_usage_logs (user_id, feature_name, action, new_value)
                VALUES (:user_id, :feature_name, 'updated', :new_value)
                """,
                {
                    "user_id": current_user.id,
                    "feature_name": key,
                    "new_value": str(value)
                }
            )
        await db.commit()

        return {
            "success": True,
            "message": "Preferences updated successfully"
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update preferences: {str(e)}"
        )



@router.get("/presets")
async def get_accessibility_presets(
    disability_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get available accessibility presets, optionally filtered by disability type."""
    try:
        if disability_type:
            result = await db.execute(
                """
                SELECT * FROM accessibility_presets
                WHERE is_system_preset = TRUE
                AND (disability_type = :disability_type OR disability_type IS NULL)
                ORDER BY name
                """,
                {"disability_type": disability_type}
            )
        else:
            result = await db.execute(
                """
                SELECT * FROM accessibility_presets
                WHERE is_system_preset = TRUE
                ORDER BY usage_count DESC, name
                """
            )

        presets = result.fetchall()

        return {
            "success": True,
            "presets": [dict(p._mapping) for p in presets]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch presets: {str(e)}"
        )


@router.post("/presets/{preset_id}/apply")
async def apply_accessibility_preset(
    preset_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Apply a preset to the current user's accessibility preferences."""
    try:
        result = await db.execute(
            """
            SELECT settings, name FROM accessibility_presets
            WHERE id = :preset_id
            """,
            {"preset_id": preset_id}
        )
        preset = result.fetchone()

        if not preset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Preset not found"
            )

        settings = preset.settings

        result = await db.execute(
            """
            SELECT id FROM accessibility_preferences
            WHERE user_id = :user_id
            """,
            {"user_id": current_user.id}
        )
        existing = result.fetchone()

        if existing:
            set_clauses = ", ".join([f"{k} = :{k}" for k in settings.keys()])
            await db.execute(
                f"""
                UPDATE accessibility_preferences
                SET {set_clauses}, active_preset = :preset_name, last_modified = CURRENT_TIMESTAMP
                WHERE user_id = :user_id
                """,
                {"user_id": current_user.id, "preset_name": preset.name, **settings}
            )
        else:
            columns = ", ".join(["user_id", "active_preset"] + list(settings.keys()))
            values = ", ".join([":user_id", ":preset_name"] + [f":{k}" for k in settings.keys()])
            await db.execute(
                f"""
                INSERT INTO accessibility_preferences ({columns})
                VALUES ({values})
                """,
                {"user_id": current_user.id, "preset_name": preset.name, **settings}
            )

        await db.execute(
            """
            UPDATE accessibility_presets
            SET usage_count = usage_count + 1
            WHERE id = :preset_id
            """,
            {"preset_id": preset_id}
        )

        await db.commit()

        return {
            "success": True,
            "message": f"Preset '{preset.name}' applied successfully",
            "settings": settings
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply preset: {str(e)}"
        )



@router.get("/teacher-specialization")
async def get_teacher_specialization(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the current teacher's specialization profile."""
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        result = await db.execute(
            text("""
            SELECT id FROM teacher_profiles
            WHERE user_id = :user_id
            """),
            {"user_id": current_user.id}
        )
        teacher = result.fetchone()

        if not teacher:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher profile not found"
            )

        result = await db.execute(
            text("""
            SELECT * FROM teacher_specializations
            WHERE teacher_id = :teacher_id
            """),
            {"teacher_id": teacher.id}
        )
        specialization = result.fetchone()

        return {
            "success": True,
            "specialization": dict(specialization._mapping) if specialization else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch teacher specialization: {str(e)}"
        )


@router.post("/teacher-specialization")
async def save_teacher_specialization(
    spec_data: TeacherSpecializationCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create or update teacher specialization profile."""
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    try:
        result = await db.execute(
            text("""
            SELECT id FROM teacher_profiles
            WHERE user_id = :user_id
            """),
            {"user_id": current_user.id}
        )
        teacher = result.fetchone()

        if not teacher:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Teacher profile not found"
            )

        result = await db.execute(
            text("""
            SELECT id FROM teacher_specializations
            WHERE teacher_id = :teacher_id
            """),
            {"teacher_id": teacher.id}
        )
        existing = result.fetchone()

        spec_dict = spec_data.dict()
        json_cols = {"certifications", "training_completed", "accommodation_strategies"}
        bind_params = {
            k: (json.dumps(v) if k in json_cols else v) for k, v in spec_dict.items()
        }

        if existing:
            set_clauses = ", ".join([f"{k} = :{k}" for k in spec_dict.keys()])
            await db.execute(
                text(f"""
                UPDATE teacher_specializations
                SET {set_clauses}, updated_at = CURRENT_TIMESTAMP
                WHERE teacher_id = :teacher_id
                """),
                {"teacher_id": teacher.id, **bind_params}
            )
        else:
            columns = ", ".join(["teacher_id"] + list(spec_dict.keys()))
            values = ", ".join([":teacher_id"] + [f":{k}" for k in spec_dict.keys()])
            await db.execute(
                text(f"""
                INSERT INTO teacher_specializations ({columns})
                VALUES ({values})
                """),
                {"teacher_id": teacher.id, **bind_params}
            )

        await db.commit()

        return {
            "success": True,
            "message": "Teacher specialization saved successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save teacher specialization: {str(e)}"
        )



@router.get("/teachers-by-specialization")
async def find_teachers_by_specialization(
    disability_type: Optional[str] = None,
    specialization: Optional[str] = None,
    verified_only: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Find teachers based on their disability specializations."""
    try:
        query = """
            SELECT
                tp.id as teacher_id,
                tp.user_id,
                up.first_name,
                up.last_name,
                up.avatar_url,
                tp.title,
                tp.average_rating,
                tp.total_reviews,
                tp.hourly_rate,
                ts.specializations,
                ts.disability_experience,
                ts.years_special_education,
                ts.sign_language_proficiency,
                ts.verified_specialist,
                ts.inclusion_rating
            FROM teacher_profiles tp
            JOIN user_profiles up ON tp.user_id = up.user_id
            LEFT JOIN teacher_specializations ts ON tp.id = ts.teacher_id
            WHERE 1=1
        """
        params = {}

        if disability_type:
            query += " AND :disability_type = ANY(ts.disability_experience)"
            params["disability_type"] = disability_type

        if specialization:
            query += " AND :specialization = ANY(ts.specializations)"
            params["specialization"] = specialization

        if verified_only:
            query += " AND ts.verified_specialist = TRUE"

        query += " ORDER BY ts.inclusion_rating DESC NULLS LAST, tp.average_rating DESC"

        result = await db.execute(query, params)
        teachers = result.fetchall()

        return {
            "success": True,
            "teachers": [dict(t._mapping) for t in teachers]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to find teachers: {str(e)}"
        )



@router.get("/guardian-links")
async def get_guardian_links(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get guardian links for the current student.

    Phase H — rewritten to use Supabase REST instead of the no-op SQLAlchemy
    session shim. The shape is unchanged so existing UI consumers keep
    working; the `verification_code` is intentionally stripped on the way
    out so a leaked dashboard response doesn't leak an active invite token.
    """
    from database.supabase_client import SupabaseREST

    try:
        rows = SupabaseREST.select(
            "guardian_links",
            "*",
            {
                "student_id": str(current_user.id),
                "is_active": True,
            },
            order="created_at.desc",
        ) or []

        sanitized = []
        for r in rows:
            row = dict(r)
            row.pop("verification_code", None)
            sanitized.append(row)

        return {
            "success": True,
            "guardian_links": sanitized,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch guardian links: {str(e)}"
        )


@router.post("/guardian-links")
async def create_guardian_link(
    link_data: GuardianLinkCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a guardian link + email the guardian an invite.

    Phase H — moved off the broken SQLAlchemy path to SupabaseREST.insert.
    The `verification_code` is generated server-side, persisted hashed to
    the row's column (the column is plain text in the existing schema for
    the verify URL — hashing would prevent the lookup), and embedded in
    the invite URL the guardian clicks. Email send is best-effort; a
    transient SMTP failure leaves the row in place so the student can
    re-trigger the email from their settings page later.
    """
    from datetime import datetime, timedelta, timezone
    import secrets as _secrets
    from database.supabase_client import SupabaseREST
    from services.email_service import send_guardian_invite_email
    from config import settings as _settings

    try:
        verification_code = _secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=14)

        inserted = SupabaseREST.insert(
            "guardian_links",
            {
                "student_id": str(current_user.id),
                "verification_code": verification_code,
                "invited_at": now.isoformat(),
                "expires_at": expires_at.isoformat(),
                "is_verified": False,
                "is_active": True,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                **link_data.dict(),
            },
        )

        if not inserted:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create guardian link.",
            )

        profile = SupabaseREST.select_one(
            "user_profiles",
            "first_name,last_name",
            {"user_id": str(current_user.id)},
        ) or {}
        student_name = (
            f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
            or current_user.email
            or "your student"
        )

        lang_row = SupabaseREST.select_one(
            "language_preferences",
            "preferred_language",
            {"user_id": str(current_user.id)},
        ) or {}
        lang = lang_row.get("preferred_language") or "en"

        base = (_settings.frontend_url or "").rstrip("/")
        invite_url = f"{base}/auth/guardian-verify?code={verification_code}"

        try:
            await send_guardian_invite_email(
                to_email=link_data.guardian_email,
                invite_url=invite_url,
                student_name=student_name,
                guardian_name=link_data.guardian_name,
                lang=lang,
            )
        except Exception as email_exc:
            return {
                "success": True,
                "message": "Guardian link created, but the invite email could not be sent.",
                "email_sent": False,
                "guardian_link_id": inserted.get("id"),
                "warning": str(email_exc),
            }

        return {
            "success": True,
            "message": "Guardian link created. An invite email has been sent.",
            "email_sent": True,
            "guardian_link_id": inserted.get("id"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create guardian link: {str(e)}"
        )



@router.get("/onboarding-status")
async def get_onboarding_status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if user has completed accessibility onboarding."""
    try:
        rows = SupabaseREST.select(
            "student_disability_profiles",
            "onboarding_completed",
            {"user_id": str(current_user.id)},
        ) or []
        return {
            "success": True,
            "onboarding_completed": bool(rows[0].get("onboarding_completed")) if rows else False,
            "has_profile": bool(rows),
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check onboarding status: {str(e)}"
        )



@router.get("/disability-types")
async def get_disability_types():
    """Get list of supported disability types with descriptions."""
    return {
        "success": True,
        "disability_types": [
            {
                "id": "dyslexia",
                "name": "Dyslexia",
                "category": "learning",
                "description": "A learning disorder that involves difficulty reading due to problems identifying speech sounds and learning how they relate to letters and words."
            },
            {
                "id": "dysgraphia",
                "name": "Dysgraphia",
                "category": "learning",
                "description": "A learning disability that affects writing abilities, including handwriting, typing, and spelling."
            },
            {
                "id": "dyscalculia",
                "name": "Dyscalculia",
                "category": "learning",
                "description": "A specific learning disability that affects a person's ability to understand numbers and learn math facts."
            },
            {
                "id": "adhd",
                "name": "ADHD",
                "category": "cognitive",
                "description": "Attention-deficit/hyperactivity disorder is a neurodevelopmental disorder characterized by inattention, hyperactivity, and impulsivity."
            },
            {
                "id": "asd",
                "name": "Autism Spectrum Disorder",
                "category": "developmental",
                "description": "A developmental disorder that affects communication and behavior, often involving repetitive behaviors and focused interests."
            },
            {
                "id": "intellectual_disability",
                "name": "Intellectual Disability",
                "category": "cognitive",
                "description": "A disability characterized by significant limitations in intellectual functioning and adaptive behavior."
            },
            {
                "id": "sld",
                "name": "Specific Learning Disorder",
                "category": "learning",
                "description": "A neurodevelopmental disorder that affects the ability to learn or use specific academic skills."
            },
            {
                "id": "visual_impairment_low_vision",
                "name": "Low Vision",
                "category": "visual",
                "description": "Visual impairment that cannot be fully corrected with glasses, contact lenses, or surgery."
            },
            {
                "id": "visual_impairment_blind",
                "name": "Blindness",
                "category": "visual",
                "description": "Complete or nearly complete vision loss."
            },
            {
                "id": "hearing_impairment_hard_of_hearing",
                "name": "Hard of Hearing",
                "category": "hearing",
                "description": "Partial hearing loss that may range from mild to severe."
            },
            {
                "id": "hearing_impairment_deaf",
                "name": "Deaf",
                "category": "hearing",
                "description": "Profound hearing loss with little to no functional hearing."
            },
            {
                "id": "physical_disability_mobility",
                "name": "Mobility Impairment",
                "category": "physical",
                "description": "Physical conditions that affect movement, including walking, coordination, and manual dexterity."
            },
            {
                "id": "physical_disability_no_limbs",
                "name": "Limb Difference",
                "category": "physical",
                "description": "Absence or difference in limbs that affects physical interaction with devices."
            },
            {
                "id": "color_vision_protanopia",
                "name": "Protanopia (Red-Blind)",
                "category": "color_vision",
                "description": "Color blindness where red cones are absent, making it difficult to distinguish red and green."
            },
            {
                "id": "color_vision_deuteranopia",
                "name": "Deuteranopia (Green-Blind)",
                "category": "color_vision",
                "description": "Color blindness where green cones are absent, making it difficult to distinguish red and green."
            },
            {
                "id": "color_vision_tritanopia",
                "name": "Tritanopia (Blue-Blind)",
                "category": "color_vision",
                "description": "Color blindness where blue cones are absent, making it difficult to distinguish blue and yellow."
            },
            {
                "id": "color_vision_achromatopsia",
                "name": "Achromatopsia (Complete Color Blindness)",
                "category": "color_vision",
                "description": "Complete color blindness, seeing only shades of gray."
            },
            {
                "id": "color_vision_protanomaly",
                "name": "Protanomaly (Red-Weak)",
                "category": "color_vision",
                "description": "Reduced sensitivity to red light."
            },
            {
                "id": "color_vision_deuteranomaly",
                "name": "Deuteranomaly (Green-Weak)",
                "category": "color_vision",
                "description": "Reduced sensitivity to green light. Most common form of color blindness."
            },
            {
                "id": "color_vision_tritanomaly",
                "name": "Tritanomaly (Blue-Weak)",
                "category": "color_vision",
                "description": "Reduced sensitivity to blue light."
            }
        ]
    }
