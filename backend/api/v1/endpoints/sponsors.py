from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, date
import uuid
import logging

from pydantic import BaseModel, EmailStr, Field

from database.database import get_db
from database.supabase_client import SupabaseREST
from database.supabase_async import SupabaseRESTAsync
from core.security import get_current_active_user
from database.models import User

logger = logging.getLogger(__name__)

router = APIRouter()



class SponsorProfileSetupRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    industry: Optional[str] = Field(default=None, max_length=200)
    website: Optional[str] = Field(default=None, max_length=400)
    description: Optional[str] = None
    contact_person: Optional[str] = Field(default=None, max_length=200)
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = Field(default=None, max_length=64)
    logo_url: Optional[str] = None


@router.post("/profile/setup")
async def setup_sponsor_profile(
    payload: SponsorProfileSetupRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Create or update the caller's sponsor_profiles row.

    Idempotent on `user_id` so the registration flow can call it once and a
    settings page can reuse the same endpoint later.
    """
    if str(current_user.role) != "sponsor" and getattr(current_user.role, "value", None) != "sponsor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only sponsor accounts can create a sponsor profile.",
        )

    user_id = str(current_user.id)
    now_iso = datetime.utcnow().isoformat()

    existing = SupabaseREST.select_one("sponsor_profiles", "id", {"user_id": user_id})
    data = payload.model_dump(exclude_none=True)
    data["updated_at"] = now_iso

    if existing:
        result = SupabaseREST.update("sponsor_profiles", data, {"id": existing["id"]})
        if not result:
            raise HTTPException(status_code=500, detail="Failed to update sponsor profile")
        return {"success": True, "profile_id": existing["id"], "created": False}

    data["user_id"] = user_id
    data["created_at"] = now_iso
    result = SupabaseREST.insert("sponsor_profiles", data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create sponsor profile")
    return {"success": True, "profile_id": result.get("id"), "created": True}

async def get_sponsor_profile(current_user: User, db: AsyncSession):
    """Helper function to get sponsor profile"""
    if current_user.role != 'sponsor':
        return None

    sponsor_profile_result = await db.execute(
        text("SELECT * FROM sponsor_profiles WHERE user_id = :user_id"),
        {"user_id": str(current_user.id)}
    )
    sponsor = sponsor_profile_result.fetchone()
    return sponsor


def get_sponsor_profile_rest(user_id: str):
    """Get sponsor profile using REST API (for fallback scenarios)"""
    return SupabaseREST.select_one("sponsor_profiles", "*", {"user_id": user_id})



_TIME_FILTERS = {
    "last-7-days": 7,
    "last-30-days": 30,
    "last-90-days": 90,
    "last-year": 365,
}


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _pct_change(current: float, previous: float) -> str:
    """Real period-over-period delta as a signed percentage string.

    Returns "0%" when there's no prior baseline (avoids the old hardcoded
    "+12%" / "+24%" placeholders). New-from-zero growth is reported as
    "+100%" rather than a divide-by-zero.
    """
    if previous <= 0:
        return "+100%" if current > 0 else "0%"
    delta = (current - previous) / previous * 100
    sign = "+" if delta >= 0 else ""
    return f"{sign}{delta:.0f}%"


def _int_change(current: int, previous: int) -> str:
    delta = current - previous
    return f"+{delta}" if delta >= 0 else str(delta)


async def build_sponsor_analytics(sponsor_profile: Dict[str, Any], time_range: str,
                                  user_id: str) -> Dict[str, Any]:
    """Build the analytics payload for a sponsor from real data only.

    Splits the requested window into a current period and the immediately
    preceding period of equal length so every `change` figure is a real
    comparison rather than a constant.
    """
    days_back = _TIME_FILTERS.get(time_range, 30)
    now = datetime.now()
    start_cur = now - timedelta(days=days_back)
    start_prev = start_cur - timedelta(days=days_back)
    start_cur_s = start_cur.isoformat()
    start_prev_s = start_prev.isoformat()

    sponsor_id = str(sponsor_profile.get("id"))
    company_name = sponsor_profile.get("company_name", "") or ""

    campaigns = await SupabaseRESTAsync.select(
        "sponsor_campaigns", "*", {"sponsor_id": sponsor_id}
    ) or []

    def _campaign_window(rows, since, until=None):
        out = []
        for c in rows:
            created = c.get("created_at", "")
            if created and created >= since and (until is None or created < until):
                out.append(c)
        return out

    cur_campaigns = _campaign_window(campaigns, start_cur_s)
    prev_campaigns = _campaign_window(campaigns, start_prev_s, start_cur_s)

    def _campaign_totals(rows):
        students = sum(int(c.get("students_reached", 0) or 0) for c in rows)
        budget = sum(float(c.get("budget", 0) or 0) for c in rows)
        completions = [float(c.get("completion_percentage", 0) or 0) for c in rows]
        avg_completion = sum(completions) / len(completions) if completions else 0.0
        active = len([c for c in rows if c.get("status") == "active"])
        return students, budget, avg_completion, active

    cur_c_students, cur_c_budget, cur_avg_completion, cur_active = _campaign_totals(cur_campaigns)
    prev_c_students, prev_c_budget, prev_avg_completion, prev_active = _campaign_totals(prev_campaigns)

    max_reach = max((int(c.get("students_reached", 0) or 0) for c in cur_campaigns), default=0)

    campaign_metrics = []
    for c in sorted(cur_campaigns, key=lambda x: x.get("created_at", ""), reverse=True)[:10]:
        budget = float(c.get("budget", 0) or 0)
        students = int(c.get("students_reached", 0) or 0)
        completion = float(c.get("completion_percentage", 0) or 0)
        engagement = (students / max_reach * 100) if max_reach > 0 else 0.0
        campaign_metrics.append({
            "name": c.get("title", "Untitled Campaign"),
            "investment": f"LKR {budget:,.0f}",
            "roi": f"{completion:.0f}%",
            "studentsReached": students,
            "engagementRate": f"{engagement:.0f}%",
            "status": c.get("status", ""),
            "progress": completion,
        })

    events = await SupabaseRESTAsync.select("events", "*", {}) or []

    def _event_window(since, until=None):
        out = []
        for e in events:
            if not (e.get("sponsor", "") == company_name or str(e.get("organizer_id", "")) == str(user_id)):
                continue
            created = e.get("created_at", "")
            if created and created >= since and (until is None or created < until):
                out.append(e)
        return out

    cur_events = _event_window(start_cur_s)
    prev_events = _event_window(start_prev_s, start_cur_s)

    def _event_totals(rows):
        attendees = sum(int(e.get("current_attendees", 0) or 0) for e in rows)
        investment = sum(float(e.get("price", 0) or 0) for e in rows)
        capacity = sum(int(e.get("max_attendees", 0) or 0) for e in rows if int(e.get("max_attendees", 0) or 0) > 0)
        return attendees, investment, capacity

    cur_e_attendees, cur_e_investment, cur_capacity = _event_totals(cur_events)
    prev_e_attendees, prev_e_investment, _ = _event_totals(prev_events)

    cur_engagement = (cur_e_attendees / cur_capacity * 100) if cur_capacity > 0 else 0.0

    grants = await SupabaseRESTAsync.select(
        "student_funding_grants",
        "student_id,amount_lkr,status,created_at,used_at",
        {"sponsor_id": sponsor_id},
    ) or []

    def _grant_window(since, until=None):
        out = []
        for g in grants:
            created = g.get("created_at", "")
            if created and created >= since and (until is None or created < until):
                out.append(g)
        return out

    cur_grants = _grant_window(start_cur_s)
    prev_grants = _grant_window(start_prev_s, start_cur_s)

    def _grant_totals(rows):
        committed = sum(float(g.get("amount_lkr", 0) or 0) for g in rows)
        used = sum(float(g.get("amount_lkr", 0) or 0) for g in rows if g.get("status") == "used")
        funded_students = {str(g.get("student_id")) for g in rows if g.get("student_id")}
        return committed, used, len(funded_students)

    cur_committed, cur_used, cur_funded = _grant_totals(cur_grants)
    prev_committed, prev_used, prev_funded = _grant_totals(prev_grants)

    requests = await SupabaseRESTAsync.select("sponsorship_requests", "*", {}) or []
    cur_requests = [r for r in requests if (r.get("created_at") or r.get("submitted_at", "")) >= start_cur_s]
    approved_amount = sum(
        float(r.get("amount_requested", 0) or 0)
        for r in cur_requests if r.get("status") == "approved"
    )

    cur_investment = cur_c_budget + cur_e_investment
    prev_investment = prev_c_budget + prev_e_investment
    cur_students = cur_c_students + cur_e_attendees + cur_funded
    prev_students = prev_c_students + prev_e_attendees + prev_funded

    if cur_committed > 0:
        cur_roi = cur_used / cur_committed * 100
        prev_roi = (prev_used / prev_committed * 100) if prev_committed > 0 else 0.0
    else:
        cur_roi = cur_avg_completion
        prev_roi = prev_avg_completion

    monthly_data = []
    for i in range(5, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        if i > 0:
            month_end = (now.replace(day=1) - timedelta(days=30 * (i - 1))).replace(day=1)
        else:
            month_end = now + timedelta(days=1)
        key = month_start.strftime("%Y-%m")

        invest = sum(
            float(c.get("budget", 0) or 0) for c in campaigns
            if (_parse_iso(c.get("created_at")) and month_start <= _parse_iso(c.get("created_at")).replace(tzinfo=None) < month_end)
        )
        invest += sum(
            float(e.get("price", 0) or 0)
            for e in events
            if (e.get("sponsor", "") == company_name or str(e.get("organizer_id", "")) == str(user_id))
            and (_parse_iso(e.get("created_at")) and month_start <= _parse_iso(e.get("created_at")).replace(tzinfo=None) < month_end)
        )
        returns = sum(
            float(g.get("amount_lkr", 0) or 0) for g in grants
            if g.get("status") == "used" and g.get("used_at")
            and (_parse_iso(g.get("used_at")) and month_start <= _parse_iso(g.get("used_at")).replace(tzinfo=None) < month_end)
        )
        month_students = len({
            str(g.get("student_id")) for g in grants
            if g.get("student_id") and (_parse_iso(g.get("created_at")) and month_start <= _parse_iso(g.get("created_at")).replace(tzinfo=None) < month_end)
        })

        monthly_data.append({
            "month": month_start.strftime("%b"),
            "investment": int(invest / 1000),
            "returns": int(returns / 1000),
            "students": month_students,
        })

    return {
        "overviewMetrics": [
            {
                "label": "Total ROI",
                "value": f"{cur_roi:.0f}%",
                "change": _pct_change(cur_roi, prev_roi),
                "trend": "up" if cur_roi >= prev_roi else "down",
                "icon": "TrendingUp",
                "color": "text-green-600",
                "bgColor": "bg-green-50",
            },
            {
                "label": "Students Reached",
                "value": f"{cur_students:,}",
                "change": _pct_change(cur_students, prev_students),
                "trend": "up" if cur_students >= prev_students else "down",
                "icon": "Users",
                "color": "text-blue-600",
                "bgColor": "bg-blue-50",
            },
            {
                "label": "Campaign Performance",
                "value": f"{cur_avg_completion:.0f}%",
                "change": _pct_change(cur_avg_completion, prev_avg_completion),
                "trend": "up" if cur_avg_completion >= prev_avg_completion else "down",
                "icon": "Target",
                "color": "text-purple-600",
                "bgColor": "bg-purple-50",
            },
            {
                "label": "Average Engagement",
                "value": f"{cur_engagement:.0f}%",
                "change": _pct_change(cur_engagement, (prev_e_attendees / max(1, _event_totals(prev_events)[2]) * 100) if _event_totals(prev_events)[2] else 0),
                "trend": "up" if cur_engagement >= 75 else "down",
                "icon": "Activity",
                "color": "text-orange-600",
                "bgColor": "bg-orange-50",
            },
        ],
        "campaignMetrics": campaign_metrics,
        "monthlyData": monthly_data,
        "impactMetrics": [
            {
                "category": "Educational Impact",
                "metrics": [
                    {"label": "Active Campaigns", "value": str(cur_active), "change": _int_change(cur_active, prev_active)},
                    {"label": "Events Organized", "value": str(len(cur_events)), "change": _int_change(len(cur_events), len(prev_events))},
                    {"label": "Students Impacted", "value": f"{cur_students:,}", "change": _int_change(cur_students, prev_students)},
                    {"label": "Success Rate", "value": f"{cur_avg_completion:.0f}%", "change": _pct_change(cur_avg_completion, prev_avg_completion)},
                ],
            },
            {
                "category": "Business Impact",
                "metrics": [
                    {"label": "Total Investment", "value": f"LKR {cur_investment/1000000:.1f}M", "change": _pct_change(cur_investment, prev_investment)},
                    {"label": "Funds Deployed", "value": f"LKR {cur_used/1000:.0f}K", "change": _pct_change(cur_used, prev_used)},
                    {"label": "Approved Funding", "value": f"LKR {approved_amount/1000:.0f}K", "change": _int_change(len([r for r in cur_requests if r.get('status') == 'approved']), 0)},
                    {"label": "ROI", "value": f"{cur_roi:.0f}%", "change": _pct_change(cur_roi, prev_roi)},
                ],
            },
        ],
        "summary": {
            "timeRange": time_range,
            "totalInvestment": cur_investment,
            "totalStudents": cur_students,
            "totalCampaigns": len(cur_campaigns),
            "totalEvents": len(cur_events),
            "estimatedROI": round(cur_roi, 1),
            "fundsCommitted": round(cur_committed, 2),
            "fundsDeployed": round(cur_used, 2),
        },
    }

@router.get("/dashboard")
async def get_sponsor_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sponsor dashboard overview data"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Sponsor role required."
            )
        
        sponsor_profile = await db.execute(
            text("SELECT * FROM sponsor_profiles WHERE user_id = :user_id"),
            {"user_id": str(current_user.id)}
        )
        sponsor = sponsor_profile.fetchone()
        
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        active_campaigns_result = await db.execute(
            text("""
                SELECT COUNT(*) as count 
                FROM sponsor_campaigns 
                WHERE sponsor_id = :sponsor_id AND status = 'active'
            """),
            {"sponsor_id": str(sponsor.id)}
        )
        active_campaigns = active_campaigns_result.fetchone().count or 0
        
        students_reached_result = await db.execute(
            text("""
                SELECT COALESCE(SUM(students_reached), 0) as total 
                FROM sponsor_campaigns 
                WHERE sponsor_id = :sponsor_id
            """),
            {"sponsor_id": str(sponsor.id)}
        )
        students_reached = students_reached_result.fetchone().total or 0
        
        investment_result = await db.execute(
            text("""
                SELECT 
                    COALESCE(SUM(budget), 0) as campaign_budget
                FROM sponsor_campaigns 
                WHERE sponsor_id = :sponsor_id
            """),
            {"sponsor_id": str(sponsor.id)}
        )
        campaign_investment = investment_result.fetchone().campaign_budget or 0
        
        event_investment_result = await db.execute(
            text("""
                SELECT COALESCE(SUM(e.price * e.current_attendees), 0) as event_investment
                FROM events e
                WHERE e.organizer_id = :user_id
            """),
            {"user_id": str(current_user.id)}
        )
        event_investment = event_investment_result.fetchone().event_investment or 0
        
        total_investment = float(campaign_investment) + float(event_investment)
        
        roi_percentage = 0
        if total_investment > 0:
            roi_percentage = round((students_reached * 1000) / total_investment * 100, 1)
        
        now = datetime.now()
        prev_window_start = (now - timedelta(days=60)).isoformat()
        prev_window_end = (now - timedelta(days=30)).isoformat()
        sponsor_id_str = str(sponsor.id)

        prev_campaign_rows = await SupabaseRESTAsync.select(
            "sponsor_campaigns",
            "status,budget,students_reached,created_at",
            {"sponsor_id": sponsor_id_str,
             "created_at.gte": prev_window_start,
             "created_at.lt": prev_window_end},
        ) or []
        previous_campaigns = len([c for c in prev_campaign_rows if c.get("status") == "active"])
        previous_students = sum(int(c.get("students_reached", 0) or 0) for c in prev_campaign_rows)
        prev_campaign_budget = sum(float(c.get("budget", 0) or 0) for c in prev_campaign_rows)

        prev_event_rows = await SupabaseRESTAsync.select(
            "events",
            "price,current_attendees,created_at",
            {"organizer_id": str(current_user.id),
             "created_at.gte": prev_window_start,
             "created_at.lt": prev_window_end},
        ) or []
        prev_event_investment = sum(
            float(e.get("price", 0) or 0) * int(e.get("current_attendees", 0) or 0)
            for e in prev_event_rows
        )
        previous_investment = prev_campaign_budget + prev_event_investment
        previous_roi = round((previous_students * 1000) / previous_investment * 100, 1) if previous_investment > 0 else 0

        campaign_growth = f"+{active_campaigns - previous_campaigns}" if active_campaigns >= previous_campaigns else str(active_campaigns - previous_campaigns)
        student_growth = f"+{round(((students_reached - previous_students) / max(previous_students, 1)) * 100)}%" if students_reached > previous_students else "0%"
        investment_growth = f"+{round(((total_investment - previous_investment) / max(previous_investment, 1)) * 100)}%" if total_investment > previous_investment else "0%"
        roi_growth = f"+{round(((roi_percentage - previous_roi) / max(previous_roi, 1)) * 100)}%" if roi_percentage > previous_roi else "0%"
        
        if total_investment >= 1000000:
            investment_display = f"LKR {total_investment/1000000:.1f}M"
        elif total_investment >= 1000:
            investment_display = f"LKR {total_investment/1000:.0f}K"
        else:
            investment_display = f"LKR {total_investment:.0f}"
        
        dashboard_stats = {
            "activeCampaigns": {
                "value": str(active_campaigns),
                "change": campaign_growth
            },
            "studentsReached": {
                "value": f"{students_reached:,}",
                "change": student_growth
            },
            "investment": {
                "value": investment_display,
                "change": investment_growth
            },
            "roi": {
                "value": f"{roi_percentage}%",
                "change": roi_growth
            }
        }
        
        return {
            "success": True,
            "data": {
                "stats": dashboard_stats,
                "sponsor": {
                    "id": str(sponsor.id),
                    "company_name": sponsor.company_name,
                    "total_investment": sponsor.total_investment or 0,
                    "active_campaigns": sponsor.active_campaigns or 0,
                    "students_reached": sponsor.students_reached or 0,
                    "roi_percentage": sponsor.roi_percentage or 0
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sponsor dashboard: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch sponsor dashboard: {str(e)}"
        )


@router.get("/dashboard/rest")
async def get_sponsor_dashboard_rest(
    current_user: User = Depends(get_current_active_user)
):
    """Get sponsor dashboard using REST API (fallback endpoint)"""
    if current_user.role != 'sponsor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Sponsor role required."
        )

    try:
        user_id = str(current_user.id)

        sponsor = await SupabaseRESTAsync.select_one("sponsor_profiles", "*", {"user_id": user_id})

        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )

        sponsor_id = sponsor.get("id")

        campaigns = await SupabaseRESTAsync.select("sponsor_campaigns", "id,status,budget,students_reached", {"sponsor_id": sponsor_id})
        active_campaigns = len([c for c in campaigns if c.get("status") == "active"])

        total_budget = sum([float(c.get("budget", 0) or 0) for c in campaigns])
        students_reached = sum([int(c.get("students_reached", 0) or 0) for c in campaigns])

        events = await SupabaseRESTAsync.select("events", "id,price,current_attendees", {"organizer_id": user_id})
        events_hosted = len(events)

        return {
            "success": True,
            "stats": {
                "active_campaigns": active_campaigns,
                "total_budget": total_budget,
                "students_reached": students_reached,
                "events_hosted": events_hosted,
                "teacher_partnerships": 0,
                "roi": 0
            },
            "sponsor": {
                "id": sponsor_id,
                "company_name": sponsor.get("company_name", ""),
                "total_investment": sponsor.get("total_investment", 0),
                "active_campaigns": active_campaigns,
                "students_reached": students_reached
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"REST sponsor dashboard error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sponsor dashboard: {str(e)}"
        )


@router.get("/events/rest")
async def get_sponsor_events_rest(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user)
):
    """Get sponsor events using REST API (fallback endpoint)"""
    if current_user.role != 'sponsor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Sponsor role required."
        )

    try:
        user_id = str(current_user.id)

        events = SupabaseREST.select(
            "events",
            "*",
            {"organizer_id": user_id},
            order="created_at.desc",
            limit=limit
        )

        formatted_events = []
        total_attendees = 0
        total_investment = 0
        total_capacity = 0

        for event in events:
            price = float(event.get("price", 0) or 0)
            attendees = int(event.get("current_attendees", 0) or 0)
            capacity = int(event.get("max_attendees", 0) or 0)
            total_attendees += attendees
            total_investment += price
            if capacity > 0:
                total_capacity += capacity

            fill_rate = (attendees / capacity * 100) if capacity > 0 else 0

            formatted_events.append({
                "id": event.get("id"),
                "title": event.get("title", "Untitled Event"),
                "description": event.get("description", ""),
                "type": event.get("event_type", "workshop"),
                "status": event.get("status", "draft"),
                "startDate": event.get("start_date"),
                "endDate": event.get("end_date"),
                "location": event.get("location", "Online"),
                "isVirtual": event.get("is_virtual", False),
                "maxAttendees": event.get("max_attendees", 0),
                "currentAttendees": attendees,
                "registeredAttendees": attendees,
                "budget": f"LKR {price:,.0f}",
                "imageUrl": event.get("image_url"),
                "category": event.get("category", "General"),
                "tags": event.get("tags", []),
                "sponsorshipLevel": "Gold" if price > 100000 else "Silver" if price > 50000 else "Bronze",
                "expectedROI": f"{fill_rate:.0f}%",
                "created_at": event.get("created_at")
            })

        average_engagement = round((total_attendees / total_capacity * 100), 1) if total_capacity > 0 else 0

        return {
            "success": True,
            "data": {
                "events": formatted_events,
                "summary": {
                    "totalEvents": len(formatted_events),
                    "totalAttendees": total_attendees,
                    "totalInvestment": total_investment,
                    "averageROI": average_engagement
                },
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": len(events),
                    "pages": max(1, (len(events) + limit - 1) // limit)
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"REST sponsor events error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sponsor events: {str(e)}"
        )


@router.get("/campaigns/rest")
async def get_sponsor_campaigns_rest(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_active_user)
):
    """Get sponsor campaigns using REST API (fallback endpoint)"""
    if current_user.role != 'sponsor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Sponsor role required."
        )

    try:
        user_id = str(current_user.id)

        sponsor = SupabaseREST.select_one("sponsor_profiles", "id", {"user_id": user_id})
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )

        sponsor_id = sponsor.get("id")

        campaigns = SupabaseREST.select(
            "sponsor_campaigns",
            "*",
            {"sponsor_id": sponsor_id},
            order="created_at.desc",
            limit=limit
        )

        formatted_campaigns = []
        for campaign in campaigns:
            budget_val = float(campaign.get("budget", 0) or 0)
            completion = campaign.get("completion_percentage", 0) or 0
            students_reached = campaign.get("students_reached", 0) or 0

            formatted_campaigns.append({
                "id": campaign.get("id"),
                "title": campaign.get("name") or campaign.get("title", "Untitled Campaign"),
                "description": campaign.get("description", ""),
                "status": campaign.get("status", "draft"),
                "budget": f"LKR {budget_val:,.0f}",
                "studentsReached": students_reached,
                "completion": completion,
                "startDate": campaign.get("start_date"),
                "endDate": campaign.get("end_date"),
                "createdAt": campaign.get("created_at")
            })

        return {
            "success": True,
            "campaigns": formatted_campaigns,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": len(campaigns),
                "pages": max(1, (len(campaigns) + limit - 1) // limit)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"REST sponsor campaigns error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sponsor campaigns: {str(e)}"
        )


@router.get("/campaigns")
async def get_sponsor_campaigns(
    status_filter: str = Query("all", description="Filter by campaign status"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=50, description="Number of campaigns per page"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sponsor's campaigns"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Sponsor role required."
            )
        
        sponsor_profile = await db.execute(
            text("SELECT id FROM sponsor_profiles WHERE user_id = :user_id"),
            {"user_id": str(current_user.id)}
        )
        sponsor = sponsor_profile.fetchone()
        
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        conditions = ["sponsor_id = :sponsor_id"]
        params = {"sponsor_id": str(sponsor.id)}
        
        if status_filter != "all":
            conditions.append("status = :status")
            params["status"] = status_filter
        
        where_clause = " AND ".join(conditions)
        
        campaigns_query = f"""
            SELECT 
                id,
                title,
                description,
                budget,
                students_reached,
                completion_percentage,
                status,
                start_date,
                end_date,
                created_at
            FROM sponsor_campaigns
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """
        
        offset = (page - 1) * limit
        params.update({"limit": limit, "offset": offset})
        
        campaigns_result = await db.execute(text(campaigns_query), params)
        campaigns_data = []
        
        for campaign in campaigns_result.fetchall():
            campaigns_data.append({
                "id": str(campaign.id),
                "title": campaign.title,
                "description": campaign.description,
                "budget": f"LKR {float(campaign.budget or 0):,.0f}",
                "studentsReached": campaign.students_reached or 0,
                "completion": campaign.completion_percentage or 0,
                "status": campaign.status,
                "startDate": campaign.start_date.isoformat() if campaign.start_date else None,
                "endDate": campaign.end_date.isoformat() if campaign.end_date else None,
                "createdAt": campaign.created_at.isoformat() if campaign.created_at else None
            })
        
        count_query = f"""
            SELECT COUNT(*) as total
            FROM sponsor_campaigns
            WHERE {where_clause}
        """
        count_result = await db.execute(text(count_query), {k: v for k, v in params.items() if k not in ['limit', 'offset']})
        total_count = count_result.fetchone().total
        
        return {
            "success": True,
            "data": {
                "campaigns": campaigns_data,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total_count,
                    "pages": (total_count + limit - 1) // limit
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sponsor campaigns: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch sponsor campaigns: {str(e)}"
        )


@router.get("/recent-impact")
async def get_recent_impact(
    days: int = Query(30, ge=1, le=90, description="Number of days to look back"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get recent impact activities"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Sponsor role required."
            )
        
        sponsor_profile = await db.execute(
            text("SELECT id FROM sponsor_profiles WHERE user_id = :user_id"),
            {"user_id": str(current_user.id)}
        )
        sponsor = sponsor_profile.fetchone()
        
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        impact_activities = []
        
        campaign_completions = await db.execute(
            text("""
                SELECT 
                    title,
                    students_reached,
                    updated_at
                FROM sponsor_campaigns
                WHERE sponsor_id = :sponsor_id 
                AND updated_at >= CURRENT_TIMESTAMP - INTERVAL ':days days'
                AND completion_percentage > 0
                ORDER BY updated_at DESC
                LIMIT 5
            """),
            {"sponsor_id": str(sponsor.id), "days": days}
        )
        
        for completion in campaign_completions.fetchall():
            hours_ago = (datetime.now() - completion.updated_at).total_seconds() / 3600
            time_display = f"{int(hours_ago)} hours ago" if hours_ago < 24 else f"{int(hours_ago/24)} days ago"
            
            impact_activities.append({
                "id": str(uuid.uuid4()),
                "type": "Campaign Progress",
                "description": f"{completion.title} reached {completion.students_reached} students",
                "impact": "High" if completion.students_reached > 100 else "Medium",
                "date": time_display
            })
        
        recent_events = await db.execute(
            text("""
                SELECT 
                    title,
                    current_attendees,
                    start_date
                FROM events
                WHERE organizer_id = :user_id 
                AND start_date >= CURRENT_TIMESTAMP - INTERVAL ':days days'
                ORDER BY start_date DESC
                LIMIT 3
            """),
            {"user_id": str(current_user.id), "days": days}
        )
        
        for event in recent_events.fetchall():
            hours_ago = (datetime.now() - event.start_date).total_seconds() / 3600
            time_display = f"{int(hours_ago)} hours ago" if hours_ago < 24 else f"{int(hours_ago/24)} days ago"
            
            impact_activities.append({
                "id": str(uuid.uuid4()),
                "type": "Event Success",
                "description": f"{event.title} reached {event.current_attendees}+ participants",
                "impact": "High" if event.current_attendees > 200 else "Medium",
                "date": time_display
            })
        
        impact_activities.sort(key=lambda x: x["date"])
        impact_activities = impact_activities[:10]
        
        return {
            "success": True,
            "data": {
                "activities": impact_activities
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching recent impact: {e}")
        return {"success": False, "error": str(e), "data": {}}

@router.get("/sponsorship-requests")
async def get_sponsorship_requests(
    status_filter: str = Query("all", description="Filter by status"),
    category_filter: str = Query("all", description="Filter by category"), 
    search: str = Query("", description="Search term"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sponsorship requests for sponsors to review"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only sponsors can access sponsorship requests"
            )
        
        query = """
            SELECT 
                sr.id,
                sr.title,
                sr.description,
                sr.amount_requested,
                sr.students_impacted,
                sr.status,
                sr.submitted_at,
                sr.reviewed_at,
                sr.reviewer_notes,
                -- Teacher information
                COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '') as teacher_name,
                u.email as teacher_email,
                up.phone as teacher_phone,
                tp.title as teacher_title,
                tp.experience_years,
                tp.average_rating,
                tp.specializations,
                -- Additional details we can derive
                'Education' as category,
                CASE 
                    WHEN sr.amount_requested > 200000 THEN 'high'
                    WHEN sr.amount_requested > 100000 THEN 'medium'
                    ELSE 'low'
                END as urgency
            FROM sponsorship_requests sr
            JOIN users u ON sr.teacher_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
            WHERE 1=1
        """
        
        params = {}
        
        if status_filter != "all":
            query += " AND sr.status = :status_filter"
            params["status_filter"] = status_filter
            
        if search:
            query += " AND (sr.title ILIKE :search OR sr.description ILIKE :search OR COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '') ILIKE :search)"
            params["search"] = f"%{search}%"
        
        query += " ORDER BY sr.submitted_at DESC"
        
        offset = (page - 1) * limit
        query += f" LIMIT {limit} OFFSET {offset}"
        
        result = await db.execute(text(query), params)
        requests_data = []
        
        for row in result.fetchall():
            request_data = {
                "id": str(row.id),
                "teacherName": row.teacher_name or "Unknown Teacher",
                "teacherEmail": row.teacher_email,
                "teacherPhone": row.teacher_phone or "Not provided",
                "teacherTitle": row.teacher_title or "Teacher",
                "school": "To be updated",
                "location": "Sri Lanka",
                "rating": float(row.average_rating) if row.average_rating else None,
                "experience": f"{row.experience_years or 5} years",
                "projectTitle": row.title,
                "projectDescription": row.description or "No description provided",
                "amountRequested": float(row.amount_requested),
                "studentsImpacted": row.students_impacted or 0,
                "submissionDate": row.submitted_at.isoformat() if row.submitted_at else None,
                "status": row.status,
                "category": row.category,
                "urgency": row.urgency,
                "specializations": row.specializations or []
            }
            requests_data.append(request_data)
        
        summary_query = """
            SELECT 
                COUNT(*) as total_requests,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_requests,
                COALESCE(SUM(students_impacted), 0) as total_students,
                COALESCE(SUM(amount_requested), 0) as total_amount
            FROM sponsorship_requests sr
        """
        
        summary_result = await db.execute(text(summary_query))
        summary = summary_result.fetchone()
        
        return {
            "success": True,
            "data": {
                "requests": requests_data,
                "summary": {
                    "totalRequests": summary.total_requests or 0,
                    "pendingRequests": summary.pending_requests or 0,
                    "totalStudents": summary.total_students or 0,
                    "totalAmount": float(summary.total_amount or 0)
                },
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": summary.total_requests or 0
                }
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching sponsorship requests: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch sponsorship requests"
        )


@router.get("/sponsorship-requests/rest")
async def get_sponsorship_requests_rest(
    status_filter: str = Query("all", description="Filter by status"),
    category_filter: str = Query("all", description="Filter by category"),
    search: str = Query("", description="Search term"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_active_user)
):
    """Get sponsorship requests using REST API (fallback endpoint)"""
    if current_user.role != 'sponsor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only sponsors can access sponsorship requests"
        )

    try:
        requests_data = SupabaseREST.select(
            "sponsorship_requests",
            "*",
            {},
            order="submitted_at.desc",
            limit=limit
        )

        formatted_requests = []
        total_students = 0
        total_amount = 0
        pending_count = 0

        for req in requests_data:
            request_status = req.get("status", "pending")
            amount = float(req.get("amount_requested", 0) or 0)
            students = int(req.get("students_impacted", 0) or 0)

            if status_filter != "all" and request_status != status_filter:
                continue

            total_students += students
            total_amount += amount
            if request_status == "pending":
                pending_count += 1

            teacher_id = req.get("teacher_id")
            teacher_name = "Unknown Teacher"
            teacher_email = ""
            teacher_phone = ""

            if teacher_id:
                user_data = SupabaseREST.select_one("users", "id,email", {"id": teacher_id})
                if user_data:
                    teacher_email = user_data.get("email", "")
                    profile_data = SupabaseREST.select_one("user_profiles", "first_name,last_name,phone", {"user_id": teacher_id})
                    if profile_data:
                        first_name = profile_data.get("first_name", "")
                        last_name = profile_data.get("last_name", "")
                        teacher_name = f"{first_name} {last_name}".strip() or "Unknown Teacher"
                        teacher_phone = profile_data.get("phone", "Not provided")

            urgency = "low"
            if amount > 200000:
                urgency = "high"
            elif amount > 100000:
                urgency = "medium"

            formatted_requests.append({
                "id": req.get("id"),
                "teacherName": teacher_name,
                "teacherEmail": teacher_email,
                "teacherPhone": teacher_phone or "Not provided",
                "teacherTitle": "Teacher",
                "school": "To be updated",
                "location": "Sri Lanka",
                "rating": 4.5,
                "experience": "5 years",
                "projectTitle": req.get("title", "Untitled Project"),
                "projectDescription": req.get("description", "No description provided"),
                "amountRequested": amount,
                "studentsImpacted": students,
                "submissionDate": req.get("submitted_at"),
                "status": request_status,
                "category": "Education",
                "urgency": urgency
            })

        return {
            "success": True,
            "data": {
                "requests": formatted_requests,
                "summary": {
                    "totalRequests": len(formatted_requests),
                    "pendingRequests": pending_count,
                    "totalStudents": total_students,
                    "totalAmount": total_amount
                },
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": len(formatted_requests)
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"REST sponsorship requests error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sponsorship requests: {str(e)}"
        )


@router.put("/sponsorship-requests/{request_id}/status")
async def update_sponsorship_request_status(
    request_id: str,
    status_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update sponsorship request status (approve/reject)"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only sponsors can update sponsorship requests"
            )
        
        new_status = status_data.get('status')
        reviewer_notes = status_data.get('notes', '')
        
        if new_status not in ['approved', 'rejected', 'under_review']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status. Must be 'approved', 'rejected', or 'under_review'"
            )
        
        update_query = """
            UPDATE sponsorship_requests 
            SET status = :status,
                reviewed_at = CURRENT_TIMESTAMP,
                reviewer_notes = :notes,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :request_id
        """
        
        await db.execute(text(update_query), {
            "status": new_status,
            "notes": reviewer_notes,
            "request_id": request_id
        })
        
        await db.commit()
        
        return {
            "success": True,
            "message": f"Sponsorship request {new_status} successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating sponsorship request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update sponsorship request"
        )

@router.get("/campaigns/detailed")
async def get_detailed_campaigns(
    status_filter: str = Query("all", description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed campaign information for sponsor"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only sponsors can access campaign details"
            )
        
        sponsor_profile = await db.execute(
            text("SELECT id FROM sponsor_profiles WHERE user_id = :user_id"),
            {"user_id": str(current_user.id)}
        )
        sponsor = sponsor_profile.fetchone()
        
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        query = """
            SELECT 
                sc.id,
                sc.title,
                sc.description,
                sc.budget,
                sc.students_reached,
                sc.completion_percentage,
                sc.status,
                sc.start_date,
                sc.end_date,
                sc.created_at,
                -- Calculate additional metrics
                CASE 
                    WHEN sc.budget > 0 AND sc.students_reached > 0 
                    THEN ROUND((sc.budget::numeric / sc.students_reached), 2)
                    ELSE 0 
                END as cost_per_student,
                CASE 
                    WHEN sc.end_date IS NOT NULL AND sc.end_date > CURRENT_DATE THEN 
                        EXTRACT(DAY FROM (sc.end_date - CURRENT_DATE))
                    ELSE 0
                END as days_remaining
            FROM sponsor_campaigns sc
            WHERE sc.sponsor_id = :sponsor_id
        """
        
        params = {"sponsor_id": str(sponsor.id)}
        
        if status_filter != "all":
            query += " AND sc.status = :status_filter"
            params["status_filter"] = status_filter
        
        query += " ORDER BY sc.created_at DESC"
        offset = (page - 1) * limit
        query += f" LIMIT {limit} OFFSET {offset}"
        
        result = await db.execute(text(query), params)
        campaigns_data = []
        
        for row in result.fetchall():
            progress_percentage = row.completion_percentage or 0
            budget = float(row.budget) if row.budget else 0
            students_reached = row.students_reached or 0
            days_remaining = int(row.days_remaining) if row.days_remaining else 0
            
            computed_status = row.status
            if row.end_date:
                from datetime import date
                if row.end_date > date.today():
                    computed_status = "active" if row.status == "active" else row.status
                elif row.end_date <= date.today() and row.status == "active":
                    computed_status = "completed"
            
            health_status = "good"
            if progress_percentage < 25 and computed_status == "active":
                health_status = "needs_attention"
            elif progress_percentage > 75:
                health_status = "excellent"
            
            campaign_data = {
                "id": str(row.id),
                "title": row.title,
                "description": row.description or "No description provided",
                "budget": budget,
                "studentsReached": students_reached,
                "completionPercentage": progress_percentage,
                "status": row.status,
                "computedStatus": computed_status,
                "startDate": row.start_date.isoformat() if row.start_date else None,
                "endDate": row.end_date.isoformat() if row.end_date else None,
                "daysRemaining": days_remaining,
                "costPerStudent": float(row.cost_per_student) if row.cost_per_student else 0,
                "healthStatus": health_status,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "budgetUtilized": round(budget * (progress_percentage / 100), 2) if budget and progress_percentage else 0,
                "averageImpactPerStudent": round(budget / students_reached, 2) if students_reached > 0 else 0
            }
            campaigns_data.append(campaign_data)
        
        summary_query = """
            SELECT 
                COUNT(*) as total_campaigns,
                COUNT(*) FILTER (WHERE status = 'active') as active_campaigns,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_campaigns,
                COUNT(*) FILTER (WHERE status = 'draft') as draft_campaigns,
                COALESCE(SUM(budget), 0) as total_budget,
                COALESCE(SUM(students_reached), 0) as total_students_reached,
                COALESCE(AVG(completion_percentage), 0) as average_completion
            FROM sponsor_campaigns
            WHERE sponsor_id = :sponsor_id
        """
        
        summary_result = await db.execute(text(summary_query), params)
        summary = summary_result.fetchone()
        
        return {
            "success": True,
            "data": {
                "campaigns": campaigns_data,
                "summary": {
                    "totalCampaigns": summary.total_campaigns or 0,
                    "activeCampaigns": summary.active_campaigns or 0,
                    "completedCampaigns": summary.completed_campaigns or 0,
                    "draftCampaigns": summary.draft_campaigns or 0,
                    "totalBudget": float(summary.total_budget or 0),
                    "totalStudentsReached": summary.total_students_reached or 0,
                    "averageCompletion": float(summary.average_completion or 0)
                },
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": summary.total_campaigns or 0
                }
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching detailed campaigns: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch campaign details"
        )

@router.post("/campaigns")
async def create_campaign(
    campaign_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new campaign"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only sponsors can create campaigns"
            )
        
        sponsor_profile = await db.execute(
            text("SELECT id FROM sponsor_profiles WHERE user_id = :user_id"),
            {"user_id": str(current_user.id)}
        )
        sponsor = sponsor_profile.fetchone()
        
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        title = campaign_data.get('title', '').strip()
        description = campaign_data.get('description', '').strip()
        budget = campaign_data.get('budget', 0)
        
        start_date = campaign_data.get('startDate')
        if start_date == '' or start_date is None:
            start_date = None
        elif isinstance(start_date, str):
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid start date format. Use YYYY-MM-DD"
                )
        
        end_date = campaign_data.get('endDate')  
        if end_date == '' or end_date is None:
            end_date = None
        elif isinstance(end_date, str):
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid end date format. Use YYYY-MM-DD"
                )
        
        if not title:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Campaign title is required"
            )
        
        if budget <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Campaign budget must be greater than 0"
            )
        
        campaign_id = await db.execute(text("""
            INSERT INTO sponsor_campaigns (
                sponsor_id, title, description, budget, 
                start_date, end_date, status
            ) VALUES (
                :sponsor_id, :title, :description, :budget,
                :start_date, :end_date, 'draft'
            ) RETURNING id
        """), {
            "sponsor_id": str(sponsor.id),
            "title": title,
            "description": description,
            "budget": budget,
            "start_date": start_date,
            "end_date": end_date
        })
        
        new_campaign_id = campaign_id.fetchone()[0]
        await db.commit()
        
        return {
            "success": True,
            "message": "Campaign created successfully",
            "data": {
                "campaignId": str(new_campaign_id)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating campaign: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create campaign"
        )

@router.put("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    campaign_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing campaign"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only sponsors can update campaigns"
            )
        
        sponsor_profile = await db.execute(
            text("SELECT id FROM sponsor_profiles WHERE user_id = :user_id"),
            {"user_id": str(current_user.id)}
        )
        sponsor = sponsor_profile.fetchone()
        
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        campaign_check = await db.execute(text("""
            SELECT id FROM sponsor_campaigns 
            WHERE id = :campaign_id AND sponsor_id = :sponsor_id
        """), {
            "campaign_id": campaign_id,
            "sponsor_id": str(sponsor.id)
        })
        
        if not campaign_check.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found or access denied"
            )
        
        update_fields = []
        params = {"campaign_id": campaign_id}
        
        if 'title' in campaign_data:
            update_fields.append("title = :title")
            params["title"] = campaign_data['title'].strip()
        
        if 'description' in campaign_data:
            update_fields.append("description = :description")
            params["description"] = campaign_data['description'].strip()
        
        if 'budget' in campaign_data:
            update_fields.append("budget = :budget")
            params["budget"] = campaign_data['budget']
        
        if 'status' in campaign_data:
            update_fields.append("status = :status")
            params["status"] = campaign_data['status']
        
        if 'studentsReached' in campaign_data:
            update_fields.append("students_reached = :students_reached")
            params["students_reached"] = campaign_data['studentsReached']
        
        if 'completionPercentage' in campaign_data:
            update_fields.append("completion_percentage = :completion_percentage")
            params["completion_percentage"] = campaign_data['completionPercentage']
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields to update"
            )
        
        update_query = f"""
            UPDATE sponsor_campaigns 
            SET {', '.join(update_fields)}
            WHERE id = :campaign_id
        """
        
        await db.execute(text(update_query), params)
        await db.commit()
        
        return {
            "success": True,
            "message": "Campaign updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating campaign: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update campaign"
        )

@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a campaign"""
    try:
        if current_user.role != 'sponsor':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only sponsors can delete campaigns"
            )
        
        sponsor_profile = await db.execute(
            text("SELECT id FROM sponsor_profiles WHERE user_id = :user_id"),
            {"user_id": str(current_user.id)}
        )
        sponsor = sponsor_profile.fetchone()
        
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        campaign_check = await db.execute(text("""
            SELECT id, status FROM sponsor_campaigns 
            WHERE id = :campaign_id AND sponsor_id = :sponsor_id
        """), {
            "campaign_id": campaign_id,
            "sponsor_id": str(sponsor.id)
        })
        
        campaign = campaign_check.fetchone()
        if not campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found or access denied"
            )
        
        if campaign.status == 'active':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete active campaigns. Please pause or complete the campaign first."
            )
        
        await db.execute(text("""
            DELETE FROM sponsor_campaigns 
            WHERE id = :campaign_id
        """), {"campaign_id": campaign_id})
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Campaign deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"Error deleting campaign: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete campaign"
        )

