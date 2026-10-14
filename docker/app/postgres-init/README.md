Your own Postgres init scripts, alongside upstream's `docker/mystic_auth/postgres-init/`.

Postgres only scans files directly inside `/var/lib/postgres/initdb/` (not
subdirectories), and only on a fresh volume's first init - see
[Database Design](../../../docs/mystic_auth/database/design.md) and
[Docker Overview](../../../docs/mystic_auth/docker/overview.md#services).
(This is Chainguard's postgres image's own init-script path, not the
official Postgres image's `/docker-entrypoint-initdb.d/` - confirmed by
reading its `/usr/bin/docker-entrypoint.sh` directly; mounting at the
official path silently runs nothing.)
Upstream's own `docker-compose.<mode>.yml` mounts `docker/mystic_auth/postgres-init/`
as a whole directory at that path, so adding your own script here does
nothing by itself - Compose merges volume mounts by target path, not by
source directory. Add each of your own scripts as an individual mount in
`docker/app/compose/docker-compose.<mode>.yml` instead, one entry per file:

```yaml
services:
  postgres:
    volumes:
      - ../../app/postgres-init/001-my-init.sh:/var/lib/postgres/initdb/001-my-init.sh:ro
```

Numeric prefixes control run order relative to upstream's own scripts, the
same convention the official Postgres image itself expects.

Ships empty; upstream never edits this file again.

---
