"""
Language Preference API Endpoints
Handles saving, fetching, and managing user language preferences
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import logging

try:
    from backend.core.security import get_current_active_user
    from backend.database.supabase_client import SupabaseREST
    from backend.database.models import User
except ImportError:
    from core.security import get_current_active_user
    from database.supabase_client import SupabaseREST
    from database.models import User

router = APIRouter(prefix="/language", tags=["language"])
logger = logging.getLogger(__name__)


class LanguagePreferenceCreate(BaseModel):
    preferred_language: str
    fallback_language: Optional[str] = "en"
    date_format: Optional[str] = "MM/DD/YYYY"
    time_format: Optional[str] = "12h"
    timezone: Optional[str] = "UTC"
    currency: Optional[str] = "USD"
    number_format: Optional[str] = "en-US"
    auto_translate: Optional[bool] = False
    show_original_content: Optional[bool] = True


class LanguagePreferenceUpdate(BaseModel):
    preferred_language: Optional[str] = None
    fallback_language: Optional[str] = None
    date_format: Optional[str] = None
    time_format: Optional[str] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None
    number_format: Optional[str] = None
    auto_translate: Optional[bool] = None
    show_original_content: Optional[bool] = None


class SupportedLanguage(BaseModel):
    code: str
    name: str
    native_name: str
    direction: str
    flag_emoji: Optional[str] = None
    is_beta: bool = False


@router.get("/supported")
async def get_supported_languages():
    """Get list of all supported languages"""
    try:
        languages = SupabaseREST.select(
            "supported_languages",
            "*",
            {"is_active": True},
            order="sort_order.asc"
        )
        
        return {
            "success": True,
            "data": {
                "languages": languages,
                "total": len(languages)
            }
        }
    except Exception as e:
        logger.error(f"Error fetching supported languages: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch supported languages"
        )


@router.get("/preference")
async def get_language_preference(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user's language preference"""
    try:
        user_id = str(current_user.id)
        
        preference = SupabaseREST.select_one(
            "language_preferences",
            "*",
            {"user_id": user_id}
        )
        
        if preference:
            return {
                "success": True,
                "data": {
                    "user_id": user_id,
                    "preferred_language": preference.get("preferred_language", "en"),
                    "fallback_language": preference.get("fallback_language", "en"),
                    "date_format": preference.get("date_format", "MM/DD/YYYY"),
                    "time_format": preference.get("time_format", "12h"),
                    "timezone": preference.get("timezone", "UTC"),
                    "currency": preference.get("currency", "USD"),
                    "number_format": preference.get("number_format", "en-US"),
                    "auto_translate": preference.get("auto_translate", False),
                    "show_original_content": preference.get("show_original_content", True),
                    "updated_at": preference.get("updated_at")
                }
            }
        
        user_settings = SupabaseREST.select_one(
            "user_settings",
            "preferred_language,language",
            {"user_id": user_id}
        )
        
        fallback_language = user_settings.get("preferred_language") or user_settings.get("language", "en") if user_settings else "en"
        
        return {
            "success": True,
            "data": {
                "user_id": user_id,
                "preferred_language": fallback_language,
                "fallback_language": "en",
                "date_format": "MM/DD/YYYY",
                "time_format": "12h",
                "timezone": "UTC",
                "currency": "USD",
                "number_format": "en-US",
                "auto_translate": False,
                "show_original_content": True
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching language preference: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch language preference: {str(e)}"
        )


@router.post("/preference")
async def save_language_preference(
    preference: LanguagePreferenceCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Save or update user's language preference"""
    try:
        user_id = str(current_user.id)
        
        existing = SupabaseREST.select_one(
            "language_preferences",
            "id",
            {"user_id": user_id}
        )
        
        preference_data = {
            "user_id": user_id,
            "preferred_language": preference.preferred_language,
            "fallback_language": preference.fallback_language,
            "date_format": preference.date_format,
            "time_format": preference.time_format,
            "timezone": preference.timezone,
            "currency": preference.currency,
            "number_format": preference.number_format,
            "auto_translate": preference.auto_translate,
            "show_original_content": preference.show_original_content,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if existing:
            SupabaseREST.update(
                "language_preferences",
                preference_data,
                {"user_id": user_id}
            )
        else:
            SupabaseREST.insert("language_preferences", preference_data)
        
        try:
            SupabaseREST.update(
                "user_settings",
                {
                    "preferred_language": preference.preferred_language,
                    "language": preference.preferred_language,
                    "language_updated_at": datetime.utcnow().isoformat()
                },
                {"user_id": user_id}
            )
        except:
            pass
        
        try:
            SupabaseREST.update(
                "user_profiles",
                {"preferred_language": preference.preferred_language},
                {"user_id": user_id}
            )
        except:
            pass
        
        return {
            "success": True,
            "message": "Language preference saved successfully",
            "data": {
                "user_id": user_id,
                "preferred_language": preference.preferred_language
            }
        }
        
    except Exception as e:
        logger.error(f"Error saving language preference: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save language preference: {str(e)}"
        )


@router.patch("/preference")
async def update_language_preference(
    preference: LanguagePreferenceUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """Partially update user's language preference"""
    try:
        user_id = str(current_user.id)
        
        update_data = {
            k: v for k, v in preference.dict(exclude_unset=True).items()
            if v is not None
        }
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        SupabaseREST.update(
            "language_preferences",
            update_data,
            {"user_id": user_id}
        )
        
        if "preferred_language" in update_data:
            try:
                SupabaseREST.update(
                    "user_settings",
                    {
                        "preferred_language": update_data["preferred_language"],
                        "language": update_data["preferred_language"]
                    },
                    {"user_id": user_id}
                )
                SupabaseREST.update(
                    "user_profiles",
                    {"preferred_language": update_data["preferred_language"]},
                    {"user_id": user_id}
                )
            except:
                pass
        
        return {
            "success": True,
            "message": "Language preference updated successfully",
            "data": update_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating language preference: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update language preference: {str(e)}"
        )


@router.get("/user-settings")
async def get_user_language_settings(
    current_user: User = Depends(get_current_active_user)
):
    """Get comprehensive user language settings (uses view)"""
    try:
        user_id = str(current_user.id)
        
        settings = SupabaseREST.select_one(
            "user_language_settings",
            "*",
            {"user_id": user_id}
        )
        
        if settings:
            return {
                "success": True,
                "data": settings
            }
        
        return {
            "success": True,
            "data": {
                "user_id": user_id,
                "preferred_language": "en",
                "language_name": "English",
                "language_native_name": "English",
                "text_direction": "ltr",
                "flag_emoji": "🇺🇸"
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching user language settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user language settings: {str(e)}"
        )


@router.post("/quick-change/{language_code}")
async def quick_change_language(
    language_code: str,
    current_user: User = Depends(get_current_active_user)
):
    """Quick endpoint to change just the language (for language switcher)"""
    try:
        user_id = str(current_user.id)
        
        supported_lang = SupabaseREST.select_one(
            "supported_languages",
            "*",
            {"code": language_code, "is_active": True}
        )
        
        if not supported_lang:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Language code '{language_code}' is not supported"
            )
        
        try:
            SupabaseREST.update(
                "language_preferences",
                {
                    "preferred_language": language_code,
                    "updated_at": datetime.utcnow().isoformat()
                },
                {"user_id": user_id}
            )
        except:
            SupabaseREST.insert(
                "language_preferences",
                {
                    "user_id": user_id,
                    "preferred_language": language_code
                }
            )
        
        try:
            SupabaseREST.update(
                "user_settings",
                {
                    "preferred_language": language_code,
                    "language": language_code,
                    "language_updated_at": datetime.utcnow().isoformat()
                },
                {"user_id": user_id}
            )
        except:
            pass
        
        return {
            "success": True,
            "message": f"Language changed to {supported_lang.get('native_name')}",
            "data": {
                "language_code": language_code,
                "language_name": supported_lang.get("name"),
                "native_name": supported_lang.get("native_name"),
                "flag_emoji": supported_lang.get("flag_emoji")
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing language: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to change language: {str(e)}"
        )
