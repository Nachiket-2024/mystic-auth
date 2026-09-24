from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...database.connection import database
from ...logging.logging_config import get_logger
from ...valkey.client import valkey_client

logger = get_logger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health():
    """
    Liveness probe: is the process up and able to serve requests at all.
    Deliberately cheap (no dependency checks) so it's safe to poll frequently.
    Use /health/ready for an actual dependency-aware readiness check.
    """
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready(db: AsyncSession = Depends(database.get_session)):
    """
    Readiness probe: confirms Postgres and Valkey connectivity. Each check is
    wrapped in its own try/except, so one dependency being down still
    reports the other's real status instead of masking it.
    """
    checks: dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        logger.error("Readiness check: database connectivity failed", exc_info=True)
        checks["database"] = "error"

    try:
        await valkey_client.ping()
        checks["valkey"] = "ok"
    except Exception:
        logger.error("Readiness check: valkey connectivity failed", exc_info=True)
        checks["valkey"] = "error"

    all_ok = all(status == "ok" for status in checks.values())
    return JSONResponse(
        content={"status": "ok" if all_ok else "error", "checks": checks},
        status_code=200 if all_ok else 503,
    )
