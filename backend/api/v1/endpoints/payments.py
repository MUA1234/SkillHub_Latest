"""
Payment API Endpoints

Phase D ships a demo-only flow: the frontend walks the student through a
multi-step checkout UI but no card data is collected and no real gateway is
contacted. This endpoint records a `completed` payment row immediately and
tags the gateway as `demo` so payment-history surfaces can mark these rows
clearly. When real payments are introduced later, this endpoint becomes the
post-confirmation handler — the gateway adapter is the only missing piece.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Body, Form, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime
import logging
import uuid

from database.database import get_db
from database.supabase_client import SupabaseREST
from core.security import get_current_active_user
from database.models import User
from services import payment_gateway
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_PAYMENT_METHODS = {"payhere", "card"}
_DEMO_GATEWAY = "demo"
_DEFAULT_CURRENCY = "LKR"


def _format_lkr(amount: float) -> str:
    """Render an LKR amount in `LKR 1,500` style for notification copy.

    We don't use Intl here (this is server-side) — a thin formatter keeps
    student/teacher notifications readable without pulling babel for one line.
    """
    try:
        return f"LKR {float(amount):,.0f}"
    except (TypeError, ValueError):
        return f"LKR {amount}"


@router.post("/sessions/{session_id}/payment")
async def create_session_payment(
    session_id: str,
    payment_method: str = Body(...),
    transaction_id: Optional[str] = Body(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a demo payment for session enrollment.

    The flow is intentionally optimistic: the frontend has already shown the
    student a "processing" animation, so by the time we land here we just
    write the row, register the participant, and fire notifications.
    """
    method = (payment_method or "").strip().lower()
    if method not in _ALLOWED_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported payment method. Choose 'payhere' or 'card'."
            ),
        )

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
        price = session.get('price', 0) or 0
        currency = (session.get('currency') or _DEFAULT_CURRENCY).upper()

        enrollment_url = f"{settings.supabase_url}/rest/v1/live_live_session_enrollment_requests"
        enrollment_response = requests.get(
            enrollment_url,
            params={
                "session_id": f"eq.{session_id}",
                "student_id": f"eq.{str(current_user.id)}",
                "status": "eq.approved"
            },
            headers=headers,
            timeout=10
        )

        if enrollment_response.status_code != 200 or not enrollment_response.json():
            raise HTTPException(
                status_code=400,
                detail="No approved enrollment found. Please request enrollment first."
            )

        enrollment = enrollment_response.json()[0]

        payment_url = f"{settings.supabase_url}/rest/v1/live_session_payments"
        check_response = requests.get(
            payment_url,
            params={
                "enrollment_request_id": f"eq.{enrollment['id']}",
                "payment_status": "eq.completed"
            },
            headers=headers,
            timeout=10
        )

        if check_response.status_code == 200 and check_response.json():
            existing = check_response.json()[0]
            return {
                "message": "Payment already completed",
                "payment": existing,
                "can_join_session": True,
                "already_paid": True,
            }

        server_txn_id = f"DEMO-{uuid.uuid4().hex[:12].upper()}"
        payment_data = {
            "id": str(uuid.uuid4()),
            "enrollment_request_id": enrollment['id'],
            "student_id": str(current_user.id),
            "teacher_id": teacher_id,
            "session_id": session_id,
            "amount": float(price),
            "currency": currency,
            "payment_status": "completed",
            "payment_method": method,
            "transaction_id": server_txn_id,
            "payment_gateway": _DEMO_GATEWAY,
            "paid_at": datetime.utcnow().isoformat()
        }

        create_response = requests.post(
            payment_url,
            json=payment_data,
            headers=headers,
            timeout=10
        )

        if create_response.status_code not in [200, 201]:
            raise HTTPException(
                status_code=create_response.status_code,
                detail=f"Failed to create payment: {create_response.text}"
            )

        payment = create_response.json()
        if isinstance(payment, list):
            payment = payment[0]

        participant_url = f"{settings.supabase_url}/rest/v1/live_session_participants"
        participant_data = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "student_id": str(current_user.id),
            "registration_date": datetime.utcnow().isoformat(),
            "payment_status": "paid",
            "payment_amount": float(price)
        }

        requests.post(participant_url, json=participant_data, headers=headers, timeout=10)

        amount_label = _format_lkr(price)
        session_title = session.get("title") or "the session"
        first_name = getattr(getattr(current_user, "profile", None), "first_name", "") or ""
        last_name = getattr(getattr(current_user, "profile", None), "last_name", "") or ""
        student_label = (f"{first_name} {last_name}".strip()) or current_user.email

        student_notif = {
            "id": str(uuid.uuid4()),
            "user_id": str(current_user.id),
            "type": "payment_received",
            "title": "Payment Successful!",
            "message": (
                f"Your payment of {amount_label} for '{session_title}' was "
                f"successful. You can now join the session!"
            ),
            "link_url": "/students/live-sessions",
            "related_entity_type": "session_payment",
            "related_entity_id": payment['id'],
            "priority": "high"
        }

        teacher_notif = {
            "id": str(uuid.uuid4()),
            "user_id": teacher_id,
            "type": "payment_received",
            "title": "Payment Received",
            "message": (
                f"{student_label} has paid {amount_label} for '{session_title}'"
            ),
            "link_url": "/teachers/live-sessions",
            "related_entity_type": "session_payment",
            "related_entity_id": payment['id'],
            "priority": "normal"
        }

        notif_url = f"{settings.supabase_url}/rest/v1/notifications"
        requests.post(notif_url, json=student_notif, headers=headers, timeout=10)
        requests.post(notif_url, json=teacher_notif, headers=headers, timeout=10)

        try:
            from services.sms_service import send_payment_confirmation
            from database.supabase_client import SupabaseREST as _Supa

            profile = _Supa.select_one(
                "user_profiles", "phone,first_name", {"user_id": str(current_user.id)}
            ) or {}
            phone = (profile.get("phone") or "").strip()
            if phone:
                send_payment_confirmation(
                    phone,
                    str(session.get("title") or "session"),
                    float(amount or 0),
                )
        except Exception:
            pass

        try:
            from services.email_service import send_receipt_email
            from database.supabase_client import SupabaseREST as _Supa2
            import asyncio
            lang_row = _Supa2.select_one(
                "language_preferences", "preferred_language",
                {"user_id": str(current_user.id)},
            ) or {}
            first_name = (profile.get("first_name") if isinstance(profile, dict) else None) or None
            asyncio.create_task(
                send_receipt_email(
                    to_email=str(getattr(current_user, "email", "") or ""),
                    first_name=first_name,
                    item_title=str(session.get("title") or "SkillHub session"),
                    amount_lkr=float(amount or 0),
                    currency="LKR",
                    method=str(payment_method or "card"),
                    transaction_id=str(payment.get("transaction_id") or payment.get("id") or ""),
                    paid_at=str(payment.get("created_at") or ""),
                    is_demo=True,
                    lang=lang_row.get("preferred_language"),
                )
            )
        except Exception:
            pass

        return {
            "message": "Payment completed successfully",
            "payment": payment,
            "can_join_session": True,
            "already_paid": False,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing payment: {str(e)}"
        )


