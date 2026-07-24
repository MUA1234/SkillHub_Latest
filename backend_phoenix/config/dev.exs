import Config

# ---------------------------------------------------------------------------
# Database — the SAME Supabase Postgres the Python backend uses.
#
# We connect through Supabase's **session** pooler (port 5432), NOT the
# transaction pooler (6543): session mode is required for LISTEN/NOTIFY (the
# realtime notifications listener) and for running migrations. Credentials
# mirror backend/config.py.
# ---------------------------------------------------------------------------
config :skillhub, SkillHub.Repo,
  username: System.get_env("DB_USER", "postgres.juwpzzkuyqygcjrubqpt"),
  password: System.get_env("DB_PASSWORD") || raise("DB_PASSWORD env var is required (see backend/.env.example)"),
  hostname: System.get_env("DB_HOST", "aws-1-ap-southeast-1.pooler.supabase.com"),
  port: String.to_integer(System.get_env("DB_PORT", "5432")),
  database: System.get_env("DB_NAME", "postgres"),
  ssl: [verify: :verify_none],
  # The session pooler caps concurrent connections; keep the pool lean and
  # leave headroom for the dedicated notifications LISTEN connection.
  pool_size: String.to_integer(System.get_env("DB_POOL_SIZE", "5")),
  # Supabase's pooler does not support server-side prepared statement caching.
  prepare: :unnamed,
  stacktrace: true,
  show_sensitive_data_on_connection_error: true

config :skillhub, SkillHubWeb.Endpoint,
  # Bind on the port the frontend already targets so Phoenix is a drop-in
  # front door (strangler): it serves ported routes and proxies the rest to
  # the Python service.
  http: [ip: {127, 0, 0, 1}, port: String.to_integer(System.get_env("PORT", "8000"))],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: "kmpgFbCnCc/Mvo8OO+oCDnVSivwG4pdAC7nwExby3kM6uibIfN/oc/uYnHvHMf2B",
  watchers: []

config :skillhub, dev_routes: true

config :logger, :default_formatter, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
