"""
Lightweight stand-ins for the ORM models the legacy code references.

Persistence is handled via Supabase REST (`database.supabase_client`).
These classes exist only so endpoint modules can `from database.models
import User, UserProfile, UserRole` and use them for type hints / enum
values without a SQLAlchemy mapper being configured.
"""

from enum import Enum
from typing import Any, Optional


class UserRole(str, Enum):
    student = "student"
    teacher = "teacher"
    sponsor = "sponsor"
    guardian = "guardian"
    admin = "admin"

    STUDENT = "student"
    TEACHER = "teacher"
    SPONSOR = "sponsor"
    GUARDIAN = "guardian"
    ADMIN = "admin"


class _Record:
    """Plain-object base — sets attributes from a dict, ignores unknowns."""

    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)

    @classmethod
    def from_dict(cls, data: Optional[dict]) -> Optional["_Record"]:
        if not data:
            return None
        return cls(**data)


class User(_Record):
    id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_verified: bool = False
    is_active: bool = True
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None


class UserProfile(_Record):
    id: Optional[str] = None
    user_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
