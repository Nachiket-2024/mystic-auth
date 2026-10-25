#!/usr/bin/env python3
"""Check every SPA entry response carries a matching, per-response CSP nonce
and a style policy with no 'unsafe-inline'."""

from __future__ import annotations

import re
import sys
import urllib.request

PATHS = ("/", "/login", "/dashboard", "/users", "/rate-limits", "/index.html")


def fetch(base: str, path: str) -> tuple[dict[str, str], str]:
    with urllib.request.urlopen(base + path, timeout=10) as response:
        headers = {key.lower(): value for key, value in response.headers.items()}
        return headers, response.read().decode()


def check(base: str, path: str) -> tuple[list[str], str | None]:
    headers, body = fetch(base, path)
    problems: list[str] = []
    csp = headers.get("content-security-policy", "")
    header_nonce = re.search(r"style-src-elem [^;]*'nonce-([0-9a-f]{32})'", csp)
    meta_nonce = re.search(r'<meta name="csp-nonce" content="([0-9a-f]{32})"', body)
    if "unsafe-inline" in csp:
        problems.append("CSP contains 'unsafe-inline'")
    if "style-src-attr" in csp:
        problems.append("CSP unexpectedly defines style-src-attr")
    if not header_nonce:
        problems.append("CSP header has no style-src-elem nonce")
    if not meta_nonce:
        problems.append("index.html meta csp-nonce was not replaced")
    if header_nonce and meta_nonce and header_nonce.group(1) != meta_nonce.group(1):
        problems.append("header and meta nonces differ")
    if "__CSP_NONCE__" in body:
        problems.append("placeholder left in body")
    if "no-store" not in headers.get("cache-control", ""):
        problems.append("response is cacheable, so the nonce could go stale")
    return problems, header_nonce.group(1) if header_nonce else None


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18080"
    failed = False
    nonces: set[str] = set()
    for path in PATHS:
        problems, nonce = check(base, path)
        if nonce:
            nonces.add(nonce)
        if problems:
            failed = True
            print(f"FAIL {path}: {'; '.join(problems)}")
        else:
            print(f"PASS {path}")
    if len(nonces) != len(PATHS):
        failed = True
        print(f"FAIL nonces are not unique per response ({len(nonces)} distinct for {len(PATHS)} requests)")
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
