# Compiles native extensions into a venv so build tools never ship in the
# runtime image.
FROM python:3.14.7-slim AS builder

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

# Slim final image: interpreter, runtime libraries, venv, and app source.
# The one image dev, local-prod, and prod all deploy from. Named so the
# `test` stage can build on it explicitly; still the default target.
FROM python:3.14.7-slim AS runtime

WORKDIR /app

# libpq5: runtime Postgres client library asyncpg/psycopg need to connect;
# libpq-dev (headers) isn't needed here. No pg_isready: Postgres readiness
# is checked via docker-compose's healthcheck on the postgres service itself.
# `apt-get upgrade` pulls in any Debian security patches released since this
# base image tag was built, rather than waiting for the next `python:3.14-slim`
# republish (which lags upstream CVE fixes by days to weeks) - re-run on every
# rebuild since it isn't pinned to a snapshot.
RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# pip/setuptools are build-time tools the running app never imports or
# invokes (dependencies are already installed into the venv above); their
# vendored bundled copies of third-party code are a pure attack-surface/CVE
# liability with no runtime upside, so they're stripped from both the venv
# and the base image's own system site-packages.
RUN /opt/venv/bin/python -m pip uninstall --yes pip setuptools \
    && rm -rf /usr/local/lib/python*/site-packages/pip* \
              /usr/local/lib/python*/site-packages/setuptools*

COPY backend/ .

# backend, procrastinate_worker, and alembic share this image and don't
# need root. /app/logs is created at build time so the dev named volume
# mounted there is writable by the non-root app user.
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
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]

# Adds the pytest toolchain on top of runtime so CI can test the real
# pinned dependency set without shipping test tooling in the deploy image.
# Selected via BACKEND_BUILD_TARGET in docker-compose.yml.
FROM runtime AS test

USER root
# runtime stripped pip/setuptools from the venv above; this stage isn't
# shipped, so restoring them just to install test-only deps is fine here.
RUN /opt/venv/bin/python -m ensurepip --upgrade
COPY backend/requirements-dev.txt .
RUN /opt/venv/bin/python -m pip install --no-cache-dir -r requirements-dev.txt
USER app
