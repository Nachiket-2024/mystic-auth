# Syncing with an AI Coding Agent

---

The steps in [README](README.md)/[Rebuild, Push, and Reference](rebuild-and-push.md)/[Troubleshooting](troubleshooting.md) are written for a person to follow by hand. If you'd rather hand the whole thing to an agentic coding tool (Claude Code, Codex, or similar) and review the result, use [`agent-prompts/sync-with-upstream.md`](../../../../agent-prompts/mystic_auth/sync-with-upstream.md) at the repo root: a copy-paste starting prompt for exactly that. This page is the reasoning behind it.

---

## Why this isn't just "sync and rebuild"

A real sync can hit several things that don't show up in a first-time read of the mechanism: upstream reorganizing a shared config file, a real merge conflict in a file both sides touch, two Alembic heads, or your own app-side code importing something upstream renamed. An agent prompt for this needs to name those failure modes up front, or the agent has no way to know that a `docker-compose.dev.yml` conflict and a `backend/mystic_auth/` conflict need completely different handling.

---

## Keeping secrets out of the agent's context

Regenerating env files is part of a full sync (fresh secrets, upstream's latest fields), but an agent reading your real `GOOGLE_CLIENT_SECRET`, `GMAIL_APP_PASSWORD`, or `DATABASE_URL` to "carry them forward" puts those values into its context and transcript for no real reason. The prompt routes around this with two scripts, neither of which ever prints a secret value to its own output, only field *names*:

1. The agent **renames** each real env file aside (`env/.env` to `env/.env.bak`, and so on) - never deletes - so nothing is lost.
2. The agent runs `scripts/mystic_auth/env-tools/setup-env/setup-env.sh` (`.ps1`/`.cmd`). Since the real files no longer exist under their normal names, it generates fresh ones from the current `.example` files, with newly generated secrets and this sync's latest fields.
3. The agent runs `scripts/mystic_auth/env-tools/copy-env-values/copy-env-values.sh OLD NEW` (`.ps1`/`.cmd`) for each pair. It copies every field from the old file into the new one, except the handful setup-env just generated fresh (secrets, and the DB URLs that embed them) - reporting only which field *names* it moved, never their values, and flagging any field that existed in the old file but not the new one (upstream may have dropped or renamed it) for you to decide on by hand.
4. Once you've confirmed the new files are correct, the agent tells you to delete the `.bak` files yourself.

See [Environment Configuration](../../environment/README.md) for what both scripts do in full.

---

See [Rebuild, Push, and Reference](rebuild-and-push.md) and [Troubleshooting](troubleshooting.md) for what each numbered step in the prompt is actually doing under the hood, if the agent (or you, reviewing its work) needs the full explanation behind a given step.
