"""
User-facing content moderation report submission.

The `reports` table is the same one the L4 admin queue reads from. Until
this endpoint landed, the admin moderation queue was unreachable — the
table had no writers. Anyone with an account can submit; reports are
authenticated by JWT so we always have a reporter_id.

Status starts at `pending` (the schema default). The admin listing query
in `admin.py` filters on `pending`/`open` so freshly-submitted reports
show up in the queue immediately.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()


VALID_CATEGORIES = {
    "spam",
    "harassment",
    "hate_speech",
    "inappropriate",
    "misinformation",
    "other",
}


class ReportSubmission(BaseModel):
    category: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=5, max_length=4000)
    reported_user_id: Optional[str] = None
    reported_post_id: Optional[str] = None
    reported_message_id: Optional[str] = None


@router.post("/students/reports")
async def submit_report(
    payload: ReportSubmission,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Submit a moderation report. Open to any authenticated user, not
    just students — the path is `/students/*` only because that's the
    main reporter surface today; teachers and sponsors can hit it too."""
    category = payload.category.lower().strip()
    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {sorted(VALID_CATEGORIES)}",
        )
    if not any([
        payload.reported_user_id,
        payload.reported_post_id,
        payload.reported_message_id,
    ]):
        raise HTTPException(
            status_code=400,
            detail="At least one of reported_user_id / reported_post_id / reported_message_id is required.",
        )

    row = {
        "reporter_id": str(current_user.id),
        "category": category,
        "description": payload.description.strip(),
    }
    if payload.reported_user_id:
        row["reported_user_id"] = payload.reported_user_id
    if payload.reported_post_id:
        row["reported_post_id"] = payload.reported_post_id
    if payload.reported_message_id:
        row["reported_message_id"] = payload.reported_message_id

    inserted = SupabaseREST.insert("reports", row)
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to submit report.")
    return {"success": True, "report": inserted}
