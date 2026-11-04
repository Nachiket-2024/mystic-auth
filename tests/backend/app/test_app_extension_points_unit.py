"""Guards for the extension points the template-usage docs promise a downstream project."""
import re
from pathlib import Path

import backend.app.models  # noqa: F401  (must import cleanly with no app models defined)
from backend.app import sdk
from backend.mystic_auth.database.base import Base

ROOT = Path(__file__).resolve().parents[3]


def test_sdk_exports_the_declarative_base_for_app_models():
    # App models declare themselves on this Base so Alembic autogenerate can see them.
    assert sdk.Base is Base
    assert "Base" in sdk.__all__


def test_alembic_env_loads_app_models_and_tolerates_a_project_without_the_file():
    env = (ROOT / "backend/alembic/env.py").read_text()
    assert "import app.models" in env
    # Only a missing app/app.models may be swallowed; a broken app model must still fail loudly.
    assert re.search(r'exc\.name not in \("app", "app\.models"\)', env)


def test_main_imports_sdk_before_app_sdk_so_the_app_sdk_alias_exists():
    # app code pulled in by app_sdk.py may use `from app.sdk import ...`, which only
    # resolves natively once backend/app/sdk.py has been imported.
    main = (ROOT / "backend/app/main.py").read_text()
    assert main.index("from .sdk import (") < main.index("from .app_sdk import register_extensions")
    assert "# isort: split" in main


def test_every_name_the_docs_import_from_app_sdk_is_exported():
    documented: set[str] = set()
    pattern = re.compile(r"from app\.sdk import (\([^)]*\)|[^\n]+)")
    for md in (ROOT / "docs").rglob("*.md"):
        if "project-story" in md.parts:
            continue
        for match in pattern.finditer(md.read_text(encoding="utf-8")):
            documented.update(re.findall(r"[A-Za-z_]\w*", match.group(1)))
    documented -= {"as"}
    assert documented, "expected the docs to show at least one app.sdk import"
    assert sorted(documented - set(sdk.__all__)) == []


def test_only_sdk_and_app_sdk_import_mystic_auth_directly():
    # sdk.py is upstream's fixed export list. app_sdk.py is the app's own place to import
    # anything else from mystic_auth that sdk.py does not expose. All other app code
    # imports from those two, so a project never edits mystic_auth/ and an upstream
    # path change is fixed in one file.
    allowed = {"sdk.py", "app_sdk.py"}
    offenders = []
    for path in (ROOT / "backend/app").rglob("*.py"):
        if path.name in allowed:
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if re.match(r"\s*(from|import)\s+(backend\.)?mystic_auth\b", line):
                offenders.append(f"{path.relative_to(ROOT)}: {line.strip()}")
    assert offenders == []
