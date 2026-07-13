"""Async Supabase REST client (Phase 0 — non-blocking data layer).

The legacy `SupabaseREST` (see `supabase_client.py`) uses the **synchronous**
`requests` library. Called from inside `async def` FastAPI handlers, every DB
round-trip blocks the event loop, so a single slow/N+1 endpoint freezes *all*
concurrent requests — throwing away the whole point of async FastAPI.

This module is the drop-in async replacement built on a shared
`httpx.AsyncClient`. The method surface mirrors `SupabaseREST` exactly
(`select`, `select_one`, `select_in`, `insert`, `update`, `delete`, `count`,
`search`) so migrating an endpoint is mechanical: add `await` and swap the
class name. Both clients can coexist during the incremental migration.

The query/URL construction lives in **pure helper functions**
(`build_query_params`, `filter_params`) so they're unit-testable without a
network or a live database.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

from config import settings

logger = logging.getLogger(__name__)

QueryParams = List[Tuple[str, str]]



def filter_params(filters: Optional[Dict[str, Any]]) -> QueryParams:
    """Translate a filter dict into PostgREST query params.

    - ``{"col": v}``              → ``col=eq.v``
    - ``{"col.gte": v}``          → ``col=gte.v``  (any operator after the dot)
    - the value is left raw; httpx percent-encodes it on send (so ``+`` inside
      ISO timestamps survives, which was the bug the sync client hand-encoded
      around).
    """
    params: QueryParams = []
    if not filters:
        return params
    for key, value in filters.items():
        if "." in key:
            col, op = key.rsplit(".", 1)
            params.append((col, f"{op}.{value}"))
        else:
            params.append((key, f"eq.{value}"))
    return params


def build_query_params(
    columns: str = "*",
    filters: Optional[Dict[str, Any]] = None,
    order: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
) -> QueryParams:
    """Assemble the full PostgREST query param list for a SELECT."""
    params: QueryParams = [("select", columns)]
    params.extend(filter_params(filters))
    if order:
        params.append(("order", order))
    if limit is not None:
        params.append(("limit", str(limit)))
    if offset:
        params.append(("offset", str(offset)))
    return params


def in_value(values: List[Any]) -> Optional[str]:
    """Build the ``in.(a,b,c)`` value for a SELECT-IN, deduped.

    Returns None when there's nothing to query so the caller can short-circuit
    instead of firing a broken ``in.()`` request that PostgREST 400s on.
    """
    if not values:
        return None
    unique = list({str(v) for v in values if v is not None})
    if not unique:
        return None
    return f"in.({','.join(unique)})"



_client: Optional[httpx.AsyncClient] = None


def _headers(prefer: str = "return=representation") -> Dict[str, str]:
    auth_key = (
        settings.supabase_service_key
        if settings.supabase_service_key
        and settings.supabase_service_key != "SERVICE_ROLE_KEY_HERE"
        else settings.supabase_key
    )
    return {
        "apikey": auth_key,
        "Authorization": f"Bearer {auth_key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def get_client() -> httpx.AsyncClient:
    """Lazily create the shared AsyncClient.

    Connection pooling + HTTP/2 keep-alive amortize the ~200-300ms TLS
    handshake to Supabase (ap-southeast-1) the same way the sync `_session`
    did, but without blocking the event loop. Transport-level retries cover
    transient 5xx/connection resets.
    """
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=f"{settings.supabase_url}/rest/v1",
            headers=_headers(),
            timeout=httpx.Timeout(20.0, connect=10.0),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
            transport=httpx.AsyncHTTPTransport(retries=2),
        )
    return _client


async def aclose() -> None:
    """Close the shared client on app shutdown (called from the lifespan)."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None



