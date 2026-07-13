"""Unit tests for the async Supabase client's pure query-building helpers.

No network, no database — these lock in the PostgREST query semantics so a
refactor of the async data layer can't silently change how filters/ranges/
IN-clauses are encoded. Run with: `cd backend && pytest`.
"""

from database.supabase_async import (
    build_query_params,
    filter_params,
    in_value,
)


class TestFilterParams:
    def test_empty_and_none(self):
        assert filter_params(None) == []
        assert filter_params({}) == []

    def test_plain_equality(self):
        assert filter_params({"user_id": "abc"}) == [("user_id", "eq.abc")]

    def test_operator_filter(self):
        assert filter_params({"created_at.gte": "2026-01-01"}) == [
            ("created_at", "gte.2026-01-01")
        ]

    def test_range_uses_two_params_on_same_column(self):
        params = filter_params(
            {"created_at.gte": "A", "created_at.lt": "B"}
        )
        assert ("created_at", "gte.A") in params
        assert ("created_at", "lt.B") in params
        assert len(params) == 2

    def test_value_left_raw_for_httpx_to_encode(self):
        assert filter_params({"ts.gte": "2026-01-01T00:00:00+00:00"}) == [
            ("ts", "gte.2026-01-01T00:00:00+00:00")
        ]


class TestBuildQueryParams:
    def test_defaults_select_star_first(self):
        assert build_query_params()[0] == ("select", "*")

    def test_full_query_order(self):
        params = build_query_params(
            columns="id,name",
            filters={"is_active": True},
            order="name.asc",
            limit=10,
            offset=20,
        )
        assert params == [
            ("select", "id,name"),
            ("is_active", "eq.True"),
            ("order", "name.asc"),
            ("limit", "10"),
            ("offset", "20"),
        ]

    def test_offset_zero_omitted(self):
        params = build_query_params(limit=5, offset=0)
        assert ("offset", "0") not in params
        assert ("limit", "5") in params

    def test_limit_zero_is_kept(self):
        params = build_query_params(limit=0)
        assert ("limit", "0") in params


class TestInValue:
    def test_empty_returns_none(self):
        assert in_value([]) is None
        assert in_value([None, None]) is None

    def test_dedupes_and_stringifies(self):
        out = in_value(["a", "a", "b"])
        assert out.startswith("in.(") and out.endswith(")")
        inner = out[len("in.("):-1].split(",")
        assert sorted(inner) == ["a", "b"]

    def test_mixed_types_coerced_to_str(self):
        out = in_value([1, 2, 2, None])
        inner = out[len("in.("):-1].split(",")
        assert sorted(inner) == ["1", "2"]
