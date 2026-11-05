#!/usr/bin/env bash
# Regression guard for stale third-party license notices: a dependency bump once
# left psycopg 3.3.6 notices (and a CI check that looked for them) in place
# after requirements.txt moved to 3.3.7.
#
# Every THIRD_PARTY_NOTICES/backend/<name>-<version>.txt must match the version
# pinned in backend/requirements.txt, and the README must name the pinned
# psycopg version. Every production package in frontend/package-lock.json must
# have exactly one matching THIRD_PARTY_NOTICES/frontend/ file, and vice versa.
#
# Usage: tests/scripts/mystic_auth/lint/check-third-party-notices.sh
# Exit 0: notices match the pins. Exit 1: mismatches, listed.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

python3 -I - <<'PY'
import re, sys
from pathlib import Path

def norm(name):
    return re.sub(r"[-_.]+", "-", name).lower()

pins = {
    norm(m[0]): m[1]
    for m in re.findall(r"^([A-Za-z0-9_.-]+)==([^\s;\\]+)", Path("backend/requirements.txt").read_text(), re.M)
}
bad = []
for f in sorted(Path("THIRD_PARTY_NOTICES/backend").glob("*.txt")):
    m = re.match(r"(.+?)-(\d[^-]*)\.txt$", f.name)
    if not m:
        continue  # license-only files such as GPL-3.0.txt
    name, version = norm(m[1]), m[2]
    if name in pins and pins[name] != version:
        bad.append(f"{f.name}: requirements.txt pins {pins[name]}")
    elif name not in pins and name != "gpl":
        bad.append(f"{f.name}: package is not in requirements.txt")
readme = Path("THIRD_PARTY_NOTICES/backend/README.md").read_text()
if f"Psycopg {pins['psycopg']}" not in readme:
    bad.append(f"README.md: does not name Psycopg {pins['psycopg']}")
import json
lock = json.loads(Path("frontend/package-lock.json").read_text())["packages"]
want = {}
for key, pkg in lock.items():
    if key.startswith("node_modules/") and not pkg.get("dev") and not pkg.get("optional"):
        name = key.rsplit("node_modules/", 1)[-1]
        want[re.sub(r"^@", "_", name, count=1).replace("/", "_") + "_" + pkg["version"] + ".txt"] = name
have = {f.name for f in Path("THIRD_PARTY_NOTICES/frontend").glob("*.txt")}
for f in sorted(set(want) - have):
    bad.append(f"frontend: missing {f}")
for f in sorted(have - set(want)):
    bad.append(f"frontend: stale {f}")
if bad:
    print("Notices out of sync with the dependency lockfiles:")
    print("\n".join(f"  {b}" for b in bad))
    sys.exit(1)
print("Notices match the dependency lockfiles")
PY
