#!/usr/bin/env python3
# scripts/load-test/load_test.py
#
# Throughput/capacity load test: how many req/s a running stack sustains
# before latency or the error rate degrades. Not a pytest file - run by
# hand against a local-prod/staging stack before a release, not on every
# push. tests/backend/mystic_auth/integration/ covers concurrency
# *correctness* (does the app stay right, not just fast) as real CI pytest.
#
# Usage:
#   python scripts/load-test/load_test.py --base-url http://localhost:8101
#   python scripts/load-test/load_test.py --base-url http://localhost:8101 \
#       --scenario login --concurrency 50 --requests 1000
#
# Needs an account for the "login"/"me" scenarios: pass --email/--password
# for one that already exists (verified) on the target, or use --scenario
# health with no account.
#
# /auth/* routes have their own per-IP throttle (MAX_REQUESTS_PER_WINDOW /
# REQUEST_WINDOW_SECONDS, default 100/60s), separate from login lockout. A
# single test client is one IP, so --requests past that budget on login/me
# measures the rate limiter, not server capacity - keep it under the
# window, or raise MAX_REQUESTS_PER_WINDOW on the target for the test.
# /health/ready is unthrottled, safe to push arbitrarily hard.
from __future__ import annotations

import argparse
import asyncio
import statistics
import time
from dataclasses import dataclass, field

import httpx


@dataclass
class Result:
    status: int | None
    seconds: float
    error: str | None = None


@dataclass
class ScenarioReport:
    name: str
    results: list[Result] = field(default_factory=list)

    def summarize(self, wall_seconds: float) -> str:
        durations = sorted(r.seconds for r in self.results)
        n = len(durations)
        ok = sum(1 for r in self.results if r.error is None and r.status is not None and r.status < 500)
        errors = n - ok

        def pct(p: float) -> float:
            if not durations:
                return 0.0
            idx = min(n - 1, int(n * p))
            return durations[idx]

        lines = [
            f"== {self.name} ==",
            f"  requests:     {n}",
            f"  ok (< 500):   {ok}",
            f"  errors (>=500 or exception): {errors}",
            f"  throughput:   {n / wall_seconds:.1f} req/s (wall {wall_seconds:.2f}s)",
        ]
        if durations:
            lines += [
                f"  latency p50:  {statistics.median(durations) * 1000:.1f} ms",
                f"  latency p95:  {pct(0.95) * 1000:.1f} ms",
                f"  latency p99:  {pct(0.99) * 1000:.1f} ms",
                f"  latency max:  {durations[-1] * 1000:.1f} ms",
            ]
        return "\n".join(lines)


async def _timed(coro) -> Result:
    start = time.perf_counter()
    try:
        resp = await coro
        return Result(status=resp.status_code, seconds=time.perf_counter() - start)
    except Exception as exc:  # network errors count as failures, not crashes
        return Result(status=None, seconds=time.perf_counter() - start, error=str(exc))


async def run_scenario(
    name: str,
    make_request,
    total_requests: int,
    concurrency: int,
) -> ScenarioReport:
    report = ScenarioReport(name=name)
    semaphore = asyncio.Semaphore(concurrency)

    async def bounded():
        async with semaphore:
            report.results.append(await _timed(make_request()))

    start = time.perf_counter()
    await asyncio.gather(*(bounded() for _ in range(total_requests)))
    report_wall = time.perf_counter() - start
    print(report.summarize(report_wall))
    print()
    return report


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="e.g. http://localhost:8101")
    parser.add_argument("--scenario", choices=["health", "login", "me", "all"], default="all")
    parser.add_argument("--requests", type=int, default=500, help="total requests per scenario")
    parser.add_argument("--concurrency", type=int, default=50, help="in-flight requests at once")
    parser.add_argument("--email", default=None, help="existing verified account, for login/me scenarios")
    parser.add_argument("--password", default=None)
    args = parser.parse_args()

    # httpx defaults to max_connections=100 - well below --concurrency for a
    # real stress run, which would silently cap throughput on the client
    # side and misreport it as a server limit.
    limits = httpx.Limits(max_connections=max(args.concurrency * 2, 100), max_keepalive_connections=args.concurrency)
    async with httpx.AsyncClient(base_url=args.base_url, timeout=30.0, verify=False, limits=limits) as client:
        if args.scenario in ("health", "all"):
            await run_scenario(
                "GET /health/ready (unauthenticated, no DB write)",
                lambda: client.get("/health/ready"),
                args.requests,
                args.concurrency,
            )

        if args.scenario in ("login", "all"):
            if not (args.email and args.password):
                print("Skipping login/me scenarios: pass --email/--password for an existing verified account.")
                return

            await run_scenario(
                "POST /auth/login (real Argon2 hash + Redis lockout counters, repeated)",
                lambda: client.post("/auth/login", json={"email": args.email, "password": args.password}),
                args.requests,
                args.concurrency,
            )

        if args.scenario in ("me", "all"):
            login_resp = await client.post("/auth/login", json={"email": args.email, "password": args.password})
            login_resp.raise_for_status()
            cookies = login_resp.cookies

            await run_scenario(
                "GET /auth/me (authenticated read, real DB round trip)",
                lambda: client.get("/auth/me", cookies=cookies),
                args.requests,
                args.concurrency,
            )


if __name__ == "__main__":
    asyncio.run(main())
