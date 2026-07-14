# Background Workers (Taskiq)

## Purpose

Offloads slow, failure-prone I/O — sending email via SMTP — off the request/response cycle, so a signup/verification/password-reset request returns immediately instead of blocking on a mail server round trip.

## Architecture

`backend/app/taskiq_tasks/email_tasks.py` defines a single [Taskiq](https://taskiq-python.github.io/) broker:

```python
broker: AsyncBroker = RedisStreamBroker(url=settings.REDIS_URL).with_result_backend(
    RedisAsyncResultBackend(redis_url=settings.REDIS_URL)
)

@broker.task
async def send_email_task(to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
    ...
```

Redis is both the broker (a Redis Stream) and the result backend — no separate message-queue infrastructure. The `taskiq_worker` container consumes the same broker, running from the identical `docker/backend.Dockerfile` image as the `backend` service, just with a different `command:` (`taskiq worker app.taskiq_tasks.email_tasks:broker --reload`) — see [Backend Architecture](../architecture/backend.md) for why one image serves three roles (`backend`, `taskiq_worker`, `alembic`).

## Tasks

| Task | Enqueued from | Purpose |
|---|---|---|
| `send_email_task(to_email, subject, body, is_html=True)` | `auth/verify_account/account_verification_service.py`, `auth/password_logic/password_reset_service.py` | Sends the verification email and the password-reset email via Gmail SMTP (`aiosmtplib`) |

Both call sites build the HTML body via `emails/email_template_service.py::render_transactional_email` (a shared template with the app name/support address baked in from settings), then enqueue with `.kiq(...)`:

```python
await send_email_task.kiq(
    to_email=user.email,
    subject="Verify your account",
    body=render_transactional_email(...),
)
```

`.kiq()` returns as soon as the task is enqueued in Redis — the caller (the signup/password-reset request handler) does not wait for the email to actually send.

## Configuration

| Setting | Purpose |
|---|---|
| `REDIS_URL` | Broker + result backend connection |
| `FROM_EMAIL` | SMTP "From" address, also the Gmail account authenticating to `smtp.gmail.com:587` |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not the account password — Gmail requires a per-app password for SMTP with 2FA enabled) |
| `SUPPORT_EMAIL` | Optional; used as the email's `Reply-To`, falls back to `FROM_EMAIL` if unset |
| `APP_NAME` | Optional; used in the email template's branding, defaults to `"MysticAuth"` |

## Failure handling

`send_email_task` wraps the entire SMTP call in `try/except Exception`, logs the full traceback, and returns `False` — it never raises out of the task. **This means a failed email send is currently silent from the caller's perspective**: the enqueueing request handler already returned success before the task ran, and there's no retry policy, dead-letter queue, or alerting configured on the broker. See [Concerns](../concerns/README.md) for this as a tracked limitation.

## Testing

No dedicated unit or integration test exercises `send_email_task` itself (real SMTP is not something the test suite calls out to) — the call sites (`account_verification_service.py`, `password_reset_service.py`) are tested with `send_email_task.kiq` mocked/patched. See [Testing Overview](../testing/overview.md).

## Troubleshooting

- **Worker not picking up tasks**: confirm `taskiq_worker` can reach `REDIS_URL` — same Redis instance the `backend` container uses. `docker logs taskiq_worker` shows task consumption.
- **Worker reloads every ~10 seconds**: known, non-fatal — its `--reload` flag watches the entire `/app` mount, which includes `backend/logs/access.log`, continuously appended to by the `backend` service sharing that host-bound directory. See [PBAC Troubleshooting](../authorization/troubleshooting.md#taskiq_worker-keeps-reloading-every-10-seconds).
- **Emails not arriving**: check `GMAIL_APP_PASSWORD` is a valid App Password (not the account password) and that "Less secure app access" / App Passwords are enabled on the sending Google account; check `docker logs taskiq_worker` for the logged traceback (`send_email_task` logs every failure with `logger.error`).
