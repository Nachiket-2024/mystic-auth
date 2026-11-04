# ASVS Level 3 Mapping
---

*New to a term here? See the [Authentication Glossary](../glossary/authentication.md) or [Infrastructure Glossary](../glossary/infrastructure.md).*

A self-assessment of this template against the OWASP Application Security Verification Standard (ASVS) **version 4.0.3, Level 3**. Level 3 includes every Level 1 and Level 2 requirement, so this page covers all three.

**How to read it.** This is a desk review of the code, tests, CI and docs on 2026-11-03. It is not a penetration test and not an audit by an outside party. A status is only "Met" when the evidence column points at something that was read in this pass. Anything not read is "Not verified", never "Met".

| Status | Meaning |
|---|---|
| Met | Implemented and evidenced in code, config, tests or CI |
| Partial | Implemented in part, or only for some paths |
| Gap | Not implemented, or implemented below the ASVS bar |
| Deployment | Depends on the operator's host, bucket, DNS or TLS, so the template alone cannot satisfy it |
| N/A | The feature does not exist in this template (for example file upload) |
| Not verified | Not examined in this pass |

Requirement numbers are ASVS 4.0.3 numbers. Only requirements this pass could tie to evidence are cited by number; the rest of each chapter is described by theme.

---

## Summary of gaps

These are the findings that matter most for a Level 3 claim. None is a new vulnerability; most are documented scope decisions.

