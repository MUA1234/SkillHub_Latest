defmodule SkillHub.SQL do
  @moduledoc """
  Thin helpers for parameterized raw SQL against the shared Supabase Postgres.
  Used for analytics/aggregation reads where pushing the work into Postgres is
  cleaner (and faster — it collapses the Python backend's N+1 loops) than
  modelling every one of the 60+ tables as an Ecto schema.

  Column names come from our own hand-written SQL (a bounded, known set), so
  turning them into atom keys is safe.
  """
  alias SkillHub.Repo

  @uuid_re ~r/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

  @doc "Run a query and return rows as a list of maps keyed by column atom."
  def maps(sql, params \\ []) do
    case run!(sql, encode(params)) do
      # UPDATE/DELETE/INSERT without RETURNING → no columns.
      %Postgrex.Result{columns: nil} ->
        []

      %Postgrex.Result{columns: cols, rows: rows} ->
        keys = Enum.map(cols, &String.to_atom/1)
        Enum.map(rows, fn row -> keys |> Enum.zip(row) |> Map.new() end)
    end
  end

  # Supabase's connection pooler (Supavisor) periodically closes pooled
  # connections; Postgrex can then hand out a dead one and the query fails with
  # a `DBConnection.ConnectionError` ("ssl recv: closed"). The connection dies
  # before the statement runs, so a single transparent retry is safe (the failed
  # attempt never reached Postgres) and hides the pooler's connection churn.
  defp run!(sql, params, attempt \\ 1) do
    Repo.query!(sql, params)
  rescue
    e in DBConnection.ConnectionError ->
      if attempt < 2, do: run!(sql, params, attempt + 1), else: reraise(e, __STACKTRACE__)
  end

  @doc "Run a query expected to return one row; returns a map or nil."
  def one(sql, params \\ []) do
    case maps(sql, params) do
      [row | _] -> row
      [] -> nil
    end
  end

  @doc """
  For queries shaped `select to_jsonb(t) as row from ... t ...`: returns the
  inner row maps (string keys). This is the fast path for faithful `select *`
  ports — every column comes back, uuids as strings, timestamps as ISO — with
  no per-table Ecto schema.
  """
  def json_all(sql, params \\ []), do: maps(sql, params) |> Enum.map(& &1[:row])

  @doc "Single `to_jsonb` row (see json_all/2), or nil."
  def json_one(sql, params \\ []) do
    case json_all(sql, params) do
      [row | _] -> row
      [] -> nil
    end
  end

  @doc "Scalar single value (first column of first row), or default."
  def scalar(sql, params \\ [], default \\ nil) do
    case run!(sql, encode(params)).rows do
      [[value | _] | _] -> value
      _ -> default
    end
  end

  # Postgrex wants uuid params as 16-byte binaries. Callers pass string uuids
  # (from JWTs / JSON), so transparently dump any uuid-formatted string param.
  defp encode(params) do
    Enum.map(params, fn
      value when is_binary(value) ->
        if Regex.match?(@uuid_re, value), do: Ecto.UUID.dump!(value), else: value

      value ->
        value
    end)
  end
end
