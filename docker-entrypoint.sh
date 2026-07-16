#!/bin/bash
# ---------------------------------------------------------------------------
# One container, two services.
#   * Python/FastAPI  -> 127.0.0.1:8001 (loopback only; reached by Phoenix's
#                        strangler proxy via PYTHON_BACKEND_URL)
#   * Phoenix release -> 0.0.0.0:8000  (the only published port; Fly routes here)
#
# If either process exits, we take the whole container down so Fly restarts it
# cleanly rather than leaving a half-dead machine.
# ---------------------------------------------------------------------------
set -e

PYTHON_PORT="${PYTHON_PORT:-8001}"

# --- Python service (AI chat, web-push, PayHere, uploads) ---
cd /app/python
PORT="$PYTHON_PORT" python main.py &
PY_PID=$!

# If Python dies, bring Phoenix down too (and vice-versa via the trap below).
term() {
  kill "$PY_PID" 2>/dev/null || true
  exit 0
}
trap term TERM INT

# --- Phoenix gateway (foreground = container lifecycle) ---
cd /app/phoenix
bin/skillhub start &
PHX_PID=$!

# Exit as soon as EITHER process exits, so Fly's health check restarts the box.
wait -n "$PY_PID" "$PHX_PID"
kill "$PY_PID" "$PHX_PID" 2>/dev/null || true
exit 1