class SupabaseRESTAsync:
    """Async twin of `SupabaseREST`. Every method is a coroutine; otherwise
    the signatures match so call sites only change by adding `await`."""

    @staticmethod
    async def select(
        table: str,
        columns: str = "*",
        filters: Optional[Dict[str, Any]] = None,
        order: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> List[Dict]:
        try:
            resp = await get_client().get(
                f"/{table}",
                params=build_query_params(columns, filters, order, limit, offset),
            )
            if resp.status_code == 200:
                return resp.json()
            logger.error("Supabase SELECT error: %s - %s", resp.status_code, resp.text)
            return []
        except Exception as e:
            logger.error("Supabase SELECT exception: %s", e)
            return []

    @staticmethod
    async def select_one(
        table: str,
        columns: str = "*",
        filters: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict]:
        rows = await SupabaseRESTAsync.select(table, columns, filters, limit=1)
        return rows[0] if rows else None

    @staticmethod
    async def select_in(
        table: str,
        column: str,
        values: List[Any],
        select_cols: str = "*",
        extra_filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict]:
        """Fetch every row whose `column` is in `values` in ONE call — the
        batch primitive that replaces per-row `select_one` N+1 loops."""
        in_clause = in_value(values)
        if in_clause is None:
            return []
        params: QueryParams = [("select", select_cols), (column, in_clause)]
        params.extend(filter_params(extra_filters))
        try:
            resp = await get_client().get(f"/{table}", params=params)
            if resp.status_code == 200:
                return resp.json()
            logger.error("Supabase SELECT IN error: %s - %s", resp.status_code, resp.text)
            return []
        except Exception as e:
            logger.error("Supabase SELECT IN exception: %s", e)
            return []

    @staticmethod
    async def insert(table: str, data: Dict[str, Any]) -> Optional[Dict]:
        try:
            resp = await get_client().post(f"/{table}", json=data)
            if resp.status_code in (200, 201):
                result = resp.json()
                return result[0] if isinstance(result, list) and result else result
            logger.error("Supabase INSERT error: %s - %s", resp.status_code, resp.text)
            return None
        except Exception as e:
            logger.error("Supabase INSERT exception: %s", e)
            return None

    @staticmethod
    async def update(
        table: str, data: Dict[str, Any], filters: Dict[str, Any]
    ) -> Optional[Dict]:
        try:
            resp = await get_client().patch(
                f"/{table}", params=filter_params(filters), json=data
            )
            if resp.status_code in (200, 201, 204):
                if resp.text:
                    result = resp.json()
                    return result[0] if isinstance(result, list) and result else result
                return data
            logger.error("Supabase UPDATE error: %s - %s", resp.status_code, resp.text)
            return None
        except Exception as e:
            logger.error("Supabase UPDATE exception: %s", e)
            return None

    @staticmethod
    async def delete(table: str, filters: Dict[str, Any]) -> bool:
        try:
            resp = await get_client().request(
                "DELETE", f"/{table}", params=filter_params(filters)
            )
            return resp.status_code in (200, 204)
        except Exception as e:
            logger.error("Supabase DELETE exception: %s", e)
            return False

    @staticmethod
    async def count(table: str, filters: Optional[Dict[str, Any]] = None) -> int:
        try:
            params: QueryParams = [("select", "count")]
            params.extend(filter_params(filters))
            resp = await get_client().request(
                "HEAD", f"/{table}", params=params, headers=_headers("count=exact")
            )
            if resp.status_code == 200:
                content_range = resp.headers.get("content-range", "*/0")
                total = content_range.split("/")[-1]
                return int(total) if total != "*" else 0
            return 0
        except Exception as e:
            logger.error("Supabase COUNT exception: %s", e)
            return 0

    @staticmethod
    async def search(
        table: str,
        column: str,
        query: str,
        columns: str = "*",
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict]:
        params: QueryParams = [
            ("select", columns),
            (column, f"ilike.*{query}*"),
            ("limit", str(limit)),
            ("offset", str(offset)),
        ]
        try:
            resp = await get_client().get(f"/{table}", params=params)
            if resp.status_code == 200:
                return resp.json()
            return []
        except Exception as e:
            logger.error("Supabase SEARCH exception: %s", e)
            return []
