"""
Direct-to-R2 upload endpoints.

The browser asks for a presigned PUT, uploads the file straight to Cloudflare R2
(bypassing this API server entirely — critical for large video), then tells us
the object key to persist. Playback URLs are minted on demand via a presigned
GET so the bucket stays private.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from core.security import get_current_active_user
from database.models import User
from config import settings
from services import r2_storage

logger = logging.getLogger(__name__)
router = APIRouter()


class PresignUploadRequest(BaseModel):
    filename: str
    content_type: Optional[str] = None
    kind: str = "media"  # media | recording | caption | audio


class PresignUploadResponse(BaseModel):
    upload_url: str
    key: str
    method: str = "PUT"
    headers: dict


class PresignGetRequest(BaseModel):
    key: str
    download: bool = False


@router.post("/presign", response_model=PresignUploadResponse)
async def presign_upload(
    payload: PresignUploadRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Return a presigned PUT URL for a direct browser→R2 upload."""
    if not settings.r2_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Media storage is not configured on the server.",
        )

    content_type = payload.content_type or r2_storage.guess_content_type(payload.filename)
    # Video/audio/captions, plus images (used for content thumbnails/previews).
    is_allowed = r2_storage.is_r2_media(content_type, payload.filename) or content_type.startswith("image/")
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only video, audio, caption, or image files are supported.",
        )

    key = r2_storage.build_object_key(str(current_user.id), payload.filename, payload.kind)
    try:
        upload_url = r2_storage.presign_put(key, content_type)
    except Exception as exc:
        logger.error(f"R2 presign PUT failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not prepare the upload.",
        )

    return PresignUploadResponse(
        upload_url=upload_url,
        key=key,
        headers={"Content-Type": content_type},
    )


@router.post("/media-url")
async def presign_media_url(
    payload: PresignGetRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Return a short-lived presigned GET URL for playback of a stored object."""
    if not settings.r2_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Media storage is not configured on the server.",
        )
    if not payload.key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing key.")
    try:
        return {"url": r2_storage.presign_get(payload.key, as_attachment=payload.download)}
    except Exception as exc:
        logger.error(f"R2 presign GET failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not prepare the media URL.",
        )
