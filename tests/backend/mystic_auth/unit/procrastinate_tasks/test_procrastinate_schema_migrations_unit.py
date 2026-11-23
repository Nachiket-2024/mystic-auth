# Procrastinate ships SQL migrations for databases created on an older release,
# but Alembic only applies the full schema once, on a fresh database. Without a
# matching revision, a database created before a bump keeps the old schema and
# the new worker code fails against it. This fails when the installed package
# ships a migration that no revision under backend/alembic/versions handles.
import re
from importlib import resources
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[5] / "backend" / "alembic" / "versions"
VERSION_PREFIX = re.compile(r"^(\d{2}\.\d{2}\.\d{2})_")


def _newest_packaged_migration() -> str:
    migrations = resources.files("procrastinate").joinpath("sql/migrations")
    return max(m.group(1) for f in migrations.iterdir() if (m := VERSION_PREFIX.match(f.name)))


def _newest_handled_migration() -> str:
    found = [
        m.group(1)
        for path in VERSIONS.glob("*.py")
        if (m := re.search(r'^PROCRASTINATE_SCHEMA_VERSION = "([\d.]+)"', path.read_text(), re.MULTILINE))
    ]
    assert found, "no Alembic revision declares PROCRASTINATE_SCHEMA_VERSION"
    return max(found)


def test_every_packaged_procrastinate_migration_has_an_alembic_revision():
    assert _newest_handled_migration() == _newest_packaged_migration(), (
        "The installed procrastinate package ships schema migrations newer than the ones Alembic applies. "
        "Add a revision like b7d4e1a9c2f6 that applies them to existing databases (guarded so fresh "
        "databases skip it) and set its PROCRASTINATE_SCHEMA_VERSION."
    )