@router.get("/events")
async def get_sponsor_events(
    status_filter: str = "all",
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get events for sponsor (events they sponsor or organize)"""

    if current_user.role != 'sponsor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Sponsor role required."
        )

    try:
        sponsor = await get_sponsor_profile(current_user, db)

        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        offset = (page - 1) * limit
        
        query = """
            SELECT 
                e.id,
                e.title,
                e.description,
                e.category,
                e.start_date,
                e.end_date,
                e.location,
                e.is_online,
                e.price,
                e.max_attendees,
                e.current_attendees,
                e.image_url,
                e.tags,
                e.level,
                e.has_certificate,
                e.sponsor,
                e.is_featured,
                e.created_at,
                -- Organizer info
                COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '') as organizer_name,
                u.email as organizer_email,
                u.role as organizer_role,
                -- Event status based on dates
                CASE 
                    WHEN e.start_date > CURRENT_TIMESTAMP THEN 'upcoming'
                    WHEN e.start_date <= CURRENT_TIMESTAMP AND e.end_date >= CURRENT_TIMESTAMP THEN 'ongoing'
                    WHEN e.end_date < CURRENT_TIMESTAMP THEN 'completed'
                    ELSE 'planned'
                END as computed_status,
                -- Calculate days until event
                CASE 
                    WHEN e.start_date > CURRENT_TIMESTAMP THEN 
                        EXTRACT(DAY FROM (e.start_date - CURRENT_TIMESTAMP))
                    ELSE 0
                END as days_until_event,
                -- Registration percentage
                CASE 
                    WHEN e.max_attendees > 0 THEN 
                        ROUND((e.current_attendees::numeric / e.max_attendees) * 100, 1)
                    ELSE 0
                END as registration_percentage
            FROM events e
            LEFT JOIN users u ON e.organizer_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE (
                e.sponsor = :company_name OR 
                e.organizer_id = :user_id OR
                e.sponsor ILIKE '%' || :company_name || '%'
            )
        """
        
        params = {
            "company_name": sponsor.company_name,
            "user_id": str(current_user.id)
        }
        
        if status_filter != "all":
            if status_filter == "upcoming":
                query += " AND e.start_date > CURRENT_TIMESTAMP"
            elif status_filter == "ongoing":
                query += " AND e.start_date <= CURRENT_TIMESTAMP AND e.end_date >= CURRENT_TIMESTAMP"
            elif status_filter == "completed":
                query += " AND e.end_date < CURRENT_TIMESTAMP"
            elif status_filter == "planned":
                query += " AND e.start_date > CURRENT_TIMESTAMP + INTERVAL '30 days'"
        
        query += " ORDER BY e.start_date DESC"
        query += f" LIMIT {limit} OFFSET {offset}"
        
        result = await db.execute(text(query), params)
        events_data = []
        
        for row in result.fetchall():
            event_type = "Event"
            if row.category in ['workshop', 'training']:
                event_type = "Workshop"
            elif row.category in ['conference', 'seminar']:
                event_type = "Conference"
            elif row.is_online:
                event_type = "Webinar"
            elif row.category in ['competition', 'hackathon']:
                event_type = "Competition"
            
            sponsorship_level = "Bronze"
            if row.price and float(row.price) > 10000:
                sponsorship_level = "Platinum"
            elif row.price and float(row.price) > 5000:
                sponsorship_level = "Gold"
            elif row.price and float(row.price) > 1000:
                sponsorship_level = "Silver"
            
            _att = int(row.current_attendees or 0)
            _cap = int(row.max_attendees or 0)
            fill_rate = (_att / _cap * 100) if _cap > 0 else 0
            expected_roi = f"{fill_rate:.0f}%"

            event_data = {
                "id": str(row.id),
                "title": row.title,
                "description": row.description or "No description provided",
                "status": row.computed_status,
                "date": row.start_date.strftime("%Y-%m-%d") if row.start_date else None,
                "time": f"{row.start_date.strftime('%I:%M %p')} - {row.end_date.strftime('%I:%M %p')}" if row.start_date and row.end_date else "TBD",
                "location": row.location or ("Online Platform" if row.is_online else "TBD"),
                "type": event_type,
                "category": row.category.title() if row.category else "General",
                "maxAttendees": row.max_attendees or 0,
                "registeredAttendees": row.current_attendees or 0,
                "budget": f"LKR {float(row.price or 0):,.0f}",
                "sponsorshipLevel": sponsorship_level,
                "expectedROI": expected_roi,
                "targetAudience": "Students, Educators",
                "isVirtual": row.is_online or False,
                "speakers": ["TBD"],
                "benefits": ["Brand visibility", "Student engagement", "Community impact"],
                "image": row.image_url,
                "organizer": {
                    "name": row.organizer_name or "Unknown Organizer",
                    "email": row.organizer_email,
                    "role": row.organizer_role.title() if row.organizer_role else "Organizer"
                },
                "daysUntilEvent": int(row.days_until_event) if row.days_until_event else 0,
                "registrationPercentage": float(row.registration_percentage) if row.registration_percentage else 0,
                "tags": row.tags or [],
                "level": row.level or "all",
                "hasCertificate": row.has_certificate or False,
                "isFeatured": row.is_featured or False,
                "createdAt": row.created_at.isoformat() if row.created_at else None
            }
            events_data.append(event_data)
        
        summary_query = """
            SELECT 
                COUNT(*) as total_events,
                COUNT(CASE WHEN e.start_date > CURRENT_TIMESTAMP THEN 1 END) as upcoming_events,
                COUNT(CASE WHEN e.start_date <= CURRENT_TIMESTAMP AND e.end_date >= CURRENT_TIMESTAMP THEN 1 END) as ongoing_events,
                COUNT(CASE WHEN e.end_date < CURRENT_TIMESTAMP THEN 1 END) as completed_events,
                COALESCE(SUM(e.price), 0) as total_investment,
                COALESCE(SUM(e.current_attendees), 0) as total_attendees,
                COALESCE(SUM(CASE WHEN e.max_attendees > 0 THEN e.max_attendees ELSE 0 END), 0) as total_capacity
            FROM events e
            WHERE (
                e.sponsor = :company_name OR
                e.organizer_id = :user_id OR
                e.sponsor ILIKE '%' || :company_name || '%'
            )
        """

        summary_result = await db.execute(text(summary_query), params)
        summary_row = summary_result.fetchone()

        _total_att = summary_row.total_attendees or 0
        _total_cap = summary_row.total_capacity or 0
        average_engagement = round((_total_att / _total_cap * 100), 1) if _total_cap > 0 else 0

        summary_data = {
            "totalEvents": summary_row.total_events or 0,
            "upcomingEvents": summary_row.upcoming_events or 0,
            "ongoingEvents": summary_row.ongoing_events or 0,
            "completedEvents": summary_row.completed_events or 0,
            "totalInvestment": float(summary_row.total_investment or 0),
            "totalAttendees": _total_att,
            "averageROI": average_engagement
        }
        
        return {
            "success": True,
            "data": {
                "events": events_data,
                "summary": summary_data,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": summary_data["totalEvents"]
                }
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching sponsor events: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch events"
        )


@router.post("/events")
async def create_sponsor_event(
    event_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new event for sponsor"""
    try:
        sponsor = await get_sponsor_profile(current_user, db)
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        event_id = uuid.uuid4()
        create_query = """
            INSERT INTO events (
                id, organizer_id, title, description, category, start_date, end_date,
                location, is_online, price, max_attendees, image_url, tags, level,
                has_certificate, sponsor, is_featured
            ) VALUES (
                :id, :organizer_id, :title, :description, :category, :start_date, :end_date,
                :location, :is_online, :price, :max_attendees, :image_url, :tags, :level,
                :has_certificate, :sponsor, :is_featured
            )
        """
        
        await db.execute(text(create_query), {
            "id": event_id,
            "organizer_id": current_user.id,
            "title": event_data.get("title"),
            "description": event_data.get("description"),
            "category": event_data.get("category"),
            "start_date": event_data.get("startDate"),
            "end_date": event_data.get("endDate"),
            "location": event_data.get("location"),
            "is_online": event_data.get("isVirtual", False),
            "price": event_data.get("budget", 0),
            "max_attendees": event_data.get("maxAttendees"),
            "image_url": event_data.get("imageUrl"),
            "tags": event_data.get("tags", []),
            "level": event_data.get("level", "all"),
            "has_certificate": event_data.get("hasCertificate", False),
            "sponsor": sponsor.company_name,
            "is_featured": event_data.get("isFeatured", False)
        })
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Event created successfully",
            "data": {"event_id": str(event_id)}
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"Error creating event: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create event"
        )

