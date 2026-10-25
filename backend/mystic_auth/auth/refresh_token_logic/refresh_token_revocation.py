import traceback

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

# Refresh token reuse is likely theft, not a routine expired/invalid refresh:
# see handle_reuse_detected.
from ...audit_log.audit_log_service import REFRESH_TOKEN_REUSE_DETECTED, log_security_event
from ...error_monitoring.sentry_service import capture_security_alert
from ...logging.logging_config import get_logger
from ...user_session.session_events import publish_session_revoked
from ...user_session.session_service import session_service
from ..token_logic.jwt_service import jwt_service
from ..token_logic.token_version_store import TokenVersionUnavailableError

logger = get_logger(__name__)


async def revoke_all_tokens_for_user(email: str, db: AsyncSession | None = None) -> int:
    """Revoke every token for logout-all, password change, or account removal.

    One account-version bump invalidates all tokens without iterating over
    token ids. The return value is the pre-revoke active session count from
    the best-effort Postgres mirror.

    Raises TokenVersionUnavailableError if the account-version bump
    itself could not be confirmed (Postgres unavailable): the Postgres
    mirror is deliberately left untouched in that case, since marking
    sessions revoked there while the durable Postgres version stayed
    unbumped would make Manage Sessions/audit logs lie about whether
    those tokens are actually dead. Callers must not report success
    when this is raised.
    """
    try:
        if not await jwt_service.bump_account_version(email):
            raise TokenVersionUnavailableError(f"Failed to bump account version for {email}")

        # The durable version bump is the security boundary. Session
        # counting is only used for the response/audit summary and must
        # never be allowed to prevent revocation from happening.
        try:
            active_count = await session_service.count_active_sessions(db, email)
        except Exception:
            active_count = 0
            logger.warning(
                "Could not count active sessions while revoking all tokens for %s",
                email,
                exc_info=True,
            )

        await session_service.revoke_all_sessions(db, email)
        await publish_session_revoked(email)

        return active_count

    except TokenVersionUnavailableError:
        raise

    except Exception:
        logger.error("Error revoking all tokens for user %s:\n%s", email, traceback.format_exc())
        return 0


async def revoke_all_tokens_for_user_except_chain(
    email: str, exempt_chain_id: str, db: AsyncSession | None = None
) -> int:
    """Revoke all active sessions except one authenticated chain.

    Used after an account-settings password change. The caller must mint
    fresh tokens for exempt_chain_id because bumping the account version
    invalidates every existing token, including the exempted session's old
    tokens.

    Returns the number of revoked sessions, excluding the exempted chain.

    Raises TokenVersionUnavailableError on the same terms as
    revoke_all_tokens_for_user above. The password change itself is a
    separate, unrelated DB write - callers should let that succeed and
    only use this exception to flag that other sessions were not
    actually revoked, rather than blocking the password change on it.
    """
    try:
        if not await jwt_service.bump_account_version(email):
            raise TokenVersionUnavailableError(f"Failed to bump account version for {email}")

        try:
            active_count = await session_service.count_active_sessions(db, email)
        except Exception:
            active_count = 0
            logger.warning(
                "Could not count active sessions while revoking tokens except chain %s for %s",
                exempt_chain_id,
                email,
                exc_info=True,
            )

        await session_service.revoke_all_sessions(db, email, exempt_chain_id=exempt_chain_id)
        await publish_session_revoked(email)

        return max(active_count - 1, 0)

    except TokenVersionUnavailableError:
        raise

    except Exception:
        logger.error(
            "Error revoking all tokens except chain %s for user %s:\n%s",
            exempt_chain_id, email, traceback.format_exc()
        )
        return 0


async def revoke_chain_for_user(email: str, chain_id: str, db: AsyncSession | None = None) -> None:
    """Revoke one token chain by chain_id.

    Manage Sessions uses session_id and goes through session_service.
    Reuse detection only has chain_id, so it comes through here. Other
    chains on the account stay valid.

    Raises TokenVersionUnavailableError if the chain-version bump could
    not be confirmed - see handle_reuse_detected, this function's only
    caller, for how a security-critical caller must react to that
    rather than treating it as a routine, swallowable failure.
    """
    try:
        if not await jwt_service.bump_chain_version(email, chain_id):
            raise TokenVersionUnavailableError(f"Failed to bump chain version for {email}/{chain_id}")

        await session_service.revoke_chain(db, chain_id)
        await publish_session_revoked(email)

    except TokenVersionUnavailableError:
        raise

    except Exception:
        logger.error(
            "Error revoking chain %s for user %s:\n%s", chain_id, email, traceback.format_exc()
        )


async def handle_reuse_detected(
    payload: dict, db: AsyncSession | None = None, request: Request | None = None
) -> None:
    """
    payload is the already-decoded claims of a refresh token whose jti
    was already claimed (see claim_jti_for_rotation). Accepting it
    directly avoids decoding the token a second time, since the caller
    already did that once to reach this point.

    The reused token itself is always rejected regardless of what
    happens here: refresh_tokens() returns None unconditionally right
    after calling this function (see the "not claimed" branch there), so
    this stays fail-closed for the actual request in flight even if the
    version bump below can't be confirmed. What TokenVersionUnavailableError
    changes is only whether *other* tokens on the account/chain actually
    got invalidated too - caught here (rather than left to propagate)
    so the critical log and audit event, the evidence that theft was
    detected at all, still get written even when Postgres is down.
    """
    email = payload.get("email")

    if not email:
        logger.warning("Refresh token reuse detected, but no email claim was present")
        return

    chain_id = payload.get("chain")
    revocation_confirmed = True
    try:
        if chain_id:
            # Scoped: only the compromised chain (this reused token's
            # own lineage) is revoked. See revoke_chain_for_user.
            await revoke_chain_for_user(email, chain_id, db)
        else:
            # A pre-upgrade token minted with no "chain" claim: lineage
            # is unknown, so fall back to the account-wide,
            # maximally-safe response.
            await revoke_all_tokens_for_user(email, db)
    except TokenVersionUnavailableError:
        revocation_confirmed = False

    revoked_description = f"chain {chain_id}" if chain_id else "the whole account (no chain claim)"

    # Logged at a severity that stands out from routine single-token
    # revocations, since this indicates likely token theft rather than an
    # expected rotation.
    if revocation_confirmed:
        logger.critical("Refresh token reuse detected for %s, revoked %s", email, revoked_description)
    else:
        logger.critical(
            "Refresh token reuse detected for %s, but revocation of %s could not be confirmed "
            "(Postgres unavailable) - those tokens may remain valid until Postgres recovers",
            email, revoked_description,
        )

    metadata: dict[str, str | bool] = {"chain_id": chain_id} if chain_id else {"scope": "account"}
    metadata["revocation_confirmed"] = revocation_confirmed

    await log_security_event(
        REFRESH_TOKEN_REUSE_DETECTED,
        db,
        user_email=email,
        success=False,
        request=request,
        metadata=metadata,
    )
    await capture_security_alert(REFRESH_TOKEN_REUSE_DETECTED, metadata=metadata)
