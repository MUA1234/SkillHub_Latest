# NOTE: app-level force_ssl is intentionally NOT set.
#
# On Railway/Fly/Render the platform terminates TLS at its edge and forwards
# plain HTTP into the container — including the internal /healthz check, which
# carries no `x-forwarded-proto` header. With force_ssl on, Plug.SSL 301-
# redirects that health check to https:// and the platform (which follows no
# redirect and expects a 200) marks the service unhealthy, so the deploy fails.
# The edge already redirects http→https for real users, so enforcing it again
# here is both redundant and harmful. Re-enable only behind a proxy that sets
# x-forwarded-proto AND excludes the health path.

import Config

# Do not print debug messages in production
config :logger, level: :info

# Runtime production configuration, including reading
# of environment variables, is done on config/runtime.exs.
