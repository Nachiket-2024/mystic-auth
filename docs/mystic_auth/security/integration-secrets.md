# Downstream Integration Secrets
---

Mystic Auth does not own product integrations or persist their credentials.
Downstream applications keep integration code under `backend/app/` and use the
public secret-provider boundary from `app.sdk`.

## Storage boundary

Use the deployment's secret manager whenever one exists: Docker/Swarm secrets,
Kubernetes Secrets backed by an external KMS, a cloud secret manager, or a
host-level secret injector. Inject only the named value the integration needs.
Do not put integration credentials in JSON settings, database rows, migrations,
audit metadata, task arguments, or logs.

For a simple deployment, the generic `EnvironmentSecretProvider` reads one
injected environment variable at a time:

```python
from app.sdk import EnvironmentSecretProvider, require_secret

provider = EnvironmentSecretProvider()
webhook_secret = require_secret(provider, "APP_WEBHOOK_SECRET")
```

For a managed secret system, implement the small `SecretProvider` protocol in
an app-owned module such as `backend/app/integrations/secret_provider.py`, with tests
under `tests/backend/app/integrations/`. Import the protocol from `app.sdk`;
do not edit `backend/mystic_auth/core/secret_provider.py`. The provider should fetch
one named value, never expose a mapping of all secrets, and never log the
returned value.

## Rotation

Rotate the value in the external secret manager, restart or reload the service
that consumes it, verify a signed request against the new value, then revoke
the old value at the provider. If overlapping rotation is required, the
app-owned provider may support a short-lived current/previous lookup, but the
application must define when the previous value is removed. Mystic Auth does
not retain old integration secrets.

The `SECURITY_ALERT_WEBHOOK_TOKEN` setting is an infrastructure-level bearer
token for Mystic Auth's own security-alert channel. Product webhook secrets
must use the app-owned provider boundary instead.

## Background jobs

Do not pass a secret as a Procrastinate task argument. Resolve it inside the
task from the provider, and ensure lifecycle observers and retry logs contain
only identifiers, status, duration, and non-sensitive error types.
