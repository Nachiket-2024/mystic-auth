import re
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute, not relative to whatever the process's CWD happens to be (a
# relative path here breaks the moment something runs alembic/pytest with
# cwd=backend/ instead of the repo root).
_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    BACKEND_BASE_URL: str                           # Used to build auth redirect URLs back from the frontend
    FRONTEND_BASE_URL: str                          # Primary frontend origin: used for redirect/email links (OAuth callback, verification, password reset) and always CORS-allowed
    FRONTEND_ADDITIONAL_BASE_URLS: str              # Optional comma-separated extra CORS-allowed origins (e.g. staging alongside prod). Empty = none. Never used for redirect/email links; those always point at FRONTEND_BASE_URL

    WEBAUTHN_RP_ID: str = ""                        # Passkey relying-party ID (a bare hostname). Empty = FRONTEND_BASE_URL's hostname. Keep it stable once users enroll passkeys
    WEBAUTHN_RP_NAME: str = ""                      # Passkey relying-party display name. Empty = APP_NAME
    WEBAUTHN_ORIGINS: str = ""                      # Comma-separated exact browser origins allowed to run passkey ceremonies. Empty = FRONTEND_BASE_URL
    WEBAUTHN_CHALLENGE_TTL_SECONDS: int = 300       # Lifetime of a one-time passkey challenge, in seconds (60-600)

    DATABASE_URL: str                               # Async PostgreSQL URL. Used by Alembic (needs DDL rights) and Procrastinate's queue connector. The app itself prefers APP_DATABASE_URL when set
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str

    APP_DATABASE_URL: str = ""                      # Optional least-privilege DB URL (CRUD only, no DDL) for the request-serving app and background jobs. Empty (default) falls back to DATABASE_URL

    DB_POOL_SIZE: int                               # Per-process SQLAlchemy pool size. UVICORN_WORKERS * (DB_POOL_SIZE + DB_MAX_OVERFLOW) must stay under Postgres max_connections - see docs/mystic_auth/deployment/environment.md
    DB_MAX_OVERFLOW: int                            # Extra connections opened beyond DB_POOL_SIZE under burst load, closed again once idle

    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_MINUTES: int
    JWT_ALGORITHM: str
    JWT_ISSUER: str                                 # "iss" claim on every JWT; distinguishes this deployment's tokens from others sharing SECRET_KEY. Typically BACKEND_BASE_URL
    JWT_AUDIENCE: str                                # "aud" claim on every JWT; the token's intended consumer. Typically BACKEND_BASE_URL too, since this API issues and validates its own tokens
    RESET_TOKEN_EXPIRE_MINUTES: int
    ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES: int        # OAuth-only self-service account-deletion confirmation link lifetime, in minutes

    GOOGLE_CLIENT_ID: str                           # OAuth2 credentials for Google login
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str

    VALKEY_URL: str
    CACHE_DEFAULT_TTL: int                          # Default TTL for Valkey cache keys, in seconds

    FROM_EMAIL: str                                 # Sender address for verification/password-reset emails
    GMAIL_APP_PASSWORD: str                         # Gmail App password for the FROM_EMAIL account
    SUPPORT_EMAIL: str                              # Reply-to/contact address in email footers. Empty falls back to FROM_EMAIL

    SMTP_HOST: str                                  # SMTP server host (e.g. smtp.gmail.com)
    SMTP_PORT: int                                  # SMTP server port (587 = STARTTLS, Gmail's default)

    EMAIL_ENABLED: bool = True                      # False sends every email through NullEmailSender (logs it, opens no SMTP connection) instead of the real SMTPEmailSender. Useful for local dev/test so signup/reset flows don't burn a real provider's send quota; tests always force this False regardless of .env

    APP_NAME: str                                    # Product name shown in email branding and API responses
    BRAND_COLOR: str = "#b5533c"                    # #rrggbb brand color, the same value the frontend reads as VITE_BRAND_COLOR. Used for the button in verification and reset emails. Defaulted, so an env file without it still works
    EMAIL_LOGO_PATH: str = ""                       # Optional path (inside the container) to a PNG, JPEG or GIF under 256 KB shown in emails instead of the badge generated from BRAND_COLOR. Defaulted: empty keeps the generated badge. Mount the file read-only into the backend and worker

    LOGIN_LOCKOUT_TIME: int                         # Default lockout duration for email-scoped protected actions, in seconds
    MAX_FAILED_LOGIN_ATTEMPTS: int                  # Default failed-attempt threshold for email-scoped protected actions
    LOGIN_LOCKOUT_TIME_PER_IP: int                  # Lockout duration for one account/source-IP pair after repeated failed logins
    MAX_FAILED_LOGIN_ATTEMPTS_PER_IP: int           # Failed-attempt threshold for one account/source-IP pair
    ACTION_RESERVATION_TIME: int = 60               # Valkey reservation lifetime for concurrent one-time auth actions, in seconds
    MAX_REQUESTS_PER_WINDOW: int                    # Rate limit: max requests per window
    REQUEST_WINDOW_SECONDS: int                     # Rate limit window size, in seconds

    LOG_LEVEL: str                                  # Application log level (e.g. INFO)

    ENVIRONMENT: str                                # "development" or "production"; gates docs/redoc exposure in main.py

    TRUSTED_PROXY_IPS: str = ""                     # Comma-separated reverse proxy IPs to trust X-Forwarded-For from. Empty = never trust it, use request.client.host as-is. Only the backend service uses this; defaulted so alembic/procrastinate_worker don't need it in their env file

    GEOIP_DB_PATH: str                              # Path to a local MaxMind GeoLite2-City .mmdb file, used to resolve login IPs to city/country for Manage Sessions' Location column. Empty = geolocation disabled, Location shows "Unknown". Requires a free MaxMind account and license key; the file can't ship in this repo (MaxMind's license forbids redistribution)

    SENTRY_DSN: str                                 # Optional Sentry-protocol DSN (Sentry itself, or a compatible self-hosted server like Bugsink). Empty = error monitoring disabled, no SDK call is made
    SENTRY_ENVIRONMENT: str                         # Optional tag reported with every event (e.g. "production", "staging"). Empty falls back to ENVIRONMENT
    SECURITY_ALERT_WEBHOOK_URL: str = ""            # Incident endpoint for high-signal security alerts; required in production
    SECURITY_ALERT_WEBHOOK_FORMAT: Literal["json", "ntfy"] = "json"  # "ntfy" posts a readable message with title/priority headers (self-hosted ntfy, or ntfy.sh); "json" posts the generic alert object
    SECURITY_ALERT_WEBHOOK_TOKEN: str = ""          # Optional bearer token for SECURITY_ALERT_WEBHOOK_URL; never logged
    SECURITY_ALERT_WEBHOOK_TIMEOUT_SECONDS: float = 2.0  # Short fail-open timeout so monitoring cannot block authentication

    ACCOUNT_PURGE_GRACE_DAYS: int                   # Days a soft-deleted account is kept before the daily purge job hard-deletes it

    # Comma-separated dotted module paths imported by the Procrastinate app
    # before workers start. Downstream projects use this to register their
    # own tasks and worker hooks without editing template task files.
    PROCRASTINATE_TASK_IMPORT_PATHS: str = ""
    PROCRASTINATE_WORKER_MIDDLEWARE_PATHS: str = ""

    REFRESH_TOKEN_REUSE_GRACE_SECONDS: int = 10     # A same-IP retry within this many seconds is rejected without revoking the first request's chain. 0 disables. Defaulted, not in .env*
    STALLED_JOB_MAX_ATTEMPTS: int = 3              # How many times a job whose worker died mid-run is put back in the queue before it is marked failed (and alerted). Matches the 3-attempt retry used by the tasks. Defaulted, not in .env*
    PASSWORD_HASH_CONCURRENCY: int = 1             # Argon2 hashes allowed to run at once per worker process (each costs ~0.4 CPU-seconds). Defaulted, not in .env*
    PASSWORD_HASH_MAX_WAITING: int = 2             # Hashes allowed to queue behind those per worker; past this the request gets 503 + Retry-After instead of hanging (auth/password_logic/password_service.py). Defaulted, not in .env*
    LOGIN_ACCOUNT_FAILURE_THRESHOLD: int = 20      # Failed logins for one account, from any source, inside the window before the cool-down starts (auth/security/account_cooldown_service.py). Defaulted, not in .env*
    LOGIN_ACCOUNT_FAILURE_WINDOW_SECONDS: int = 900  # Window for the count above
    LOGIN_ACCOUNT_COOLDOWN_SECONDS: int = 30       # While cooling down, the account accepts one login attempt per this many seconds. A cool-down, not a lock, so it cannot be used to shut the owner out
    FAILED_JOB_RETENTION_DAYS: int = 30            # Days a failed, aborted or cancelled background job stays in procrastinate_jobs before the daily sweep deletes it. Kept this long because such a job (for example an authorization audit entry that could not be written) is the only record of the work. Defaulted, not in .env*
    SESSION_ROW_RETENTION_HOURS: int = 1           # Hours past expires_at a user_sessions row is kept before the daily sweep (maintenance_tasks.py) hard-deletes it. Buffer, not a deployment knob (defaulted, not in .env*): revoked sessions delete immediately on revoke, this only covers ones that lapsed without an explicit revoke
    SESSION_EVENT_MAX_CONNECTIONS_PER_ACCOUNT: int = 5  # Maximum concurrent authenticated SSE streams for one account, enforced globally through Valkey
    SESSION_EVENT_MAX_CONNECTIONS_PER_IP: int = 20      # Maximum concurrent authenticated SSE streams for one client IP, enforced globally through Valkey
    SESSION_EVENT_LEASE_GRACE_SECONDS: int = 30         # Expiry cushion if a worker dies before its SSE cleanup runs

    USER_EXPORT_MAX_ROWS: int                       # Hard ceiling on GET /users/export's row count (that endpoint has no offset/limit). A request matching more rows is rejected instead of loaded into memory in one query

    # For running the backend locally instead of in Docker (Docker itself
    # injects these via docker-compose's --env-file, not this fallback).
    # Both files are read in order so an env/app/ value wins on overlap,
    # matching every docker-compose invocation in this template's own
    # scripts (see docs/mystic_auth/template-usage/ownership-split.md).
    # Also picks up infra-only vars (VALKEY_PASSWORD, BUGSINK_*, etc.) that
    # have no matching Settings field below; extra="ignore" lets those pass
    # through instead of pydantic rejecting them as undeclared.
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / "env" / "mystic_auth" / ".env.dev", _REPO_ROOT / "env" / "app" / ".env.dev"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("BRAND_COLOR")
    @classmethod
    def _brand_color_is_hex(cls, value: str) -> str:
        # Written straight into inline email styles, so only a plain #rrggbb is accepted.
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("BRAND_COLOR must be a #rrggbb hex color, for example #b5533c")
        return value

    @field_validator("SECRET_KEY")
    @classmethod
    def _secret_key_minimum_strength(cls, value: str) -> str:
        # Fail fast at startup rather than let a weak SECRET_KEY go
        # unnoticed until someone forges a token. 32 chars is just a floor
        # to catch placeholders like "changeme", not a real entropy check.
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return value

    @field_validator("SECURITY_ALERT_WEBHOOK_URL")
    @classmethod
    def _security_webhook_must_use_https(cls, value: str) -> str:
        if value:
            parsed = urlsplit(value)
            if not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("SECURITY_ALERT_WEBHOOK_URL must be an HTTPS URL without embedded credentials")
            # Plain http is allowed only for a Docker service name (no dots, such
            # as http://ntfy:8080/topic). That name resolves only on the private
            # compose network, so the alert never crosses the internet unencrypted.
            internal_service = parsed.scheme == "http" and re.fullmatch(r"[a-z][a-z0-9_-]*", parsed.hostname) is not None
            if parsed.scheme != "https" and not internal_service:
                raise ValueError("SECURITY_ALERT_WEBHOOK_URL must be an HTTPS URL without embedded credentials")
        return value

    @model_validator(mode="after")
    def _reject_placeholder_secret_key_outside_development(self) -> Settings:
        # The example env files ship a public placeholder SECRET_KEY. Anyone
        # who has read the repo could forge tokens for any account against a
        # deployment that kept it, so refuse to start outside development.
        if self.ENVIRONMENT.lower() != "development" and "change_me" in self.SECRET_KEY.lower():
            raise ValueError("SECRET_KEY is still the example placeholder; generate a random value")
        return self

    @model_validator(mode="after")
    def _require_production_alert_webhook(self) -> Settings:
        if self.ENVIRONMENT.lower() == "production" and not self.SECURITY_ALERT_WEBHOOK_URL:
            raise ValueError(
                "SECURITY_ALERT_WEBHOOK_URL is required in production so critical security "
                "events have an outbound alert channel"
            )
        rp_id = self.webauthn_rp_id
        rp_parts = urlsplit(f"//{rp_id}")
        if not rp_parts.hostname or rp_parts.hostname != rp_id.lower() or rp_parts.path or rp_parts.port:
            raise ValueError("WEBAUTHN_RP_ID must be a hostname without a scheme, path, or port")
        if not 1 <= len(self.webauthn_rp_name) <= 64:
            raise ValueError("WEBAUTHN_RP_NAME (or APP_NAME when blank) must be between 1 and 64 characters")
        if not 60 <= self.WEBAUTHN_CHALLENGE_TTL_SECONDS <= 600:
            raise ValueError("WEBAUTHN_CHALLENGE_TTL_SECONDS must be between 60 and 600")
        for origin in self.webauthn_origins:
            parts = urlsplit(origin)
            if (
                not parts.scheme
                or not parts.hostname
                or parts.username
                or parts.password
                or parts.path
                or parts.query
                or parts.fragment
            ):
                raise ValueError("WEBAUTHN_ORIGINS must contain exact origins without paths or credentials")
            host = parts.hostname.lower()
            local = host in {"localhost", "127.0.0.1", "::1"}
            if parts.scheme != "https" and not local:
                raise ValueError("WebAuthn origins must use HTTPS except on localhost")
            if host != rp_id and not host.endswith(f".{rp_id}") and not (local and rp_id == "localhost"):
                raise ValueError("Each WebAuthn origin host must match or be a subdomain of WEBAUTHN_RP_ID")
        return self

    @property
    def cors_allowed_origins(self) -> list[str]:
        """Every origin CORSMiddleware should allow: FRONTEND_BASE_URL plus
        whatever FRONTEND_ADDITIONAL_BASE_URLS adds."""
        extra = (
            origin.strip()
            for origin in self.FRONTEND_ADDITIONAL_BASE_URLS.split(",")
        )
        # dict.fromkeys, not set(): keeps a deterministic order for logging;
        # CORS matching itself doesn't care about order.
        return list(dict.fromkeys([self.FRONTEND_BASE_URL, *(o for o in extra if o)]))

    @property
    def webauthn_rp_id(self) -> str:
        return self.WEBAUTHN_RP_ID.strip() or (urlsplit(self.FRONTEND_BASE_URL).hostname or "localhost")

    @property
    def webauthn_rp_name(self) -> str:
        return self.WEBAUTHN_RP_NAME.strip() or self.APP_NAME

    @property
    def webauthn_origins(self) -> list[str]:
        origins = (origin.strip() for origin in self.WEBAUTHN_ORIGINS.split(","))
        return list(dict.fromkeys(origin for origin in origins if origin)) or [self.FRONTEND_BASE_URL]

    @property
    def trusted_hosts(self) -> list[str]:
        """Hostnames (no scheme/port) TrustedHostMiddleware should accept on
        the Host header. Reset/verify links are already built from
        FRONTEND_BASE_URL alone, never from the request (see
        account_verification_service.py), so this isn't what keeps those
        links honest - it closes the separate gap that nothing at the app
        layer itself rejects a spoofed Host, which previously meant a
        request straight to the backend's own localhost-only port (bypassing
        nginx/the tunnel, both of which enforce their own Host expectations)
        was accepted with no app-level check at all.

        Derived from cors_allowed_origins' hostnames, since nginx forwards
        the original client Host unchanged (`proxy_set_header Host $host`
        in nginx.frontend.conf), so real traffic's Host always matches one
        of those. "localhost"/"127.0.0.1" are always included too: every
        compose mode's backend healthcheck runs
        `curl http://localhost:8000/health/ready` from inside the
        container, and local direct-port debugging (documented in each
        local-prod compose file) hits the backend the same way.
        TrustedHostMiddleware compares only the hostname, so "localhost:8000"
        already matches a bare "localhost" entry; the port needs no separate
        listing.
        """
        hosts = {urlsplit(origin).hostname for origin in self.cors_allowed_origins}
        # The API may be hosted on a separate origin from the frontend. CORS
        # origins describe browser callers, not every valid Host header the
        # backend itself must serve.
        hosts.add(urlsplit(self.BACKEND_BASE_URL).hostname)
        hosts.update({"localhost", "127.0.0.1"})
        # httpx/Starlette's AsyncClient(transport=ASGITransport(...)) test
        # harness defaults to this exact hostname (see tests/backend/
        # conftest.py's `client` fixture) - the same convention Django's own
        # ALLOWED_HOSTS ships by default, for the same reason: nothing on
        # the real internet resolves "testserver", so allowing it here never
        # widens what a real request can spoof.
        hosts.add("testserver")
        return sorted(h for h in hosts if h)

    @property
    def secure_cookies(self) -> bool:
        """Use Secure cookies everywhere except the plain-HTTP dev stack."""
        return self.ENVIRONMENT.lower() != "development"

    @property
    def procrastinate_database_url(self) -> str:
        """DATABASE_URL rewritten from SQLAlchemy's `postgresql+asyncpg://`
        prefix to the plain `postgresql://` DSN Procrastinate's
        PsycopgConnector expects. Always the DDL-capable DATABASE_URL role,
        never APP_DATABASE_URL: this property is also reused by
        alembic/versions/a4c1e8f2b6d3_add_procrastinate_schema.py to create
        Procrastinate's own tables/functions/triggers, which genuinely needs
        schema rights. For the long-lived worker's own connector (which
        needs no DDL at runtime), use procrastinate_worker_database_url
        instead - see that property for why the two must stay distinct."""
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

    @property
    def procrastinate_worker_database_url(self) -> str:
        """APP_DATABASE_URL (falling back to DATABASE_URL, same preference
        order as database/connection.py's own engine) rewritten the same way
        procrastinate_database_url is. Used only by the long-lived worker
        connector in procrastinate_tasks/procrastinate_app.py, never by the
        schema-creating migration (which needs procrastinate_database_url's
        DDL-capable DATABASE_URL instead - the two must not be merged back
        into one property, or a deployment with APP_DATABASE_URL configured
        would have that migration fail for lacking DDL rights).

        Prefers the least-privilege role deliberately: the worker only ever
        needs CRUD on its own queue tables and whatever task bodies touch,
        both already covered by mystic_auth_app's blanket GRANT (see
        alembic/versions/b1e6a9f3c7d2_add_least_privilege_app_role.py) - it
        never runs DDL at runtime, only Alembic does. A worker compromise
        (a malicious/buggy job payload, a dependency RCE, a task
        deserialization bug) is contained to the app's own schema instead of
        inheriting the superuser DATABASE_URL role."""
        return (self.APP_DATABASE_URL or self.DATABASE_URL).replace("postgresql+asyncpg://", "postgresql://", 1)

settings = Settings()
