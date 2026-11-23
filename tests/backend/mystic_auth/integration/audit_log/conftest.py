# Runs the real `procrastinate ... worker` CLI as a subprocess for the whole
# test session, pointed at this suite's database. A plain local `pytest` run has
# no `procrastinate_worker` container, and audit log rows (see
# authorization_audit_logger.log_decision) appear only once a worker drains the
# queue; poll_for_entries (audit_log_test_accounts.py) would otherwise time out.
#
# A separate OS process, not an in-process asyncio worker, which deadlocked
# against the top-level conftest's per-test connector cycling. Scoped to this
# directory because the rest of the real-DB suite does not poll the audit log.

import os
import subprocess
import time
from pathlib import Path

import pytest

_BACKEND_DIR = Path(__file__).resolve().parents[5] / "backend"


@pytest.fixture(scope="session", autouse=True)
def _run_procrastinate_worker(tmp_path_factory: pytest.TempPathFactory):
    # Same command and cwd (`backend/`) as docker-compose.dev.yml's
    # procrastinate_worker service, run as a host process against this
    # session's Postgres. PYTHONPATH must be set explicitly to match the
    # container's `PYTHONPATH=/app`: the `procrastinate` console script does not
    # add its cwd to sys.path, so without it `import mystic_auth...` fails and
    # the subprocess exits silently. EMAIL_ENABLED=false rides along via the env
    # copy so this worker sends no real emails.
    env = os.environ.copy()
    env["PYTHONPATH"] = str(_BACKEND_DIR)
    log_path = tmp_path_factory.mktemp("audit-log-worker") / "procrastinate_worker.log"
    log_file = log_path.open("w")
    proc = subprocess.Popen(
        ["procrastinate", "--app=mystic_auth.procrastinate_tasks.procrastinate_app.app", "worker"],
        cwd=_BACKEND_DIR,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    # The worker prints no readiness signal, so poll the same
    # `procrastinate ... healthchecks` command the dev compose healthcheck uses,
    # up to READINESS_TIMEOUT_SECONDS. A fixed 1s sleep raced the first tests:
    # cold imports could take longer, so an early job went unprocessed until
    # poll_for_entries gave up (a real, observed flake).
    READINESS_TIMEOUT_SECONDS = 15.0
    deadline = time.monotonic() + READINESS_TIMEOUT_SECONDS
    ready = False
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            break
        check = subprocess.run(
            ["procrastinate", "--app=mystic_auth.procrastinate_tasks.procrastinate_app.app", "healthchecks"],
            cwd=_BACKEND_DIR,
            env=env,
            capture_output=True,
            check=False,
        )
        if check.returncode == 0:
            ready = True
            break
        time.sleep(0.2)
    if proc.poll() is not None:
        log_file.close()
        raise RuntimeError(
            f"procrastinate worker subprocess exited immediately (code {proc.returncode}); "
            f"see {log_path}"
        )
    if not ready:
        proc.terminate()
        proc.wait(timeout=10)
        log_file.close()
        raise RuntimeError(
            f"procrastinate worker subprocess did not become ready within "
            f"{READINESS_TIMEOUT_SECONDS}s; see {log_path}"
        )
    yield
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    log_file.close()
