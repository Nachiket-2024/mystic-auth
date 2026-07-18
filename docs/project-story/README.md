# Project Story

## Where this started

This project started because I got tired of rebuilding the same authentication and authorization pieces for different startup take-home assignments.

During 2025, while applying to startups, many take-home projects required similar foundations but with slightly different expectations:

- one needed email/password authentication,
- another needed OAuth2,
- another wanted RBAC.

Each time, the actual product logic was slowed down because a large amount of time went into rebuilding the same authentication foundation.

The original idea was simple:

> Build auth + OAuth2 + a basic authorization layer once, then reuse it.

The assumption was that this would take a week or two.

That assumption was too optimistic.

Authentication looks small from the outside — a login endpoint, a logout endpoint, maybe a token — but quickly becomes its own engineering domain.

The project expanded into understanding and implementing:

- refresh token rotation and reuse detection,
- session storage decisions,
- Redis-based session and token management,
- rate limiting,
- brute-force protection,
- cookie security,
- OAuth2 PKCE flows,
- background email delivery through asynchronous workers,
- database migrations,
- CI validation,
- frontend authorization handling.

What started as a shortcut for future projects became a project of its own.

---

## How it evolved

The commit history shows the actual evolution rather than a fully planned architecture from day one.

### Aug 2025 — the foundation

The first version focused on authentication:

- modular authentication flows,
- role-based tables,
- login/logout flows,
- OAuth2 experimentation,
- initial React frontend.

Rate limiting and brute-force protection appeared very early because security concerns became obvious while building the foundation.

The frontend started as a React application and gradually evolved alongside the backend.

---

### Sep–Oct 2025 — security, infrastructure, and architecture changes

This phase involved the biggest learning curve.

The token system went through multiple iterations:

- token tables were introduced,
- token lifecycle handling was refined,
- storage decisions were reconsidered,
- eventually token management moved to Redis-based session tracking.

This was one of the areas where the project changed from simply implementing features to understanding the underlying security decisions.

Questions such as:

- Should tokens live in PostgreSQL?
- How should refresh tokens be revoked?
- How should reuse detection work?
- What should happen during logout-all?

became architectural decisions rather than just coding tasks.

Docker also became a much larger part of the project.

While I had containerized a smaller application before, this was the first time I was managing a system with many connected moving parts:

- backend,
- frontend,
- PostgreSQL,
- Redis,
- background workers,
- migrations,
- environment configuration.

Background jobs were another area of exploration.

Initially, Celery was considered because it is widely used. However, since the backend was built around async patterns, the worker model created friction.

After exploring alternatives including ARQ, Dramatiq, and Taskiq, I moved the project to Taskiq because it fit the async-first approach better.

The requirement was relatively simple — reliably sending verification and password-reset emails — so a lightweight asynchronous worker solution was a better fit than introducing workarounds around a different execution model.

---

## Architecture evolution

The architecture was not designed perfectly from the beginning.

Early on, different structures were explored, including more traditional MVC-style approaches and layouts inspired by examples found online.

However, as the project grew, a problem became obvious:

Authentication flows are not isolated files.

A single feature might involve:

- API routes,
- schemas,
- services,
- handlers,
- database models,
- frontend pages,
- API clients,
- state management,
- tests.

When these pieces were spread across unrelated folders, debugging became harder because understanding one flow required jumping across many locations.

The architecture eventually evolved into a feature-based/domain-based structure.

Instead of organizing only by technical type:

```text
controllers/
services/
models/
schemas/
```

I moved toward grouping related behavior together.

The structure before the later PBAC and Claude Code sprint looked like this:

```text
backend/
  app/
    api/
      auth_routes/
      user_routes/

    auth/
      current_user/
      login/
      logout/
      logout_all/
      oauth2/
      password_logic/
      password_reset_confirm/
      password_reset_request/
      refresh_token_logic/
      security/
      signup/
      token_logic/
      verify_account/

    core/
    database/
    logging/
    redis/
    taskiq_tasks/
    user_crud/
    user_table/

frontend/
  src/
    api/

    auth/
      current_user/
      login/
      logout/
      logout_all/
      oauth2/
      password_reset_confirm/
      password_reset_request/
      signup/
      verify_account/

    core/
    dashboard/
    store/
```

The important decision was grouping code around business flows rather than forcing every feature across separate technical layers.

This made changes easier because everything needed for a feature lived close together.

For example, changing login behavior meant primarily working inside the authentication area instead of searching across unrelated controller, service, and model folders.