| # | ASVS | Gap | Where it is recorded |
|---|---|---|---|
| 1 | V2.1.1, V2.1.7, V2.1.9 | Password policy is 8 characters minimum with upper, lower and digit rules. ASVS wants at least 12 characters, a check against breached passwords, and no composition rules. I accepted this as a product decision. | `password_service.py::validate_password_strength`, mirrored in `passwordRules.ts` |
| 2 | V2.8, V2.9, V4.3.1 | No multi-factor authentication. Passkeys are an optional single-step sign-in, not a second factor. L3 expects MFA for privileged management interfaces. I accepted this: password or Google sign-in is the main path, and I offer optional passkeys instead of a forced second factor, which would add daily friction. | [Why MFA is not enabled](decisions-product.md#why-mfa-is-not-enabled) |
| 3 | V6.2, V6.4 | Rotation of passwords held by a running service (database, Bugsink, Valkey) is manual. | [Rotating secrets](../deployment/secret-rotation.md) |
| 4 | V9.1 | Plain connections between backend, Postgres and Valkey inside the single-host compose network, which is isolated with `internal: true` networks. Multi-host deployments must add TLS (documented, untested here). Transport protection to the browser is handled by the reverse proxy or tunnel. | Deployment |
| 5 | V8.3 | No point-in-time recovery, so up to one backup interval (hourly in the production example) of data can be lost. | [Database backups](../deployment/database-backups.md#choosing-the-interval-and-cleaning-up-old-objects) |
| 6 | V14.2 | No automated dependency-update bot (deliberate, CVEs are still scanned by `pip-audit`, `npm audit` and `trivy`). | [Dependency updates](../testing/tooling.md#dependency-updates) |

Items marked Deployment cannot be closed by the template. They need a real host and are listed in the [Concerns](../concerns/README.md) page and the [Downstream Project Launch Checklist](../template-usage/downstream-launch-checklist.md).

---

## V1 Architecture, design and threat modeling

| Theme | Status | Evidence |
|---|---|---|
| Documented security decisions and architecture | Met | `docs/mystic_auth/security/decisions*.md`, `docs/mystic_auth/architecture/` |
| Trust boundaries and component responsibilities | Met | Component docs under `docs/mystic_auth/authorization/architecture/` |
| Threat model | Met | [Threat model](threat-model.md): assets, actors, trust boundaries, STRIDE threats mapped to controls, accepted residual risks |
| Centralised, deny-by-default access control | Met | PBAC in `backend/mystic_auth/authorization/`; a route without a matching policy is refused |
| Secrets and keys kept out of code | Met | Env files, `gitleaks` in CI, `SECRET_KEY` strength check in `core/settings.py` |
| Sensitive data classification and minimisation | Partial | Audit log rules say never to store secrets (`audit_log_model.py`); no formal data classification |

---

## V2 Authentication

| ASVS | Requirement (short) | Status | Evidence |
|---|---|---|---|
| V2.1.1 | Minimum 12 characters | Gap (accepted) | Minimum is 8 |
| V2.1.2 | Allow at least 64 characters, cap at 128 | Met | `max_length=128` in `user_schema.py` and `signup_schema.py` |
| V2.1.7 | Check against breached passwords | Gap (accepted) | No breach list lookup |
| V2.1.9 | No composition rules | Gap (accepted) | Upper, lower and digit are required |
| V2.2.1 | Anti-automation: rate limiting and lockout | Met | `rate_limiter_service.py`, `login_protection_service.py` |
| V2.2.x | Generic failure messages, no account enumeration | Met | Identical responses and dummy-hash timing, see [Timing-attack resistance](hardening-abuse-prevention.md#timing-attack-resistance); signup always returns 200 and the race test asserts identical bodies |
| V2.3 | Authenticator lifecycle | Met | Verification and reset links are single use and expire; passkey add and remove need a recent identity check |
| V2.4.1 | Passwords stored with an approved adaptive hash | Met | Argon2id via `argon2-cffi` `PasswordHasher()` defaults |
| V2.5 | Credential recovery | Met | Single-use signed reset tokens, generic response, expiry; see [Password reset](../authentication/password-reset.md) |
| V2.6 | Look-up secrets | N/A | No recovery codes or look-up secrets |
| V2.7 | Out of band verifiers | Partial | Email links only; no SMS or push |
| V2.8 | Single or multi-factor one time verifiers | Gap (accepted) | No TOTP |
| V2.9 | Cryptographic verifiers | Partial | Passkeys (WebAuthn) are cryptographic authenticators, but optional and single-step |
| V2.10 | Service authentication | Partial | Database and Valkey use passwords; the app uses a least-privilege database role (`b1e6a9f3c7d2_add_least_privilege_app_role.py`) |

---

## V3 Session management

| Theme | Status | Evidence |
|---|---|---|
| Tokens generated with enough entropy, unique `jti` | Met | `uuid.uuid4().hex` per token in `jwt_service.py` |
| Cookies `HttpOnly`, `Secure` outside dev, `SameSite=Strict`, scoped path | Met | [Cookies](hardening-http.md#cookies) |
| Short access token, rotating single-use refresh token with reuse detection | Met | `ACCESS_TOKEN_EXPIRE_MINUTES=15`; refresh rotation and chain revocation, [Session management](../authentication/session-management/) |
| Logout and logout-everywhere invalidate server side | Met | Token-version store and revocation, [Logout](../authentication/logout.md) |
| Session list and revoke by the user | Met | `session_list_handler.py`, `session_revoke_handler.py` |
| Re-authentication for sensitive actions | Met | Passkey management step-up (15 minutes) |
| Issuer, audience, expiry and algorithm checked on decode | Met | `algorithms=[settings.JWT_ALGORITHM]`, iss and aud checks in `jwt_service.py` |
| Asymmetric signing keys | Partial | HS256 with a shared secret; fine for one service, weaker if tokens are verified by other parties |
| Sessions end on account deactivation | Met | `revoke_all_tokens_for_user` in the delete route |

---

## V4 Access control

| Theme | Status | Evidence |
|---|---|---|
| Least privilege and deny by default | Met | PBAC, `require_authorization` dependency |
| Server-side enforcement on every route | Met | Route dependencies; the UI is never trusted |
| Privilege escalation prevented | Met | `authorization_grant_guard.py`; mutation-checked tests in `test_privilege_escalation_security.py` pin `CANNOT_GRANT_UNHELD_ACTION` |
| Actions on privileged or system accounts need extra permission | Met | `privilege_hierarchy.py`, system-account guards |
| Self-action protections (cannot delete or manage own account through the management routes) | Met | `CANNOT_DELETE_OWN_ACCOUNT`, `CANNOT_MANAGE_OWN_PASSKEYS_HERE` |
| Authorization decisions audited | Met | Authorization audit log |
| Direct object reference checks | Met | Credential and session operations are scoped by user id |
| Multi-factor for privileged management interfaces (V4.3.1, ASVS calls these administrative interfaces) | Gap (accepted) | See gap 2 |
| Stale decision window | Partial | 60 second bounded cache; API writes invalidate it at once, out-of-band writes wait at most 60 seconds (see [database migrations](../deployment/database-migrations.md) and the [threat model](threat-model.md#residual-risks-we-accept)) |

---

## V5 Validation, sanitization and encoding

| Theme | Status | Evidence |
|---|---|---|
| Schema validation of all input | Met | Pydantic schemas on every route, length caps |
| SQL injection | Met | SQLAlchemy parameterised queries; no string-built SQL in routes |
| Output encoding in emails | Met | User-supplied names are `html.escape`d in passkey notices |
| Output encoding in the SPA | Met | React escaping; strict CSP with no `unsafe-inline` for scripts or styles, see [Security response headers](hardening-http.md#security-response-headers) |
| SSRF, template injection, deserialization | Not verified | No dedicated review in this pass |
| File upload | N/A | No upload feature |
| Static analysis | Met | `bandit` in CI |

---

## V6 Stored cryptography

| ASVS | Theme | Status | Evidence |
|---|---|---|---|
| V6.1 | Sensitive data identified and protected at rest | Partial | Passwords hashed; backups encrypted; no per-column encryption |
| V6.2 | Approved algorithms | Met | Argon2id, HMAC-SHA256, AES-256 for backups |
| V6.2 | Backup encryption is authenticated | Met | `openssl enc -aes-256-cbc -pbkdf2` plus a detached HMAC-SHA256 tag (encrypt-then-MAC) with an independently derived key, verified before decryption on restore (`backup-hmac.sh`, `database-restore.sh`). `openssl enc` has no GCM mode, so this is the construction available without changing tools |
| V6.3 | Random values from a CSPRNG | Met | `uuid4`, `os.urandom`, `openssl rand` in tooling |
| V6.4 | Secret management, rotation | Partial | Env-file secrets, `SECRET_KEY` and `BUGSINK_SECRET_KEY` rotate by script; passwords held by a running service rotate by hand ([procedure](../deployment/secret-rotation.md)); no vault or HSM |

---

## V7 Error handling and logging

| Theme | Status | Evidence |
|---|---|---|
| Generic errors to clients, no stack traces | Met | Global handler, [Error handling](hardening-http.md#error-handling) |
| Security events logged | Met | `AuditLog`, login, logout, passkey, role and policy events |
| Logs do not hold secrets | Met | Documented rule in `audit_log_model.py`; HMAC digests for lockout keys |
| Log integrity | Met | App role has `UPDATE` and `DELETE` on the audit log revoked (`4b8d1f6e9c2a`, `9c3e7f1a4b8d`), and on `policy_history` (`6d2a8f4c1e7b`) |
| Request correlation | Met | `CorrelationIdMiddleware` |
| Alerting | Partial | Sentry-compatible monitoring (`capture_security_alert`); no alert routing or on-call process |
| Log forwarding to a separate system | Deployment | Operator choice |

---

## V8 Data protection

| Theme | Status | Evidence |
|---|---|---|
| Sensitive responses not cached (V8.2.1) | Met | `security_headers_middleware.py` sets `Cache-Control: no-store` on every API response (docs pages excluded); covered in `test_security_headers_integration.py` |
| No sensitive data in URLs | Met | Tokens travel in URL fragments, not query strings, for email links; `Referrer-Policy: no-referrer` |
| Backups | Partial | Scheduled, verified, encrypted, shipped off host; no PITR |
| Data deletion | Met | Soft delete, grace period, purge service |
| Privacy-sensitive metadata | Partial | Geolocation is off by default |

---

## V9 Communication

| Theme | Status | Evidence |
|---|---|---|
| TLS to the client | Deployment | Reverse proxy or tunnel terminates TLS; HSTS set in production |
| TLS between internal services | Met for single host, Deployment for multi-host | Postgres and Valkey sit on `internal: true` Compose networks with no route off the host; TLS to shared data services is required and documented for multi-host in [environment.md](../deployment/environment.md) |
| Only trusted proxies may set client IP | Met | `TRUSTED_PROXY_IPS`, [Reverse-proxy IP trust](hardening-infra.md#reverse-proxy-ip-trust) |

---

## V10 Malicious code

| Theme | Status | Evidence |
|---|---|---|
| Dependency vulnerability scanning | Met | `pip-audit`, `npm audit`, `trivy` in CI |
| Pinned container images by digest | Partial | Trivy image is digest pinned; other images not checked in this pass |
| SBOM | Met | `sbom` step in CI |
| Secret scanning | Met | `gitleaks` over history |
| Third-party notices | Met | `THIRD_PARTY_NOTICES/` |
| Known vulnerable component | Gap | Vendored Go modules in the ngrok helper, see [The ngrok tunnel image embeds vulnerable Go modules](../concerns/README.md#the-ngrok-tunnel-image-embeds-vulnerable-go-modules) |

---

## V11 Business logic

| Theme | Status | Evidence |
|---|---|---|
| Rate limits on business flows | Met | Decorators on all auth routes |
| Race conditions handled | Met | Concurrency tests for signup, lockout, sessions, policies |
| Anti-automation | Met | Layered rate limit and lockout |
| Workflow order enforced | Met | Verification before login, step-up before passkey changes |

---

## V12 Files and resources

N/A for upload and download of user files. Backup files are handled under V6 and V8.

---

## V13 API and web service

| Theme | Status | Evidence |
|---|---|---|
| Restricted CORS | Met | Single configured origin set, limited methods and headers |
| Content-type enforced | Met | JSON bodies validated by Pydantic |
| Security headers on every response | Met | `security_headers_middleware.py` |
| Docs endpoints off in production | Met | Enabled only when `ENVIRONMENT != "production"` |
| Rate limiting | Met | See V2, V11 |
| GraphQL, SOAP, WebSocket | N/A | Not used |

---

## V14 Configuration

| Theme | Status | Evidence |
|---|---|---|
| Hardened, reproducible builds | Partial | Dockerfiles in `docker/mystic_auth/dockerfiles/`; not every image was checked for non-root user in this pass |
| Config separated from code | Met | `env/` files, `.env.*.example` |
| Secrets not in images | Met | Env injection at run time |
| Production vs development differences documented | Met | Compose modes docs |
| HTTP method restriction and header hygiene | Met | `server_tokens off`, restricted methods |
| Pre-deployment config check | Met | `make check-env` |
| Dependency update process | Partial | Manual and batched by design |

---

## Level 3 specific notes

Level 3 adds depth rather than new chapters. For this template the L3-only items are:

- **Architecture review and threat modelling** (V1): a design-level [threat model](threat-model.md) exists; an independent architecture review has not been done.
- **Multi-factor authentication for privileged management access** (V2.8, V4.3.1): not implemented, by my choice; I offer optional passkeys instead (see [Why MFA is not enabled](decisions-product.md#why-mfa-is-not-enabled)).
- **Cryptographic key management with a vault or HSM** (V6.4): not in scope for a template; keys live in env files.
- **Separation of duties and tamper-evident audit logs** (V7, V4): the application role cannot edit or delete audit rows, but a database superuser still can. Shipping logs to an external append-only store is a deployment choice.
- **Verified build provenance** (V10, V14): an SBOM is produced, but images are not signed or attested. Not applicable while images are built on the host that runs them, because there is no registry hop to protect. Revisit signing (for example cosign) together with a registry push if images are ever pulled onto other hosts.

---

## Suggested order to close gaps

1. If images start being pushed to a registry and pulled onto servers, sign them and publish provenance in CI (V10, V14).
## Out of scope: export-control classification

Whether the cryptography in this template needs an export classification (for example under US EAR) is a legal question for whoever distributes the product. This page does not make that determination. My decision (2026-11-03): I plan to run this as a hosted service from Sydney or Mumbai, so I distribute no software to customers. I will revisit this and get advice if I ever ship the software (downloadable, on-premise or published) or sell to government or defence buyers.

## See also

- [Security Hardening](hardening.md)
- [Security Decisions](decisions.md)
- [Concerns](../concerns/README.md)
- [OWASP ASVS 4.0.3](https://github.com/OWASP/ASVS/tree/v4.0.3/4.0)
