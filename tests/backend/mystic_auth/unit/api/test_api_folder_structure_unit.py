"""api/ holds routes only; helpers belong to the domain package that owns them."""
import ast
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[5] / "backend" / "mystic_auth" / "api"
SHARED_HELPER_DIRS = {"get_or_404"}  # the one shared route helper kept in api/


def _route_modules():
    for path in sorted(API_DIR.rglob("*.py")):
        if path.name == "__init__.py" or path.parent.name in SHARED_HELPER_DIRS:
            continue
        yield path


def test_api_contains_only_route_modules():
    offenders = [str(p.relative_to(API_DIR)) for p in _route_modules() if not p.name.endswith("_routes.py")]
    assert offenders == []


def test_route_modules_define_only_handlers():
    # Every module-level function must be a decorated route handler (the decorator is the
    # router registration); classes and bare helpers go to the owning domain package.
    offenders = []
    for path in _route_modules():
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if isinstance(node, ast.ClassDef):
                offenders.append(f"{path.relative_to(API_DIR)}: class {node.name}")
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.decorator_list:
                offenders.append(f"{path.relative_to(API_DIR)}: {node.name}()")
    assert offenders == []
