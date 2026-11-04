"""Downstream-owned exports and startup hooks for template consumers.

sdk.py is upstream's fixed list of what MysticAuth exposes: never edit it. This
file is yours. If your app needs something MysticAuth has but sdk.py does not
export, import it here straight from the MysticAuth tree and re-export it, then
import it from `app.app_sdk` in the rest of your code:

    from mystic_auth.emails.email_sender import send_email  # noqa: F401

Keeping those imports in this one file means an upstream rename is a one-line
fix. Also register extensions (custom condition handlers, listeners) below.
"""


def register_extensions() -> None:
    """Register app-owned extensions before requests are served."""
    # Add app imports and call register_condition_type() here as needed.
