# Compiles native extensions into a venv so build tools never ship in the
# runtime image.
FROM python:3.14-alpine AS builder

WORKDIR /app

# gcc/musl-dev/postgresql-dev/libffi-dev: needed to compile packages with
# native extensions (psycopg-binary's own build deps are none - it bundles
# libpq - but argon2-cffi's C bindings still need a compiler) against musl
# libc; Alpine has no prebuilt manylinux wheels for these like Debian does.
RUN apk add --no-cache \
    gcc \
    musl-dev \
    postgresql-dev \
    libffi-dev

# Install into an isolated venv so the runtime stage can copy it wholesale
# without dragging along build-only files pip leaves in site-packages.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Slim final image: interpreter, runtime libraries, venv, and app source.
# The one image dev, local-prod, and prod all deploy from. Named so the
# `test` stage can build on it explicitly; still the default target.
#
# Alpine over Debian for the CVE count: Trivy found python:3.14-alpine at
# 0 High/Critical on this app's built image vs. python:3.14-slim at 50+,
# all unpatched Debian OS packages unrelated to app code.
FROM python:3.14-alpine AS runtime

WORKDIR /app

# No system libpq package needed here: asyncpg speaks the Postgres wire
# protocol itself, and psycopg[binary] bundles its own libpq - verified
# neither links against a system one. `apk upgrade` pulls in any Alpine
# security patches released since this base image tag was built, rather
# than waiting for the next `python:3.14-alpine` republish - re-run on
# every rebuild since it isn't pinned to a snapshot.
RUN apk upgrade --no-cache

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
# need root at runtime - the entrypoint below drops to this user after
# fixing volume ownership. su-exec does that privilege drop; it's Alpine's
# minimal exec-and-setuid tool (gosu without the Go runtime).
RUN mkdir -p /app/logs \
    && addgroup -S app && adduser -S -G app -h /app app \
    && chown -R app:app /app \
    && apk add --no-cache su-exec

# Stays root here on purpose: the entrypoint needs root to chown a
# `backend_logs` volume that predates a base image's UID (e.g. the Alpine
# migration changed the `app` user's UID from the old Debian image's), then
# execs the real command as `app`. A fresh volume already has the right
# owner, so this is a no-op there.
COPY docker/mystic_auth/dockerfiles/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]

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

# Already root here (runtime's default, since its entrypoint needs root to
# drop privileges itself - see backend-entrypoint.sh). Restoring
# pip/setuptools (stripped from the venv above) just to install test-only
# deps is fine since this stage isn't shipped.
RUN /opt/venv/bin/python -m ensurepip --upgrade
COPY backend/requirements-dev.txt .
RUN /opt/venv/bin/python -m pip install --no-cache-dir -r requirements-dev.txt
