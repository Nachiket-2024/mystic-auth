# Compiles native extensions into a venv so build tools never ship in the
# runtime image.
FROM python:3.14.6-slim AS builder

WORKDIR /app

# gcc + libpq-dev: needed to compile packages with native extensions
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install into an isolated venv so the runtime stage can copy it wholesale
# without dragging along build-only files pip leaves in site-packages.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Slim final image with only the interpreter, runtime libraries, venv, and app
# source. This is the one image dev, local-prod, and prod all deploy from
# (no separate dev stage, unlike the frontend Dockerfile). Named (rather than
# left as the implicit last stage) so the `test` stage below can build on
# top of it explicitly; still the default target since it remains the last
# stage when no --target is passed.
FROM python:3.14.6-slim AS runtime

WORKDIR /app

# libpq5: runtime Postgres client library asyncpg/psycopg need to connect;
# libpq-dev (headers) isn't needed here. No pg_isready: Postgres readiness
# is checked via docker-compose's healthcheck on the postgres service itself.
RUN apt-get update && apt-get install -y \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/ .

# backend, procrastinate_worker, and alembic share this image and do not need root at
# runtime. /app/logs is created during the build so the dev named volume mounted
# there inherits ownership that the non-root app user can write to.
RUN mkdir -p /app/logs \
    && groupadd --system app && useradd --system --gid app --home-dir /app app \
    && chown -R app:app /app
USER app

EXPOSE 8000

# Fallback healthcheck for running this image outside Compose. Compose defines
# the service healthcheck that gates dependent service startup.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/ready')" || exit 1

# Overridden in docker-compose for the procrastinate_worker and alembic services
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Adds the pytest toolchain on top of the runtime image so
# docker-full-suite (CI) can run the full backend suite against the actual
# pinned dependency set inside the real image, without the runtime image
# everyone else deploys ever shipping test tooling. Selected via the backend
# service's `target: ${BACKEND_BUILD_TARGET:-runtime}` in docker-compose.yml.
FROM runtime AS test

USER root
COPY backend/requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
USER app
