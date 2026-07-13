"""HTTP-level tests for the async Supabase client using a mocked transport.

These exercise the *real* httpx request/response path (URL, query params,
status handling) against a fake PostgREST, without a live database — so we
verify that `select`/`select_in`/`insert` actually issue the requests we
expect and parse responses correctly.
"""

import httpx
import pytest
import respx

from database import supabase_async
from database.supabase_async import SupabaseRESTAsync
from config import settings

BASE = f"{settings.supabase_url}/rest/v1"


@pytest.fixture(autouse=True)
async def _reset_client():
    await supabase_async.aclose()
    yield
    await supabase_async.aclose()


@respx.mock
@pytest.mark.asyncio
async def test_select_parses_rows_and_filters():
    route = respx.get(f"{BASE}/courses").mock(
        return_value=httpx.Response(200, json=[{"id": "1", "title": "Math"}])
    )
    rows = await SupabaseRESTAsync.select("courses", "id,title", {"is_active": True})
    assert rows == [{"id": "1", "title": "Math"}]
    req = route.calls.last.request
    assert req.url.params["select"] == "id,title"
    assert req.url.params["is_active"] == "eq.True"


@respx.mock
@pytest.mark.asyncio
async def test_select_in_builds_in_clause_single_call():
    route = respx.get(f"{BASE}/teacher_profiles").mock(
        return_value=httpx.Response(200, json=[{"id": "a"}, {"id": "b"}])
    )
    rows = await SupabaseRESTAsync.select_in(
        "teacher_profiles", "id", ["a", "b", "a"], "id,user_id"
    )
    assert len(rows) == 2
    assert route.call_count == 1
    val = route.calls.last.request.url.params["id"]
    assert val.startswith("in.(") and "a" in val and "b" in val


@pytest.mark.asyncio
async def test_select_in_empty_short_circuits_no_request():
    with respx.mock:
        route = respx.get(f"{BASE}/courses").mock(return_value=httpx.Response(200, json=[]))
        rows = await SupabaseRESTAsync.select_in("courses", "id", [])
        assert rows == []
        assert route.call_count == 0


@respx.mock
@pytest.mark.asyncio
async def test_select_non_200_returns_empty():
    respx.get(f"{BASE}/courses").mock(return_value=httpx.Response(500, text="boom"))
    assert await SupabaseRESTAsync.select("courses") == []


@respx.mock
@pytest.mark.asyncio
async def test_insert_returns_first_row():
    respx.post(f"{BASE}/courses").mock(
        return_value=httpx.Response(201, json=[{"id": "new"}])
    )
    out = await SupabaseRESTAsync.insert("courses", {"title": "X"})
    assert out == {"id": "new"}
