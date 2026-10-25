from backend.app.main import app


def test_every_offset_query_is_bounded_to_prevent_database_integer_overflow():
    offset_parameters = [
        parameter
        for path in app.openapi()["paths"].values()
        for operation in path.values()
        if isinstance(operation, dict)
        for parameter in operation.get("parameters", [])
        if parameter.get("name") == "offset"
    ]

    assert len(offset_parameters) == 9
    assert all(parameter["schema"].get("maximum") == 10_000_000 for parameter in offset_parameters)
