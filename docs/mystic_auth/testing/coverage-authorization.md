# What the Authorization (PBAC) Tests Cover
---

This page walks through what the test suite checks for policies,
conditions, the authorization evaluator, caching, direct permission grants,
bulk actions, and audit logging of authorization decisions. See
[Testing Overview](overview.md) for how to run the suite, and
[PBAC Architecture](../authorization/architecture.md) for how the system
itself works.

---

## Policy evaluation

The evaluator is checked against the basic shape of a decision: a policy
that lists the right action and resource type grants access, no policy at
all denies, a policy that exists but does not cover the action denies, a
mismatched resource type denies, and a wildcard resource type matches any
resource. If several policies are assigned and any single one of them
grants the action, access is allowed.

A dedicated test confirms the evaluator never references a role at all,
role and policy are deliberately independent concepts, so two users with
the same role but different assigned policies get different access, and a
user with no role at all can still be authorized purely through policies or
direct grants.

Detailed evaluation (the version that reports *why* a decision was made) is
checked to agree with the plain allow/deny evaluator on the same inputs,
correctly separates policies that matched the action but failed a condition
from policies that never matched the action at all, and reports a
"no assigned policies" reason distinctly from a "no matching policy" reason.

---
## Conditions

Every condition type is tested against both its "allows" and "fails safe"
paths:

- **`self_only`**: allows when the resource belongs to the caller, denies
  for someone else's resource, denies when no resource was supplied at all
  (fails safe rather than defaulting open), and works against both plain
  dicts and attribute-bearing objects.
- **`resource_attributes`** and **`context_attributes`**: allow when every
  listed field matches, deny on any mismatch or a missing resource/context,
  and fail safe on a malformed (non-mapping) condition value instead of
  raising.
- **`security_context`**: same shape, checked against a nested sub-key
  structure, denying safely when the sub-key or the whole context is
  missing.
- **`time`**: allows within a configured business-hours window, denies
  outside it, correctly handles a window that wraps past midnight, respects
  an explicit timezone and defaults to UTC when none is given, and fails
  safe on a malformed time string or invalid timezone rather than crashing
  the request.
- **`date_range`**: allows within an inclusive start/end range (boundary
  dates included), supports an open-ended start or end, and fails safe on a
  malformed date or a range with neither bound present.
- **`network`**: allows an exact IP or a CIDR range match, denies an IP
  outside the allowed ranges, and fails safe on a missing IP, an empty
  allow-list, or an unparseable IP string.

A schema-consistency test walks every condition type's canonical example
shape through both the runtime evaluator and the request-time payload
validator, to catch the two layers drifting out of sync with each other.

### Guarding against abusive condition payloads

The condition validator is also tested as a size and structure guard, not
just a correctness check: a huge number of keys, pathologically deep
nesting, and an oversized string or key are all rejected quickly rather
than being evaluated (which could otherwise be used to burn CPU on
crafted policy conditions). Ordinary, reasonably-sized conditions pass
through this guard unaffected. See
[coverage-security.md](coverage-security.md) for how this guard is exercised
as an actual attack scenario, not just a unit-level shape check.

---
## Policy CRUD, history, and rollback

Creating, listing, updating, and deleting policies is checked end to end
through the API, including that a caller without the right permission
cannot manage policies at all, and that permission is split finely: a
caller holding only `policies:read`, only `policies:create`, only
`policies:update`, and so on, can do exactly that action and nothing else.
Baseline (built-in) policies cannot be renamed or deleted even by a system
superuser, this is checked as both a permission test and a dedicated
security-hardening test, see [coverage-security.md](coverage-security.md).

Every policy write (create, update, delete) is checked to leave behind a
history entry, and an update's history entry records which fields actually
changed. Rolling back to a prior revision is checked to restore that
revision's exact definition and label the resulting history entry as a
rollback, including rolling back to a state before the policy was deleted.
A rollback is rejected if the target history entry belongs to a different
policy than the one being rolled back.

Concurrent policy writes are tested directly: two simultaneous updates to
the same policy do not silently lose one of the writes or corrupt the
history trail, and an update racing a delete of the same policy resolves to
a 404 rather than a 500.

---
## The "granting your own privileges" guard

