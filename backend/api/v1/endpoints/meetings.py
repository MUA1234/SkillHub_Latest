"""
WebRTC Meeting API Endpoints
Handles live meeting room creation, management, and WebRTC signaling
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from typing import List, Optional
from datetime import datetime, timedelta
import uuid

from database.database import get_db
from core.security import get_current_active_user
from database.models import User
from config import settings
from services import livekit_service

router = APIRouter()


@router.post("/livekit/token")
async def livekit_token(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
):
    """Return a LiveKit access token + server URL so the caller can join a live
    video room (room name = live-session id). Any authenticated user may join;
    finer access control can layer on top later."""
    if not settings.livekit_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Live video is not configured on the server.",
        )
    room = str(payload.get("room") or "").strip()
    if not room:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing room.")

    identity = str(current_user.id)
    name = str(payload.get("name") or "").strip() or getattr(current_user, "email", "") or identity
    try:
        token = livekit_service.create_token(room=room, identity=identity, name=name)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not create a room token: {exc}",
        )
    return {"url": settings.livekit_url, "token": token, "room": room, "identity": identity}


@router.post("/rooms")
async def create_meeting_room(
    title: str = Body(...),
    description: Optional[str] = Body(None),
    meeting_type: str = Body(...),
    scheduled_start: str = Body(...),
    scheduled_end: str = Body(...),
    max_participants: int = Body(50),
    video_enabled: bool = Body(True),
    audio_enabled: bool = Body(True),
    screen_share_enabled: bool = Body(True),
    chat_enabled: bool = Body(True),
    recording_enabled: bool = Body(False),
    captions_enabled: bool = Body(False),
    course_id: Optional[str] = Body(None),
    session_id: Optional[str] = Body(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new meeting room"""
    try:
        room_id = str(uuid.uuid4())
        
        import requests
        from config import settings
        
        url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        payload = {
            "id": str(uuid.uuid4()),
            "title": title,
            "description": description,
            "meeting_type": meeting_type,
            "host_id": str(current_user.id),
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "status": "scheduled",
            "room_id": room_id,
            "max_participants": max_participants,
            "current_participant_count": 0,
            "video_enabled": video_enabled,
            "audio_enabled": audio_enabled,
            "screen_share_enabled": screen_share_enabled,
            "chat_enabled": chat_enabled,
            "recording_enabled": recording_enabled,
            "captions_enabled": captions_enabled,
            "accessibility_mode_enabled": False,
            "low_distraction_mode": False,
            "high_contrast_mode": False,
            "large_controls": False,
            "course_id": course_id,
            "session_id": session_id
        }
        
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            meeting_data = response.json()
            if isinstance(meeting_data, list) and len(meeting_data) > 0:
                return meeting_data[0]
            return meeting_data
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to create meeting room: {response.text}"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating meeting room: {str(e)}"
        )


@router.get("/rooms")
async def list_meeting_rooms(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List meeting rooms visible to the current user.

    A teacher sees rooms they host; a student sees rooms where they are
    enrolled or have joined; everyone sees rooms scoped to their courses.
    For the dashboard list view we surface rooms the user hosts (host_id =
    current user) plus any room they've recorded participation in. The
    backend gap that broke the meetings page was that this listing endpoint
    didn't exist — only POST /rooms (create) and GET /rooms/{id} (single).
    """
    try:
        import requests
        from config import settings

        url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
        }

        params = {
            "host_id": f"eq.{str(current_user.id)}",
            "order": "scheduled_start.desc",
            "limit": "100",
        }
        if status_filter and status_filter != "all":
            params["status"] = f"eq.{status_filter}"

        response = requests.get(url, params=params, headers=headers, timeout=10)
        hosted = response.json() if response.status_code == 200 else []

        joined: List[dict] = []
        try:
            part_url = f"{settings.supabase_url}/rest/v1/meeting_participants"
            part_resp = requests.get(
                part_url,
                params={"user_id": f"eq.{str(current_user.id)}", "select": "meeting_id"},
                headers=headers,
                timeout=10,
            )
            if part_resp.status_code == 200:
                ids = [row.get("meeting_id") for row in part_resp.json() if row.get("meeting_id")]
                if ids:
                    join_resp = requests.get(
                        url,
                        params={"id": f"in.({','.join(ids)})"},
                        headers=headers,
                        timeout=10,
                    )
                    if join_resp.status_code == 200:
                        joined = join_resp.json()
        except Exception:
            joined = []

        seen = set()
        out = []
        for row in list(hosted) + list(joined):
            rid = row.get("id")
            if not rid or rid in seen:
                continue
            seen.add(rid)
            out.append(row)
        return out

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing meeting rooms: {str(e)}",
        )


@router.get("/rooms/{room_id}")
async def get_meeting_room(
    room_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get meeting room details"""
    try:
        import requests
        from config import settings
        
        url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        params = {"room_id": f"eq.{room_id}"}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            rooms = response.json()
            if rooms and len(rooms) > 0:
                return rooms[0]
            raise HTTPException(status_code=404, detail="Meeting room not found")
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch meeting room: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching meeting room: {str(e)}"
        )


