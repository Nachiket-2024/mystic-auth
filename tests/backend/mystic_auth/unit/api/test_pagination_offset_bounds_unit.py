from fastapi import FastAPI

from backend.app.main import app


def _template_only_app() -> FastAPI:
    # Rebuild the API from MysticAuth's own routers only, so routes a downstream
    # app adds do not change the expected count. Apps bound their own offsets.
    template_app = FastAPI()
    for route in app.routes:
        router = getattr(route, "original_router", None)
        if router is None:
            continue
        endpoints = [getattr(r, "endpoint", None) for r in router.routes]
        if any(e is not None and e.__module__.startswith("backend.mystic_auth.") for e in endpoints):
            template_app.include_router(router)
    return template_app


def test_every_offset_query_is_bounded_to_prevent_database_integer_overflow():
    offset_parameters = [
        parameter
        for path in _template_only_app().openapi()["paths"].values()
        for operation in path.values()
        if isinstance(operation, dict)
        for parameter in operation.get("parameters", [])
        if parameter.get("name") == "offset"
    ]

    assert len(offset_parameters) == 9
    assert all(parameter["schema"].get("maximum") == 10_000_000 for parameter in offset_parameters)
