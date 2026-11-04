from pathlib import Path

import pytest
import yaml

COMPOSE_DIR = Path(__file__).resolve().parents[5] / "docker" / "mystic_auth" / "compose"
PROD_STYLE = [
    "docker-compose.prod.yml",
    "docker-compose.local-prod-ngrok.yml",
    "docker-compose.local-prod-cloudflare.yml",
    "docker-compose.local-prod-tailscale.yml",
]


@pytest.mark.parametrize("name", PROD_STYLE)
def test_worker_that_sends_email_can_reach_the_outbound_network_but_not_the_proxy(name):
    services = yaml.safe_load((COMPOSE_DIR / name).read_text())["services"]
    networks = set(services["procrastinate_worker"]["networks"])

    assert "app_egress_net" in networks, "the worker sends email and alerts and needs outbound access"
    assert {"postgres_net", "valkey_net"} <= networks
    assert "frontend_proxy" not in networks
