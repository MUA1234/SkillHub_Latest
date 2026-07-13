"""
Notifications API Endpoints
"""

from fastapi import APIRouter, Body, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import logging
import uuid

from config import settings
from database.database import get_db
from database.supabase_client import SupabaseREST
from core.security import get_current_active_user
from database.models import User

logger = logging.getLogger(__name__)
router = APIRouter()




class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=10)
    auth: str = Field(min_length=4)


class PushSubscribePayload(BaseModel):
    endpoint: str = Field(min_length=20)
    keys: PushSubscriptionKeys
    user_agent: Optional[str] = None

@router.get("/")
async def get_notifications(
    limit: int = Query(50, le=100),
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user notifications"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        params = {
            "user_id": f"eq.{str(current_user.id)}",
            "order": "created_at.desc",
            "limit": limit
        }
        
        if unread_only:
            params["is_read"] = "eq.false"
        
        url = f"{settings.supabase_url}/rest/v1/notifications"
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            notifications = response.json()
            unread_count = len([n for n in notifications if not n.get('is_read', False)])
            return {
                "notifications": notifications,
                "unread_count": unread_count,
                "total_count": len(notifications)
            }
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch notifications: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching notifications: {str(e)}"
        )


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark notification as read"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        update_data = {
            "is_read": True,
            "read_at": datetime.utcnow().isoformat()
        }
        
        url = f"{settings.supabase_url}/rest/v1/notifications"
        response = requests.patch(
            url,
            params={
                "id": f"eq.{notification_id}",
                "user_id": f"eq.{str(current_user.id)}"
            },
            json=update_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return {"message": "Notification marked as read"}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to mark notification as read: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error marking notification as read: {str(e)}"
        )


@router.patch("/mark-all-read")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all notifications as read"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        update_data = {
            "is_read": True,
            "read_at": datetime.utcnow().isoformat()
        }
        
        url = f"{settings.supabase_url}/rest/v1/notifications"
        response = requests.patch(
            url,
            params={"user_id": f"eq.{str(current_user.id)}", "is_read": "eq.false"},
            json=update_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return {"message": "All notifications marked as read"}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to mark notifications as read: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error marking notifications as read: {str(e)}"
        )


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a notification"""
    try:
        import requests
        from config import settings

        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}"
        }

        url = f"{settings.supabase_url}/rest/v1/notifications"
        response = requests.delete(
            url,
            params={
                "id": f"eq.{notification_id}",
                "user_id": f"eq.{str(current_user.id)}"
            },
            headers=headers,
            timeout=10
        )

        if response.status_code in [200, 204]:
            return {"message": "Notification deleted"}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to delete notification: {response.text}"
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting notification: {str(e)}"
        )




@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Return the VAPID public key for the browser to subscribe with.

    Anonymous on purpose — the public key is, well, public, and the
    registration step happens before the user can authenticate (the SW
    registers on every page load). When VAPID isn't configured, return
    an empty string so the frontend can detect "push not available" and
    skip the prompt.
    """
    return {"public_key": settings.vapid_public_key or ""}


@router.post("/subscribe")
async def subscribe_push(
    payload: PushSubscribePayload,
    current_user: User = Depends(get_current_active_user),
):
    """Register (or refresh) a Web Push subscription for the calling user.

    Idempotent on `endpoint`: if the browser re-subscribes from the same
    device, we update the existing row's keys and clear `revoked_at`
    rather than inserting a duplicate.
    """
    existing = SupabaseREST.select_one(
        "push_subscriptions", "*", {"endpoint": payload.endpoint}
    )
    now_iso = datetime.utcnow().isoformat()

    if existing:
        SupabaseREST.update(
            "push_subscriptions",
            {
                "user_id": str(current_user.id),
                "p256dh": payload.keys.p256dh,
                "auth": payload.keys.auth,
                "user_agent": payload.user_agent,
                "revoked_at": None,
            },
            {"id": existing["id"]},
        )
        return {"id": existing["id"], "refreshed": True}

    record = {
        "id": str(uuid.uuid4()),
        "user_id": str(current_user.id),
        "endpoint": payload.endpoint,
        "p256dh": payload.keys.p256dh,
        "auth": payload.keys.auth,
        "user_agent": payload.user_agent,
        "created_at": now_iso,
    }
    inserted = SupabaseREST.insert("push_subscriptions", record)
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to register push subscription.")
    return {"id": inserted["id"], "refreshed": False}


@router.post("/unsubscribe")
async def unsubscribe_push(
    endpoint: str = Body(..., embed=True),
    current_user: User = Depends(get_current_active_user),
):
    """Mark a subscription dead. Always succeeds (even on missing rows) so a
    client cleaning up after a permission revoke doesn't have to handle 404."""
    SupabaseREST.update(
        "push_subscriptions",
        {"revoked_at": datetime.utcnow().isoformat()},
        {"endpoint": endpoint, "user_id": str(current_user.id)},
    )
    return {"ok": True}


@router.get("/subscriptions")
async def list_my_subscriptions(
    current_user: User = Depends(get_current_active_user),
):
    """List the calling user's active subscriptions (for a settings page)."""
    try:
        from services.push_service import list_user_subscriptions
        return {"subscriptions": list_user_subscriptions(str(current_user.id))}
    except Exception as exc:
        logger.warning("list_user_subscriptions failed: %s", exc)
        return {"subscriptions": []}
