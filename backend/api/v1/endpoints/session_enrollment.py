"""
Session Enrollment API Endpoints
Handles enrollment requests, approvals, and notifications
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime
import uuid

from database.database import get_db
from core.security import get_current_active_user
from database.models import User
from database.supabase_client import SupabaseREST
from services import track_matching

router = APIRouter()


@router.post("/sessions/{session_id}/enroll")
async def request_session_enrollment(
    session_id: str,
    message: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Student requests to enroll in a session"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        session_url = f"{settings.supabase_url}/rest/v1/live_sessions"
        session_response = requests.get(
            session_url,
            params={"id": f"eq.{session_id}"},
            headers=headers,
            timeout=10
        )
        
        if session_response.status_code != 200 or not session_response.json():
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = session_response.json()[0]
        teacher_id = session['teacher_id']

        # Hard wall: a student may only enroll with a teacher on a matching
        # accessibility track. live_sessions.teacher_id is a teacher_profiles id,
        # so resolve the owning user first.
        teacher_profile = SupabaseREST.select_one(
            "teacher_profiles", "user_id", {"id": teacher_id}
        )
        teacher_uid = teacher_profile.get("user_id") if teacher_profile else None
        if teacher_uid and not track_matching.teacher_can_see_student(
            teacher_uid, str(current_user.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This session isn't available for your accessibility track.",
            )

        enrollment_url = f"{settings.supabase_url}/rest/v1/live_live_session_enrollment_requests"
        check_response = requests.get(
            enrollment_url,
            params={
                "session_id": f"eq.{session_id}",
                "student_id": f"eq.{str(current_user.id)}"
            },
            headers=headers,
            timeout=10
        )
        
        if check_response.status_code == 200 and check_response.json():
            existing = check_response.json()[0]
            raise HTTPException(
                status_code=400,
                detail=f"You already have a {existing['status']} enrollment request for this session"
            )
        
        enrollment_data = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "student_id": str(current_user.id),
            "status": "pending",
            "request_message": message
        }
        
        create_response = requests.post(
            enrollment_url,
            json=enrollment_data,
            headers=headers,
            timeout=10
        )
        
        if create_response.status_code not in [200, 201]:
            raise HTTPException(
                status_code=create_response.status_code,
                detail=f"Failed to create enrollment request: {create_response.text}"
            )
        
        enrollment = create_response.json()
        if isinstance(enrollment, list):
            enrollment = enrollment[0]
        
        notification_data = {
            "id": str(uuid.uuid4()),
            "user_id": teacher_id,
            "type": "session_enrollment_request",
            "title": "New Session Enrollment Request",
            "message": f"{current_user.profile.first_name} {current_user.profile.last_name} wants to join your session: {session['title']}",
            "link_url": f"/teachers/live-sessions/enrollments",
            "related_entity_type": "session_enrollment_request",
            "related_entity_id": enrollment['id'],
            "priority": "high"
        }
        
        notif_url = f"{settings.supabase_url}/rest/v1/notifications"
        requests.post(notif_url, json=notification_data, headers=headers, timeout=10)
        
        return {
            "message": "Enrollment request sent successfully",
            "enrollment": enrollment
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating enrollment request: {str(e)}"
        )


@router.get("/sessions/{session_id}/enrollments")
async def get_session_enrollments(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all enrollment requests for a session (teacher only)"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        session_url = f"{settings.supabase_url}/rest/v1/live_sessions"
        session_response = requests.get(
            session_url,
            params={"id": f"eq.{session_id}"},
            headers=headers,
            timeout=10
        )
        
        if session_response.status_code != 200 or not session_response.json():
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = session_response.json()[0]
        if session['teacher_id'] != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized to view enrollments")
        
        enrollment_url = f"{settings.supabase_url}/rest/v1/live_live_session_enrollment_requests"
        response = requests.get(
            enrollment_url,
            params={"session_id": f"eq.{session_id}", "order": "requested_at.desc"},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return {"enrollments": response.json()}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch enrollments: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching enrollments: {str(e)}"
        )


@router.patch("/enrollments/{enrollment_id}/respond")
async def respond_to_enrollment(
    enrollment_id: str,
    action: str,
    response_message: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Teacher approves or rejects an enrollment request"""
    try:
        import requests
        from config import settings
        
        if action not in ['approve', 'reject']:
            raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        enrollment_url = f"{settings.supabase_url}/rest/v1/live_live_session_enrollment_requests"
        get_response = requests.get(
            enrollment_url,
            params={"id": f"eq.{enrollment_id}"},
            headers=headers,
            timeout=10
        )
        
        if get_response.status_code != 200 or not get_response.json():
            raise HTTPException(status_code=404, detail="Enrollment request not found")
        
        enrollment = get_response.json()[0]
        session_id = enrollment['session_id']
        student_id = enrollment['student_id']
        
        session_url = f"{settings.supabase_url}/rest/v1/live_sessions"
        session_response = requests.get(
            session_url,
            params={"id": f"eq.{session_id}"},
            headers=headers,
            timeout=10
        )
        
        if session_response.status_code != 200 or not session_response.json():
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = session_response.json()[0]
        if session['teacher_id'] != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        new_status = 'approved' if action == 'approve' else 'rejected'
        update_data = {
            "status": new_status,
            "teacher_response": response_message,
            "responded_at": datetime.utcnow().isoformat()
        }
        
        update_response = requests.patch(
            enrollment_url,
            params={"id": f"eq.{enrollment_id}"},
            json=update_data,
            headers=headers,
            timeout=10
        )
        
        if update_response.status_code != 200:
            raise HTTPException(
                status_code=update_response.status_code,
                detail=f"Failed to update enrollment: {update_response.text}"
            )
        
        notif_type = 'enrollment_approved' if action == 'approve' else 'enrollment_rejected'
        notif_title = "Enrollment Request Approved!" if action == 'approve' else "Enrollment Request Rejected"
        notif_message = f"Your request to join '{session['title']}' has been {new_status}."
        
        if action == 'approve':
            if session.get('requires_payment') and session.get('price', 0) > 0:
                notif_message += f" Please complete payment of ${session['price']} to join the session."
                notif_type = 'payment_required'
            else:
                notif_message += " You can now join the session!"
        
        notification_data = {
            "id": str(uuid.uuid4()),
            "user_id": student_id,
            "type": notif_type,
            "title": notif_title,
            "message": notif_message,
            "link_url": f"/students/live-sessions/{session_id}/payment" if action == 'approve' and session.get('requires_payment') else f"/students/live-sessions",
            "related_entity_type": "session_enrollment_request",
            "related_entity_id": enrollment_id,
            "priority": "high"
        }
        
        notif_url = f"{settings.supabase_url}/rest/v1/notifications"
        requests.post(notif_url, json=notification_data, headers=headers, timeout=10)
        
        return {
            "message": f"Enrollment request {new_status}",
            "enrollment": update_response.json()[0] if isinstance(update_response.json(), list) else update_response.json()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error responding to enrollment: {str(e)}"
        )


@router.get("/my-enrollments")
async def get_my_enrollments(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current user's enrollment requests"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        params = {
            "student_id": f"eq.{str(current_user.id)}",
            "order": "requested_at.desc"
        }
        
        if status_filter:
            params["status"] = f"eq.{status_filter}"
        
        enrollment_url = f"{settings.supabase_url}/rest/v1/live_live_session_enrollment_requests"
        response = requests.get(
            enrollment_url,
            params=params,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return {"enrollments": response.json()}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch enrollments: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching enrollments: {str(e)}"
        )
