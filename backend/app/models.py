"""App-owned SQLAlchemy models, loaded by Alembic.

Alembic's autogenerate only sees models that were imported when it starts.
Import every model your app defines here (a bare import is enough) so
`alembic revision --autogenerate` and `alembic check` include its tables:

    from .projects.project_model import Project  # noqa: F401

Define models on `Base` from `app.sdk`.
"""
