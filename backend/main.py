from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager
import logging
from datetime import datetime
import os
from typing import Optional

from config import settings, validate_secret_key
from database.database import init_db, close_db
from database.supabase_client import init_supabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

validate_secret_key(settings)

_reminder_task: Optional["asyncio.Task[None]"] = None


async def _reminder_loop():
    """Background coroutine that walks live_sessions starting in the next
    `REMINDER_WINDOW_MIN` minutes and triggers reminder emails.

    Why this lives in-process rather than relying on an external cron:
    - In dev / demo environments there's no scheduler available, so the
      `/admin/send-session-reminders` endpoint never fires and the email
      flow is invisible. Running it on a loop means the feature actually
      works out of the box.
    - In production, an external scheduler can still hit the endpoint; our
      loop is idempotent (the endpoint dedupes via notifications + the
      window is short) so duplicates don't compound.

    Set `REMINDER_LOOP_ENABLED=false` to disable (e.g. when a real cron
    is wired) or `REMINDER_LOOP_INTERVAL_SEC` to tune cadence.
    """
    import asyncio
    interval = int(os.getenv("REMINDER_LOOP_INTERVAL_SEC", "300"))
    window = int(os.getenv("REMINDER_WINDOW_MIN", "30"))

    from api.v1.endpoints.admin import send_session_reminders  # type: ignore

    try:
        while True:
            try:
                from datetime import datetime as _dt, timedelta as _td, timezone as _tz
                from services.email_service import send_session_reminder_email
                from database.supabase_client import SupabaseREST
                now = _dt.now(_tz.utc)
                horizon = now + _td(minutes=window)
                rows = SupabaseREST.select(
                    "live_sessions",
                    "id,title,teacher_id,scheduled_start",
                    {
                        "scheduled_start.gte": now.isoformat(),
                        "scheduled_start.lte": horizon.isoformat(),
                    },
                    order="scheduled_start.asc",
                    limit=200,
                ) or []
                for s in rows:
                    sid = str(s.get("id"))

                    teacher_name = ""
                    teacher_id = str(s.get("teacher_id") or "")
                    if teacher_id:
                        tp = SupabaseREST.select_one(
                            "teacher_profiles", "user_id", {"id": teacher_id}
                        ) or {}
                        tprof = SupabaseREST.select_one(
                            "user_profiles", "first_name,last_name",
                            {"user_id": str(tp.get("user_id") or "")},
                        ) or {}
                        teacher_name = " ".join(
                            x for x in [tprof.get("first_name"), tprof.get("last_name")] if x
                        )

                    participants = SupabaseREST.select(
                        "session_participants", "user_id", {"session_id": sid}
                    ) or []
                    for p in participants:
                        uid = str(p.get("user_id") or "")
                        if not uid:
                            continue
                        user = SupabaseREST.select_one("users", "email", {"id": uid}) or {}
                        prof = SupabaseREST.select_one(
                            "user_profiles", "first_name", {"user_id": uid}
                        ) or {}
                        lang_row = SupabaseREST.select_one(
                            "language_preferences", "preferred_language", {"user_id": uid}
                        ) or {}
                        email_addr = (user.get("email") or "").strip()
                        if not email_addr:
                            continue
                        try:
                            await send_session_reminder_email(
                                to_email=email_addr,
                                first_name=prof.get("first_name"),
                                session_title=str(s.get("title") or ""),
                                teacher_name=teacher_name,
                                when_local=str(s.get("scheduled_start") or ""),
                                join_url=f"/students/meeting-room/{sid}",
                                lang=lang_row.get("preferred_language"),
                            )
                        except Exception:
                            continue
            except Exception as exc:
                logger.warning("Reminder loop pass failed: %s", exc)
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        logger.info("⏰ Reminder loop cancelled")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting SkillHub API...")
    logger.info(f"🌍 Environment: {settings.environment}")
    logger.info(f"🔗 Railway Environment: {os.getenv('RAILWAY_ENVIRONMENT', 'Not set')}")
    logger.info(f"📍 Port: {os.getenv('PORT', '8000')}")

    try:
        logger.info("🔌 Initializing database connections...")
        db_success = await init_db()
        supabase_success = await init_supabase()

        if supabase_success:
            logger.info("🎉 Supabase connection successful - using real database authentication")
        elif db_success:
            logger.info("🎉 PostgreSQL connection successful - using direct database authentication")
        else:
            logger.warning("⚠️ No database connection - using mock authentication for demo")

        global _reminder_task
        if os.getenv("REMINDER_LOOP_ENABLED", "true").lower() != "false":
            import asyncio
            _reminder_task = asyncio.create_task(_reminder_loop())
            logger.info("⏰ Reminder scheduler started (in-process)")

        logger.info("✅ Backend startup completed successfully")
    except Exception as e:
        logger.error(f"❌ Startup error: {e}")

    yield

    logger.info("🛑 Shutting down SkillHub API...")
    if _reminder_task is not None:
        _reminder_task.cancel()
        try:
            await _reminder_task
        except Exception:
            pass
    try:
        await close_db()
        try:
            from database.supabase_async import aclose as _supa_aclose
            await _supa_aclose()
        except Exception:
            pass
        logger.info("✅ Shutdown completed")
    except Exception as e:
        logger.error(f"❌ Shutdown error: {e}")

