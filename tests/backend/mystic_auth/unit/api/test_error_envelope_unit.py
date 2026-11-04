# Every error response from the backend uses {detail, code, params}. The auth
# handlers used to build {"error": ...} bodies by hand; this keeps that from
# coming back.
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[5] / "backend" / "mystic_auth"
# A response-body key `"error":` (audit metadata like metadata={"error": ...} is not a response).
PATTERN = re.compile(r'(?<!metadata=\{)"error":')


def test_no_handler_builds_an_error_key_response_body():
    offenders = [
        f"{path.relative_to(BACKEND)}:{number}"
        for path in BACKEND.rglob("*.py")
        for number, line in enumerate(path.read_text().splitlines(), 1)
        if PATTERN.search(line)
    ]
    assert offenders == []


def test_refresh_is_listed_once_in_the_api_docs_but_both_spellings_work():
    from fastapi.testclient import TestClient

    from backend.app.main import app

    paths = [p for p in app.openapi()["paths"] if p.startswith("/auth/refresh")]
    assert len(paths) == 1
    client = TestClient(app)
    assert client.post("/auth/refresh").status_code == client.post("/auth/refresh/").status_code == 401
