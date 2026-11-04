import asyncio
import unicodedata
import uuid
import weakref
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from ...core.errors import service_unavailable_error
from ...core.settings import settings
from ..token_logic.jwt_service import jwt_service

_hasher = PasswordHasher()


class _HashGate:
    """Bounds how many Argon2 operations run at once on one worker, and how many may wait.

    Each hash costs about 0.4 CPU-seconds, so a stack with a couple of CPUs
    sustains only a few logins per second. Without a bound, a burst queues
    behind that limit and callers hang until their client times out (30 s in
    the load test). Past the waiting limit a caller is told to retry shortly
    (503 with Retry-After), which keeps latency bounded for the ones admitted.
    """

    def __init__(self) -> None:
        self.running = asyncio.Semaphore(max(1, settings.PASSWORD_HASH_CONCURRENCY))
        self.waiting = 0


# One gate per event loop: a Semaphore binds to the loop it first waits on.
_gates: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, _HashGate] = weakref.WeakKeyDictionary()


async def _run_hash(function, *args):
    loop = asyncio.get_running_loop()
    gate = _gates.get(loop)
    if gate is None:
        gate = _gates[loop] = _HashGate()
    if gate.running.locked():
        if gate.waiting >= settings.PASSWORD_HASH_MAX_WAITING:
            raise service_unavailable_error("Too many sign-in attempts at once; please try again shortly")
        gate.waiting += 1
        try:
            await gate.running.acquire()
        finally:
            gate.waiting -= 1
    else:
        await gate.running.acquire()
    try:
        return await asyncio.to_thread(function, *args)
    finally:
        gate.running.release()


def normalize_password(password: str) -> str:
    """NFKC-normalize a password before hashing or checking it (NIST SP 800-63B).

    "é" can be typed as one character or as "e" plus a combining accent, and
    different keyboards, browsers and operating systems pick differently. Without
    this, a user who set a password on one device can be told "wrong password" on
    another, because the two byte strings hash differently.
    """
    return unicodedata.normalize("NFKC", password)


class PasswordService:
    """Handles password hashing/verification, strength checks, and reset tokens."""

    # A fixed Argon2 hash of a never-used password. Callers with no real
    # hash to check against (nonexistent account, OAuth2-only account)
    # compare against this instead of skipping the check, which would let a
    # timing attack distinguish "no such account" from "wrong password."
    DUMMY_HASH: str = _hasher.hash("timing-attack-mitigation-placeholder")

    @staticmethod
    async def hash_password(password: str) -> str:
        # Off the event loop: Argon2 is deliberately slow (that's the point), and
        # calling it synchronously inside a coroutine blocks every other
        # concurrent request on this worker for the duration of the hash.
        return await _run_hash(_hasher.hash, normalize_password(password))

    @staticmethod
    async def verify_password(plain_password: str, hashed_password: str) -> bool:
        # argon2-cffi raises on a mismatch or malformed hash rather than
        # returning False; normalized to a bool here so callers don't need
        # to know that.
        normalized = normalize_password(plain_password)
        if await PasswordService._matches(normalized, hashed_password):
            return True
        # Accounts created before normalization hashed the password exactly as
        # typed. Only inputs that normalization actually changes (non-ASCII text)
        # need this second check, so ordinary passwords still cost one hash.
        return normalized != plain_password and await PasswordService._matches(plain_password, hashed_password)

    @staticmethod
    async def _matches(password: str, hashed_password: str) -> bool:
        try:
            return await _run_hash(_hasher.verify, hashed_password, password)
        except (VerifyMismatchError, InvalidHashError):
            return False

    @staticmethod
    async def validate_password_strength(password: str) -> bool:
        password = normalize_password(password)
        if len(password) < 8:
            return False

        # Require a mix of character classes: a length-only check accepts
        # passwords like "aaaaaaaa" that are trivially guessable, defeating the
        # point of enforcing a minimum length at all.
        has_upper = any(char.isupper() for char in password)
        has_lower = any(char.islower() for char in password)
        has_digit = any(char.isdigit() for char in password)

        return has_upper and has_lower and has_digit

    @staticmethod
    async def create_reset_token(
        email: str,
        expires_minutes: int = settings.RESET_TOKEN_EXPIRE_MINUTES
    ) -> str:
        expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)

        # The "reset" type claim lets verify_reset_token reject any other
        # validly-signed JWT carrying an "email" claim.
        payload: dict[str, str | float] = {
            "email": email,
            "jti": uuid.uuid4().hex,
            "type": "reset",
            "exp": expire.timestamp(),
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
        }

        # Off the event loop, same as jwt_service.py's own encode/decode calls,
        # since PyJWT's encode/decode are sync, so calling them directly here would
        # block every other concurrent request on this worker.
        return await asyncio.to_thread(jwt.encode, payload, settings.SECRET_KEY, settings.JWT_ALGORITHM)

    @staticmethod
    async def verify_reset_token(token: str) -> dict | None:
        try:
            # Decode audience separately so the shared issuer/audience guard
            # can enforce the current token contract and reject older signed
            # tokens that predate those claims.
            payload = await asyncio.to_thread(
                jwt.decode,
                token,
                settings.SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
                options={"verify_aud": False},
            )

            if not payload.get("email"):
                return None

            # Rejects any other validly-signed JWT (e.g. a stolen but
            # still-valid access/refresh token sharing the same SECRET_KEY) that
            # happens to also carry an "email" claim.
            if payload.get("type") != "reset":
                return None

            if not jwt_service.has_valid_issuer_and_audience(payload):
                return None

            return payload

        except jwt.ExpiredSignatureError:
            return None

        except jwt.InvalidTokenError:
            return None


password_service = PasswordService()
