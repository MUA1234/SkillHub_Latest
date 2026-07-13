"""Public subject catalogue endpoints.

These back the frontend `lib/api.ts` methods `getSubjects()` and
`getSubjectCategories()`, which hit `/api/v1/subjects/` and
`/api/v1/subjects/categories`. The module did not exist before, so
`main.py`'s `from api.v1.endpoints.subjects import router` failed silently
and both calls 404'd.

Both handlers return **flat arrays** (not wrapped in `{success, data}`)
because the client types them as `Promise<any[]>` and iterates the JSON
directly. The role-specific `/students/subjects` and `/teachers/subjects`
endpoints (which return enriched, wrapped payloads with teacher/course
counts) are left untouched — this is the lightweight shared catalogue.
"""

from fastapi import APIRouter, Depends, HTTPException, status
import logging

from database.models import User
from database.supabase_client import SupabaseREST
from core.security import get_current_active_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
async def get_subjects(current_user: User = Depends(get_current_active_user)):
    """Return the active subject catalogue as a flat list, ordered by name."""
    try:
        subjects = SupabaseREST.select(
            "subjects", "*", {"is_active": True}, order="name.asc"
        ) or []
        return [
            {
                "id": str(s.get("id")),
                "name": s.get("name"),
                "description": s.get("description"),
                "category": s.get("category"),
            }
            for s in subjects
        ]
    except Exception as e:
        logger.error(f"Get subjects error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subjects: {str(e)}",
        )


@router.get("/categories")
async def get_subject_categories(current_user: User = Depends(get_current_active_user)):
    """Return the distinct, non-empty subject categories as a sorted flat
    list. Derived from the catalogue rather than a separate table so it can
    never drift out of sync with the subjects themselves."""
    try:
        subjects = SupabaseREST.select(
            "subjects", "category", {"is_active": True}
        ) or []
        categories = sorted({
            (s.get("category") or "").strip()
            for s in subjects
            if (s.get("category") or "").strip()
        })
        return categories
    except Exception as e:
        logger.error(f"Get subject categories error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subject categories: {str(e)}",
        )