A caller can only create or modify a policy to grant actions they
themselves already hold, this is the core self-escalation guard. It is
tested from every angle: creating a new policy that mints an action the
caller lacks is blocked, adding that action to an existing policy is
blocked, deactivating a policy is blocked if the caller no longer holds its
current actions, and renaming a baseline policy is blocked outright. A
caller who already holds every action involved passes all of the above.
Actions outside the app's own declared vocabulary are deliberately ignored
by this guard, since it only reasons about actions the app defines.

---
## Permission and policy assignment

Assigning and revoking both policies and direct (non-policy) permission
grants to users is checked to actually change what the user can do, not
just to write a database row, granting a permission is followed by an
authorization check that now passes, and revoking is followed by one that
now fails. Revoking a permission or policy the user does not currently hold
returns 404 rather than silently succeeding. Re-granting the same action
with different conditions updates the existing grant in place instead of
duplicating it.

The self-service `/users/me/policies` and `/users/me/permissions` endpoints
are checked to return only the caller's own grants without requiring the
admin-level `policies:read`/`permissions:read` permission, and to not be
accidentally shadowed by the admin route that matches a similar path.

Revoking one action from a multi-action policy assignment is checked to
leave the assignment's other actions intact, and to not affect any other
user who also holds that same policy.

### The "last superuser" guard

A set of tests specifically targets the situation where removing a policy
or permission assignment would leave zero users holding system-superuser
access. Removing the last superuser assignment is blocked; removing one
when other superusers remain is allowed. This is checked at the single-item
level and, separately, at the bulk level: a bulk removal cannot jointly
strip every superuser holder even if no single item in the batch would do
it alone (the check is checked to be batch-aware, not just item-by-item).

---
## Bulk actions

Bulk assign/remove for roles, policies, and permissions are checked to be
best-effort rather than all-or-nothing: one invalid or already-applied item
in a batch does not block the other valid items in the same batch. Specific
cases covered: assigning a policy the target already holds is reported as
"already held" without duplicating the assignment row, assigning to an
unknown policy name is reported per-item without blocking the rest of the
batch, and a concurrent bulk assignment of the exact same user/policy pair
from two requests does not fail the whole batch. Bulk operations targeting
the reserved system user are rejected for that one item while still
applying to the other selected users.

Users affected by a bulk change are notified: each user is notified exactly
once even if they appear in the batch more than once, notifications are
sent only for items that actually succeeded, and notifications can be
disabled entirely.

---
## Caching

The user-policy cache is checked to serve a cache hit without touching the
database, populate the cache on a miss, and correctly invalidate: updating
or deleting a policy invalidates every affected user's cache, while
assigning or removing a single user's policy invalidates only that one
user's entry (not the whole cache) when an email is available to scope the
invalidation. The cache degrades gracefully: a Redis outage on read returns
a cache miss rather than raising, a write failure is swallowed rather than
failing the request, and a corrupted cached payload is treated as a miss
instead of crashing.

A separate integration test checks the cache actually flips a live
authorization decision after a policy change, narrowing a policy's actions,
deactivating a policy, or revoking a direct permission all correctly
invalidate a decision that had already been cached, so a stale cached
"allowed" does not linger after the underlying grant is gone.

---
## Batch authorization checks

The `/authorize/batch` endpoint is checked to reject an empty batch, an
oversized batch, and a batch containing a malformed check (missing or
wrong-typed action), while a batch at the documented maximum size is
accepted. A batch response never exposes which policies were matched,
rejected, or evaluated, only the allow/deny outcome per check, since that
detail is meant for the single-check "explain" endpoint, not the bulk one.
Internally, `authorize_batch` is checked to fetch each user's policies only
once for the whole batch (not once per check), to produce results matching
what individual `authorize()` calls would produce for the same checks, and
to fail closed if evaluating any single check inside the batch raises.

---
## Audit logging of authorization decisions

Every `authorize()` call is checked to queue exactly one audit log entry
recording the decision, including which policies granted it and, for a
denial, which conditions failed. The `authorize_detailed()` variant (used
for the inspection/debug endpoint) is checked to never write an audit entry
at all, since it is used for confirms, not real access decisions. A failure
while writing the audit entry is checked to never break the authorization
response itself, the caller still gets a correct allow/deny even if
audit logging failed behind the scenes.

See [Common Patterns](../authorization/common-patterns.md) and
[Condition Schema Reference](../authorization/condition-schema-reference.md)
for how these pieces fit together, and
[coverage-infrastructure.md](coverage-infrastructure.md) for the audit log
storage and query layer itself.

---