app = FastAPI(
    title=settings.project_name,
    openapi_url=f"{settings.api_v1_str}/openapi.json",
    debug=settings.debug,
    lifespan=lifespan
)

cors_origins = settings.backend_cors_origins
logger.info(f"🌍 Environment: {settings.environment}")
logger.info(f"🚀 Railway Environment: {os.getenv('RAILWAY_ENVIRONMENT', 'Not set')}")
logger.info(f"🔗 Railway Public Domain: {os.getenv('RAILWAY_PUBLIC_DOMAIN', 'Not set')}")
logger.info(f"🎯 Setting up CORS with origins: {cors_origins}")

if not cors_origins:
    logger.error("⚠️ No CORS origins resolved; falling back to localhost only.")
    cors_origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "SkillHub API is running!",
        "version": "1.0.0",
        "environment": settings.environment
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "skillhub-api", "timestamp": datetime.now().isoformat()}

@app.get("/ping")
def ping():
    return {"message": "pong", "status": "healthy"}

@app.get("/")
def root_health():
    return {
        "status": "healthy", 
        "service": "skillhub-backend",
        "port": os.getenv("PORT", "8000"),
        "environment": os.getenv("RAILWAY_ENVIRONMENT", "unknown")
    }

@app.get("/cors-debug")
async def cors_debug():
    cors_origins = settings.backend_cors_origins
    return {
        "environment": settings.environment,
        "railway_env": os.getenv("RAILWAY_ENVIRONMENT"),
        "railway_domain": os.getenv("RAILWAY_PUBLIC_DOMAIN"),
        "cors_origins": cors_origins,
        "cors_count": len(cors_origins)
    }

@app.options("/api/v1/auth/login")
async def options_auth_login():
    return {"message": "OK"}

logger.info("Loading API routes...")

api_router = APIRouter()

try:
    from api.v1.endpoints.auth import router as auth_router
    api_router.include_router(auth_router, prefix="/auth", tags=["authentication"])
    logger.info("✅ Auth routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load auth routes: {e}")

try:
    from api.v1.endpoints.users import router as users_router
    api_router.include_router(users_router, prefix="/users", tags=["users"])
    logger.info("✅ Users routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load users routes: {e}")

try:
    from api.v1.endpoints.teachers import router as teachers_router
    api_router.include_router(teachers_router, prefix="/teachers", tags=["teachers"])
    logger.info("✅ Teachers routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load teachers routes: {e}")

try:
    from api.v1.endpoints.students import router as students_router
    api_router.include_router(students_router, prefix="/students", tags=["students"])
    logger.info("✅ Students routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load students routes: {e}")

try:
    from api.v1.endpoints.accessibility_student import router as accessibility_student_router
    api_router.include_router(accessibility_student_router, prefix="/students", tags=["accessibility-student"])
    logger.info("✅ Accessibility student (track) routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load accessibility student routes: {e}")

try:
    from api.v1.endpoints.subjects import router as subjects_router
    api_router.include_router(subjects_router, prefix="/subjects", tags=["subjects"])
    logger.info("✅ Subjects routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load subjects routes: {e}")

try:
    from api.v1.endpoints.sponsors import router as sponsors_router
    api_router.include_router(sponsors_router, prefix="/sponsors", tags=["sponsors"])
    logger.info("✅ Sponsors routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load sponsors routes: {e}")

try:
    from api.v1.endpoints.language import router as language_router
    api_router.include_router(language_router, tags=["language"])
    logger.info("✅ Language routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load language routes: {e}")

try:
    from api.v1.endpoints.scholarships import router as scholarships_router
    api_router.include_router(scholarships_router, tags=["scholarships"])
    logger.info("✅ Scholarships routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load scholarships routes: {e}")

try:
    from api.v1.endpoints.payments import router as payments_router
    api_router.include_router(payments_router, prefix="/payments", tags=["payments"])
    logger.info("✅ Payments routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load payments routes: {e}")

try:
    from api.v1.endpoints.notifications import router as notifications_router
    api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
    logger.info("✅ Notifications routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load notifications routes: {e}")

try:
    from api.v1.endpoints.chat_ai import router as chat_ai_router
    api_router.include_router(chat_ai_router, prefix="/chat", tags=["chat-ai"])
    logger.info("✅ Chat AI routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load chat AI routes: {e}")

try:
    from api.v1.endpoints.guardians import router as guardians_router
    api_router.include_router(guardians_router, tags=["guardians"])
    logger.info("✅ Guardian portal routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load guardian routes: {e}")

try:
    from api.v1.endpoints.certificates import router as certificates_router
    api_router.include_router(certificates_router, tags=["certificates"])
    logger.info("✅ Certificate routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load certificate routes: {e}")

