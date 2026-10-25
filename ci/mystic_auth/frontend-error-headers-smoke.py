#!/usr/bin/env python3
"""Check Nginx's pre-routing 414/431 responses retain the security headers."""

from __future__ import annotations

import socket
import sys


def request(host: str, port: int, payload: bytes) -> tuple[str, set[str]]:
    with socket.create_connection((host, port), timeout=5) as connection:
        connection.settimeout(5)
        connection.sendall(payload)
        response = bytearray()
        while b"\r\n\r\n" not in response:
            chunk = connection.recv(4096)
            if not chunk:
                break
            response.extend(chunk)

    lines = bytes(response).split(b"\r\n")
    status = lines[0].decode("ascii", errors="replace") if lines else ""
    headers = {
        line.split(b":", 1)[0].decode("ascii", errors="replace").lower()
        for line in lines[1:]
        if b":" in line
    }
    return status, headers


def main() -> int:
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 18080
    required_headers = {
        "cache-control",
        "content-security-policy",
        "strict-transport-security",
        "x-content-type-options",
        "x-frame-options",
    }
    probes = (
        (
            "414 long request target",
            b"GET /" + b"a" * 9000 + b" HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            "414",
        ),
        (
            "431 oversized request header",
            b"GET / HTTP/1.1\r\nHost: localhost\r\nX-Oversized: "
            + b"a" * 9000
            + b"\r\nConnection: close\r\n\r\n",
            "431",
        ),
    )

    failed = False
    for label, payload, expected_status in probes:
        status, headers = request(host, port, payload)
        missing = sorted(required_headers - headers)
        if not status.startswith(f"HTTP/1.1 {expected_status} ") or missing:
            failed = True
            print(f"FAIL {label}: status={status!r}, missing_headers={missing}")
        else:
            print(f"PASS {label}: status={expected_status}, security_headers={len(required_headers)}")
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
