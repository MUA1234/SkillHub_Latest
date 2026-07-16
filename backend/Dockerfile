# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Python/FastAPI service — the AI/uploads/web-push/PayHere pieces the Phoenix
# strangler proxy forwards to. Listens on :8001 (PORT), reached only from the
# Phoenix container over the compose network.
# ---------------------------------------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8001

WORKDIR /app

# build-essential kept for any source-only wheels (reportlab/pandas/etc.).
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

RUN useradd --system --create-home app && chown -R app: /app
USER app

EXPOSE 8001
CMD ["python", "main.py"]
