"""The image shown at the top of transactional emails.

By default a badge drawn from BRAND_COLOR (brand_logo.py). A project with its own
logo points EMAIL_LOGO_PATH at an image file instead. Emails cannot use the
web app's VITE_APP_LOGO_URL: that is a URL the browser fetches, while mail
clients block remote and data: images, so the file is attached to each message.
"""
from functools import lru_cache
from pathlib import Path

from ..core.settings import settings
from ..logging.logging_config import get_logger
from .brand_logo import render_brand_logo_png

logger = get_logger(__name__)

MAX_LOGO_BYTES = 256 * 1024
_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpeg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
)


def _subtype_for(data: bytes) -> str | None:
    return next((subtype for signature, subtype in _SIGNATURES if data.startswith(signature)), None)


@lru_cache(maxsize=4)
def _load_custom_logo(path: str, mtime_ns: int) -> tuple[bytes, str] | None:
    """The file's bytes and image subtype, or None (with a warning) if it is unusable.

    mtime_ns is part of the cache key so replacing the file is picked up without a restart.
    """
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        logger.warning("EMAIL_LOGO_PATH %s cannot be read (%s); using the generated badge", path, exc.__class__.__name__)
        return None
    if len(data) > MAX_LOGO_BYTES:
        logger.warning("EMAIL_LOGO_PATH %s is larger than %d bytes; using the generated badge", path, MAX_LOGO_BYTES)
        return None
    subtype = _subtype_for(data)
    if subtype is None:
        logger.warning("EMAIL_LOGO_PATH %s is not a PNG, JPEG or GIF; using the generated badge", path)
        return None
    return data, subtype


def load_email_logo() -> tuple[bytes, str]:
    """(image bytes, MIME subtype) to attach inline as cid:brand-logo."""
    path = settings.EMAIL_LOGO_PATH
    if path:
        try:
            mtime_ns = Path(path).stat().st_mtime_ns
        except OSError:
            mtime_ns = -1
        custom = _load_custom_logo(path, mtime_ns)
        if custom is not None:
            return custom
    return render_brand_logo_png(settings.BRAND_COLOR), "png"
