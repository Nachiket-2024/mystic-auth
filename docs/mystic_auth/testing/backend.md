# Backend Test Map
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

The backend test tree has four different jobs. Unit tests answer whether one
module makes the correct decision when its collaborators are controlled.
Integration tests answer whether modules work through the application and
database boundaries. Security tests deliberately act like an attacker or a
restricted deployment. Performance tests provide early warning about expensive
authorization, login, and audit-log paths.

The source-file explanations are split into [unit tests](backend-unit.md),
[integration tests](backend-integration.md), and [security and performance
tests](backend-security-performance.md). This page is the navigation and
execution guide.

PBAC has an additional scenario-level guide: [Backend Authorization Test
Detail](backend-authorization.md). Use it when the question is not just which
file owns a test, but which grant, denial, mutation, race, or escalation case
the file proves.

Authentication and lifecycle scenarios have the same depth in [Backend
Authentication Test Detail](backend-authentication.md) and [Backend Users and
Sessions Test Detail](backend-users-sessions.md).

---

## Application wrapper

`tests/backend/app/test_main_global_exception_handler_unit.py` covers the thin
FastAPI application wrapper. It verifies that unexpected exceptions become a
safe public 500 response and are reported without leaking internal details.
This is separate from MysticAuth domain tests because a failure here can hide
or distort every route-level failure.

---

## Unit tests

The 105 modules under `tests/backend/mystic_auth/unit/` isolate handlers,
services, repositories, schemas, middleware, and pure policy logic. They are
the fastest way to identify which decision or transformation changed. The
[Backend Unit Tests](backend-unit.md) page names each module and explains its
responsibility.

Run them with the backend unit pytest marker or the unit path configured by
the repository test commands. They should not require a live application
server, and their fake collaborators make edge cases such as Valkey failure,
invalid conditions, and token replay deterministic.

---

## Integration tests

The 48 modules under `tests/backend/mystic_auth/integration/` exercise real
application boundaries with the test database and Valkey fixtures. They cover
HTTP-shaped workflows, transaction behavior, cache invalidation, concurrency,
and the interaction between authorization and user/session state.

The [Backend Integration Tests](backend-integration.md) page is organised by
the product area that owns each workflow. Use it when a route works in unit
tests but fails once persistence, transactions, or cache state is involved.

---

## Security and performance

The seven security modules under `tests/backend/mystic_auth/security/` are
attacker-shaped regression tests. They verify that callers cannot forge
authorization context, amplify batch checks, smuggle unsafe conditions, or
escalate grants. The least-privilege database test also verifies deployment
permissions when the restricted database role is available.

The two performance modules under `tests/backend/mystic_auth/performance/`
measure repeated authorization plus login and audit-log paths. They are
diagnostic bounds, not a replacement for production load testing. Details and
file-by-file intent are in [Backend Security and Performance](backend-security-performance.md).

---

## Choosing a backend layer

When adding a test, begin with the narrowest boundary that can prove the
behavior. Put a pure evaluator or handler decision in unit tests. Add an
integration test when the claim includes a route, transaction, database row,
Valkey key, or concurrent request. Add a security test when the important
property is that an untrusted caller cannot obtain or mutate something. Keep a
performance test focused on a measurable regression risk.

---

## See also

- [Backend Unit Tests](backend-unit.md)
- [Backend Integration Tests](backend-integration.md)
- [Backend Security and Performance](backend-security-performance.md)
- [Testing Map](README.md)
- [Testing Overview](overview.md)
