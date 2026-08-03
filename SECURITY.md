# Security Policy

---

## Supported versions

This is a template repository, not a versioned library with a support matrix.
There is one line of development, `main`, and security fixes land there. If you
created your own repository from this template, pull fixes by merging from
upstream. See [Staying in Sync with Upstream Template Updates](docs/mystic_auth/template-usage/syncing-upstream.md).

---

## Reporting a vulnerability

**Please do not open a public GitHub Issue for a security vulnerability.** A
public issue can disclose the problem before a fix exists.

Instead, report it privately via
[GitHub's private vulnerability reporting](https://github.com/Nachiket-2024/mystic-auth/security/advisories/new)
from the Security tab. Include:

- What the vulnerability is and where it lives (file/route/component).
- Steps to reproduce, or a proof-of-concept if you have one.
- The impact as you understand it (what an attacker could actually do with it).

You should get an acknowledgment within a few days. This is a best-effort
template, not a funded security team with a formal SLA.

---

## Scope

This repo's own security posture is in scope. That includes authentication
(JWT/cookie handling, password hashing, rate limiting, lockout, OAuth2/PKCE),
authorization (PBAC policy evaluation), and audit logging around both. See
[Security Hardening](docs/mystic_auth/security/hardening.md) and
[Security Decisions](docs/mystic_auth/security/decisions.md) for issues that
have already been considered. Reports already covered there will get a doc
pointer unless they identify a flaw in the reasoning.

**Out of scope:** third-party dependency vulnerabilities and issues specific to
how *you've* deployed or customized your own copy of this template. Report
dependency vulnerabilities upstream to the maintainers. This repo scans for
known dependency CVEs on every push and PR via `pip-audit` and `npm audit` in
CI. See [CI/CD Overview](docs/mystic_auth/cicd/overview.md).

---

## Known, already-tracked gaps

Not every limitation is a vulnerability to report. Some are deliberate, documented scope boundaries. Check [Known Issues, Limitations & Technical Debt](docs/mystic_auth/concerns/README.md) first for the running list of known gaps and rationale.
