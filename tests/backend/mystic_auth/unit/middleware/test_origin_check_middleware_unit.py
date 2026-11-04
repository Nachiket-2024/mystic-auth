import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.mystic_auth.core.settings import settings
from backend.mystic_auth.middleware.origin_check_middleware import (
    OriginCheckMiddleware,
)

FRONTEND = settings.FRONTEND_BASE_URL.rstrip("/")


@pytest.fixture
def client():
    app = FastAPI()
    app.add_middleware(OriginCheckMiddleware)

    @app.post("/write")
    async def write():
        return {"ok": True}

    @app.get("/read")
    async def read():
        return {"ok": True}

    return TestClient(app, base_url="http://testserver")


def test_a_sibling_subdomain_origin_cannot_send_an_unsafe_request(client):
    r = client.post("/write", headers={"Origin": "https://staging.evil.example", "Sec-Fetch-Site": "same-site"})
    assert r.status_code == 403
    assert r.json()["code"] == "CROSS_ORIGIN_REQUEST_BLOCKED"


def test_the_configured_frontend_origin_is_allowed(client):
    assert client.post("/write", headers={"Origin": FRONTEND}).status_code == 200


def test_same_host_origin_is_allowed_for_pages_served_through_the_proxy(client):
    r = client.post("/write", headers={"Origin": "http://testserver", "Sec-Fetch-Site": "same-origin"})
    assert r.status_code == 200


def test_origin_null_is_blocked(client):
    assert client.post("/write", headers={"Origin": "null"}).status_code == 403


def test_requests_without_origin_from_non_browsers_still_work(client):
    assert client.post("/write").status_code == 200


def test_a_browser_cross_site_request_without_origin_is_blocked(client):
    assert client.post("/write", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403


def test_safe_methods_are_never_checked(client):
    assert client.get("/read", headers={"Origin": "https://staging.evil.example"}).status_code == 200
