defmodule SkillHub.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      SkillHubWeb.Telemetry,
      SkillHub.Repo,
      {DNSCluster, query: Application.get_env(:skillhub, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: SkillHub.PubSub},
      # Realtime bridge: LISTENs for new notifications and pushes them to the
      # per-user channel. Self-healing — degrades gracefully if the DB session
      # can't be held.
      SkillHub.Notifications.Listener,
      # Start to serve requests, typically the last entry
      SkillHubWeb.Endpoint
    ]

    log_pdf_availability()

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: SkillHub.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    SkillHubWeb.Endpoint.config_change(changed, removed)
    :ok
  end

  # PDF generation shells out to headless Chrome on demand (see SkillHub.PDF),
  # so nothing needs supervising — we just note at boot whether a browser exists.
  defp log_pdf_availability do
    require Logger

    case SkillHub.PDF.chrome_executable() do
      nil -> Logger.info("No Chrome/Edge found — PDF generation will proxy to Python")
      exe -> Logger.info("PDF generation ready via #{exe}")
    end
  end
end
