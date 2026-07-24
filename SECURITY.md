# Security Policy

## Supported versions

This is a template repository, not a versioned library with a support matrix — there is one line of development, `main`. Security fixes land there; if you've created your own repository from this template to build on top of it, pulling in fixes means merging from upstream (see [Using This Repository as a Template: staying in sync with upstream template updates](docs/mystic_auth/template-usage.md#staying-in-sync-with-upstream-template-updates)).

## Reporting a vulnerability

**Please do not open a public GitHub Issue for a security vulnerability.** A public issue discloses the problem (and often enough detail to exploit it) before a fix exists.

Instead, report it privately via [GitHub's private vulnerability reporting](https://github.com/Nachiket-2024/mystic-auth/security/advisories/new) (Security tab → "Report a vulnerability"). Include:

- What the vulnerability is and where it lives (file/route/component).
- Steps to reproduce, or a proof-of-concept if you have one.
- The impact as you understand it (what an attacker could actually do with it).

You should get an acknowledgment within a few days. This is a template maintained on a best-effort basis, not a funded security team with a formal SLA — please be patient, and thank you for reporting responsibly rather than disclosing publicly first.

## Scope

This repo's own security posture — authentication (JWT/cookie handling, password hashing, rate limiting/lockout, OAuth2/PKCE), authorization (PBAC policy evaluation), and the audit logging around both — is in scope. See [Security Hardening](docs/mystic_auth/security/hardening.md) and [Security Decisions](docs/mystic_auth/security/decisions.md) for what's already been deliberately considered; a report that turns out to already be covered there (with reasoning for why the current behavior is intentional) will get a pointer to that doc rather than a fix, unless the report identifies a flaw in the reasoning itself.

**Out of scope**: vulnerabilities in this project's third-party dependencies (report those upstream, to the dependency's own maintainers — this repo scans for known dependency CVEs on every push/PR via `pip-audit`/`npm audit` in CI, see [CI/CD Overview](docs/mystic_auth/cicd/overview.md)), and anything specific to how *you've* deployed or customized your own copy of this template (a misconfigured reverse proxy, a `SECRET_KEY` committed to your own repo, etc.) — those aren't issues with this template's code.

## Known, already-tracked gaps

Not every limitation is a vulnerability to report — some are deliberate, documented scope boundaries. Check [Known Issues, Limitations & Technical Debt](docs/mystic_auth/concerns/README.md) first; it's the running list of what's already known and why it's not (yet, or ever) fixed.