@router.get("/events/{event_id}")
async def get_sponsor_event(
    event_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get single event details"""
    try:
        sponsor = await get_sponsor_profile(current_user, db)
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        query = """
            SELECT 
                e.id, e.title, e.description, e.category, e.start_date, e.end_date,
                e.location, e.is_online, e.price, e.max_attendees, e.current_attendees,
                e.image_url, e.tags, e.level, e.has_certificate, e.sponsor, e.is_featured,
                e.created_at,
                COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '') as organizer_name,
                u.email as organizer_email
            FROM events e
            LEFT JOIN users u ON e.organizer_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE e.id = :event_id
            AND (e.sponsor = :company_name OR e.organizer_id = :user_id)
        """
        
        result = await db.execute(text(query), {
            "event_id": event_id,
            "company_name": sponsor.company_name,
            "user_id": str(current_user.id)
        })
        
        event = result.fetchone()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found"
            )
        
        event_data = {
            "id": str(event.id),
            "title": event.title,
            "description": event.description,
            "category": event.category,
            "startDate": event.start_date.isoformat() if event.start_date else None,
            "endDate": event.end_date.isoformat() if event.end_date else None,
            "location": event.location,
            "isVirtual": event.is_online,
            "budget": float(event.price or 0),
            "maxAttendees": event.max_attendees,
            "currentAttendees": event.current_attendees or 0,
            "imageUrl": event.image_url,
            "tags": event.tags or [],
            "level": event.level,
            "hasCertificate": event.has_certificate,
            "sponsor": event.sponsor,
            "isFeatured": event.is_featured,
            "organizer": {
                "name": event.organizer_name or "Unknown",
                "email": event.organizer_email
            }
        }
        
        return {"success": True, "data": event_data}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching event: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch event"
        )

@router.put("/events/{event_id}")
async def update_sponsor_event(
    event_id: str,
    event_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing event"""
    try:
        sponsor = await get_sponsor_profile(current_user, db)
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        check_query = """
            SELECT id FROM events 
            WHERE id = :event_id 
            AND (sponsor = :company_name OR organizer_id = :user_id)
        """
        
        check_result = await db.execute(text(check_query), {
            "event_id": event_id,
            "company_name": sponsor.company_name,
            "user_id": str(current_user.id)
        })
        
        if not check_result.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found or access denied"
            )
        
        update_query = """
            UPDATE events SET
                title = :title,
                description = :description,
                category = :category,
                start_date = :start_date,
                end_date = :end_date,
                location = :location,
                is_online = :is_online,
                price = :price,
                max_attendees = :max_attendees,
                image_url = :image_url,
                tags = :tags,
                level = :level,
                has_certificate = :has_certificate,
                is_featured = :is_featured
            WHERE id = :event_id
        """
        
        await db.execute(text(update_query), {
            "event_id": event_id,
            "title": event_data.get("title"),
            "description": event_data.get("description"),
            "category": event_data.get("category"),
            "start_date": event_data.get("startDate"),
            "end_date": event_data.get("endDate"),
            "location": event_data.get("location"),
            "is_online": event_data.get("isVirtual", False),
            "price": event_data.get("budget", 0),
            "max_attendees": event_data.get("maxAttendees"),
            "image_url": event_data.get("imageUrl"),
            "tags": event_data.get("tags", []),
            "level": event_data.get("level", "all"),
            "has_certificate": event_data.get("hasCertificate", False),
            "is_featured": event_data.get("isFeatured", False)
        })
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Event updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"Error updating event: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update event"
        )

