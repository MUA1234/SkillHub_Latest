from fastapi import UploadFile, HTTPException, status
from typing import Optional, Tuple, List
import uuid
import os
import asyncio
import logging
from datetime import datetime
import aiofiles
from PIL import Image
import io
import mimetypes
from pathlib import Path

from config import settings
from database.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

class StorageService:
    """Service for handling file uploads and storage operations"""
    
    ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
    ALLOWED_VIDEO_TYPES = {'video/mp4', 'video/avi', 'video/mov', 'video/webm'}
    ALLOWED_DOCUMENT_TYPES = {
        'application/pdf', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }
    ALLOWED_AUDIO_TYPES = {'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'}
    
    MAX_FILE_SIZE = 100 * 1024 * 1024
    MAX_IMAGE_SIZE = 10 * 1024 * 1024
    
    @staticmethod
    def validate_file(file: UploadFile) -> Tuple[bool, Optional[str]]:
        """Validate uploaded file"""
        
        if hasattr(file, 'size') and file.size:
            if file.size > StorageService.MAX_FILE_SIZE:
                return False, f"File size ({file.size} bytes) exceeds maximum allowed size ({StorageService.MAX_FILE_SIZE} bytes)"
            
            if file.content_type in StorageService.ALLOWED_IMAGE_TYPES and file.size > StorageService.MAX_IMAGE_SIZE:
                return False, f"Image size ({file.size} bytes) exceeds maximum allowed size ({StorageService.MAX_IMAGE_SIZE} bytes)"
        
        all_allowed_types = (
            StorageService.ALLOWED_IMAGE_TYPES | 
            StorageService.ALLOWED_VIDEO_TYPES | 
            StorageService.ALLOWED_DOCUMENT_TYPES | 
            StorageService.ALLOWED_AUDIO_TYPES
        )
        
        if file.content_type not in all_allowed_types:
            return False, f"File type '{file.content_type}' is not allowed"
        
        if file.filename:
            file_extension = Path(file.filename).suffix.lower()
            mime_type, _ = mimetypes.guess_type(file.filename)
            
            if mime_type and mime_type != file.content_type:
                return False, f"File extension does not match content type"
        
        return True, None
    
    @staticmethod
    def generate_file_path(file: UploadFile, user_id: str, content_type: str) -> str:
        """Generate unique file path for storage"""
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_uuid = str(uuid.uuid4())[:8]
        
        file_extension = ""
        if file.filename:
            file_extension = Path(file.filename).suffix.lower()
        
        if file.content_type in StorageService.ALLOWED_IMAGE_TYPES:
            folder = "images"
        elif file.content_type in StorageService.ALLOWED_VIDEO_TYPES:
            folder = "videos"
        elif file.content_type in StorageService.ALLOWED_DOCUMENT_TYPES:
            folder = "documents"
        elif file.content_type in StorageService.ALLOWED_AUDIO_TYPES:
            folder = "audio"
        else:
            folder = "other"
        
        return f"teachers/{user_id}/{folder}/{timestamp}_{file_uuid}{file_extension}"
    
    @staticmethod
    async def upload_file(file: UploadFile, user_id: str, content_type: str = "content") -> dict:
        """Upload file to Supabase Storage"""
        
        is_valid, error_message = StorageService.validate_file(file)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_message
            )
        
        try:
            file_path = StorageService.generate_file_path(file, user_id, content_type)
            
            file_content = await file.read()
            
            supabase = get_supabase_client()
            
            if not supabase:
                return await StorageService._upload_to_local(file_path, file_content, file)
            
            bucket = supabase.storage().from_("skillhub-content")
            result = bucket.upload(
                file_path, 
                file_content,
                file_options={
                    "content-type": file.content_type,
                    "upsert": False
                }
            )
            
            if not result.get("success"):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to upload file: {result.get('error', 'Unknown error')}"
                )
            
            public_url = result.get("public_url")
            
            thumbnail_url = None
            if file.content_type in StorageService.ALLOWED_IMAGE_TYPES:
                thumbnail_url = await StorageService.generate_image_thumbnail(
                    file_content, file_path, supabase
                )
            elif file.content_type in StorageService.ALLOWED_VIDEO_TYPES:
                pass
            
            return {
                "file_url": public_url,
                "thumbnail_url": thumbnail_url,
                "file_path": file_path,
                "file_size": len(file_content),
                "content_type": file.content_type,
                "original_filename": file.filename
            }
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"File upload failed: {str(e)}"
            )
        finally:
            await file.seek(0)
    
    @staticmethod
    async def _upload_to_local(file_path: str, file_content: bytes, file: UploadFile) -> dict:
        """Fallback local storage for development"""
        
        local_storage_path = Path("storage") / file_path
        local_storage_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(local_storage_path, 'wb') as f:
            await f.write(file_content)
        
        file_url = f"/storage/{file_path}"
        thumbnail_url = None
        
        if file.content_type in StorageService.ALLOWED_IMAGE_TYPES:
            thumbnail_url = await StorageService._generate_local_thumbnail(
                file_content, file_path
            )
        
        return {
            "file_url": file_url,
            "thumbnail_url": thumbnail_url,
            "file_path": file_path,
            "file_size": len(file_content),
            "content_type": file.content_type,
            "original_filename": file.filename
        }
    
    @staticmethod
    async def generate_image_thumbnail(file_content: bytes, original_path: str, supabase) -> Optional[str]:
        """Generate thumbnail for image files"""
        
        try:
            image = Image.open(io.BytesIO(file_content))
            
            image.thumbnail((300, 300), Image.Resampling.LANCZOS)
            
            if image.mode in ('RGBA', 'P'):
                image = image.convert('RGB')
            
            thumbnail_io = io.BytesIO()
            image.save(thumbnail_io, format='JPEG', quality=85, optimize=True)
            thumbnail_content = thumbnail_io.getvalue()
            
            path_parts = original_path.split('/')
            filename = path_parts[-1]
            name, ext = os.path.splitext(filename)
            thumbnail_filename = f"{name}_thumb.jpg"
            thumbnail_path = '/'.join(path_parts[:-1]) + '/thumbnails/' + thumbnail_filename
            
            bucket = supabase.storage().from_("skillhub-content")
            thumbnail_result = bucket.upload(
                thumbnail_path,
                thumbnail_content,
                file_options={
                    "content-type": "image/jpeg",
                    "upsert": False
                }
            )
            
            if not thumbnail_result.get("success"):
                return None
            
            return thumbnail_result.get("public_url")
            
        except Exception as e:
            logger.warning(f"Failed to generate thumbnail: {e}")
            return None
    
    @staticmethod
    async def _generate_local_thumbnail(file_content: bytes, original_path: str) -> Optional[str]:
        """Generate thumbnail for local storage"""
        
        try:
            image = Image.open(io.BytesIO(file_content))
            
            image.thumbnail((300, 300), Image.Resampling.LANCZOS)
            
            if image.mode in ('RGBA', 'P'):
                image = image.convert('RGB')
            
            path_parts = original_path.split('/')
            filename = path_parts[-1]
            name, ext = os.path.splitext(filename)
            thumbnail_filename = f"{name}_thumb.jpg"
            thumbnail_path = '/'.join(path_parts[:-1]) + '/thumbnails/' + thumbnail_filename
            
            local_thumbnail_path = Path("storage") / thumbnail_path
            local_thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
            
            image.save(local_thumbnail_path, format='JPEG', quality=85, optimize=True)
            
            return f"/storage/{thumbnail_path}"
            
        except Exception as e:
            logger.warning(f"Failed to generate local thumbnail: {e}")
            return None
    
    @staticmethod
    async def delete_file(file_path: str) -> bool:
        """Delete file from storage"""
        
        try:
            supabase = get_supabase_client()
            
            if not supabase:
                local_path = Path("storage") / file_path
                if local_path.exists():
                    local_path.unlink()
                return True
            
            result = supabase.storage().from_("skillhub-content").remove([file_path])
            
            return not bool(result.error)
            
        except Exception as e:
            logger.warning(f"Failed to delete file: {e}")
            return False
    
    @staticmethod
    async def get_file_info(file_path: str) -> Optional[dict]:
        """Get file information from storage"""
        
        try:
            supabase = get_supabase_client()
            
            if not supabase:
                local_path = Path("storage") / file_path
                if local_path.exists():
                    stat = local_path.stat()
                    return {
                        "size": stat.st_size,
                        "last_modified": datetime.fromtimestamp(stat.st_mtime),
                        "exists": True
                    }
                return None
            
            result = supabase.storage().from_("skillhub-content").info(file_path)
            
            if result.error:
                return None
            
            return result.data
            
        except Exception as e:
            logger.warning(f"Failed to get file info: {e}")
            return None

class AvatarService:
    """Specialized service for handling user avatar uploads"""
    
    @staticmethod
    async def upload_avatar(file: UploadFile, user_id: str) -> dict:
        """Upload user avatar with special handling"""
        
        if file.content_type not in StorageService.ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Avatar must be an image file"
            )
        
        if hasattr(file, 'size') and file.size and file.size > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Avatar file size must be less than 5MB"
            )
        
        result = await StorageService.upload_file(file, user_id, "avatar")
        
        if result.get("file_url"):
            pass
        
        return result 