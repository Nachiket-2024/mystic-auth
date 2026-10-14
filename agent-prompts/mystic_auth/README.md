# Agent Prompts

Ready-to-paste starting prompts for handing common mystic-auth-template
tasks to an AI coding agent (Claude Code, Codex, or similar) instead of
following the docs by hand.

| File | Use when | Assumes |
|---|---|---|
| [`new-project-setup.md`](new-project-setup.md) | You created a project from this template and want a working local development stack. See [Template Usage: Quickstart](../../docs/mystic_auth/template-usage/quickstart.md) for the supported setup path. | Docker is available and the agent has a shell at the repository root. Supply the app name and brand details if you want them set during setup. |
| [`sync-with-upstream.md`](sync-with-upstream.md) | Your project already exists and you want to bring in template updates. See [Staying in Sync with Upstream Template Updates](../../docs/mystic_auth/template-usage/syncing-upstream/README.md) for the full workflow and conflict handling. | The agent is working in the downstream repository root and can reach the upstream remote. Docker and browser dependencies are needed for the full local validation suite. The sync script requires a clean Git index and creates one sync commit after its confirmation prompt. |

Each file is a task brief. Hand it to the agent with the project-specific
context it needs, such as the target branch for an upstream sync. The prompt
sets the goal and key safety boundaries; the agent should use the linked guide
and current implementation for exact commands, then report concrete results
and blockers.

---

## Why these avoid putting real secrets in the agent's context

The setup and sync workflows may touch env files that hold real credentials
(`GOOGLE_CLIENT_SECRET`, `GMAIL_APP_PASSWORD`, database passwords, ...). An
agent's tool output becomes part of its own context and transcript, so
having it `cat` a file full of secrets to "read them, then write them
somewhere else" puts those values somewhere they don't need to be, for no
real benefit over just moving them directly.

The setup prompt uses `scripts/mystic_auth/env-tools/setup-env/`, while the
sync workflow uses `scripts/mystic_auth/env-tools/copy-env-values/` and
`scripts/mystic_auth/env-tools/set-env-field/`. These helpers
read and write values themselves, and none of them print a secret
value to their own output, only field *names*. The agent runs the script
and reports which fields still need a real value; a human fills those in
directly, either straight into the env file or into
`scripts/mystic_auth/env-tools/set-env-field/shared-values.env` (a copy of that folder's
`shared-values.env.example`, gitignored) so one edit reaches every mode at once. See
[Environment Configuration](../../docs/mystic_auth/environment/README.md) for
what each script actually does.

---