@router.delete("/events/{event_id}")
async def delete_sponsor_event(
    event_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an event"""
    try:
        sponsor = await get_sponsor_profile(current_user, db)
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        check_query = """
            SELECT id FROM events 
            WHERE id = :event_id 
            AND (sponsor = :company_name OR organizer_id = :user_id)
        """
        
        check_result = await db.execute(text(check_query), {
            "event_id": event_id,
            "company_name": sponsor.company_name,
            "user_id": str(current_user.id)
        })
        
        if not check_result.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found or access denied"
            )
        
        await db.execute(text("DELETE FROM event_registrations WHERE event_id = :event_id"), {
            "event_id": event_id
        })
        
        await db.execute(text("DELETE FROM events WHERE id = :event_id"), {
            "event_id": event_id
        })
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Event deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"Error deleting event: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete event"
        )

@router.put("/events/{event_id}/launch")
async def launch_sponsor_event(
    event_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Launch a planned event (change status to active)"""
    try:
        sponsor = await get_sponsor_profile(current_user, db)
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        
        update_query = """
            UPDATE events SET
                is_featured = true
            WHERE id = :event_id 
            AND (sponsor = :company_name OR organizer_id = :user_id)
        """
        
        result = await db.execute(text(update_query), {
            "event_id": event_id,
            "company_name": sponsor.company_name,
            "user_id": str(current_user.id)
        })
        
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found or access denied"
            )
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Event launched successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"Error launching event: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to launch event"
        )

