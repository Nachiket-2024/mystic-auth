# tests/backend/mystic_auth/unit/core/settings_valid_fields.py
# Shared by the test_settings_*_unit.py files. Not collected as a test module.

# Every Settings field is required, with no Python-level default, except:
# TRUSTED_PROXY_IPS ("" since only the backend needs a real value) and
# SESSION_ROW_RETENTION_HOURS (1, a generic buffer with no reason to vary per
# deployment). This follows the convention of defaulting a required-but-
# service-specific field instead of padding every env file. .env.dev (or the
# process environment) is the source of truth for every other field. This
# fixture is a complete, valid payload; the tests poke at deviations from it.
# WebAuthn fields have safe defaults from the frontend URL and app name, so
# passkeys remain optional and do not require deployment-specific overrides.
ALL_FIELDS = {
    "BACKEND_BASE_URL": "http://localhost:8000",
    "FRONTEND_BASE_URL": "http://localhost:5173",
    "FRONTEND_ADDITIONAL_BASE_URLS": "",
    "WEBAUTHN_RP_ID": "localhost",
    "WEBAUTHN_ORIGINS": "http://localhost:5173",
    "WEBAUTHN_RP_NAME": "TestApp",
    "WEBAUTHN_CHALLENGE_TTL_SECONDS": 300,
    "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/db",
    "DB_POOL_SIZE": 10,
    "DB_MAX_OVERFLOW": 20,
    "POSTGRES_USER": "user",
    "POSTGRES_PASSWORD": "pass",
    "POSTGRES_DB": "db",
    "SECRET_KEY": "a" * 32,
    "ACCESS_TOKEN_EXPIRE_MINUTES": 15,
    "REFRESH_TOKEN_EXPIRE_MINUTES": 43200,
    "JWT_ALGORITHM": "HS256",
    "JWT_ISSUER": "http://localhost:8000",
    "JWT_AUDIENCE": "http://localhost:8000",
    "RESET_TOKEN_EXPIRE_MINUTES": 60,
    "ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES": 60,
    "GOOGLE_CLIENT_ID": "client-id",
    "GOOGLE_CLIENT_SECRET": "client-secret",
    "GOOGLE_REDIRECT_URI": "http://localhost:8000/auth/oauth2/callback/google",
    "VALKEY_URL": "redis://localhost:6379/0",
    "CACHE_DEFAULT_TTL": 300,
    "FROM_EMAIL": "from@example.com",
    "GMAIL_APP_PASSWORD": "app-password",
    "SUPPORT_EMAIL": "",
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": 587,
    "APP_NAME": "TestApp",
    "LOGIN_LOCKOUT_TIME": 300,
    "MAX_FAILED_LOGIN_ATTEMPTS": 5,
    "LOGIN_LOCKOUT_TIME_PER_IP": 300,
    "MAX_FAILED_LOGIN_ATTEMPTS_PER_IP": 20,
    "MAX_REQUESTS_PER_WINDOW": 100,
    "REQUEST_WINDOW_SECONDS": 60,
    "LOG_LEVEL": "INFO",
    "ENVIRONMENT": "development",
    "TRUSTED_PROXY_IPS": "",
    "GEOIP_DB_PATH": "",
    "SENTRY_DSN": "",
    "SENTRY_ENVIRONMENT": "",
    "ACCOUNT_PURGE_GRACE_DAYS": 30,
    "SESSION_ROW_RETENTION_HOURS": 1,
    "REFRESH_TOKEN_REUSE_GRACE_SECONDS": 10,
    "USER_EXPORT_MAX_ROWS": 50000,
}
