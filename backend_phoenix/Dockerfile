# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Phoenix gateway — built as an OTP release, run behind Caddy on the same host
# as the Python service. Ships headless Chromium so PDF generation works.
# ---------------------------------------------------------------------------

# ---- Build stage -----------------------------------------------------------
FROM elixir:1.18-otp-27 AS build

ENV MIX_ENV=prod \
    LANG=C.UTF-8

# build-essential + make: the Hex bcrypt_elixir NIF compiles with cc here
# (the vendored zig build in vendor/ is Windows-only; mix.exs selects the Hex
# package automatically on Linux).
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends build-essential git \
    && rm -rf /var/lib/apt/lists/*

RUN mix local.hex --force && mix local.rebar --force

WORKDIR /app

# Deps first, for layer caching.
COPY mix.exs mix.lock ./
COPY config config
RUN mix deps.get --only prod
RUN mix deps.compile

# Application code.
COPY lib lib
COPY priv priv
RUN mix compile

RUN mix release

# ---- Runtime stage ---------------------------------------------------------
FROM debian:bookworm-slim AS app

# chromium         -> SkillHub.PDF shells out to it (--print-to-pdf)
# fonts-noto*      -> Sinhala/Tamil/CJK glyphs for trilingual certificates
# openssl/ncurses  -> shared libs the OTP release needs at runtime
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
        libstdc++6 openssl libncurses6 locales ca-certificates \
    && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    CHROME_BIN=/usr/bin/chromium \
    PHX_SERVER=true \
    MIX_ENV=prod

WORKDIR /app
COPY --from=build /app/_build/prod/rel/skillhub ./

RUN useradd --system --create-home --home-dir /home/app app \
    && chown -R app: /app
USER app

EXPOSE 8000
CMD ["bin/skillhub", "start"]
