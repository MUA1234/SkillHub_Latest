"""
Phase K2 — Learning groups endpoints.

Minimal viable surface: browse, create, join, leave, detail. Group
posts and scheduled-sessions live in their own tables (`group_posts`,
`group_sessions`) and are out of scope for this iteration — the data
model can be extended without breaking these endpoints.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST

logger = logging.getLogger(__name__)
router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CreateGroupPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    subject_id: Optional[str] = None
    group_type: str = "study"
    level: Optional[str] = None
    max_members: Optional[int] = None
    language: Optional[str] = "en"
    tags: Optional[List[str]] = None


@router.get("/students/groups")
async def list_groups(
    q: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Browse all active learning groups."""
    rows = SupabaseREST.select(
        "learning_groups", "*", None, order="created_at.desc", limit=100
    ) or []
    if q:
        ql = q.lower()
        rows = [
            r for r in rows
            if ql in (r.get("name") or "").lower()
            or ql in (r.get("description") or "").lower()
        ]
    user_id = str(current_user.id)
    memberships = SupabaseREST.select(
        "group_memberships",
        "group_id,is_active",
        {"user_id": user_id, "is_active": True},
    ) or []
    member_ids = {str(m.get("group_id")) for m in memberships}
    for r in rows:
        r["is_member"] = str(r.get("id")) in member_ids
    return {"success": True, "groups": rows}


@router.get("/students/groups/mine")
async def list_my_groups(
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """The groups the current user is in (admin or member)."""
    user_id = str(current_user.id)
    memberships = SupabaseREST.select(
        "group_memberships",
        "group_id,role,joined_at,is_active",
        {"user_id": user_id, "is_active": True},
    ) or []
    out: List[Dict[str, Any]] = []
    for m in memberships:
        g = SupabaseREST.select_one(
            "learning_groups", "*", {"id": str(m.get("group_id"))}
        )
        if g:
            g["my_role"] = m.get("role")
            g["joined_at"] = m.get("joined_at")
            out.append(g)
    return {"success": True, "groups": out}


@router.post("/students/groups")
async def create_group(
    payload: CreateGroupPayload,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Create a new learning group. The creator is auto-enrolled as `admin`."""
    user_id = str(current_user.id)
    group_id = str(uuid.uuid4())
    now = _now_iso()

    inserted = SupabaseREST.insert(
        "learning_groups",
        {
            "id": group_id,
            "name": payload.name,
            "description": payload.description,
            "subject_id": payload.subject_id,
            "group_type": payload.group_type,
            "level": payload.level,
            "admin_id": user_id,
            "max_members": payload.max_members,
            "current_members": 1,
            "language": payload.language,
            "tags": payload.tags or [],
            "created_at": now,
        },
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Could not create group.")

    SupabaseREST.insert(
        "group_memberships",
        {
            "group_id": group_id,
            "user_id": user_id,
            "role": "admin",
            "joined_at": now,
            "is_active": True,
        },
    )

    return {"success": True, "group": inserted}


@router.get("/students/groups/{group_id}")
async def get_group(
    group_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    g = SupabaseREST.select_one("learning_groups", "*", {"id": group_id})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found.")

    members = SupabaseREST.select(
        "group_memberships",
        "user_id,role,joined_at",
        {"group_id": group_id, "is_active": True},
    ) or []
    member_rows: List[Dict[str, Any]] = []
    for m in members:
        p = SupabaseREST.select_one(
            "user_profiles",
            "first_name,last_name,avatar_url",
            {"user_id": str(m.get("user_id"))},
        ) or {}
        name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "Member"
        member_rows.append(
            {
                "user_id": m.get("user_id"),
                "role": m.get("role"),
                "joined_at": m.get("joined_at"),
                "name": name,
                "avatar_url": p.get("avatar_url"),
            }
        )

    user_id = str(current_user.id)
    my_membership = next(
        (m for m in members if str(m.get("user_id")) == user_id),
        None,
    )

    return {
        "success": True,
        "group": g,
        "members": member_rows,
        "my_role": my_membership.get("role") if my_membership else None,
        "is_member": bool(my_membership),
    }


@router.post("/students/groups/{group_id}/join")
async def join_group(
    group_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    user_id = str(current_user.id)
    group = SupabaseREST.select_one(
        "learning_groups", "id,max_members,current_members", {"id": group_id}
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")

    existing = SupabaseREST.select_one(
        "group_memberships",
        "id,is_active",
        {"group_id": group_id, "user_id": user_id},
    )
    if existing:
        if existing.get("is_active"):
            return {"success": True, "already_member": True}
        SupabaseREST.update(
            "group_memberships",
            {"is_active": True, "joined_at": _now_iso()},
            {"id": str(existing["id"])},
        )
    else:
        if group.get("max_members") and (
            int(group.get("current_members") or 0) >= int(group["max_members"])
        ):
            raise HTTPException(status_code=400, detail="Group is full.")
        SupabaseREST.insert(
            "group_memberships",
            {
                "group_id": group_id,
                "user_id": user_id,
                "role": "member",
                "joined_at": _now_iso(),
                "is_active": True,
            },
        )

    SupabaseREST.update(
        "learning_groups",
        {"current_members": int(group.get("current_members") or 0) + 1},
        {"id": group_id},
    )
    return {"success": True}


@router.post("/students/groups/{group_id}/leave")
async def leave_group(
    group_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    user_id = str(current_user.id)
    existing = SupabaseREST.select_one(
        "group_memberships",
        "id,is_active,role",
        {"group_id": group_id, "user_id": user_id},
    )
    if not existing or not existing.get("is_active"):
        return {"success": True, "not_a_member": True}
    if existing.get("role") == "admin":
        raise HTTPException(
            status_code=400,
            detail="Admins cannot leave their own group. Transfer admin first.",
        )
    SupabaseREST.update(
        "group_memberships",
        {"is_active": False},
        {"id": str(existing["id"])},
    )
    group = SupabaseREST.select_one(
        "learning_groups", "current_members", {"id": group_id}
    ) or {}
    SupabaseREST.update(
        "learning_groups",
        {"current_members": max(0, int(group.get("current_members") or 1) - 1)},
        {"id": group_id},
    )
    return {"success": True}
