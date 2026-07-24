"""
Pydantic schemas for auth/user payloads.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field

from database.models import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: UserRole
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional["User"] = None


class User(BaseModel):
    id: str
    email: EmailStr
    role: UserRole
    is_verified: bool = False
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Accessibility track enrichment (populated at login / on /me).
    # Students carry `accessibility_track` (their primary track → landing
    # dashboard). Teachers carry `teaching_tracks` + `verified_specialist`.
    accessibility_track: Optional[str] = None
    teaching_tracks: Optional[List[str]] = None
    verified_specialist: Optional[bool] = None

    class Config:
        from_attributes = True


Token.model_rebuild()
