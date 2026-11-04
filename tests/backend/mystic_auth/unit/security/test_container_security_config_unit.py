import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]


def _compose_service(text: str, service_name: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(service_name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        text,
    )
    assert match, f"{service_name} service missing"
    return match.group(1)


def test_ngrok_container_declares_non_root_user_and_healthcheck():
    dockerfile = (ROOT / "docker/mystic_auth/dockerfiles/ngrok.Dockerfile").read_text()
    compose = (ROOT / "docker/mystic_auth/compose/docker-compose.local-prod-ngrok.yml").read_text()
    service = _compose_service(compose, "ngrok")

    assert re.search(r"(?mi)^USER\s+65532:65532\s*$", dockerfile)
    assert re.search(r"(?mi)^HEALTHCHECK\s+.*?/healthcheck", dockerfile)
    assert re.search(r"(?m)^    user:\s*['\"]65532:65532['\"]\s*$", service)
    assert re.search(r"(?m)^    healthcheck:\s*$", service)
    assert "/healthcheck" in service


def test_nginx_routes_generated_errors_through_security_header_locations():
    config = (ROOT / "docker/mystic_auth/nginx.frontend.conf").read_text()
    snippet = (ROOT / "docker/mystic_auth/nginx.error-headers.conf").read_text()
    dockerfile = (ROOT / "docker/mystic_auth/dockerfiles/frontend.Dockerfile").read_text()

    for code in (400, 404, 405, 408, 413, 414, 429, 431, 500, 502, 503, 504):
        assert f"error_page {code} /_security_error/{code};" in config
        assert f"location = /_security_error/{code} {{ internal;" in config
    assert "include /etc/nginx/snippets/security-error-headers.conf;" in config
    # 494 = nginx's internal "header too large" code, otherwise sent as bare 400.
    assert "error_page 494 /_security_error/431;" in config
    assert "@security_error_" not in config
    assert "Strict-Transport-Security" in snippet
    assert "X-Content-Type-Options" in snippet
    assert "Content-Security-Policy" in snippet
    assert "nginx.error-headers.conf /etc/nginx/snippets/security-error-headers.conf" in dockerfile


def test_cloudflare_tunnel_token_is_excluded_from_docker_build_context():
    dockerignore = (ROOT / ".dockerignore").read_text()

    assert re.search(r"(?m)^env/mystic_auth/\.cloudflare-tunnel-token$", dockerignore)


def test_cloudflare_compose_secret_uses_the_documented_token_file():
    compose = (
        ROOT / "docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml"
    ).read_text()

    assert re.search(
        r"(?m)^    file: \.\./\.\./\.\./env/mystic_auth/\.cloudflare-tunnel-token$",
        compose,
    )


def test_nginx_returns_404_for_missing_static_files_instead_of_the_spa_page():
    config = (ROOT / "docker/mystic_auth/nginx.frontend.conf").read_text()
    for marker in ("location ~ ^/assets/", "location ~ ^/(robots"):
        start = config.index(marker)
        block = config[start : config.index("}", start)]
        assert "try_files $uri =404;" in block
        assert "Cross-Origin-Resource-Policy" in block
    # the SPA fallback stays only in the catch-all location
    assert config.count("try_files $uri $uri/ /index.html;") == 1


def test_hashed_assets_are_cached_for_a_year_but_the_spa_page_is_not():
    config = (ROOT / "docker/mystic_auth/nginx.frontend.conf").read_text()
    start = config.index("location ~ ^/assets/")
    assets_block = config[start : config.index("}", start)]
    assert "public, max-age=31536000, immutable" in assets_block
    index_block = config[config.index("location = /index.html") :][:1800]
    assert "no-cache, no-store, must-revalidate" in index_block


_ALL_COMPOSE_FILES = [
    "docker-compose.prod.yml",
    "docker-compose.local-prod-ngrok.yml",
    "docker-compose.local-prod-tailscale.yml",
    "docker-compose.local-prod-cloudflare.yml",
]


def test_self_hosted_ntfy_is_deny_all_and_locked_down_in_every_mode():
    for name in _ALL_COMPOSE_FILES:
        compose = (ROOT / "docker/mystic_auth/compose" / name).read_text()
        service = _compose_service(compose, "ntfy")
        assert "NTFY_AUTH_DEFAULT_ACCESS: deny-all" in service, name
        assert 'NTFY_ENABLE_SIGNUP: "false"' in service, name
        assert "NTFY_WEB_ROOT: disable" in service, name
        assert "read_only: true" in service, name
        assert "*container_hardening" in service, name
        assert "alert_net" in service, name
        assert re.search(r"(?m)^    healthcheck:\s*$", service), name
        # the image is pinned by digest, never a floating tag
        assert re.search(r"image: binwiederhier/ntfy:v[\d.]+@sha256:[0-9a-f]{64}", service), name


def test_ntfy_is_not_published_to_the_internet_and_alert_net_has_no_route_out():
    prod = (ROOT / "docker/mystic_auth/compose/docker-compose.prod.yml").read_text()
    assert "ports:" not in _compose_service(prod, "ntfy"), "prod ntfy must only be reachable through Caddy"
    assert "NTFY_BEHIND_PROXY: \"true\"" in _compose_service(prod, "ntfy")
    for name in _ALL_COMPOSE_FILES:
        compose = (ROOT / "docker/mystic_auth/compose" / name).read_text()
        assert re.search(r"(?m)^  alert_net:\n    internal: true\n", compose), name
        for local_port in re.findall(r"- \"([^\"]*:8080)\"", _compose_service(compose, "ntfy")):
            assert local_port.startswith("127.0.0.1:"), f"{name}: ntfy port must bind to loopback only"
        # only the senders and ntfy itself may sit on alert_net
        for service in ("postgres", "valkey", "frontend", "bugsink", "db_backup", "alembic", "geoipupdate"):
            if re.search(rf"(?m)^  {service}:\n", compose):
                assert "alert_net" not in _compose_service(compose, service), f"{name}: {service}"


def test_caddy_publishes_ntfy_on_its_own_domain_with_a_safe_fallback():
    caddyfile = (ROOT / "docker/mystic_auth/Caddyfile").read_text()
    assert "{$NTFY_PUBLIC_DOMAIN:ntfy.localhost} {" in caddyfile
    assert "reverse_proxy ntfy:8080" in caddyfile


def test_nginx_access_log_never_records_query_strings():
    config = (ROOT / "docker/mystic_auth/nginx.frontend.conf").read_text()
    match = re.search(r"log_format no_query (.*?);", config, re.DOTALL)
    assert match, "custom access log format missing"
    fmt = match.group(1)
    assert "$path_only" in fmt
    assert "~^(?<p>[^?]*) $p;" in config
    for leaky in ("$request ", "$request\"", "$request_uri", "$args", "$query_string", "$http_referer"):
        assert leaky not in fmt, f"{leaky} would log the OAuth code or other query data"
    assert "access_log /dev/stdout no_query;" in config


def test_bugsink_emails_are_off_unless_explicitly_enabled():
    for name in ["docker-compose.dev.yml", *_ALL_COMPOSE_FILES]:
        compose = (ROOT / "docker/mystic_auth/compose" / name).read_text()
        service = _compose_service(compose, "bugsink")
        assert (
            "EMAIL_BACKEND: ${BUGSINK_EMAIL_BACKEND:-bugsink.email_backends.QuietConsoleEmailBackend}" in service
        ), name


def test_backend_worker_autosizing_respects_the_container_cpu_limit():
    for name in _ALL_COMPOSE_FILES:
        compose = (ROOT / "docker/mystic_auth/compose" / name).read_text()
        service = _compose_service(compose, "backend")
        assert "/sys/fs/cgroup/cpu.max" in service, name
        assert "container CPU limit" in service, name
        # still capped at 4 and never below 1
        assert "-gt 4" in service and "-lt 1" in service, name
