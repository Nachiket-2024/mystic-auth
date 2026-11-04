import hashlib
import hmac

from ..core.settings import settings


def one_time_token_key(prefix: str, token: str) -> str:
    """Valkey key for a single-use emailed token, built from its SHA-256.

    The token itself is a signed JWT that carries the account email. Using it
    as a key name would let anyone who can list keys (SCAN, a dump, a backup,
    a monitoring tool) read live, redeemable tokens and emails. Tokens are
    random-enough signed values, so a fast hash is the right tool here: the
    hash cannot be turned back into a token that works.
    """
    return f"{prefix}:{hashlib.sha256(token.encode()).hexdigest()}"


def email_key_id(email: str) -> str:
    """Keyed, stable stand-in for an email address inside a Valkey key name.

    Key names are visible to SCAN, dumps, backups and monitoring tools, so an
    address must not appear in them. HMAC with the app secret (not a bare
    hash) stops anyone from confirming a guessed address against a leaked key
    list. Case and surrounding spaces are normalized so every call site maps
    one account to one id.
    """
    message = f"mystic-auth:valkey-key:v1:email:{email.strip().casefold()}".encode()
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()
