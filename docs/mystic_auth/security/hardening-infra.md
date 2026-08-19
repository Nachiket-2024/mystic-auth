# Security Hardening: Infrastructure

Redis authentication, secret strength, reverse-proxy IP trust, session geolocation, and the current accepted-gaps list. See [Security Hardening](hardening.md) for the full index.

## Redis authentication

`REDIS_PASSWORD` (`.env`/`.env.example`) is passed to `redis-server --requirepass` in both compose files (empty value = no-op, so local dev is unaffected by default); both healthchecks authenticate with it. Since `redis-py` (`redis/client.py`) authenticates via the connection URL rather than a separate kwarg, the same password must also be embedded in `REDIS_URL` (`redis://:<REDIS_PASSWORD>@redis:6379/0`): documented inline in `.env.example`. (Background jobs no longer use Redis at all: `procrastinate_tasks/` runs on the same Postgres instance as everything else, see [Background Email Delivery](../background-workers/procrastinate.md).)

---

## `SECRET_KEY` strength enforcement

`core/settings.py` rejects any `SECRET_KEY` under 32 characters at import time (`Settings._secret_key_minimum_strength`): a placeholder/example value fails fast at startup instead of silently signing tokens with weak entropy. This is a length floor, not a real entropy check (a 32-character low-entropy string still passes).

---

## Reverse-proxy IP trust

`auth/security/client_ip.py::get_client_ip` only trusts `X-Forwarded-For` when the literal TCP peer is listed in `TRUSTED_PROXY_IPS` (`.env`, empty/untrusted by default): every rate-limit, lockout, audit-log, and PBAC context call site goes through it. Deploying behind a reverse proxy only requires setting `TRUSTED_PROXY_IPS` to that proxy's address, no code change needed.

---

## Session geolocation (Manage Sessions' Location column)

Resolves each login's city/country from its IP via a local MaxMind GeoLite2-City database, off by default. Split out into its own doc since it has a full setup flow (MaxMind account, license key, Docker profile) rather than being a simple config flag: see [Session Geolocation](../geolocation/overview.md).

---

## Known accepted gaps

See [Concerns](../concerns/README.md) for the current open list (automated backup scheduling, the single global rate-limit threshold, no deploy automation): everything else previously tracked there has since been resolved and folded into this document. `pytest` no longer ships in the production backend image: `docker/backend.Dockerfile`'s multi-stage build has a `runtime` target (no test tooling, the default and the only target `backend`/`procrastinate_worker`/`alembic` actually run) and a separate `test` target that layers `requirements-dev.txt` on top of it, selected via the backend service's `target: ${BACKEND_BUILD_TARGET:-runtime}` in `docker-compose.yml`. Error monitoring is available (opt-in) rather than a tracked gap now: see [Error Monitoring](../error-monitoring/overview.md).
