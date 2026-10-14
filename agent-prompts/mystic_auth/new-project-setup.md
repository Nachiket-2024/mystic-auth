Set up this repository for local development as a project created from the
MysticAuth template. Work from the repository root and use the implementation
and [template quickstart](../../docs/mystic_auth/template-usage/quickstart.md)
as the source of truth.

1. Check whether `env/mystic_auth/.env.dev` and `env/app/.env.dev` exist without
   reading or printing their contents. If either is missing, run
   `scripts/mystic_auth/env-tools/setup-env/setup-env.sh` (or its PowerShell or
   Command Prompt wrapper). Use the project name and brand details I supplied;
   leave optional OAuth and email integrations unset unless I provided their
   credentials outside this chat.
2. Run `scripts/mystic_auth/env-tools/quickstart/quickstart.sh` (or the matching
   platform wrapper) and follow its startup checks. Do not overwrite existing
   runtime env files or ask me to paste secrets into the conversation.
3. If startup requires a real value, report the field name, which env file owns
   it, what feature uses it, and how I can provide it. Keep product settings in
   `env/app/`; use `env/mystic_auth/` only for template-owned runtime settings.
   Do not edit template internals or tracked `.example` files for this setup.
4. Confirm the frontend and backend API docs respond on the ports configured in
   the runtime env files. Report any service that is not ready and the relevant
   command or health check output, without exposing env values.

Finish with the services started, URLs checked, any values I still need to
provide, and any blocker you could not resolve. Do not commit changes.

---
