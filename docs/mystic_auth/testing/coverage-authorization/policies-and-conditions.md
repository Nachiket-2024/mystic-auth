# PBAC Coverage: Policy Evaluation, Conditions, and CRUD

---

## Policy evaluation

1. **The evaluator is checked against the basic shape of a decision:**
   - A policy that lists the right action and resource type grants access.
   - No policy at all denies.
   - A policy that exists but does not cover the action denies.
   - A mismatched resource type denies, and a wildcard resource type matches any resource.
   - If several policies are assigned and any single one of them grants the action, access is allowed.
2. **A dedicated test confirms the evaluator never references a role at all**: role and policy are deliberately independent concepts, so two users with the same role but different assigned policies get different access, and a user with no role at all can still be authorized purely through policies or direct grants.
3. **Detailed evaluation** (the version that reports *why* a decision was made) is checked to:
   - Agree with the plain allow/deny evaluator on the same inputs.
   - Correctly separate policies that matched the action but failed a condition from policies that never matched the action at all.
   - Report a "no assigned policies" reason distinctly from a "no matching policy" reason.

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

---

### Guarding against abusive condition payloads

1. The condition validator is also tested as a size and structure guard, not just a correctness check: a huge number of keys, pathologically deep nesting, and an oversized string or key are all rejected quickly rather than being evaluated (which could otherwise be used to burn CPU on crafted policy conditions).
2. Ordinary, reasonably-sized conditions pass through this guard unaffected.

See [coverage-security.md](../coverage-security.md) for how this guard is exercised as an actual attack scenario, not just a unit-level shape check.

---

## Policy CRUD, history, and rollback

1. Creating, listing, updating, and deleting policies is checked end to end through the API, including that a caller without the right permission cannot manage policies at all, and that permission is split finely: a caller holding only `policies:read`, only `policies:create`, only `policies:update`, and so on, can do exactly that action and nothing else.
2. Baseline (built-in) policies cannot be renamed or deleted even by a system superuser: this is checked as both a permission test and a dedicated security-hardening test, see [coverage-security.md](../coverage-security.md).
3. Every policy write (create, update, delete) is checked to leave behind a history entry, and an update's history entry records which fields actually changed.
4. Rolling back to a prior revision is checked to restore that revision's exact definition and label the resulting history entry as a rollback, including rolling back to a state before the policy was deleted. A rollback is rejected if the target history entry belongs to a different policy than the one being rolled back.
5. Concurrent policy writes are tested directly: two simultaneous updates to the same policy do not silently lose one of the writes or corrupt the history trail, and an update racing a delete of the same policy resolves to a 404 rather than a 500.

---

## The "granting your own privileges" guard

A caller can only create or modify a policy to grant actions they themselves already hold: this is the core self-escalation guard. It is tested from every angle:

1. Creating a new policy that mints an action the caller lacks is blocked.
2. Adding that action to an existing policy is blocked.
3. Deactivating a policy is blocked if the caller no longer holds its current actions.
4. Renaming a baseline policy is blocked outright.
5. A caller who already holds every action involved passes all of the above.
6. Actions outside the app's own declared vocabulary are deliberately ignored by this guard, since it only reasons about actions the app defines.

---

See [PBAC Coverage](README.md) for the rest, or [Assignment, Caching, and Audit](access-and-audit.md) for the rest of this suite.

---
