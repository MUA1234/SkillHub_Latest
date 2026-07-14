defmodule SkillHub.Auth.OneTimeTokens do
  @moduledoc """
  Email-verification and password-reset tokens. The raw token goes in the email
  link; only its SHA-256 hash is stored, so a leaked DB row is useless. Mirrors
  backend/api/v1/endpoints/auth.py (same tables, same hashing).
  """
  alias SkillHub.SQL

  @verify_ttl_hours 24
  @reset_ttl_hours 1

  def generate_raw, do: :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  defp hash(token), do: :crypto.hash(:sha256, token) |> Base.encode16(case: :lower)

  # --- email verification ----------------------------------------------------

  def issue_verification(user_id) do
    raw = generate_raw()

    SQL.maps(
      "insert into public.email_verification_tokens (user_id, token_hash, expires_at, created_at) values ($1::uuid, $2, now() + ($3 || ' hours')::interval, now())",
      [user_id, hash(raw), to_string(@verify_ttl_hours)]
    )

    raw
  end

  @doc "Consume a verification token. Returns {:ok, user_id} | {:already_verified, user_id} | {:error, reason}."
  def consume_verification(raw) do
    case SQL.one("select id::text, user_id::text, expires_at, verified_at from public.email_verification_tokens where token_hash = $1", [hash(raw)]) do
      nil ->
        {:error, :invalid}

      %{verified_at: v} = row when not is_nil(v) ->
        {:already_verified, row.user_id}

      row ->
        if expired?(row.expires_at) do
          {:error, :expired}
        else
          SQL.maps("update public.email_verification_tokens set verified_at = now() where id = $1::uuid", [row.id])
          {:ok, row.user_id}
        end
    end
  end

  # --- password reset --------------------------------------------------------

  def issue_reset(user_id, request_ip \\ nil) do
    raw = generate_raw()

    # Invalidate any prior unused tokens so an old link can't be replayed.
    SQL.maps("update public.password_reset_tokens set used_at = now() where user_id = $1::uuid and used_at is null", [user_id])

    SQL.maps(
      "insert into public.password_reset_tokens (user_id, token_hash, expires_at, created_at, request_ip) values ($1::uuid, $2, now() + ($3 || ' hours')::interval, now(), $4)",
      [user_id, hash(raw), to_string(@reset_ttl_hours), request_ip]
    )

    raw
  end

  @doc "Validate a reset token. Returns {:ok, user_id, token_id} | {:error, reason}."
  def check_reset(raw) do
    case SQL.one("select id::text, user_id::text, expires_at, used_at from public.password_reset_tokens where token_hash = $1", [hash(raw)]) do
      nil -> {:error, :invalid}
      %{used_at: u} when not is_nil(u) -> {:error, :invalid}
      row -> if expired?(row.expires_at), do: {:error, :expired}, else: {:ok, row.user_id, row.id}
    end
  end

  def mark_reset_used(token_id), do: SQL.maps("update public.password_reset_tokens set used_at = now() where id = $1::uuid", [token_id])

  # --- shared ----------------------------------------------------------------

  defp expired?(nil), do: true
  defp expired?(%NaiveDateTime{} = ts), do: NaiveDateTime.compare(ts, NaiveDateTime.utc_now()) == :lt
  defp expired?(%DateTime{} = ts), do: DateTime.compare(ts, DateTime.utc_now()) == :lt
  defp expired?(ts) when is_binary(ts) do
    norm = ts |> String.replace(" ", "T")
    norm = if String.contains?(norm, "+") or String.ends_with?(norm, "Z"), do: norm, else: norm <> "Z"
    case DateTime.from_iso8601(norm) do
      {:ok, dt, _} -> DateTime.compare(dt, DateTime.utc_now()) == :lt
      _ -> true
    end
  end
end
