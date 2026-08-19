from pydantic import BaseModel


class RateLimitEntryRead(BaseModel):
    """One live Redis-backed rate-limit counter, as shown on the admin Rate
    Limit Dashboard. `key` is the raw Redis key (endpoint:scope:identifier),
    kept so the frontend can target DELETE /rate-limits/{key} for a
    row-level Reset without having to reconstruct it client-side."""

    key: str
    endpoint: str
    scope: str
    identifier: str
    count: int
    limit: int
    resets_in_seconds: int | None


class RateLimitPageRead(BaseModel):
    """One numbered page of RateLimitEntryRead. `total` (and any page count
    derived from it) is a floor, not an exact count, when `truncated` is
    true: the keyspace walk stopped at RateLimiterService.MAX_SCANNED_KEYS
    before reaching the end (see list_active_limits' docstring)."""

    entries: list[RateLimitEntryRead]
    total: int
    truncated: bool