@router.get("/payhere/status")
async def payhere_status(current_user: User = Depends(get_current_active_user)):
    """Tell the frontend whether the real PayHere gateway is live.

    The checkout page uses this to decide between the live PayHere redirect
    and the existing demo flow. Returns `enabled: false` whenever merchant
    credentials aren't configured (the default), so the demo stays the path.
    """
    return {
        "enabled": payment_gateway.is_enabled(),
        "sandbox": settings.payhere_sandbox if payment_gateway.is_enabled() else None,
    }


@router.post("/sessions/{session_id}/payhere/initiate")
async def initiate_payhere_payment(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Begin a real PayHere checkout for a session.

    Validates the same preconditions as the demo flow (approved enrollment,
    no existing completed payment), writes a **pending** payment row keyed by
    a fresh `order_id`, and returns the signed checkout payload the frontend
    POSTs to PayHere. If the gateway isn't configured, responds with
    `enabled: false` so the client falls back to the demo checkout.
    """
    from config import settings as _settings

    if not payment_gateway.is_enabled():
        return {
            "enabled": False,
            "fallback": "demo",
            "message": "PayHere is not configured; use the demo checkout flow.",
        }

    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can pay for sessions.")

    user_id = str(current_user.id)

    session = SupabaseREST.select_one("live_sessions", "*", {"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    price = float(session.get("price") or 0)
    currency = (session.get("currency") or _DEFAULT_CURRENCY).upper()
    if price <= 0:
        raise HTTPException(status_code=400, detail="This session has no payable price.")

    enrollment = SupabaseREST.select_one(
        "live_live_session_enrollment_requests",
        "*",
        {"session_id": session_id, "student_id": user_id, "status": "approved"},
    )
    if not enrollment:
        raise HTTPException(
            status_code=400,
            detail="No approved enrollment found. Please request enrollment first.",
        )

    existing = SupabaseREST.select_one(
        "live_session_payments",
        "id,transaction_id,payment_status",
        {"enrollment_request_id": enrollment["id"], "payment_status": "completed"},
    )
    if existing:
        return {"enabled": True, "already_paid": True, "payment": existing}

    order_id = f"PH-{uuid.uuid4().hex[:16].upper()}"
    SupabaseREST.insert("live_session_payments", {
        "id": str(uuid.uuid4()),
        "enrollment_request_id": enrollment["id"],
        "student_id": user_id,
        "teacher_id": session.get("teacher_id"),
        "session_id": session_id,
        "amount": price,
        "currency": currency,
        "payment_status": "pending",
        "payment_method": "payhere",
        "transaction_id": order_id,
        "payment_gateway": "payhere",
    })

    profile = SupabaseREST.select_one(
        "user_profiles", "first_name,last_name,phone", {"user_id": user_id}
    ) or {}

    frontend = _settings.frontend_url.rstrip("/")
    backend = _settings.backend_url.rstrip("/")
    payload = payment_gateway.build_checkout_payload(
        order_id=order_id,
        amount=price,
        currency=currency,
        items=str(session.get("title") or "SkillHub session"),
        return_url=f"{frontend}/students/live-sessions?paid={session_id}",
        cancel_url=f"{frontend}/students/live-sessions/{session_id}/payment?canceled=1",
        notify_url=f"{backend}{_settings.api_v1_str}/payments/payhere/notify",
        first_name=profile.get("first_name") or "",
        last_name=profile.get("last_name") or "",
        email=str(getattr(current_user, "email", "") or ""),
        phone=profile.get("phone") or "",
    )
    return {"enabled": True, "order_id": order_id, "checkout": payload}


@router.post("/payhere/notify")
async def payhere_notify(request: Request):
    """Server-to-server webhook PayHere calls with the payment result.

    This is the authoritative completion signal. We recompute the `md5sig`
    and ignore anything that doesn't verify. Always returns 200 text so
    PayHere stops retrying once we've recorded the outcome; the real
    success/failure is reflected in the payment row, not the HTTP status.
    """
    form = await request.form()
    merchant_id = str(form.get("merchant_id", ""))
    order_id = str(form.get("order_id", ""))
    payhere_amount = str(form.get("payhere_amount", ""))
    payhere_currency = str(form.get("payhere_currency", ""))
    status_code = str(form.get("status_code", ""))
    md5sig = str(form.get("md5sig", ""))

    if not payment_gateway.is_enabled():
        return PlainTextResponse("disabled", status_code=200)

    if not payment_gateway.verify_notification(
        merchant_id=merchant_id,
        order_id=order_id,
        payhere_amount=payhere_amount,
        payhere_currency=payhere_currency,
        status_code=status_code,
        received_sig=md5sig,
    ):
        logger.warning("PayHere notify signature mismatch for order %s", order_id)
        return PlainTextResponse("invalid-signature", status_code=200)

    payment = SupabaseREST.select_one(
        "live_session_payments", "*", {"transaction_id": order_id}
    )
    if not payment:
        logger.warning("PayHere notify for unknown order %s", order_id)
        return PlainTextResponse("unknown-order", status_code=200)

    new_state = payment_gateway.status_to_payment_state(status_code)

    if payment.get("payment_status") == "completed":
        return PlainTextResponse("already-completed", status_code=200)

    now_iso = datetime.utcnow().isoformat()
    update = {"payment_status": new_state}
    if new_state == "completed":
        update["paid_at"] = now_iso
    SupabaseREST.update(
        "live_session_payments", update, {"transaction_id": order_id}
    )

    if new_state == "completed":
        _finalize_paid_session(payment, now_iso)

    return PlainTextResponse("ok", status_code=200)


def _finalize_paid_session(payment: dict, now_iso: str) -> None:
    """Register the participant and fire notifications after a confirmed
    PayHere payment. Mirrors the demo flow's post-payment side effects."""
    session_id = payment.get("session_id")
    student_id = payment.get("student_id")
    teacher_id = payment.get("teacher_id")
    amount = float(payment.get("amount") or 0)

    session = SupabaseREST.select_one("live_sessions", "title", {"id": session_id}) or {}
    session_title = session.get("title") or "the session"

    existing_part = SupabaseREST.select_one(
        "live_session_participants", "id",
        {"session_id": session_id, "student_id": student_id},
    )
    if not existing_part:
        SupabaseREST.insert("live_session_participants", {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "student_id": student_id,
            "registration_date": now_iso,
            "payment_status": "paid",
            "payment_amount": amount,
        })

    amount_label = _format_lkr(amount)
    SupabaseREST.insert("notifications", {
        "id": str(uuid.uuid4()),
        "user_id": student_id,
        "type": "payment_received",
        "title": "Payment Successful!",
        "message": f"Your payment of {amount_label} for '{session_title}' was successful. You can now join the session!",
        "link_url": "/students/live-sessions",
        "related_entity_type": "session_payment",
        "related_entity_id": payment.get("id"),
        "priority": "high",
    })
    if teacher_id:
        SupabaseREST.insert("notifications", {
            "id": str(uuid.uuid4()),
            "user_id": teacher_id,
            "type": "payment_received",
            "title": "Payment Received",
            "message": f"A student has paid {amount_label} for '{session_title}'",
            "link_url": "/teachers/live-sessions",
            "related_entity_type": "session_payment",
            "related_entity_id": payment.get("id"),
            "priority": "normal",
        })


@router.get("/my-payments")
async def get_my_payments(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current user's payment history"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        payment_url = f"{settings.supabase_url}/rest/v1/live_session_payments"
        response = requests.get(
            payment_url,
            params={
                "student_id": f"eq.{str(current_user.id)}",
                "order": "created_at.desc"
            },
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return {"payments": response.json()}
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch payments: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching payments: {str(e)}"
        )


@router.post("/scholarship-grant")
async def consume_grant_for_session(
    session_id: str = Body(..., embed=True),
    grant_id: str = Body(..., embed=True),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Satisfy a session's payment requirement using a funding grant.

    The student picks an `available` grant they own, the grant is marked
    `used`, a `live_session_payments` row is written with method
    `scholarship_grant`, and the participant row is created. Mirrors the
    demo flow's data shape so payment-history surfaces handle the row the
    same way.
    """
    try:
        import requests
        from config import settings

        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        grant_url = f"{settings.supabase_url}/rest/v1/student_funding_grants"
        grant_resp = requests.get(
            grant_url,
            params={"id": f"eq.{grant_id}", "student_id": f"eq.{str(current_user.id)}"},
            headers=headers,
            timeout=10,
        )
        if grant_resp.status_code != 200 or not grant_resp.json():
            raise HTTPException(status_code=404, detail="Grant not found.")
        grant = grant_resp.json()[0]
        if grant.get("status") != "available":
            raise HTTPException(
                status_code=400,
                detail=f"Grant is {grant.get('status')}; cannot be applied.",
            )

        session_url = f"{settings.supabase_url}/rest/v1/live_sessions"
        session_resp = requests.get(
            session_url,
            params={"id": f"eq.{session_id}"},
            headers=headers,
            timeout=10,
        )
        if session_resp.status_code != 200 or not session_resp.json():
            raise HTTPException(status_code=404, detail="Session not found.")
        session = session_resp.json()[0]
        price = float(session.get("price") or 0)
        if float(grant.get("amount_lkr") or 0) < price:
            raise HTTPException(
                status_code=400,
                detail="Grant amount is less than the session price.",
            )

        enrollment_url = f"{settings.supabase_url}/rest/v1/live_live_session_enrollment_requests"
        enrollment_resp = requests.get(
            enrollment_url,
            params={
                "session_id": f"eq.{session_id}",
                "student_id": f"eq.{str(current_user.id)}",
                "status": "eq.approved",
            },
            headers=headers,
            timeout=10,
        )
        if enrollment_resp.status_code != 200 or not enrollment_resp.json():
            raise HTTPException(
                status_code=400,
                detail="No approved enrollment for this session.",
            )
        enrollment = enrollment_resp.json()[0]

        now_iso = datetime.utcnow().isoformat()

        payment_url = f"{settings.supabase_url}/rest/v1/live_session_payments"
        payment_data = {
            "id": str(uuid.uuid4()),
            "enrollment_request_id": enrollment["id"],
            "student_id": str(current_user.id),
            "teacher_id": session["teacher_id"],
            "session_id": session_id,
            "amount": price,
            "currency": (session.get("currency") or "LKR").upper(),
            "payment_status": "completed",
            "payment_method": "scholarship_grant",
            "transaction_id": f"GRANT-{uuid.uuid4().hex[:12].upper()}",
            "payment_gateway": "scholarship",
            "paid_at": now_iso,
        }
        create_resp = requests.post(payment_url, json=payment_data, headers=headers, timeout=10)
        if create_resp.status_code not in [200, 201]:
            raise HTTPException(
                status_code=create_resp.status_code,
                detail=f"Failed to record payment: {create_resp.text}",
            )

        requests.patch(
            f"{grant_url}?id=eq.{grant_id}",
            json={
                "status": "used",
                "used_at": now_iso,
                "applies_to_session_id": session_id,
            },
            headers=headers,
            timeout=10,
        )

        participant_url = f"{settings.supabase_url}/rest/v1/live_session_participants"
        requests.post(
            participant_url,
            json={
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "student_id": str(current_user.id),
                "registration_date": now_iso,
                "payment_status": "paid",
                "payment_amount": price,
            },
            headers=headers,
            timeout=10,
        )

        return {
            "message": "Grant applied successfully.",
            "payment": create_resp.json()[0]
            if isinstance(create_resp.json(), list)
            else create_resp.json(),
            "grant_id": grant_id,
            "can_join_session": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error applying grant: {str(e)}",
        )


@router.get("/sessions/{session_id}/payment-status")
async def check_payment_status(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if user has paid for a session"""
    try:
        import requests
        from config import settings
        
        headers = {
            "apikey": settings.supabase_key,
            "Authorization": f"Bearer {settings.supabase_key}",
            "Content-Type": "application/json"
        }
        
        payment_url = f"{settings.supabase_url}/rest/v1/live_session_payments"
        response = requests.get(
            payment_url,
            params={
                "session_id": f"eq.{session_id}",
                "student_id": f"eq.{str(current_user.id)}",
                "payment_status": "eq.completed"
            },
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            payments = response.json()
            has_paid = len(payments) > 0
            return {
                "has_paid": has_paid,
                "can_join": has_paid,
                "payment": payments[0] if has_paid else None
            }
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to check payment status: {response.text}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking payment status: {str(e)}"
        )