This structure was not chosen because it was the only "correct" architecture.

It was chosen because, for this project size and workflow, it made the system easier to understand, debug, and extend.

That decision became especially important later when larger changes were introduced.

---

### Feb 2026 — frontend maturity

The frontend continued evolving:

- React + TypeScript became the foundation.
- Initial styling approaches were replaced.
- Chakra UI was introduced around February 2026 to provide a consistent component system and theme structure.

The frontend also moved toward feature-based organization, mirroring the backend:

- auth,
- dashboard,
- profile,
- policies,
- users administration,
- audit logging.

Redux was the frontend state management foundation during this phase.

---

### Apr 2026 — data model improvements

The authorization data model continued changing.

Earlier role-based tables were simplified into a single users table with role metadata.

Additional improvements included:

- password reset validation,
- cooldown handling,
- HTML email templates,
- improved email workflows.

---

### Jul 2026 — from personal project to reusable template

The biggest change happened in July 2026.

The project moved from a role-based authorization system to Policy-Based Access Control (PBAC).

Instead of access being determined by a role column, authorization decisions are now based on:

- assigned policies,
- allowed actions,
- resources,
- optional conditions.

Roles became descriptive metadata rather than the source of truth for permissions.

PBAC was not part of the original design. It was explored and implemented later as the authorization model matured and the limitations of role-based access became clearer.

This phase also introduced:

- audit logging,
- security hardening,
- improved headers and middleware,
- stronger cookie/security handling,
- CI/CD pipelines,
- extensive backend and frontend testing,
- complete documentation.

The frontend state management was also redesigned during this period.

Redux was replaced with:

- Zustand for client state,
- TanStack Query for server state.

This was done alongside the wider frontend and authorization work.

The project had moved from "a reusable auth module" into a complete authentication and authorization foundation.

---

## The tools that built it

The project was worked on across several months, with gaps in between — my master's programme started during this period, and there were stretches where I wasn't actively working on it.

### Aug 2025 – Apr 2026: manual development and learning workflow

Most of the early foundation was built through a traditional learning workflow:

- researching approaches,
- manually implementing changes,
- debugging issues,
- testing locally,
- reading documentation,
- iterating.

AI assistance was used through manual ChatGPT conversations:

- explaining problems,
- applying changes in VSCode,
- running the application,
- checking failures,
- repeating the process.

This was slower, but it meant each system decision was understood while being built.

During this period, I learned many technologies while solving real problems:

- Redis-based session management and token lifecycle design,
- Docker and multi-container application setup,
- TypeScript,
- OAuth2 and PKCE flows,
- background workers and Taskiq,
- security practices,
- frontend architecture decisions,
- Redux-based state management.

Some concepts, such as PBAC, were explored more deeply later during the authorization redesign rather than being part of the original architecture.

---

### Jul 2026 — Claude Code acceleration

Two days before the July commit, I purchased a Claude Code Pro plan to try it out. I used it heavily during that period — hitting the 5-hour window limits 2–3 times and using roughly 65% of my weekly quota in that sprint.

The foundation and architecture already existed.

The main advantage was reducing implementation friction:

- describing desired changes,
- reviewing generated implementation,
- correcting decisions,
- running tests,
- refining the result.

The AI accelerated implementation and iteration speed, but the architecture decisions, trade-offs, and direction of the system came from the understanding I built throughout the earlier development.

This allowed a large change set to land while preserving the architectural direction that had already been established:

- Policy-Based Access Control,
- audit logging,
- security hardening,
- frontend authorization features and UI integration,
- Redux to Zustand + TanStack Query migration,
- CI/CD pipelines,
- documentation,
- 650+ backend and frontend tests.

The final July change set was large, but the existing feature-based architecture meant most changes could be added as new domains/features rather than requiring a complete rewrite and restructure.

---

## Why it is a template now

Somewhere during the infrastructure and security work, this stopped being only a personal shortcut.

The problems solved here are common in almost every application with users:

- authentication,
- sessions,
- permissions,
- security controls,
- audit trails,
- email workflows,
- testing.

The purpose of this template is not just saving development time.

It provides a starting point with:

- documented architectural decisions,
- tested authentication flows,
- reusable authorization patterns,
- security considerations already handled.

Instead of rebuilding the same foundation repeatedly, a new project can start from a stronger baseline and focus on the actual product being built.

See [Using This Repository as a Template](../template-usage.md) for how to adapt it.