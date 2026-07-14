defmodule SkillHubWeb.AuthController do
  @moduledoc """
  Natively-ported auth: register, login, current user, refresh, logout, plus the
  email-token flows (verify / resend / forgot / reset). bcrypt-compatible with
  the Python passlib hashes and JWT-compatible with `core/security.py`.
  """
  use SkillHubWeb, :controller

  require Logger

  alias SkillHub.Accounts
  alias SkillHub.Auth.Token
  alias SkillHub.Auth.OneTimeTokens
  alias SkillHub.Emails

  @roles ~w(student teacher sponsor guardian admin)

  # --- register / login ------------------------------------------------------

  def register(conn, params) do
    role = to_string(params["role"] || "")

    cond do
      not valid_email?(params["email"]) -> conn |> put_status(400) |> json(%{detail: "A valid email is required"})
      String.length(to_string(params["password"] || "")) < 6 -> conn |> put_status(400) |> json(%{detail: "Password must be at least 6 characters"})
      role not in @roles -> conn |> put_status(400) |> json(%{detail: "Invalid role"})
      true ->
        case Accounts.register_user(params) do
          {:ok, user} ->
            issue_and_send_verification(user)
            json(conn, user_view(user))

          {:error, :already_registered} ->
            conn |> put_status(400) |> json(%{detail: "Email already registered or registration failed"})

          {:error, _changeset} ->
            conn |> put_status(500) |> json(%{detail: "Registration failed. Please try again later."})
        end
    end
  end

  def login(conn, params) do
    case Accounts.authenticate(params["email"], params["password"] || "") do
      {:ok, user} ->
        {token, max_age} = new_token(user.id)

        conn
        |> put_auth_cookie(token, max_age)
        |> json(%{access_token: token, token_type: "bearer", user: user_view(user)})

      {:error, _} ->
        conn
        |> put_status(401)
        |> put_resp_header("www-authenticate", "Bearer")
        |> json(%{detail: "Incorrect email or password"})
    end
  end

  # --- current user / refresh / logout ---------------------------------------

  def me(conn, _params), do: json(conn, user_view(conn.assigns.current_user))

  def refresh(conn, _params) do
    {token, max_age} = new_token(conn.assigns.current_user.id)
    conn |> put_auth_cookie(token, max_age) |> json(%{access_token: token, token_type: "bearer"})
  end

  def logout(conn, _params), do: conn |> delete_auth_cookie() |> json(%{success: true})

  # --- email verification ----------------------------------------------------

  def verify_email(conn, params) do
    case params["token"] do
      nil -> conn |> put_status(400) |> json(%{detail: "Missing verification token"})
      raw ->
        case OneTimeTokens.consume_verification(raw) do
          {:ok, user_id} ->
            Accounts.mark_verified(user_id)
            send_welcome(user_id)
            json(conn, %{success: true})

          {:already_verified, _} ->
            json(conn, %{success: true, already_verified: true})

          {:error, :expired} ->
            conn |> put_status(400) |> json(%{detail: "Verification link expired. Please request a new one."})

          {:error, _} ->
            conn |> put_status(400) |> json(%{detail: "Invalid or expired verification link"})
        end
    end
  end

  def resend_verification(conn, params) do
    with %{is_verified: false} = user <- Accounts.get_user_by_email(to_string(params["email"] || "")) do
      issue_and_send_verification(user)
    end

    # Always success — never reveal whether the account exists / is verified.
    json(conn, %{success: true})
  end

  # --- password reset --------------------------------------------------------

  def forgot_password(conn, params) do
    if user = Accounts.get_user_by_email(to_string(params["email"] || "")) do
      ip = conn.remote_ip |> :inet.ntoa() |> to_string()
      raw = OneTimeTokens.issue_reset(user.id, ip)
      link = frontend_link("/auth/reset-password", raw)
      Emails.password_reset(user.email, link, first_name_of(user.id))
    end

    # Always success to prevent email enumeration.
    json(conn, %{success: true})
  end

  def reset_password(conn, params) do
    new_password = to_string(params["new_password"] || "")

    cond do
      String.length(new_password) < 6 ->
        conn |> put_status(400) |> json(%{detail: "Password must be at least 6 characters"})

      true ->
        case OneTimeTokens.check_reset(to_string(params["token"] || "")) do
          {:ok, user_id, token_id} ->
            Accounts.set_password(user_id, new_password)
            OneTimeTokens.mark_reset_used(token_id)
            json(conn, %{success: true})

          {:error, :expired} ->
            conn |> put_status(400) |> json(%{detail: "Reset link expired. Please request a new one."})

          {:error, _} ->
            conn |> put_status(400) |> json(%{detail: "Invalid or expired reset link"})
        end
    end
  end

  # --- helpers ---------------------------------------------------------------

  defp issue_and_send_verification(user) do
    raw = OneTimeTokens.issue_verification(user.id)
    link = frontend_link("/auth/verify-email", raw)
    Emails.verification(user.email, link, first_name_of(user.id))
  rescue
    e -> Logger.warning("verification email pipeline failed: #{inspect(e)}")
  end

  defp send_welcome(user_id) do
    case Accounts.get_user(user_id) do
      nil -> :ok
      user -> Emails.welcome(user.email, first_name_of(user_id), to_string(user.role))
    end
  rescue
    _ -> :ok
  end

  defp first_name_of(user_id) do
    case SkillHub.SQL.one("select first_name from public.user_profiles where user_id = $1::uuid", [user_id]) do
      %{first_name: fn_} -> fn_
      _ -> nil
    end
  end

  defp user_view(user) do
    %{
      id: user.id, email: user.email, role: user.role,
      is_verified: user.is_verified, is_active: user.is_active,
      created_at: user.created_at, updated_at: user.updated_at
    }
  end

  defp frontend_link(path, token) do
    base = System.get_env("FRONTEND_URL", "http://localhost:3000") |> String.trim_trailing("/")
    "#{base}#{path}?token=#{token}"
  end

  defp valid_email?(email) when is_binary(email), do: Regex.match?(~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/, email)
  defp valid_email?(_), do: false

  defp new_token(user_id) do
    ttl = Application.fetch_env!(:skillhub, :auth)[:access_token_ttl_minutes]
    {Token.generate(user_id, ttl), ttl * 60}
  end

  defp put_auth_cookie(conn, token, max_age), do: Plug.Conn.put_resp_cookie(conn, cookie_name(), token, cookie_opts(max_age))
  defp delete_auth_cookie(conn), do: Plug.Conn.delete_resp_cookie(conn, cookie_name(), cookie_opts(0))
  defp cookie_name, do: Application.fetch_env!(:skillhub, :auth)[:cookie_name]

  defp cookie_opts(max_age) do
    prod? = Application.get_env(:skillhub, :env) == :prod
    base = [http_only: true, path: "/", secure: prod?, same_site: if(prod?, do: "None", else: "Lax")]
    if max_age > 0, do: [{:max_age, max_age} | base], else: base
  end
end
