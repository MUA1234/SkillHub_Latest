defmodule SkillHubWeb do
  @moduledoc """
  The entrypoint for defining your web interface, such
  as controllers, components, channels, and so on.

  This can be used in your application as:

      use SkillHubWeb, :controller
      use SkillHubWeb, :html

  The definitions below will be executed for every controller,
  component, etc, so keep them short and clean, focused
  on imports, uses and aliases.

  Do NOT define functions inside the quoted expressions
  below. Instead, define additional modules and import
  those modules here.
  """

  def static_paths, do: ~w(assets fonts images favicon.ico robots.txt)

  @doc """
  Allowed CORS origins for the frontend. Reads `CORS_ORIGINS` (comma-separated)
  and `FRONTEND_URL`, falling back to the local Next.js dev origins.
  """
  def cors_origins do
    from_env =
      [System.get_env("FRONTEND_URL"), System.get_env("CORS_ORIGINS")]
      |> Enum.reject(&is_nil/1)
      |> Enum.flat_map(&String.split(&1, ","))
      |> Enum.map(&String.trim/1)
      |> Enum.map(&String.trim_trailing(&1, "/"))
      |> Enum.reject(&(&1 == ""))

    case from_env do
      [] -> ["http://localhost:3000", "http://127.0.0.1:3000"]
      origins -> origins
    end
  end

  def router do
    quote do
      use Phoenix.Router, helpers: false

      # Import common connection and controller functions to use in pipelines
      import Plug.Conn
      import Phoenix.Controller
    end
  end

  def channel do
    quote do
      use Phoenix.Channel
    end
  end

  def controller do
    quote do
      use Phoenix.Controller, formats: [:html, :json]

      import Plug.Conn

      unquote(verified_routes())
    end
  end

  def verified_routes do
    quote do
      use Phoenix.VerifiedRoutes,
        endpoint: SkillHubWeb.Endpoint,
        router: SkillHubWeb.Router,
        statics: SkillHubWeb.static_paths()
    end
  end

  @doc """
  When used, dispatch to the appropriate controller/live_view/etc.
  """
  defmacro __using__(which) when is_atom(which) do
    apply(__MODULE__, which, [])
  end
end
