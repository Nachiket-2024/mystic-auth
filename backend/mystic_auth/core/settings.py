from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    BACKEND_BASE_URL: str                           # Used to build auth redirect URLs back from the frontend
    FRONTEND_BASE_URL: str                          # Primary frontend origin, used to build redirect/email links (OAuth callback, verification, password reset), and always CORS-allowed
    FRONTEND_ADDITIONAL_BASE_URLS: str              # Optional, comma-separated extra CORS-allowed origins (e.g. a second domain, staging alongside prod). Empty string = none. Never used for redirect/email links: those always point at FRONTEND_BASE_URL alone, so there's one canonical link target regardless of how many origins are CORS-allowed.

    DATABASE_URL: str                               # Async PostgreSQL connection URL. Used as-is by Alembic migrations (needs DDL/role-management rights) and by Procrastinate's own internal queue connector (procrastinate_database_url below). The request-serving app itself prefers APP_DATABASE_URL when set - see that field.
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str

    APP_DATABASE_URL: str = ""                      # Optional. Async PostgreSQL connection URL for the request-serving app and background task bodies (database/connection.py), using a least-privilege role (CRUD only, no DDL/role management - see alembic migration b1e6a9f3c7d2) instead of DATABASE_URL's migration-capable role. Empty string (the default) falls back to DATABASE_URL, so existing deployments that don't set this are unaffected.

    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_MINUTES: int
    JWT_ALGORITHM: str
    JWT_ISSUER: str                                 # "iss" claim minted into every access/refresh/verify JWT and checked on verify_token(); distinguishes this deployment's tokens from any other service/environment that happens to share SECRET_KEY. Typically BACKEND_BASE_URL.
    JWT_AUDIENCE: str                               # "aud" claim minted into every access/refresh/verify JWT and checked on verify_token(); the token's intended consumer. Typically BACKEND_BASE_URL too, since this API is both the issuer and the resource server that validates its own tokens.
    RESET_TOKEN_EXPIRE_MINUTES: int
    ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES: int        # OAuth-only self-service account-deletion confirmation link lifetime, in minutes. See user_lifecycle/account_deletion_service.py.

    GOOGLE_CLIENT_ID: str                           # OAuth2 credentials for Gmail login
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str

    REDIS_URL: str
    CACHE_DEFAULT_TTL: int                          # Default TTL for Redis cache keys, in seconds

    FROM_EMAIL: str                                 # Email address used to send verification/password-reset emails
    GMAIL_APP_PASSWORD: str                         # Gmail App password for the FROM_EMAIL account
    SUPPORT_EMAIL: str                              # Reply-to/contact address shown in email footers. Empty string falls back to FROM_EMAIL.

    SMTP_HOST: str                                  # SMTP server host (e.g. smtp.gmail.com)
    SMTP_PORT: int                                  # SMTP server port (587 = STARTTLS, Gmail's default)

    EMAIL_ENABLED: bool = True                      # False routes every email through NullEmailSender (logs subject/recipient, never opens an SMTP connection) instead of emails/email_sender.py's real SMTPEmailSender. Defaults to True so an existing deployment's behavior is unaffected; set False for local dev/test runs against a real provider (e.g. a personal Gmail account with a real daily send quota) where signup/password-reset/account-deletion flows would otherwise burn through it on every run. tests/backend/conftest.py forces this False unconditionally for every test run regardless of .env, the same safety-net reasoning as its DATABASE_URL/APP_DATABASE_URL localhost rewrite.

    APP_NAME: str                                    # Product name shown in email branding and API responses

    LOGIN_LOCKOUT_TIME: int                         # Lockout duration after failed login attempts, in seconds
    MAX_FAILED_LOGIN_ATTEMPTS: int
    LOGIN_LOCKOUT_TIME_PER_IP: int                  # Lockout duration for an IP after too many failed logins across accounts
    MAX_FAILED_LOGIN_ATTEMPTS_PER_IP: int           # Failed attempts from one IP, across any accounts, before that IP is locked out
    MAX_REQUESTS_PER_WINDOW: int                    # Rate limit: max requests per window
    REQUEST_WINDOW_SECONDS: int                     # Rate limit window size, in seconds

    LOG_LEVEL: str                                  # Application log level (e.g. INFO)

    ENVIRONMENT: str                                # "development" or "production"; gates docs/redoc exposure in main.py

    TRUSTED_PROXY_IPS: str                          # Comma-separated reverse proxy IPs to trust X-Forwarded-For from (see auth/security/client_ip.py). Empty string = never trust it, use request.client.host as-is.

    GEOIP_DB_PATH: str                              # Path to a local MaxMind GeoLite2-City .mmdb file, used to resolve login IPs to city/country for Manage Sessions' Location column (see user_session/session_geolocation.py). Empty string = geolocation disabled, Location shows "Unknown". Free MaxMind account + license key required to download the .mmdb; it can't ship in this repo (MaxMind's license forbids redistribution).

    SENTRY_DSN: str                                 # Optional. Sentry-protocol error-monitoring DSN (works with Sentry itself, or a self-hosted Sentry-SDK-compatible server like Bugsink; see docs/mystic_auth/error-monitoring/overview.md). Empty string = error monitoring disabled entirely, no SDK call is ever made.
    SENTRY_ENVIRONMENT: str                         # Optional. Tag reported alongside every event (e.g. "production", "staging"). Empty string falls back to ENVIRONMENT.

    DEFAULT_APP_POLICIES: str                       # Optional, comma-separated policy names auto-assigned to every user once verified, alongside self_service. Empty string = self_service only. See authorization/policies/default_policies.py.

    ACCOUNT_PURGE_GRACE_DAYS: int                   # Days a soft-deleted (deleted_at set) account is kept before the daily procrastinate_tasks/account_purge_tasks.py job hard-purges it. See docs/mystic_auth/security/decisions.md#account-lifecycle.

    USER_EXPORT_MAX_ROWS: int                       # Hard ceiling on GET /users/export's filtered row count (that endpoint has no offset/limit of its own - see user_management_query_routes.py). A request matching more rows than this is rejected rather than loading them all into memory in one query.

    # The root .env is shared with docker-compose's `env_file:` directive, which
    # also passes it to infra-only services (REDIS_PASSWORD, BUGSINK_*, etc.)
    # with no corresponding Settings field. pydantic-settings' default
    # extra="forbid" would only bite when cwd=/repo (tests), not cwd=/app (the
    # real app, where the relative ".env" doesn't resolve). "ignore" makes both
    # paths behave the same instead of a test-only crash on undeclared env vars.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("SECRET_KEY")
    @classmethod
    def _secret_key_minimum_strength(cls, value: str) -> str:
        # A short/low-entropy SECRET_KEY would otherwise go undetected until
        # someone forges a token against it; fail fast at startup instead.
        # 32 chars is a floor, not a real entropy guarantee; it only catches
        # placeholder/example values like "changeme" or "secret".
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return value

    @property
    def cors_allowed_origins(self) -> list[str]:
        """
        Every origin CORSMiddleware should allow: FRONTEND_BASE_URL always,
        plus whatever FRONTEND_ADDITIONAL_BASE_URLS supplies. Kept here
        (rather than inline in main.py) so it's unit-testable on its own,
        same rationale as client_ip.py parsing TRUSTED_PROXY_IPS itself
        rather than leaving that to each call site.
        """
        extra = (
            origin.strip()
            for origin in self.FRONTEND_ADDITIONAL_BASE_URLS.split(",")
        )
        # dict.fromkeys, not set(): preserves the (otherwise arbitrary)
        # order origins were configured in, which matters only for reading
        # error messages/logs deterministically, never for CORS semantics
        # itself (allow_origins is checked as an unordered set of matches).
        return list(dict.fromkeys([self.FRONTEND_BASE_URL, *(o for o in extra if o)]))

    @property
    def procrastinate_database_url(self) -> str:
        """DATABASE_URL, translated from SQLAlchemy's `postgresql+asyncpg://`
        dialect prefix to the bare `postgresql://` DSN Procrastinate's
        PsycopgConnector expects. Procrastinate opens its own psycopg
        connection pool, entirely separate from the SQLAlchemy engine
        `database.py` builds from DATABASE_URL as-is."""
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

    @property
    def default_app_policy_names(self) -> list[str]:
        """Parsed, deduplicated DEFAULT_APP_POLICIES. Empty list when unset,
        so a downstream app that never sets this behaves exactly like
        upstream did before this setting existed: self_service only."""
        names = (name.strip() for name in self.DEFAULT_APP_POLICIES.split(","))
        return list(dict.fromkeys(name for name in names if name))


settings = Settings()
