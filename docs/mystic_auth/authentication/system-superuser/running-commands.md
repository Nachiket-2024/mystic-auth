# System Superuser: Interactive Commands

---

## Commands by run mode (interactive)

---

### Dev Docker

Use this with `env/.env.example` and `docker/compose/docker-compose.dev.yml`:

```bash
docker compose -f docker/compose/docker-compose.dev.yml exec -it backend python -m mystic_auth.scripts.create_system_user
```

---

### Local-prod Docker

Use this with the env file and Compose file for whichever tunnel you're
running (see [Local-Prod: which tunnel do I want?](../../deployment/local-prod/README.md#which-tunnel-do-i-want)); ngrok shown here:

```bash
docker compose -f docker/compose/docker-compose.local-prod-ngrok.yml --env-file env/.env.local-prod-ngrok exec -it backend python -m mystic_auth.scripts.create_system_user
```

---

### Prod Docker

Use this on the server that runs `env/.env.prod.example` and `docker-compose.prod.yml`:

```bash
docker compose -f docker/compose/docker-compose.prod.yml --env-file env/.env.prod exec -it backend python -m mystic_auth.scripts.create_system_user
```

---

### Local Backend Without Docker

Use this only if the backend is running directly on your host and can reach the configured Postgres and Redis:

```bash
PYTHONPATH=backend python -m mystic_auth.scripts.create_system_user
```

If you run any Docker command from a non-interactive shell or CI job, remove `-it`.

---

See [System Superuser](README.md) for the bootstrap scripts and command matrix, or [Behavior and Prompts](creation-and-promotion-behavior.md) for what each path actually does.

---
