from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    BACKEND_BASE_URL: str                           # Backend URL for Auth redirection from frontend
    FRONTEND_BASE_URL: str                          # Frontend URL for redirection

    DATABASE_URL: str                               # Async PostgreSQL connection URL
    POSTGRES_USER: str                              # PostgreSQL username
    POSTGRES_PASSWORD: str                          # PostgreSQL password
    POSTGRES_DB: str                                # PostgreSQL DB name

    SECRET_KEY: str                                 # Secret key for JWT encoding
    ACCESS_TOKEN_EXPIRE_MINUTES: int                # Access token expiration time in minutes
    REFRESH_TOKEN_EXPIRE_MINUTES: int               # Refresh token expiration time in minutes
    JWT_ALGORITHM: str                              # Algorithm for JWT encoding
    RESET_TOKEN_EXPIRE_MINUTES: int                 # Password reset token expiration time in minutes

    GOOGLE_CLIENT_ID: str                           # OAuth2 Client ID for Gmail
    GOOGLE_CLIENT_SECRET: str                       # OAuth2 Client Secret for Gmail
    GOOGLE_REDIRECT_URI: str                        # OAuth2 redirect URI for Gmail login

    REDIS_URL: str                                  # Redis connection URL
    CACHE_DEFAULT_TTL: int                          # Default TTL for Redis cache keys in seconds

    FROM_EMAIL: str                                 # Email address used to send password reset emails
    GMAIL_APP_PASSWORD: str                         # Gmail App password for sending email from above account
    SUPPORT_EMAIL: str = ""                         # Reply-to/contact address shown in email footers (defaults to FROM_EMAIL if unset)

    APP_NAME: str = "MysticAuth"                     # Product name shown in email branding (defaulted so existing .env files/CI keep working)

    LOGIN_LOCKOUT_TIME: int                         # Time in seconds to lockout after failed login attempts
    MAX_FAILED_LOGIN_ATTEMPTS: int                  # Max failed login attempts before lockout
    LOGIN_LOCKOUT_TIME_PER_IP: int                  # Time in seconds to lock out an IP after too many failed logins across accounts
    MAX_FAILED_LOGIN_ATTEMPTS_PER_IP: int           # Max failed login attempts from a single IP (across any accounts) before that IP is locked out
    MAX_REQUESTS_PER_WINDOW: int                    # Max requests allowed per rate limit window
    REQUEST_WINDOW_SECONDS: int                     # Time window for rate limiting in seconds

    LOG_LEVEL: str = "INFO"                         # Application log level (defaulted so existing .env files/CI keep working)

    ENVIRONMENT: str = "development"                # "development" or "production" (defaulted so existing .env files/CI keep working) — gates docs/redoc exposure in main.py

    TRUSTED_PROXY_IPS: str = ""                     # Comma-separated reverse proxy IPs to trust X-Forwarded-For from (see core/client_ip.py). Empty (default) = never trust it, use request.client.host as-is.

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @field_validator("SECRET_KEY")
    @classmethod
    def _secret_key_minimum_strength(cls, value: str) -> str:
        # A short/low-entropy SECRET_KEY would otherwise go undetected until
        # someone forges a token against it — fail fast at startup instead.
        # 32 chars is a floor, not a real entropy guarantee; it only catches
        # placeholder/example values like "changeme" or "secret".
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return value


settings = Settings()
