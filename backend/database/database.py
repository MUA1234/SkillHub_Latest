"""
SQLAlchemy async engine + session factory.

Most data access in the codebase routes through ``SupabaseREST`` /
``SupabaseService`` (see ``database/supabase_client``). A small but
load-bearing minority of endpoints — sponsor analytics, the main teacher
schedule, sponsor dashboard, teacher analytics — were written against
SQLAlchemy and use ``db: AsyncSession = Depends(get_db)``.

Previously this module was a stub that raised ``RuntimeError`` on every
``.execute``, so those endpoints always 500'd and the frontend silently
fell back to the ``/…/rest`` twin. That meant every page load wasted a
round-trip on the broken primary call.

The engine here points at ``settings.database_pool_url`` (Supabase's
pgbouncer endpoint — transaction-mode pooling, port 6543), which is the
right choice for serverless / many-connection environments. We fall back
to the direct URL if the pooler one is unset.

If engine creation fails at startup (bad URL, no network), we keep a
``_NullSession`` fallback so the SupabaseREST-backed routes still serve.
The SQL-backed endpoints raise a clear 503 instead of an opaque
``RuntimeError`` so frontend can decide whether to retry the REST twin.
"""

from __future__ import annotations

import logging
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from config import settings

logger = logging.getLogger(__name__)


_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _normalize_url(url: str) -> str:
    """Force the ``+asyncpg`` driver on a stock postgres URL.

    Supabase exposes URLs as ``postgresql://…`` (sync libpq form). SQLAlchemy
    needs ``postgresql+asyncpg://…`` to pick the async driver — we'd rather
    rewrite here than make ops set two near-identical env vars.
    """
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    return url


class _NullSession:
    """Fallback session yielded when the real engine couldn't be created.

    The error message names SupabaseREST explicitly so a developer who hits
    it knows the codebase has two persistence paths and the SQL one is
    currently down — not that everything is broken.
    """

    async def execute(self, *_args, **_kwargs):
        raise RuntimeError(
            "SQLAlchemy session not initialised. "
            "Check DATABASE_URL / DATABASE_POOL_URL connectivity, or migrate "
            "this endpoint to SupabaseREST."
        )

    async def commit(self):
        return None

    async def rollback(self):
        return None

    async def close(self):
        return None

    def add(self, _obj):
        raise RuntimeError(
            "SQLAlchemy session not initialised. Use SupabaseREST or fix DB connectivity."
        )


async def init_db() -> bool:
    """Create the async engine + session factory.

    Returns True if the engine came up cleanly; False if we fell back to
    the null session (in which case SQL-backed endpoints will 503 but the
    Supabase REST endpoints remain healthy). Called from the FastAPI
    lifespan; never raises so a transient DB hiccup can't block startup.
    """
    global _engine, _session_factory

    raw_url = settings.database_pool_url or settings.database_url
    if not raw_url:
        logger.warning("init_db: no database URL configured; SQL endpoints disabled")
        return False

    try:
        url = _normalize_url(raw_url)
        _engine = create_async_engine(
            url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            connect_args={"statement_cache_size": 0} if "pooler" in url else {},
        )
        _session_factory = async_sessionmaker(
            _engine, expire_on_commit=False, class_=AsyncSession
        )

        async with _engine.connect() as conn:
            from sqlalchemy import text
            await conn.execute(text("SELECT 1"))
        logger.info("✅ SQLAlchemy async engine initialised")
        return True
    except Exception as exc:
        logger.warning(
            "⚠️ SQLAlchemy engine init failed (%s); SQL endpoints will 503", exc,
        )
        _engine = None
        _session_factory = None
        return False


async def close_db() -> None:
    """Dispose the engine on shutdown — closes the pool gracefully."""
    global _engine, _session_factory
    if _engine is not None:
        try:
            await _engine.dispose()
        except Exception:
            pass
    _engine = None
    _session_factory = None


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding an ``AsyncSession`` (or the null fallback).

    Endpoints that depend on SQLAlchemy will use this transparently. If the
    engine failed to initialise (see ``init_db``), they receive a
    ``_NullSession`` whose ``.execute`` raises a clear ``RuntimeError``;
    catching that and returning 503 is the endpoint's responsibility.
    """
    if _session_factory is None:
        yield _NullSession()  # type: ignore[misc]
        return

    async with _session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
