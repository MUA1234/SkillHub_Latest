"""
Cloudflare R2 (S3-compatible) storage for heavy media.

Videos, audio, sign-language clips, recordings and caption files live in the
private `skillhub-media` bucket. Nothing is public: the backend mints short-
lived presigned URLs so uploads and playback go **directly** browser↔R2 and
never stream through the API server (which keeps large uploads fast regardless
of the API instance size, and downloads free of egress cost).

Object keys are stable and stored in the DB; the presigned GET URL is generated
on read.
"""

from __future__ import annotations

import logging
import mimetypes
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

# Media that belongs in R2 (everything else stays in Supabase Storage).
_VIDEO_TYPES = {"video/mp4", "video/webm", "video/avi", "video/mov", "video/quicktime"}
_AUDIO_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "audio/aac"}
_CAPTION_EXTS = {".vtt", ".srt"}


def is_r2_media(content_type: Optional[str], filename: Optional[str] = None) -> bool:
    """True when a file should be stored in R2 rather than Supabase Storage."""
    ct = (content_type or "").lower()
    if ct in _VIDEO_TYPES or ct in _AUDIO_TYPES:
        return True
    if filename and Path(filename).suffix.lower() in _CAPTION_EXTS:
        return True
    return False


def build_object_key(user_id: str, filename: str, kind: str = "media") -> str:
    """A collision-free, human-debuggable object key."""
    ext = Path(filename or "").suffix.lower()
    ts = datetime.utcnow().strftime("%Y%m%d")
    return f"{kind}/{user_id}/{ts}/{uuid.uuid4().hex}{ext}"


def _client():
    """Lazily build a boto3 S3 client for R2. Raises if R2 isn't configured or
    boto3 isn't installed — callers should guard with settings.r2_enabled."""
    if not settings.r2_enabled:
        raise RuntimeError("R2 is not configured (set R2_* env vars).")
    import boto3  # imported lazily so the app boots even without boto3 present
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def presign_put(key: str, content_type: Optional[str] = None, expires: Optional[int] = None) -> str:
    """Presigned URL the browser uses to PUT the object straight into R2."""
    params = {"Bucket": settings.r2_bucket, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    return _client().generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=expires or settings.r2_presign_expiry,
    )


def presign_get(key: str, expires: Optional[int] = None, as_attachment: bool = False) -> str:
    """Presigned URL for playback/download of a stored object.

    `as_attachment=True` forces the browser to download (Content-Disposition:
    attachment) rather than play inline — used by the download button.
    """
    params = {"Bucket": settings.r2_bucket, "Key": key}
    if as_attachment:
        filename = key.rsplit("/", 1)[-1]
        params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
    return _client().generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=expires or settings.r2_presign_expiry,
    )


def delete_object(key: str) -> None:
    """Best-effort delete of a stored object (used when content is removed)."""
    if not key:
        return
    try:
        _client().delete_object(Bucket=settings.r2_bucket, Key=key)
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("R2 delete_object failed for %s: %s", key, exc)


def guess_content_type(filename: str) -> str:
    ct, _ = mimetypes.guess_type(filename)
    return ct or "application/octet-stream"