@router.put("/rooms/{meeting_id}")
async def update_meeting_room(
    meeting_id: str,
    title: Optional[str] = Body(None),
    description: Optional[str] = Body(None),
    scheduled_start: Optional[str] = Body(None),
    scheduled_end: Optional[str] = Body(None),
    max_participants: Optional[int] = Body(None),
    video_enabled: Optional[bool] = Body(None),
    audio_enabled: Optional[bool] = Body(None),
    screen_share_enabled: Optional[bool] = Body(None),
    chat_enabled: Optional[bool] = Body(None),
    recording_enabled: Optional[bool] = Body(None),
    captions_enabled: Optional[bool] = Body(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit a meeting room. Only the host can mutate it; everyone else gets
    403. We accept the same field set the create endpoint did and ignore
    any keys the caller didn't provide so partial updates work.
    """
    try:
        import requests
        from config import settings

        url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        existing_resp = requests.get(
            url, params={"id": f"eq.{meeting_id}"}, headers=headers, timeout=10,
        )
        if existing_resp.status_code != 200 or not existing_resp.json():
            raise HTTPException(status_code=404, detail="Meeting not found")
        existing = existing_resp.json()[0]
        if str(existing.get("host_id")) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Only the host can edit this meeting")

        updates: dict = {}
        for k, v in (
            ("title", title),
            ("description", description),
            ("scheduled_start", scheduled_start),
            ("scheduled_end", scheduled_end),
            ("max_participants", max_participants),
            ("video_enabled", video_enabled),
            ("audio_enabled", audio_enabled),
            ("screen_share_enabled", screen_share_enabled),
            ("chat_enabled", chat_enabled),
            ("recording_enabled", recording_enabled),
            ("captions_enabled", captions_enabled),
        ):
            if v is not None:
                updates[k] = v

        if not updates:
            return existing

        resp = requests.patch(
            url, params={"id": f"eq.{meeting_id}"}, json=updates, headers=headers, timeout=10,
        )
        if resp.status_code in (200, 204):
            data = resp.json() if resp.text else [existing]
            return data[0] if isinstance(data, list) and data else {**existing, **updates}
        raise HTTPException(status_code=resp.status_code, detail=f"Update failed: {resp.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating meeting: {str(e)}",
        )


@router.delete("/rooms/{meeting_id}")
async def delete_meeting_room(
    meeting_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-cancel a meeting room. We flip status to `cancelled` rather than
    hard-deleting so participants who already joined still have audit context
    (recordings, attendance, etc). Only the host can call this.
    """
    try:
        import requests
        from config import settings

        url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        existing_resp = requests.get(
            url, params={"id": f"eq.{meeting_id}"}, headers=headers, timeout=10,
        )
        if existing_resp.status_code != 200 or not existing_resp.json():
            raise HTTPException(status_code=404, detail="Meeting not found")
        existing = existing_resp.json()[0]
        if str(existing.get("host_id")) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Only the host can delete this meeting")

        resp = requests.patch(
            url,
            params={"id": f"eq.{meeting_id}"},
            json={"status": "cancelled"},
            headers=headers,
            timeout=10,
        )
        if resp.status_code in (200, 204):
            return {"message": "Meeting cancelled", "id": meeting_id}
        raise HTTPException(status_code=resp.status_code, detail=f"Delete failed: {resp.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting meeting: {str(e)}",
        )


@router.patch("/rooms/{meeting_id}/status")
async def update_meeting_status(
    meeting_id: str,
    new_status: str = Body(..., embed=True),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update meeting room status (scheduled, starting, live, ended, cancelled)"""
    try:
        import requests
        from config import settings
        
        url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        params = {"id": f"eq.{meeting_id}"}
        
        update_data = {"status": new_status}
        
        if new_status == "live":
            update_data["actual_start"] = datetime.utcnow().isoformat()
        elif new_status == "ended":
            update_data["actual_end"] = datetime.utcnow().isoformat()
        
        response = requests.patch(url, params=params, json=update_data, headers=headers, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if isinstance(result, list) and len(result) > 0:
                return result[0]
            return {"message": "Meeting status updated", "status": new_status}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to update meeting status: {response.text}"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating meeting status: {str(e)}"
        )


@router.get("/rooms/{room_id}/participants")
async def get_meeting_participants(
    room_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all participants in a meeting room"""
    try:
        import requests
        from config import settings
        
        meeting_url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(
            meeting_url,
            params={"room_id": f"eq.{room_id}", "select": "id"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200 or not response.json():
            raise HTTPException(status_code=404, detail="Meeting room not found")
        
        meeting_id = response.json()[0]["id"]
        
        participants_url = f"{settings.supabase_url}/rest/v1/meeting_participants"
        response = requests.get(
            participants_url,
            params={"meeting_id": f"eq.{meeting_id}"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return {"participants": response.json()}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch participants: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching participants: {str(e)}"
        )


@router.post("/rooms/{room_id}/join")
async def join_meeting_room(
    room_id: str,
    role: str = Body("participant", embed=True),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Join a meeting room as a participant"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        meeting_url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        response = requests.get(
            meeting_url,
            params={"room_id": f"eq.{room_id}"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200 or not response.json():
            raise HTTPException(status_code=404, detail="Meeting room not found")
        
        meeting = response.json()[0]
        meeting_id = meeting["id"]
        
        participants_url = f"{settings.supabase_url}/rest/v1/meeting_participants"
        check_response = requests.get(
            participants_url,
            params={
                "meeting_id": f"eq.{meeting_id}",
                "user_id": f"eq.{str(current_user.id)}"
            },
            headers=headers,
            timeout=10
        )
        
        if check_response.status_code == 200 and check_response.json():
            participant = check_response.json()[0]
            update_data = {
                "is_currently_in_meeting": True,
                "joined_at": datetime.utcnow().isoformat(),
                "last_seen": datetime.utcnow().isoformat()
            }
            
            update_response = requests.patch(
                participants_url,
                params={"id": f"eq.{participant['id']}"},
                json=update_data,
                headers=headers,
                timeout=10
            )
            
            if update_response.status_code == 200:
                return {"message": "Rejoined meeting", "meeting": meeting}
        
        participant_data = {
            "id": str(uuid.uuid4()),
            "meeting_id": meeting_id,
            "user_id": str(current_user.id),
            "role": role,
            "joined_at": datetime.utcnow().isoformat(),
            "is_currently_in_meeting": True,
            "video_enabled": meeting["video_enabled"],
            "audio_enabled": meeting["audio_enabled"],
            "is_screen_sharing": False,
            "connection_quality": "good",
            "last_seen": datetime.utcnow().isoformat(),
            "needs_captions": meeting["captions_enabled"],
            "prefers_large_video": meeting["large_controls"],
            "prefers_low_distraction": meeting["low_distraction_mode"],
            "keyboard_only_mode": False,
            "total_time_minutes": 0,
            "attended": True,
            "spoke_count": 0,
            "message_count": 0
        }
        
        create_response = requests.post(
            participants_url,
            json=participant_data,
            headers=headers,
            timeout=10
        )
        
        if create_response.status_code in [200, 201]:
            count_update = requests.patch(
                meeting_url,
                params={"id": f"eq.{meeting_id}"},
                json={"current_participant_count": meeting["current_participant_count"] + 1},
                headers=headers,
                timeout=10
            )
            
            return {
                "message": "Joined meeting successfully",
                "meeting": meeting,
                "participant": participant_data
            }
        else:
            raise HTTPException(
                status_code=create_response.status_code,
                detail=f"Failed to join meeting: {create_response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error joining meeting: {str(e)}"
        )


@router.post("/rooms/{room_id}/leave")
async def leave_meeting_room(
    room_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Leave a meeting room"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        meeting_url = f"{settings.supabase_url}/rest/v1/live_meeting_rooms"
        response = requests.get(
            meeting_url,
            params={"room_id": f"eq.{room_id}"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200 or not response.json():
            raise HTTPException(status_code=404, detail="Meeting room not found")
        
        meeting = response.json()[0]
        meeting_id = meeting["id"]
        
        participants_url = f"{settings.supabase_url}/rest/v1/meeting_participants"
        update_data = {
            "is_currently_in_meeting": False,
            "left_at": datetime.utcnow().isoformat(),
            "last_seen": datetime.utcnow().isoformat()
        }
        
        update_response = requests.patch(
            participants_url,
            params={
                "meeting_id": f"eq.{meeting_id}",
                "user_id": f"eq.{str(current_user.id)}"
            },
            json=update_data,
            headers=headers,
            timeout=10
        )
        
        if update_response.status_code == 200:
            new_count = max(0, meeting["current_participant_count"] - 1)
            requests.patch(
                meeting_url,
                params={"id": f"eq.{meeting_id}"},
                json={"current_participant_count": new_count},
                headers=headers,
                timeout=10
            )
            
            return {"message": "Left meeting successfully"}
        else:
            raise HTTPException(
                status_code=update_response.status_code,
                detail=f"Failed to leave meeting: {update_response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error leaving meeting: {str(e)}"
        )



@router.post("/signaling")
async def send_signaling_message(
    meeting_id: str = Body(...),
    to_user_id: Optional[str] = Body(None),
    message_type: str = Body(...),
    payload: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Send WebRTC signaling message (offer, answer, ICE candidate)"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        signal_data = {
            "id": str(uuid.uuid4()),
            "meeting_id": meeting_id,
            "from_user_id": str(current_user.id),
            "to_user_id": to_user_id,
            "message_type": message_type,
            "payload": payload,
            "processed": False,
            "expires_at": (datetime.utcnow() + timedelta(minutes=5)).isoformat()
        }
        
        url = f"{settings.supabase_url}/rest/v1/webrtc_signaling_messages"
        response = requests.post(url, json=signal_data, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            return {"message": "Signaling message sent", "signal": signal_data}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to send signaling message: {response.text}"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending signaling message: {str(e)}"
        )


@router.get("/signaling/{meeting_id}")
async def get_signaling_messages(
    meeting_id: str,
    since: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get pending signaling messages for current user"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        params = {
            "meeting_id": f"eq.{meeting_id}",
            "or": f"(to_user_id.eq.{str(current_user.id)},to_user_id.is.null)",
            "processed": "eq.false",
            "order": "created_at.asc"
        }
        
        if since:
            params["created_at"] = f"gt.{since}"
        
        url = f"{settings.supabase_url}/rest/v1/webrtc_signaling_messages"
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            return {"signals": response.json()}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch signaling messages: {response.text}"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching signaling messages: {str(e)}"
        )



@router.post("/chat/{meeting_id}")
async def send_chat_message(
    meeting_id: str,
    message: str = Body(..., embed=True),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a chat message in the meeting"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        chat_data = {
            "id": str(uuid.uuid4()),
            "meeting_id": meeting_id,
            "user_id": str(current_user.id),
            "message": message,
            "message_type": "text",
            "is_private": False,
            "reactions": []
        }
        
        url = f"{settings.supabase_url}/rest/v1/meeting_chat_messages"
        response = requests.post(url, json=chat_data, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            return response.json()[0] if isinstance(response.json(), list) else response.json()
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to send chat message: {response.text}"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending chat message: {str(e)}"
        )


@router.get("/chat/{meeting_id}")
async def get_chat_messages(
    meeting_id: str,
    limit: int = Query(50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get chat messages for a meeting"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        url = f"{settings.supabase_url}/rest/v1/meeting_chat_messages"
        params = {
            "meeting_id": f"eq.{meeting_id}",
            "order": "created_at.desc",
            "limit": limit
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            messages = response.json()
            messages.reverse()

            # meeting_chat_messages only stores user_id — ChatPanel.tsx reads
            # m.user_name / m.sender_name and always fell back to the
            # generic "User" default for every message. Batch-resolve real
            # names instead of leaving it to the frontend.
            from database.supabase_client import SupabaseREST
            user_ids = [m.get("user_id") for m in messages if m.get("user_id")]
            profiles = SupabaseREST.select_in(
                "user_profiles", "user_id", user_ids, "user_id,first_name,last_name"
            ) or []
            names_by_id = {
                str(p.get("user_id")): (
                    " ".join(x for x in [p.get("first_name"), p.get("last_name")] if x) or None
                )
                for p in profiles
            }
            for m in messages:
                m["user_name"] = names_by_id.get(str(m.get("user_id"))) or "User"

            return {"messages": messages}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch chat messages: {response.text}"
            )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching chat messages: {str(e)}"
        )



from database.supabase_client import SupabaseREST as _CaptionSupabase


@router.post("/captions/{meeting_id}")
async def append_caption(
    meeting_id: str,
    body: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
):
    """Persist a final caption segment to `meeting_captions`.

    The frontend streams interim segments from Web Speech locally but only
    POSTs *final* segments here — interim text is noisy and we don't want
    to bloat the table. Body shape: `{ text, language?, confidence? }`.
    """
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Caption text required.")
    lang = (body.get("language") or "en")[:5]
    confidence = body.get("confidence")
    try:
        _CaptionSupabase.insert(
            "meeting_captions",
            {
                "meeting_id": str(meeting_id),
                "speaker_id": str(current_user.id),
                "text": text,
                "language": lang,
                "confidence": confidence,
                "is_final": True,
                "created_at": datetime.utcnow().isoformat(),
            },
        )
    except Exception:
        pass
    return {"success": True}


@router.get("/captions/{meeting_id}")
async def list_captions(
    meeting_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Return the full caption transcript for a meeting (most recent last)."""
    rows = _CaptionSupabase.select(
        "meeting_captions",
        "id,speaker_id,text,language,confidence,created_at",
        {"meeting_id": str(meeting_id)},
        order="created_at.asc",
    ) or []
    return {"success": True, "captions": rows}
