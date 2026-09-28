Set up this mystic-auth-based project for local development:

1. Run scripts/mystic_auth/env-tools/quickstart/quickstart.sh. If it asks for an app name and
   brand color, use the values I gave you when handing you this file (or
   ask me if I didn't give you any).
2. Once the stack is up and you've created the system superuser, run
   scripts/mystic_auth/env-tools/check-env/check-env.sh with no arguments. It
   checks every real env/mystic_auth/.env* and env/app/.env* file and reports
   placeholder field names without exposing values. Don't guess from memory.
3. For each reported placeholder or warning, tell me what it means, whether it blocks
   startup, and what action is needed. For placeholders, also say what the value is for
   and where to get a real value
   (see docs/mystic_auth/template-usage/overview.md's OAuth/Email setup
   sections), then stop. If only dev matters right now, I'll edit env/mystic_auth/.env.dev
   myself; if I want the same values applied everywhere, I'll copy
   scripts/mystic_auth/env-tools/set-env-field/shared-values.env.example to shared-values.env,
   fill it in myself, and tell you to run
   scripts/mystic_auth/env-tools/set-env-field/set-env-field.sh. Either way, don't ask me to
   paste real values into this chat, and don't read or print any real secret
   value out of an env file yourself. App-only variables belong in env/app/;
   do not add them to upstream-owned MysticAuth files.
4. Confirm the frontend (http://localhost:5173) and backend API docs
   (http://localhost:8000/docs) are both reachable, and tell me if either
   isn't.
