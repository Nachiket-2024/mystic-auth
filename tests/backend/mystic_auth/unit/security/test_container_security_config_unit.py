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

    for code in (400, 405, 408, 413, 414, 429, 431, 500, 502, 503, 504):
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
