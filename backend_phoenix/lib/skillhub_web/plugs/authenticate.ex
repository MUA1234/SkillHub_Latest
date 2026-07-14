defmodule SkillHubWeb.Plugs.Authenticate do
  @moduledoc """
  Resolves the current user from a `Authorization: Bearer <jwt>` header OR the
  auth cookie (same cookie name as the Python backend). On success assigns
  `:current_user` and `:current_user_id`; on failure halts with 401 JSON.

  Accepts tokens minted by EITHER backend — they share a secret and algorithm.
  """
  import Plug.Conn

  alias SkillHub.Accounts
  alias SkillHub.Auth.Token

  def init(opts), do: opts

  def call(conn, _opts) do
    with {:ok, token} <- fetch_token(conn),
         {:ok, user_id} <- Token.verify(token),
         %Accounts.User{is_active: true} = user <- Accounts.get_user(user_id) do
      conn
      |> assign(:current_user, user)
      |> assign(:current_user_id, user.id)
    else
      _ -> unauthorized(conn)
    end
  end

  defp fetch_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token | _] when token != "" -> {:ok, token}
      ["bearer " <> token | _] when token != "" -> {:ok, token}
      _ -> fetch_cookie_token(conn)
    end
  end

  defp fetch_cookie_token(conn) do
    name = Application.fetch_env!(:skillhub, :auth)[:cookie_name]
    conn = fetch_cookies(conn)

    case conn.cookies[name] do
      token when is_binary(token) and token != "" -> {:ok, token}
      _ -> {:error, :no_token}
    end
  end

  defp unauthorized(conn) do
    conn
    |> put_resp_content_type("application/json")
    |> put_resp_header("www-authenticate", "Bearer")
    |> send_resp(401, Jason.encode!(%{detail: "Not authenticated"}))
    |> halt()
  end
end
