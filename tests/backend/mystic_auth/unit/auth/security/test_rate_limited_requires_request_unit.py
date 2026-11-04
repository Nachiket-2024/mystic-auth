import pytest

from backend.mystic_auth.auth.security.rate_limiting.rate_limiter_service import (
    rate_limiter_service as rate_limiter,
)


def test_rate_limited_rejects_a_handler_without_a_request_parameter():
    # Without a Request the limiter cannot see the IP and every caller would
    # share one "<endpoint>:ip:unknown" bucket.
    with pytest.raises(TypeError, match="must declare a `request: Request`"):

        @rate_limiter.rate_limited("no_request_endpoint_test")
        async def handler(db):  # pragma: no cover - never called
            return None


def test_rate_limited_accepts_a_handler_with_a_request_parameter():
    @rate_limiter.rate_limited("with_request_endpoint_test")
    async def handler(request):  # pragma: no cover - never called
        return None

    assert handler is not None


def test_every_registered_route_handler_declares_request():
    # Importing the app runs every @rate_limited decorator; one that lacks a
    # Request would already have raised TypeError here.
    import backend.app.main  # noqa: F401
