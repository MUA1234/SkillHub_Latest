# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :skillhub,
  namespace: SkillHub,
  ecto_repos: [SkillHub.Repo],
  generators: [timestamp_type: :utc_datetime],
  # Drives cookie `secure`/`SameSite` at runtime (see AuthController).
  env: config_env()

# ---------------------------------------------------------------------------
# Auth / gateway settings.
#
# `jwt_secret` and `jwt_algorithm` MUST match backend/config.py so tokens are
# cross-valid: a JWT minted by Python's `python-jose` verifies here and vice
# versa. Same story for bcrypt password hashes in the shared `users` table.
# Overridable via env in config/runtime.exs for production.
# ---------------------------------------------------------------------------
config :skillhub, :auth,
  jwt_secret: "skillhub_super_secret_key_2024_production_change_in_production",
  jwt_algorithm: "HS256",
  access_token_ttl_minutes: 30,
  cookie_name: "skillhub_session"

# The Python/FastAPI service the strangler proxy forwards un-ported routes to.
config :skillhub, :python_backend,
  base_url: "http://localhost:8001"

# Email: default to a no-op local adapter (dev). runtime.exs swaps in real SMTP
# when SMTP_HOST + SMTP_USER are set, mirroring the Python `emails_enabled=auto`.
config :skillhub, SkillHub.Mailer, adapter: Swoosh.Adapters.Local
config :swoosh, :api_client, false

config :skillhub, :email,
  from_name: "SkillHub",
  from_email: "noreply@skillhub.lk"

# Supabase Storage (file uploads). URL + a key with insert rights on the bucket.
config :skillhub, :supabase,
  url: "https://juwpzzkuyqygcjrubqpt.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1d3B6emt1eXF5Z2NqcnVicXB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTkyOTgsImV4cCI6MjA4NDA3NTI5OH0.aYy7VG-Q1Yon9mOgucL8EDbefs0GyfD7HbWDCDrirA4",
  bucket: "skillhub-content"

# Configure the endpoint
config :skillhub, SkillHubWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: SkillHubWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: SkillHub.PubSub,
  live_view: [signing_salt: "fYi1af3f"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
