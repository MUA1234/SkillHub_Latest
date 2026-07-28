from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging
import hashlib
import secrets

from pydantic import BaseModel, EmailStr, Field

from database.database import get_db
from database.models import User, UserProfile, UserRole
from database.supabase_client import SupabaseService, SupabaseREST
from schemas.user_schemas import UserCreate, UserLogin, Token, User as UserSchema
from core.security import (
    create_access_token,
    verify_password,
    get_password_hash,
    get_current_active_user,
    set_auth_cookie,
    clear_auth_cookie,
)
from services.email_service import (
    send_verification_email,
    send_password_reset_email,
    send_welcome_email,
)
from services import track_matching
from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)



EMAIL_VERIFICATION_TTL = timedelta(hours=24)
PASSWORD_RESET_TTL = timedelta(hours=1)


def _hash_token(token: str) -> str:
    """One-way hash so the DB row is useless on its own."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate_token() -> str:
    """Cryptographically random URL-safe token (~43 chars)."""
    return secrets.token_urlsafe(32)


def _frontend_link(path: str, token: str) -> str:
    base = settings.frontend_url.rstrip("/")
    return f"{base}{path}?token={token}"


def _resolve_lang_for_user(user_id: str) -> str:
    """Look up the user's stored language preference; default to English."""
    try:
        row = SupabaseREST.select_one(
            "language_preferences", "preferred_language", {"user_id": user_id}
        )
        if row and row.get("preferred_language"):
            return row["preferred_language"]
    except Exception:
        pass
    return "en"


