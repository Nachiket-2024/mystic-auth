# Layout rule for every example env file: a section header line is followed
# directly by its first line (no blank line in between), a blank line separates
# one section from the next, and no section is empty.
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[5]
HEADER = re.compile(r"^#\s*-{3,}.*-{3,}\s*$")
FILES = sorted(
    [*ROOT.glob("env/*/.env.*.example"), ROOT / "frontend/.env.example"]
    + list(ROOT.glob("local-scripts/**/system-user.env.example"))
    + list(ROOT.glob("scripts/**/shared-values.env.example"))
)


@pytest.mark.parametrize("path", FILES, ids=lambda p: str(p.relative_to(ROOT)))
def test_section_headers_sit_directly_above_their_fields(path):
    lines = path.read_text().split("\n")
    for index, line in enumerate(lines):
        if not HEADER.match(line):
            continue
        following = lines[index + 1] if index + 1 < len(lines) else ""
        assert following.strip() != "", f"{path.name}:{index + 1} header is followed by a blank line or nothing"
        assert not HEADER.match(following), f"{path.name}:{index + 1} header has an empty section"
        if index > 0:
            assert lines[index - 1].strip() == "", f"{path.name}:{index + 1} needs one blank line before the header"
    assert path.read_text().endswith("\n"), f"{path.name} must end with a newline"
