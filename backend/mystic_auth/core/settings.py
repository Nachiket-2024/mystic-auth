from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    BACKEND_BASE_URL: str                           # Used to build auth redirect URLs back from the frontend
    FRONTEND_BASE_URL: str                          # Primary frontend origin: used for redirect/email links (OAuth callback, verification, password reset) and always CORS-allowed
    FRONTEND_ADDITIONAL_BASE_URLS: str              # Optional comma-separated extra CORS-allowed origins (e.g. staging alongside prod). Empty = none. Never used for redirect/email links; those always point at FRONTEND_BASE_URL

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

    REDIS_URL: str
    CACHE_DEFAULT_TTL: int                          # Default TTL for Redis cache keys, in seconds

    FROM_EMAIL: str                                 # Sender address for verification/password-reset emails
    GMAIL_APP_PASSWORD: str                         # Gmail App password for the FROM_EMAIL account
    SUPPORT_EMAIL: str                              # Reply-to/contact address in email footers. Empty falls back to FROM_EMAIL

    SMTP_HOST: str                                  # SMTP server host (e.g. smtp.gmail.com)
    SMTP_PORT: int                                  # SMTP server port (587 = STARTTLS, Gmail's default)

    EMAIL_ENABLED: bool = True                      # False sends every email through NullEmailSender (logs it, opens no SMTP connection) instead of the real SMTPEmailSender. Useful for local dev/test so signup/reset flows don't burn a real provider's send quota; tests always force this False regardless of .env

    APP_NAME: str                                    # Product name shown in email branding and API responses

    LOGIN_LOCKOUT_TIME: int                         # Lockout duration after failed login attempts, in seconds
    MAX_FAILED_LOGIN_ATTEMPTS: int
    LOGIN_LOCKOUT_TIME_PER_IP: int                  # Lockout duration for an IP after too many failed logins across accounts
    MAX_FAILED_LOGIN_ATTEMPTS_PER_IP: int           # Failed attempts from one IP, across any accounts, before that IP is locked out
    MAX_REQUESTS_PER_WINDOW: int                    # Rate limit: max requests per window
    REQUEST_WINDOW_SECONDS: int                     # Rate limit window size, in seconds

    LOG_LEVEL: str                                  # Application log level (e.g. INFO)

    ENVIRONMENT: str                                # "development" or "production"; gates docs/redoc exposure in main.py

    TRUSTED_PROXY_IPS: str                          # Comma-separated reverse proxy IPs to trust X-Forwarded-For from. Empty = never trust it, use request.client.host as-is

    GEOIP_DB_PATH: str                              # Path to a local MaxMind GeoLite2-City .mmdb file, used to resolve login IPs to city/country for Manage Sessions' Location column. Empty = geolocation disabled, Location shows "Unknown". Requires a free MaxMind account and license key; the file can't ship in this repo (MaxMind's license forbids redistribution)

    SENTRY_DSN: str                                 # Optional Sentry-protocol DSN (Sentry itself, or a compatible self-hosted server like Bugsink). Empty = error monitoring disabled, no SDK call is made
    SENTRY_ENVIRONMENT: str                         # Optional tag reported with every event (e.g. "production", "staging"). Empty falls back to ENVIRONMENT

    DEFAULT_APP_POLICIES: str                       # Optional comma-separated policy names auto-assigned to every verified user, alongside self_service. Empty = self_service only

    ACCOUNT_PURGE_GRACE_DAYS: int                   # Days a soft-deleted account is kept before the daily purge job hard-deletes it

    USER_EXPORT_MAX_ROWS: int                       # Hard ceiling on GET /users/export's row count (that endpoint has no offset/limit). A request matching more rows is rejected instead of loaded into memory in one query

    # env/.env is also passed by docker-compose to infra-only services
    # (REDIS_PASSWORD, BUGSINK_*, etc.) that have no matching Settings
    # field. extra="ignore" lets those pass through instead of pydantic
    # rejecting them as undeclared.
    model_config = SettingsConfigDict(env_file="env/.env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("SECRET_KEY")
    @classmethod
    def _secret_key_minimum_strength(cls, value: str) -> str:
        # Fail fast at startup rather than let a weak SECRET_KEY go
        # unnoticed until someone forges a token. 32 chars is just a floor
        # to catch placeholders like "changeme", not a real entropy check.
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return value

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
    def procrastinate_database_url(self) -> str:
        """DATABASE_URL rewritten from SQLAlchemy's `postgresql+asyncpg://`
        prefix to the plain `postgresql://` DSN Procrastinate's
        PsycopgConnector expects. Procrastinate opens its own psycopg
        connection pool, separate from the SQLAlchemy engine."""
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

    @property
    def default_app_policy_names(self) -> list[str]:
        """Parsed, deduplicated DEFAULT_APP_POLICIES. Empty list when unset."""
        names = (name.strip() for name in self.DEFAULT_APP_POLICIES.split(","))
        return list(dict.fromkeys(name for name in names if name))


settings = Settings()