@router.get("/analytics")
async def get_sponsor_analytics(
    time_range: str = "last-30-days",
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get analytics data for a sponsor.

    SupabaseREST-backed via ``build_sponsor_analytics`` so it returns real
    aggregates (no mock ROI, no fabricated monthly "returns" curve) and works
    whether or not the optional SQLAlchemy engine is connected. The
    ``/analytics/rest`` twin shares the exact same implementation.
    """
    if current_user.role != 'sponsor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Sponsor role required."
        )
    try:
        sponsor = SupabaseREST.select_one(
            "sponsor_profiles", "*", {"user_id": str(current_user.id)}
        )
        if not sponsor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        data = await build_sponsor_analytics(sponsor, time_range, str(current_user.id))
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sponsor analytics error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch analytics"
        )


@router.get("/analytics/rest")
async def get_sponsor_analytics_rest(
    time_range: str = "last-30-days",
    current_user: User = Depends(get_current_active_user)
):
    """Get analytics data for sponsor using REST API (fallback endpoint)."""
    if current_user.role != 'sponsor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Sponsor role required."
        )
    try:
        sponsor_profile = SupabaseREST.select_one(
            "sponsor_profiles", "*", {"user_id": str(current_user.id)}
        )
        if not sponsor_profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sponsor profile not found"
            )
        data = await build_sponsor_analytics(sponsor_profile, time_range, str(current_user.id))
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"REST analytics error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch analytics: {str(e)}"
        )
