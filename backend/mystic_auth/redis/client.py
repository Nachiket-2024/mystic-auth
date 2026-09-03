from redis.asyncio import Redis

from ..core.settings import settings

REDIS_SOCKET_TIMEOUT_SECONDS = 3.0

redis_client = Redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
    socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
)