async def _issue_verification_email(user_id: str, email: str, first_name: Optional[str]) -> None:
    """Best-effort: insert a token row + send the email. Failures are logged."""
    raw_token = _generate_token()
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + EMAIL_VERIFICATION_TTL

    try:
        SupabaseREST.insert(
            "email_verification_tokens",
            {
                "user_id": user_id,
                "token_hash": token_hash,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as exc:
        logger.error("Failed to persist verification token for %s: %s", email, exc)
        return

    link = _frontend_link("/auth/verify-email", raw_token)
    lang = _resolve_lang_for_user(user_id)
    await send_verification_email(
        to_email=email,
        verification_url=link,
        first_name=first_name,
        lang=lang,
    )



@router.post("/register", response_model=UserSchema)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    logger.info(f"Registration attempt for: {user.email} as {user.role}")

    try:
        created_user = await SupabaseService.create_user(
            email=user.email,
            password=user.password,
            role=user.role.value if hasattr(user.role, "value") else user.role,
            first_name=user.first_name,
            last_name=user.last_name,
        )

        if not created_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered or registration failed",
            )

        class DatabaseUser:
            def __init__(self, data: dict):
                self.id = data["id"]
                self.email = data["email"]
                self.role = UserRole(data["role"])
                self.is_verified = data.get("is_verified", False)
                self.is_active = data.get("is_active", True)
                self.created_at = data.get("created_at")
                self.updated_at = data.get("updated_at")

        db_user = DatabaseUser(created_user)

        try:
            user_id = str(created_user["id"])
            SupabaseREST.insert(
                "language_preferences",
                {
                    "user_id": user_id,
                    "preferred_language": "en",
                    "fallback_language": "en",
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )
        except Exception as lang_error:
            logger.warning(f"⚠️ Could not create language preference for {user.email}: {lang_error}")

        try:
            await _issue_verification_email(
                user_id=str(created_user["id"]),
                email=user.email,
                first_name=user.first_name,
            )
        except Exception as exc:
            logger.warning("Verification email pipeline failed for %s: %s", user.email, exc)

        logger.info(f"✅ User registered successfully in database: {user.email} as {user.role}")
        return db_user

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Supabase registration failed for {user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again later.",
        )


@router.get("/check-email")
async def check_email(email: str):
    """Public pre-signup check: is this email already registered?

    Returns {"available": bool}. Fails open (available=True) on any lookup
    hiccup so a transient error never blocks signup — register() still rejects
    duplicates as the authoritative backstop.
    """
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        return {"available": False, "email": email, "reason": "invalid"}
    try:
        existing = await SupabaseService.get_user_by_email(normalized)
        return {"available": existing is None, "email": normalized}
    except Exception as e:
        logger.warning("check-email lookup failed for %s: %s", normalized, e)
        return {"available": True, "email": normalized}



def _enrich_user_with_tracks(user) -> None:
    """Attach accessibility-track fields to a user object in place so the login
    response / `/me` carry enough for the client to route to the right
    dashboard. Best-effort — never let a lookup hiccup break auth."""
    try:
        role = getattr(user, "role", None)
        role_val = role.value if hasattr(role, "value") else role
        if role_val == "student":
            user.accessibility_track = track_matching.get_student_primary_track(str(user.id))
        elif role_val == "teacher":
            info = track_matching.get_teacher_specialist_status(str(user.id))
            user.teaching_tracks = info["teaching_tracks"]
            user.verified_specialist = info["verified_specialist"]
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(f"⚠️ Track enrichment failed for {getattr(user, 'id', None)}: {exc}")


@router.post("/login", response_model=Token)
async def login(
    user_credentials: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    logger.info(f"Login attempt for: {user_credentials.email}")

    try:
        authenticated_user = await SupabaseService.authenticate_user(
            email=user_credentials.email,
            password=user_credentials.password,
        )

        if not authenticated_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_profile = None
        user_role = authenticated_user.get("role")
        user_id = authenticated_user["id"]

        try:
            import requests

            headers = {
                "apikey": settings.supabase_key,
                "Authorization": f"Bearer {settings.supabase_key}",
                "Content-Type": "application/json",
            }

            if user_role == "sponsor":
                sponsor_url = f"{settings.supabase_url}/rest/v1/sponsor_profiles?user_id=eq.{user_id}&select=*"
                sponsor_response = requests.get(sponsor_url, headers=headers, timeout=10)

                if sponsor_response.status_code == 200:
                    sponsor_data = sponsor_response.json()
                    if sponsor_data:
                        data = sponsor_data[0]

                        class SponsorProfile:
                            def __init__(self, d):
                                self.id = str(d.get("id", ""))
                                self.user_id = str(d.get("user_id", ""))
                                self.first_name = d.get("company_name", "")
                                self.last_name = ""
                                self.phone = d.get("contact_phone", "")
                                self.date_of_birth = None
                                self.location = None
                                self.bio = d.get("description", "")
                                self.avatar_url = d.get("logo_url", "")
                                self.university = None
                                self.student_id = None
                                self.major = None
                                self.year = None
                                self.gpa = None
                                self.reputation_score = 0
                                self.created_at = d.get("created_at")
                                self.updated_at = d.get("updated_at")

                        user_profile = SponsorProfile(data)
            else:
                profile_url = f"{settings.supabase_url}/rest/v1/user_profiles?user_id=eq.{user_id}&select=*"
                profile_response = requests.get(profile_url, headers=headers, timeout=10)

                if profile_response.status_code == 200:
                    profile_data = profile_response.json()
                    if profile_data:
                        data = profile_data[0]

                        class RestUserProfile:
                            def __init__(self, d):
                                self.id = str(d.get("id", ""))
                                self.user_id = str(d.get("user_id", ""))
                                self.first_name = d.get("first_name", "")
                                self.last_name = d.get("last_name", "")
                                self.phone = d.get("phone", "")
                                self.date_of_birth = d.get("date_of_birth")
                                self.location = d.get("location", "")
                                self.bio = d.get("bio", "")
                                self.avatar_url = d.get("avatar_url", "")
                                self.university = d.get("university", "")
                                self.student_id = d.get("student_id", "")
                                self.major = d.get("major", "")
                                self.year = d.get("year", "")
                                self.gpa = d.get("gpa")
                                self.reputation_score = d.get("reputation_score", 0)
                                self.created_at = d.get("created_at")
                                self.updated_at = d.get("updated_at")

                        user_profile = RestUserProfile(data)
        except Exception as profile_error:
            logger.warning(f"⚠️ Could not fetch profile for {authenticated_user['email']}: {profile_error}")

        class DatabaseUser:
            def __init__(self, data: dict, profile=None):
                self.id = data["id"]
                self.email = data["email"]
                self.role = UserRole(data["role"])
                self.is_verified = data.get("is_verified", False)
                self.is_active = data.get("is_active", True)
                self.created_at = data.get("created_at")
                self.updated_at = data.get("updated_at")
                self.profile = profile

        user = DatabaseUser(authenticated_user, user_profile)
        _enrich_user_with_tracks(user)

        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = create_access_token(
            data={"sub": str(user.id)}, expires_delta=access_token_expires
        )

        set_auth_cookie(response, access_token, max_age_seconds=int(access_token_expires.total_seconds()))

        logger.info(f"✅ Successful login from database: {user.email} as {user.role}")
        return Token(access_token=access_token, user=user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Supabase authentication failed for {user_credentials.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/logout")
async def logout(response: Response):
    """Clear the auth cookie. Stateless JWT, so nothing else to invalidate yet."""
    clear_auth_cookie(response)
    return {"success": True}


@router.get("/me", response_model=UserSchema)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    _enrich_user_with_tracks(current_user)
    return current_user


@router.post("/refresh")
async def refresh_token(
    response: Response, current_user: User = Depends(get_current_active_user)
):
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(current_user.id)}, expires_delta=access_token_expires
    )
    set_auth_cookie(response, access_token, max_age_seconds=int(access_token_expires.total_seconds()))
    return {"access_token": access_token, "token_type": "bearer"}



class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


@router.get("/verify-email")
@router.post("/verify-email")
async def verify_email(token: Optional[str] = None, payload: Optional[VerifyEmailRequest] = None):
    """Consume an email verification token. Sets users.is_verified = true."""
    raw_token = token or (payload.token if payload else None)
    if not raw_token:
        raise HTTPException(status_code=400, detail="Missing verification token")

    token_hash = _hash_token(raw_token)
    row = SupabaseREST.select_one(
        "email_verification_tokens",
        "id,user_id,expires_at,verified_at",
        {"token_hash": token_hash},
    )
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    if row.get("verified_at"):
        return {"success": True, "already_verified": True}

    expires_at_raw = row.get("expires_at") or ""
    try:
        expires_at = datetime.fromisoformat(expires_at_raw.replace("Z", "+00:00"))
    except ValueError:
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification link expired. Please request a new one.")

    now_iso = datetime.now(timezone.utc).isoformat()
    SupabaseREST.update(
        "email_verification_tokens",
        {"verified_at": now_iso},
        {"id": row["id"]},
    )
    SupabaseREST.update(
        "users",
        {"is_verified": True, "updated_at": now_iso},
        {"id": row["user_id"]},
    )

    logger.info("✅ Email verified for user_id=%s", row["user_id"])

    try:
        user_record = SupabaseREST.select_one(
            "users", "id,email,role", {"id": row["user_id"]}
        )
        if user_record and user_record.get("email"):
            profile = SupabaseREST.select_one(
                "user_profiles", "first_name", {"user_id": str(row["user_id"])}
            )
            await send_welcome_email(
                to_email=user_record["email"],
                first_name=(profile or {}).get("first_name"),
                role=user_record.get("role"),
                lang=_resolve_lang_for_user(str(row["user_id"])),
            )
    except Exception as exc:
        logger.warning("Welcome email skipped for user_id=%s: %s", row["user_id"], exc)

    return {"success": True}


@router.post("/resend-verification")
async def resend_verification(payload: ResendVerificationRequest):
    user = await SupabaseService.get_user_by_email(payload.email)
    if not user or user.get("is_verified"):
        return {"success": True}

    profile = SupabaseREST.select_one(
        "user_profiles", "first_name", {"user_id": str(user["id"])}
    )
    first_name = profile.get("first_name") if profile else None
    await _issue_verification_email(
        user_id=str(user["id"]),
        email=user["email"],
        first_name=first_name,
    )
    return {"success": True}



class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=200)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    """Issue a one-time reset token + email the link.

    Always returns success to prevent email enumeration.
    """
    user = await SupabaseService.get_user_by_email(payload.email)
    if not user:
        return {"success": True}

    raw_token = _generate_token()
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)
    expires_at = now + PASSWORD_RESET_TTL
    request_ip = request.client.host if request.client else None

    try:
        SupabaseREST.update(
            "password_reset_tokens",
            {"used_at": now.isoformat()},
            {"user_id": str(user["id"]), "used_at.is": "null"},
        )
    except Exception as exc:
        logger.warning("Could not invalidate prior reset tokens for user %s: %s", user["id"], exc)

    try:
        SupabaseREST.insert(
            "password_reset_tokens",
            {
                "user_id": str(user["id"]),
                "token_hash": token_hash,
                "expires_at": expires_at.isoformat(),
                "created_at": now.isoformat(),
                "request_ip": request_ip,
            },
        )
    except Exception as exc:
        logger.error("Failed to persist password reset token for %s: %s", payload.email, exc)
        return {"success": True}

    profile = SupabaseREST.select_one(
        "user_profiles", "first_name", {"user_id": str(user["id"])}
    )
    first_name = profile.get("first_name") if profile else None

    link = _frontend_link("/auth/reset-password", raw_token)
    lang = _resolve_lang_for_user(str(user["id"]))
    await send_password_reset_email(
        to_email=user["email"],
        reset_url=link,
        first_name=first_name,
        lang=lang,
    )
    return {"success": True}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    token_hash = _hash_token(payload.token)
    row = SupabaseREST.select_one(
        "password_reset_tokens",
        "id,user_id,expires_at,used_at",
        {"token_hash": token_hash},
    )
    if not row or row.get("used_at"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    expires_at_raw = row.get("expires_at") or ""
    try:
        expires_at = datetime.fromisoformat(expires_at_raw.replace("Z", "+00:00"))
    except ValueError:
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link expired. Please request a new one.")

    new_hash = get_password_hash(payload.new_password)
    now_iso = datetime.now(timezone.utc).isoformat()

    SupabaseREST.update(
        "users",
        {"password_hash": new_hash, "updated_at": now_iso},
        {"id": row["user_id"]},
    )
    SupabaseREST.update(
        "password_reset_tokens",
        {"used_at": now_iso},
        {"id": row["id"]},
    )

    logger.info("✅ Password reset for user_id=%s", row["user_id"])
    return {"success": True}
