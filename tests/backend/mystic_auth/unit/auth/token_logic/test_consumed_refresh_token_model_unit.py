from backend.mystic_auth.auth.token_logic.consumed_refresh_token_model import (
    ConsumedRefreshToken,
)


def test_consumed_refresh_token_model_declares_durable_single_use_claim():
    row = ConsumedRefreshToken(jti="abc123", expires_at=None, client_ip="203.0.113.5")

    assert row.jti == "abc123"
    assert row.client_ip == "203.0.113.5"
    assert ConsumedRefreshToken.__tablename__ == "consumed_refresh_tokens"
    assert ConsumedRefreshToken.__table__.c.jti.primary_key is True
    assert ConsumedRefreshToken.__table__.c.expires_at.nullable is False
    assert ConsumedRefreshToken.__table__.c.expires_at.index is True
    assert ConsumedRefreshToken.__table__.c.account_ver.nullable is False
    assert ConsumedRefreshToken.__table__.c.chain_ver.nullable is False
