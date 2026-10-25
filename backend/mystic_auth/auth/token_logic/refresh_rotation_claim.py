from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class RefreshRotationClaim:
    claimed: bool
    consumed_at: datetime | None
    account_ver: int | None
    chain_ver: int | None
    client_ip: str | None
    legacy_valkey_marker: bool = False
