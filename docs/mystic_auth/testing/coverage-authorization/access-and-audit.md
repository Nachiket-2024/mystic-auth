# PBAC Coverage: Assignment, Caching, and Audit

---

## Permission and policy assignment

1. Assigning and revoking both policies and direct (non-policy) permission grants to users is checked to actually change what the user can do, not just to write a database row: granting a permission is followed by an authorization check that now passes, and revoking is followed by one that now fails.
2. Revoking a permission or policy the user does not currently hold returns 404 rather than silently succeeding.
3. Re-granting the same action with different conditions updates the existing grant in place instead of duplicating it.
4. The self-service `/users/me/policies` and `/users/me/permissions` endpoints are checked to return only the caller's own grants without requiring the admin-level `policies:read`/`permissions:read` permission, and to not be accidentally shadowed by the admin route that matches a similar path.
5. Revoking one action from a multi-action policy assignment is checked to leave the assignment's other actions intact, and to not affect any other user who also holds that same policy.

---

### The "last superuser" guard

1. A set of tests specifically targets the situation where removing a policy or permission assignment would leave zero users holding system-superuser access. Removing the last superuser assignment is blocked; removing one when other superusers remain is allowed.
2. This is checked at the single-item level and, separately, at the bulk level: a bulk removal cannot jointly strip every superuser holder even if no single item in the batch would do it alone (the check is checked to be batch-aware, not just item-by-item).

---

## Bulk actions

1. Bulk assign/remove for roles, policies, and permissions are checked to be best-effort rather than all-or-nothing: one invalid or already-applied item in a batch does not block the other valid items in the same batch.
2. **Specific cases covered:**
   - Assigning a policy the target already holds is reported as "already held" without duplicating the assignment row.
   - Assigning to an unknown policy name is reported per-item without blocking the rest of the batch.
   - A concurrent bulk assignment of the exact same user/policy pair from two requests does not fail the whole batch.
   - Bulk operations targeting the reserved system user are rejected for that one item while still applying to the other selected users.
3. **Users affected by a bulk change are notified:**
   - Each user is notified exactly once even if they appear in the batch more than once.
   - Notifications are sent only for items that actually succeeded.
   - Notifications can be disabled entirely.

---

## Caching

1. **The user-policy cache is checked to:**
   - Serve a cache hit without touching the database, and populate the cache on a miss.
   - Correctly invalidate: updating or deleting a policy invalidates every affected user's cache, while assigning or removing a single user's policy invalidates only that one user's entry (not the whole cache) when an email is available to scope the invalidation.
2. **The cache degrades gracefully:**
   - A Redis outage on read returns a cache miss rather than raising.
   - A write failure is swallowed rather than failing the request.
   - A corrupted cached payload is treated as a miss instead of crashing.
3. A separate integration test checks the cache actually flips a live authorization decision after a policy change: narrowing a policy's actions, deactivating a policy, or revoking a direct permission all correctly invalidate a decision that had already been cached, so a stale cached "allowed" does not linger after the underlying grant is gone.

---

## Batch authorization checks

1. The `/authorize/batch` endpoint is checked to reject an empty batch, an oversized batch, and a batch containing a malformed check (missing or wrong-typed action), while a batch at the documented maximum size is accepted.
2. A batch response never exposes which policies were matched, rejected, or evaluated, only the allow/deny outcome per check, since that detail is meant for the single-check "explain" endpoint, not the bulk one.
3. **Internally, `authorize_batch` is checked to:**
   - Fetch each user's policies only once for the whole batch (not once per check).
   - Produce results matching what individual `authorize()` calls would produce for the same checks.
   - Fail closed if evaluating any single check inside the batch raises.

---

## Audit logging of authorization decisions

1. Every `authorize()` call is checked to queue exactly one audit log entry recording the decision, including which policies granted it and, for a denial, which conditions failed.
2. The `authorize_detailed()` variant (used for the inspection/debug endpoint) is checked to never write an audit entry at all, since it is used for confirms, not real access decisions.
3. A failure while writing the audit entry is checked to never break the authorization response itself: the caller still gets a correct allow/deny even if audit logging failed behind the scenes.

See [Common Patterns](../../authorization/common-patterns.md) and
[Condition Schema Reference](../../authorization/condition-schema-reference.md)
for how these pieces fit together, and
[coverage-infrastructure/README.md](../coverage-infrastructure/README.md) for the audit log
storage and query layer itself.

---

See [PBAC Coverage](README.md) for the rest, or [Policy Evaluation and Conditions](policies-and-conditions.md) for the rest of this suite.

---
