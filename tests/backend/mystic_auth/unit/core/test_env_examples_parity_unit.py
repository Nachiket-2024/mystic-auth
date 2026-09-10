# tests/backend/mystic_auth/unit/core/test_env_examples_parity_unit.py
#
# Regression guard for the class of bug found in TRUSTED_PROXY_IPS: a
# Settings field with no default silently required a value in every env
# file, including env/mystic_auth/.env*.example files that never actually
# shipped one and services (alembic, procrastinate_worker) that never
# needed it. This only ever surfaced as a runtime crash for whoever hit it
# first. Comparing Settings' own required fields against what each shipped
# .env*.example actually declares catches that mismatch at test time
# instead.
from pathlib import Path

import pytest

from backend.mystic_auth.core.settings import Settings

_REPO_ROOT = Path(__file__).resolve().parents[5]

# frontend/.env.example is VITE_*-only and never read by Settings, so it's
# excluded here on purpose. env/app/ ships empty by design, so it's
# excluded too - this checks each mystic_auth file is complete on its own.
# Globbed rather than a fixed list, so a fork's own new mode is checked too.
_BACKEND_ENV_EXAMPLES = sorted(
    str(p.relative_to(_REPO_ROOT))
    for p in (_REPO_ROOT / "env" / "mystic_auth").glob(".env*.example")
)


def _declared_keys(example_path: Path) -> set[str]:
    keys = set()
    for line in example_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        keys.add(stripped.split("=", 1)[0])
    return keys


def _required_settings_fields() -> set[str]:
    return {
        name
        for name, field in Settings.model_fields.items()
        if field.is_required()
    }


@pytest.mark.parametrize("example_file", _BACKEND_ENV_EXAMPLES)
def test_every_required_settings_field_is_declared_in_env_example(example_file):
    example_path = _REPO_ROOT / example_file
    assert example_path.exists(), f"{example_file} is missing from the repo"

    declared = _declared_keys(example_path)
    required = _required_settings_fields()
    missing = required - declared

    assert not missing, (
        f"{example_file} is missing required Settings field(s): {sorted(missing)}. "
        "Either add them to the file or give the field a default in "
        "backend/mystic_auth/core/settings.py if it's not actually needed "
        "by every service that reads this file."
    )
