# Dependency locking

This page explains how the backend's Python packages are pinned, why, and how to update them.

## The problem it solves

If only your direct dependencies are pinned, `pip` still picks the newest version of every dependency of those packages each time an image is built. Two builds a week apart can ship different code, and nothing checks that a downloaded file is the one you tested. A hijacked or re-uploaded package would install without any warning.

## How it works

| File | Role | Edit it? |
|---|---|---|
| `backend/requirements.in` | Direct runtime dependencies, pinned to exact versions | Yes |
| `backend/requirements-dev.in` | Direct dev and test tools | Yes |
| `backend/requirements.txt` | Generated lock: every package, including transitive ones, with `--hash=sha256:...` lines | No |
| `backend/requirements-dev.txt` | Generated lock for the dev tools, resolved against the runtime lock | No |

Installs always use `pip install --require-hashes -r ...`. pip then refuses any package that is not in the lock, or whose file hash does not match. The Dockerfile, CI and local setup all install the lock, so they get the same packages.

The lock is compiled with [uv](https://docs.astral.sh/uv/) using `--universal`, so one file covers Linux glibc and Alpine (musl) and every Python platform the images use. uv is only a compile tool: it is not in the images.

## Update a dependency

1. Install the compiler once: `pip install uv==0.13.7`.
2. Change the version in `backend/requirements.in` (or `requirements-dev.in`).
3. Run `scripts/mystic_auth/deps/compile-lock.sh`.
4. Run the full test suite, then commit the `.in` and the lock files together.

To refresh every transitive package to the newest allowed version, run the script with `--upgrade`, then test the same way.

## What CI checks

- **Lock is current:** `compile-lock.sh --check` re-resolves and fails the build if a committed lock differs from its `.in` file, so the two cannot drift.
- **Hashes enforced:** CI installs with `--require-hashes`.
- **Known vulnerabilities:** `pip-audit` runs on the lock, so it audits the transitive packages too.

## Frontend

The frontend already has `frontend/package-lock.json`, which npm checks by hash. Update with `npm outdated`, then `npm install`, and run `npx tsc -b`, `npx eslint .`, `npx vitest run` and `npx vite build`. Check peer ranges before a major bump: for example `typescript-eslint` currently requires `typescript <6.1.0`, so TypeScript 7 has to wait for it.