try:
    from api.v1.endpoints.exams import router as exams_router
    api_router.include_router(exams_router, tags=["exams"])
    logger.info("✅ Exam routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load exam routes: {e}")

try:
    from api.v1.endpoints.admin import router as admin_router
    api_router.include_router(admin_router, tags=["admin"])
    logger.info("✅ Admin routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load admin routes: {e}")

try:
    from api.v1.endpoints.impact import router as impact_router
    api_router.include_router(impact_router, tags=["impact"])
    logger.info("✅ Impact routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load impact routes: {e}")

try:
    from api.v1.endpoints.uploads import router as uploads_router
    api_router.include_router(uploads_router, prefix="/uploads", tags=["uploads"])
    logger.info("✅ Upload (R2 presign) routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load upload routes: {e}")

try:
    from api.v1.endpoints.groups import router as groups_router
    api_router.include_router(groups_router, tags=["groups"])
    logger.info("✅ Group routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load group routes: {e}")

try:
    from api.v1.endpoints.teacher_analytics import router as teacher_analytics_router
    api_router.include_router(teacher_analytics_router, tags=["teacher-analytics"])
    logger.info("✅ Teacher analytics routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load teacher analytics routes: {e}")

try:
    from api.v1.endpoints.progress_reports import router as progress_reports_router
    api_router.include_router(progress_reports_router, tags=["progress-reports"])
    logger.info("✅ Progress report routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load progress report routes: {e}")

try:
    from api.v1.endpoints.sponsor_impact import router as sponsor_impact_router
    api_router.include_router(sponsor_impact_router, tags=["sponsor-impact"])
    logger.info("✅ Sponsor impact routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load sponsor impact routes: {e}")

try:
    from api.v1.endpoints.peer_matching import router as peer_matching_router
    api_router.include_router(peer_matching_router, tags=["peer-matching"])
    logger.info("✅ Peer matching routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load peer matching routes: {e}")

try:
    from api.v1.endpoints.reports import router as reports_router
    api_router.include_router(reports_router, tags=["reports"])
    logger.info("✅ Reports routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load reports routes: {e}")

try:
    from api.v1.endpoints.accessibility import router as accessibility_router
    api_router.include_router(accessibility_router, prefix="/accessibility", tags=["accessibility"])
    logger.info("✅ Accessibility routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load accessibility routes: {e}")

try:
    from api.v1.endpoints.meetings import router as meetings_router
    api_router.include_router(meetings_router, prefix="/meetings", tags=["meetings"])
    logger.info("✅ Meetings routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load meetings routes: {e}")

try:
    from api.v1.endpoints.session_enrollment import router as session_enrollment_router
    api_router.include_router(session_enrollment_router, prefix="/enrollments", tags=["session-enrollment"])
    logger.info("✅ Session enrollment routes loaded")
except Exception as e:
    logger.error(f"❌ Failed to load session enrollment routes: {e}")

app.include_router(api_router, prefix=settings.api_v1_str)
logger.info(f"🚀 API routes included with prefix: {settings.api_v1_str}")

@app.get("/debug/routes")
async def debug_routes():
    """Debug endpoint to see all registered routes"""
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            routes.append({
                "methods": list(route.methods),
                "path": route.path,
                "name": getattr(route, 'name', 'unnamed')
            })
    return {"total_routes": len(routes), "routes": routes}

@app.get("/debug/teachers")
async def debug_teachers():
    """Debug endpoint to test teacher module import on Railway"""
    result = {
        "status": "testing",
        "errors": [],
        "teacher_routes": [],
        "import_success": False
    }
    
    try:
        from api.v1.endpoints.teachers import router as test_teachers_router
        result["import_success"] = True
        result["teacher_routes"] = [
            {"methods": list(route.methods), "path": route.path}
            for route in test_teachers_router.routes 
            if hasattr(route, 'path') and hasattr(route, 'methods')
        ]
        result["teacher_route_count"] = len(result["teacher_routes"])
        result["status"] = "success"
    except ImportError as e:
        result["errors"].append(f"Import Error: {e}")
        result["status"] = "import_failed"
    except Exception as e:
        result["errors"].append(f"Other Error: {e}")
        result["status"] = "failed"
    
    return result

if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", "8000"))

    workers = int(os.getenv("WEB_CONCURRENCY", "1"))
    reload = settings.debug and workers == 1
    if workers > 1 and os.getenv("REMINDER_LOOP_ENABLED", "true").lower() != "false":
        logger.warning(
            "WEB_CONCURRENCY=%s but REMINDER_LOOP_ENABLED is on — each worker "
            "will run the reminder loop. Set REMINDER_LOOP_ENABLED=false and use "
            "an external cron to avoid duplicate reminders.", workers,
        )
    logger.info(f"🚀 Starting server on port {port} with {workers} worker(s)")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
        workers=workers if not reload else None,
        log_level=settings.log_level.lower()
    )