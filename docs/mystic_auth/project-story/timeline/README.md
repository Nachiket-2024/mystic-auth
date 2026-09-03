# How It Evolved

---

Companion to the [Project Story](../README.md). That page covers *why* this exists and how its
architecture settled into its current shape; this one is the day-by-day (well, commit-by-commit)
log of what actually happened, split out on its own since it only ever grows longer while the rest
of the story doesn't.

The commit history shows the real evolution, not a fully planned architecture from day one. The
first commit was on 18 August, 2025, the most recent below on 4 September, 2026. There's a 4-month
gap between October 2025 and February 2026. Below, days committed back-to-back are grouped into
one range while an isolated day stands on its own.

---

```mermaid
%%{init: {"themeVariables":{"fontSize":"16px","lineColor":"#334155","cScale0":"#0284c7","cScale1":"#16a34a","cScale2":"#d97706","cScale3":"#dc2626","cScale4":"#7c3aed","cScale5":"#0d9488","cScale6":"#db2777","cScale7":"#4338ca","cScaleLabel0":"#ffffff","cScaleLabel1":"#ffffff","cScaleLabel2":"#ffffff","cScaleLabel3":"#ffffff","cScaleLabel4":"#ffffff","cScaleLabel5":"#ffffff","cScaleLabel6":"#ffffff","cScaleLabel7":"#ffffff"}} }%%
timeline
    title Major milestones (main branch)
    August 2025: Auth foundation, role-based tables
                : OAuth2, rate limiting, brute-force lockout
                : Frontend skeleton, Tailwind tried and dropped
    September 2025: httpOnly cookies, first full OAuth2 flow end-to-end
                   : Token table rework, backend fully commented
                   : Logout-all reworked, TokenCRUD/UserCRUD modularized
                   : Token tables removed for Redis-only sessions
    October 2025: Fully Dockerized (all services together)
                 : Celery replaced with Taskiq
                 : Frontend flickering fixed, full auth flow reconfirmed
    February 2026: Work resumes after 4-month gap
                  : Frontend rebuilt on Chakra UI
    April 2026: Role tables collapsed into one users table
               : Forgot-password flow, HTML emails
    July 2026: PBAC, audit logging, CI/CD, tests, docs
              : Refresh-token race fixes, password-change session revocation
              : Bugsink error monitoring and SDK exports
              : app / mystic_auth template split
              : Template docs, sync workflow, Docker/dev-up, logging
    August 2026: UI, backend changes, session/logout-all fixes
                : Codebase restructure, PBAC/reset-token security fixes
                : Language toggle and i18n addition
                : Account deletion/purge, PBAC grant guard, command palette
                : Replaced Taskiq with Procrastinate, added rate-limit dashboard, geolocation
                : Brand color, legal consent pages, least-privilege DB role
                : PBAC granularity, live security testing, backup scheduling
    September 2026: Local-prod tunnel modes added for ngrok, Tailscale Funnel
                   : Playwright E2E tests, pg_dump backups
```

---

## Pages

- [2025](2025.md): 18 August, 2025 to 14 October, 2025.
- [2026](2026.md): 21 February, 2026 to 4 September, 2026.

---

## The tools that built it

See [The Tools That Built It](../tools.md) for the two workflows: manual ChatGPT + VS Code for most of it, then Claude Code (and briefly Codex) from July 2026 on.

---
