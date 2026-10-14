"""Downstream-owned exports and startup hooks for template consumers."""


def register_extensions() -> None:
    """Register app-owned extensions before requests are served."""
    # Add app imports and call register_condition_type() here as needed.
