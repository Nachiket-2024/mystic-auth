import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[5]
COMPOSE_DIR = ROOT / "docker" / "mystic_auth" / "compose"
SETTINGS = ROOT / "backend" / "mystic_auth" / "core" / "settings.py"

MODES = {
    "docker-compose.prod.yml": ".env.prod.example",
    "docker-compose.local-prod-ngrok.yml": ".env.local-prod-ngrok.example",
    "docker-compose.local-prod-cloudflare.yml": ".env.local-prod-cloudflare.example",
    "docker-compose.local-prod-tailscale.yml": ".env.local-prod-tailscale.example",
}
SECRET_NAME = re.compile(r"KEY|TOKEN|PASSWORD|SECRET|AUTH")
# Shared on purpose: the same password is already embedded in VALKEY_URL, which
# the backend and worker must have.
SHARED_ON_PURPOSE = {"VALKEY_PASSWORD"}
SERVICES = ("backend", "procrastinate_worker")


def _settings_fields() -> set[str]:
    return set(re.findall(r"^    ([A-Z][A-Z0-9_]+):\s", SETTINGS.read_text(), re.MULTILINE))


def _example_secrets(example: str) -> set[str]:
    names = set(re.findall(r"^([A-Z][A-Z0-9_]*)=", (ROOT / "env" / "mystic_auth" / example).read_text(), re.MULTILINE))
    return {n for n in names if SECRET_NAME.search(n)} - _settings_fields() - SHARED_ON_PURPOSE


@pytest.mark.parametrize("compose_name,example", list(MODES.items()))
@pytest.mark.parametrize("service", SERVICES)
def test_backend_and_worker_get_no_secret_that_belongs_to_another_service(compose_name, example, service):
    env = yaml.safe_load((COMPOSE_DIR / compose_name).read_text())["services"][service]["environment"]
    not_blanked = sorted(n for n in _example_secrets(example) if env.get(n) != "")

    assert not not_blanked, (
        f"{service} in {compose_name} inherits secrets it does not use: {not_blanked}. "
        'Add each as `NAME: ""` under its environment: block.'
    )
