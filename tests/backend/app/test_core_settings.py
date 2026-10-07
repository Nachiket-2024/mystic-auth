from backend.mystic_auth.core.settings import Settings


def test_trusted_hosts_include_a_separate_backend_origin():
    settings = Settings.model_construct(
        BACKEND_BASE_URL="https://api.example.test",
        FRONTEND_BASE_URL="https://app.example.test",
        FRONTEND_ADDITIONAL_BASE_URLS="https://admin.example.test",
    )

    assert settings.trusted_hosts == [
        "127.0.0.1",
        "admin.example.test",
        "api.example.test",
        "app.example.test",
        "localhost",
        "testserver",
    ]
