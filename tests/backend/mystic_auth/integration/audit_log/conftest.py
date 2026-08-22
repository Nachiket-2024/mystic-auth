# tests/backend/mystic_auth/integration/audit_log/conftest.py
#
# Runs the real `procrastinate ... worker` CLI as a subprocess for the
# whole test session, pointed at the same database this suite runs
# against. Unlike the docker-full-suite CI job, the native backend job
# (and a plain local `pytest` run) has no separate `procrastinate_worker`
# container, and audit log rows (see AuthorizationService._log_decision)
# only ever appear once *some* worker consumes the queue.
# poll_for_entries (audit_log_test_accounts.py) polls for exactly that, so
# without a worker actually draining the queue it always times out and
# sees nothing.
#
# A real subprocess, not an in-process asyncio worker task: an earlier
# version of this fixture ran a `procrastinate.worker.Worker` loop as a
# background asyncio task inside the test process, opened/closed once per
# test alongside conftest.py's own per-test-event-loop connector cycling
# (_procrastinate_app_lifecycle). That reliably deadlocked partway through
# a run - most likely the worker task and the connector's per-test
# open/close fighting over an event loop that a given test doesn't always
# keep pumped. A separate OS process has its own event loop entirely, so
# it can't collide with pytest-asyncio's per-test one no matter how this
# suite's fixtures churn.
#
# Scoped to this directory, not the top-level conftest.py: the rest of the
# real-DB suite doesn't defer/poll for anything through the audit log, so
# there's no reason to pay for a worker process there.
import os
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

_BACKEND_DIR = Path(__file__).resolve().parents[5] / "backend"


@pytest.fixture(scope="session", autouse=True)
def _run_procrastinate_worker():
    # Same command docker-compose.yml's procrastinate_worker service runs,
    # with the same cwd (`backend/`, so `mystic_auth...` resolves the way
    # it does inside the container's /app) - just as a host process instead
    # of a container, against this session's Postgres.
    #
    # PYTHONPATH must be set explicitly, matching the container's own
    # `PYTHONPATH=/app`: unlike `python -m`, the `procrastinate` console
    # script doesn't add its cwd to sys.path on its own, so without this
    # `import mystic_auth...` fails and the subprocess exits immediately -
    # silently, since nothing here was reading its output, so the fixture
    # looked like it started a worker while every test actually ran with
    # none. EMAIL_ENABLED=false (see conftest.py's os.environ override
    # above this file's own conftest.py) rides along via the env copy, so
    # this real worker doesn't also try to send real verification/reset
    # emails through whatever's in FROM_EMAIL/GMAIL_APP_PASSWORD.
    env = os.environ.copy()
    env["PYTHONPATH"] = str(_BACKEND_DIR)
    log_path = Path(tempfile.gettempdir()) / "mystic_auth_test_procrastinate_worker.log"
    log_file = log_path.open("w")
    proc = subprocess.Popen(  # noqa: S603
        ["procrastinate", "--app=mystic_auth.procrastinate_tasks.procrastinate_app.app", "worker"],  # noqa: S607
        cwd=_BACKEND_DIR,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    # No readiness signal on stdout to wait on (the CLI logs to stderr with
    # no fixed "ready" line): a short fixed wait before the first test
    # starts deferring jobs is simpler than parsing worker log output, and
    # this only costs time once per session, not once per test.
    time.sleep(1)
    if proc.poll() is not None:
        log_file.close()
        raise RuntimeError(
            f"procrastinate worker subprocess exited immediately (code {proc.returncode}); "
            f"see {log_path}"
        )
    yield
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    log_file.close()
