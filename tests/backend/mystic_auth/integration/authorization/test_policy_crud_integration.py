# tests/backend/mystic_auth/integration/test_policy_crud_integration.py
#
# End-to-end coverage for policy_crud_routes.py (backend/mystic_auth/api/
# pbac_routes/) against the real ASGI app, real PostgreSQL, and real Redis.
# Split out of what used to be one 568-line
# test_authorization_routes_integration.py. "All management
# actions must themselves use PBAC authorization": these tests prove that
# gate on the policy CRUD surface specifically.
import asyncio
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app
from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
    SYSTEM_SUPERUSER_POLICY_NAME,
    USER_ADMINISTRATION_POLICY_NAME,
)
from backend.mystic_auth.authorization.repositories.policy_assignment_repository import (
    policy_assignment_repository,
)
from backend.mystic_auth.authorization.repositories.policy_repository import (
    policy_repository,
)
from backend.mystic_auth.database.connection import database

from .authorization_test_accounts import (
    PASSWORD,
    cleanup_test_policies,
    create_system_user,
    create_verified_user,
    unique_email,
    unique_policy_name,
)

__all__ = ["cleanup_test_policies"]

# ---------------------------- Authorization gate on management routes ----------------------------

@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(client):
    resp = await client.get("/authorization/policies")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_regular_user_cannot_manage_policies(client, created_emails):
    email = unique_email()
    await create_verified_user(client, created_emails, email, [SELF_SERVICE_POLICY_NAME])

    resp = await client.get("/authorization/policies")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_without_policies_read_cannot_manage_policies(client, created_emails):
    # user_administration does not include policies:read (or any of the
    # other fine-grained policies:* actions); only system_superuser does.
    # An ordinary admin must be denied here.
    email = unique_email("admin")
    await create_verified_user(client, created_emails, email, [SELF_SERVICE_POLICY_NAME, USER_ADMINISTRATION_POLICY_NAME])

    resp = await client.get("/authorization/policies")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_policies_respects_limit_query_param(client, created_emails):
    # Regression guard: GET /authorization/policies previously read the
    # whole table unconditionally, unlike every other list endpoint in the
    # app. The baseline seeded policies (self_service, user_administration,
    # system_superuser, ...) guarantee more than one row exists already.
    email = unique_email("system")
    await create_verified_user(client, created_emails, email, [SYSTEM_SUPERUSER_POLICY_NAME])

    resp = await client.get("/authorization/policies?limit=1")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ---------------------------- List: search/filter/sort/pagination ----------------------------
# Regression guard for the server-side search/resource_type/is_active/
# sort_by/sort_dir/X-Total-Count behavior PoliciesPage.tsx now relies on
# (see policy_repository.py's _apply_filters/_order_by): only `limit` had
# integration coverage before these were added.

@pytest.mark.asyncio
async def test_list_policies_search_matches_name_or_description_case_insensitively(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    token = uuid.uuid4().hex

    name_match = f"test_policy_namematch_{token}"
    description_match = unique_policy_name()
    no_match = unique_policy_name()

    await client.post(
        "/authorization/policies",
        json={"name": name_match, "actions": ["projects:read"], "resource_type": "projects"},
    )
    await client.post(
        "/authorization/policies",
        json={
            "name": description_match,
            "description": f"mentions {token} in its description",
            "actions": ["projects:read"],
            "resource_type": "projects",
        },
    )
    await client.post(
        "/authorization/policies",
        json={"name": no_match, "actions": ["projects:read"], "resource_type": "projects"},
    )

    # Uppercased, to prove the match is case-insensitive (ILIKE), not just
    # a lucky exact-case substring.
    resp = await client.get("/authorization/policies", params={"search": token.upper(), "limit": 100})
    assert resp.status_code == 200
    matched_names = {p["name"] for p in resp.json()}

    assert matched_names == {name_match, description_match}
    assert no_match not in matched_names


@pytest.mark.asyncio
async def test_list_policies_filters_by_resource_type_exactly(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    token = uuid.uuid4().hex
    resource_type = f"widgets_{token}"

    matching = unique_policy_name()
    other = unique_policy_name()
    await client.post(
        "/authorization/policies",
        json={"name": matching, "actions": ["widgets:read"], "resource_type": resource_type},
    )
    await client.post(
        "/authorization/policies",
        # Same token prefix in the resource_type, but not an exact match -
        # proves this filter is exact-match, not a substring search like
        # `search` above.
        json={"name": other, "actions": ["widgets:read"], "resource_type": f"{resource_type}_other"},
    )

    resp = await client.get("/authorization/policies", params={"resource_type": resource_type, "limit": 100})
    assert resp.status_code == 200
    matched_names = {p["name"] for p in resp.json()}

    assert matched_names == {matching}


@pytest.mark.asyncio
async def test_list_policies_filters_by_is_active(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    active_name = unique_policy_name()
    inactive_name = unique_policy_name()
    await client.post(
        "/authorization/policies",
        json={"name": active_name, "actions": ["projects:read"], "resource_type": "projects"},
    )
    await client.post(
        "/authorization/policies",
        json={"name": inactive_name, "actions": ["projects:read"], "resource_type": "projects"},
    )
    deactivate_resp = await client.put(f"/authorization/policies/{inactive_name}", json={"is_active": False})
    assert deactivate_resp.status_code == 200

    active_resp = await client.get(
        "/authorization/policies", params={"search": "test_policy_", "is_active": True, "limit": 1000}
    )
    inactive_resp = await client.get(
        "/authorization/policies", params={"search": "test_policy_", "is_active": False, "limit": 1000}
    )
    assert active_resp.status_code == 200
    assert inactive_resp.status_code == 200

    active_names = {p["name"] for p in active_resp.json()}
    inactive_names = {p["name"] for p in inactive_resp.json()}

    assert active_name in active_names
    assert active_name not in inactive_names
    assert inactive_name in inactive_names
    assert inactive_name not in active_names


@pytest.mark.asyncio
async def test_list_policies_sorts_by_name_ascending(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    # Sharing a common prefix isolates this test's own two rows from other
    # entries in the table (baseline seeded policies, other tests' leftover
    # rows within this same run), same pattern as the audit log integration
    # tests' equivalent sort test.
    prefix = f"test_policy_sorttest_{uuid.uuid4().hex}"
    name_a = f"{prefix}_aaa"
    name_b = f"{prefix}_bbb"
    # Created in reverse (b before a) order, so a correct result proves the
    # response is actually sorted, not just returned in insertion order.
    await client.post(
        "/authorization/policies",
        json={"name": name_b, "actions": ["projects:read"], "resource_type": "projects"},
    )
    await client.post(
        "/authorization/policies",
        json={"name": name_a, "actions": ["projects:read"], "resource_type": "projects"},
    )

    resp = await client.get(
        "/authorization/policies",
        params={"search": prefix, "sort_by": "name", "sort_dir": "asc", "limit": 100},
    )
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]

    assert names == [name_a, name_b]


@pytest.mark.asyncio
async def test_list_policies_unrecognized_sort_by_falls_back_to_id_instead_of_erroring(client, created_emails):
    # _order_by allowlists sort_by against a fixed column set and falls back
    # to Policy.id for anything else, rather than letting an arbitrary
    # caller-supplied column name reach the query. A request for a
    # non-existent/unsupported column must still succeed, not 400/500.
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    resp = await client.get(
        "/authorization/policies", params={"sort_by": "not_a_real_column", "sort_dir": "asc", "limit": 5}
    )

    assert resp.status_code == 200
    assert len(resp.json()) <= 5


@pytest.mark.asyncio
async def test_list_policies_x_total_count_reflects_filtered_total_not_just_this_page(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    prefix = f"test_policy_pagetest_{uuid.uuid4().hex}"
    names = [f"{prefix}_{i}" for i in range(3)]
    for name in names:
        create_resp = await client.post(
            "/authorization/policies",
            json={"name": name, "actions": ["projects:read"], "resource_type": "projects"},
        )
        assert create_resp.status_code == 201

    # One page at a time (limit=1), sorted deterministically by name so each
    # offset lands on a known row.
    seen_names = []
    for offset in range(3):
        resp = await client.get(
            "/authorization/policies",
            params={"search": prefix, "sort_by": "name", "sort_dir": "asc", "limit": 1, "offset": offset},
        )
        assert resp.status_code == 200
        # The header reports every matching row (3), not this page's size
        # (1) - what PoliciesPage.tsx's totalPages calculation depends on.
        assert resp.headers["x-total-count"] == "3"
        body = resp.json()
        assert len(body) == 1
        seen_names.append(body[0]["name"])

    assert seen_names == names


# ---------------------------- Policy CRUD ----------------------------

@pytest.mark.asyncio
async def test_system_user_can_create_list_update_and_delete_a_policy(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    create_resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "description": "A test-only policy",
            "actions": ["projects:read"],
            "resource_type": "projects",
        },
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["name"] == policy_name
    assert body["is_active"] is True
    assert body["created_by"] == system_email

    list_resp = await client.get("/authorization/policies")
    assert list_resp.status_code == 200
    assert any(p["name"] == policy_name for p in list_resp.json())

    update_resp = await client.put(
        f"/authorization/policies/{policy_name}", json={"is_active": False}
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["is_active"] is False

    delete_resp = await client.delete(f"/authorization/policies/{policy_name}")
    assert delete_resp.status_code == 200

    get_resp = await client.get(f"/authorization/policies/{policy_name}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_concurrent_updates_to_the_same_policy_do_not_lose_writes_or_corrupt_history(
    client, created_emails
):
    """Regression for a real race in PolicyRepository.update: two admins
    editing the same policy concurrently each used to read the same
    pre-update row (via get_by_name, before either transaction held a
    lock), so the second commit could silently discard the first's change
    to a field it didn't itself touch, and both history entries' recorded
    previous_definition could describe a state neither actually preceded.
    Fires two concurrent PUTs against real Postgres, changing different
    fields, and asserts both changes land and the two resulting history
    entries chain correctly against each other and the pre-existing state.
    """
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    create_resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "description": "original description",
            "actions": ["projects:read"],
            "resource_type": "projects",
        },
    )
    assert create_resp.status_code == 201

    responses = await asyncio.gather(
        client.put(f"/authorization/policies/{policy_name}", json={"description": "changed by A"}),
        client.put(f"/authorization/policies/{policy_name}", json={"conditions": {"self_only": True}}),
    )
    assert all(r.status_code == 200 for r in responses)

    final = await client.get(f"/authorization/policies/{policy_name}")
    assert final.status_code == 200
    final_body = final.json()
    # Both concurrent edits must be reflected: neither transaction's write
    # should have been silently overwritten by the other reading stale data.
    assert final_body["description"] == "changed by A"
    assert final_body["conditions"] == {"self_only": True}

    history_resp = await client.get(f"/authorization/policies/{policy_name}/history")
    assert history_resp.status_code == 200
    entries = history_resp.json()
    updated_entries = [e for e in entries if e["change_type"] == "updated"]
    assert len(updated_entries) == 2
    # get_for_policy orders newest-first; the chain, read oldest-to-newest,
    # must have each entry's previous_definition match the prior entry's
    # new_definition (or the original create for the first one) : proof
    # that whichever update actually landed second saw the first update's
    # committed row (via FOR UPDATE + populate_existing), not a stale
    # pre-either-update snapshot.
    chain = list(reversed(updated_entries))
    assert chain[0]["previous_definition"]["description"] == "original description"
    assert chain[0]["previous_definition"]["conditions"] is None
    assert chain[1]["previous_definition"] == chain[0]["new_definition"]
    # The second-committed entry's new_definition must carry both edits,
    # regardless of which of the two concurrent requests actually won the
    # race to commit first.
    assert chain[1]["new_definition"]["description"] == "changed by A"
    assert chain[1]["new_definition"]["conditions"] == {"self_only": True}


@pytest.mark.asyncio
async def test_concurrent_update_racing_a_delete_of_the_same_policy_returns_404_not_500(
    client, created_emails
):
    """Regression: PolicyRepository.update re-fetches the row with FOR
    UPDATE before mutating (see the sibling concurrency test above). If a
    concurrent request deletes the same policy while an update is blocked
    waiting on that lock, the update's re-fetch returns None; without an
    explicit check, computing a definition snapshot from None raised an
    uncaught AttributeError (an unhandled-exception 500) instead of a
    clean, explainable error."""
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    create_resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "description": "original description",
            "actions": ["projects:read"],
            "resource_type": "projects",
        },
    )
    assert create_resp.status_code == 201

    responses = await asyncio.gather(
        client.put(f"/authorization/policies/{policy_name}", json={"description": "changed"}),
        client.delete(f"/authorization/policies/{policy_name}"),
        return_exceptions=True,
    )

    for resp in responses:
        assert not isinstance(resp, Exception)
        # Whichever of the two wins the race, the loser must get a clean
        # 4xx (already-deleted 404, or the update landing before the
        # delete and the delete then 200ing) - never an unhandled 500.
        assert resp.status_code < 500, resp.text


@pytest.mark.asyncio
async def test_concurrent_bulk_removes_cannot_jointly_strip_every_superuser_holder(created_emails):
    """Regression for a real TOCTOU race in bulk_remove_policies' "can't
    remove the last system_superuser assignment" lockout guard: it used to
    read the current holder count with a plain (non-locking) SELECT, once
    per request. Two admins who are the only two system_superuser holders
    could concurrently revoke *each other's* superuser access: each
    request's own pre-check only ever sees itself removing one holder out
    of two, so each independently concludes one holder will remain, and
    both commit - together stripping every system_superuser assignment
    (a total admin lockout) despite the guard each individually passed.

    Uses two independent authenticated clients (real cookie sessions, real
    Postgres) firing concurrently, exactly like two different admins in
    two different browser tabs.
    """
    holder_a = unique_email("holder-a")
    holder_b = unique_email("holder-b")

    async def _new_client():
        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="https://testserver", follow_redirects=False)

    setup_client = await _new_client()
    try:
        await create_system_user(setup_client, created_emails, holder_a)
        await create_system_user(setup_client, created_emails, holder_b)
    finally:
        await setup_client.aclose()

    client_a = await _new_client()
    client_b = await _new_client()
    try:
        await client_a.post("/auth/login", json={"email": holder_a, "password": PASSWORD})
        await client_b.post("/auth/login", json={"email": holder_b, "password": PASSWORD})

        # Each holder concurrently revokes the OTHER holder's superuser
        # assignment - the minimal two-party version of the race.
        responses = await asyncio.gather(
            client_a.post(
                "/authorization/bulk/policies/remove",
                json={"items": [{"user_email": holder_b, "policy_name": SYSTEM_SUPERUSER_POLICY_NAME}]},
            ),
            client_b.post(
                "/authorization/bulk/policies/remove",
                json={"items": [{"user_email": holder_a, "policy_name": SYSTEM_SUPERUSER_POLICY_NAME}]},
            ),
        )
        assert all(r.status_code == 200 for r in responses)

        outcomes = [r.json()["results"][0]["status"] for r in responses]
        # Exactly one of the two removals must have been blocked by the
        # lockout guard (order is non-deterministic - whichever request's
        # transaction acquires the row lock first wins and actually
        # removes the other's assignment; the second must then observe
        # the post-commit state and refuse to leave zero holders).
        assert sorted(outcomes) == ["error", "success"]

        async with database.async_session() as session:
            superuser_policy = await policy_repository.get_by_name(SYSTEM_SUPERUSER_POLICY_NAME, session)
            remaining_holders = set(await policy_assignment_repository.get_holder_emails(superuser_policy.id, session))
        assert holder_a in remaining_holders or holder_b in remaining_holders
    finally:
        await client_a.aclose()
        await client_b.aclose()


@pytest.mark.asyncio
async def test_creating_a_duplicate_named_policy_is_rejected(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    payload = {
        "name": policy_name,
        "actions": ["projects:read"],
        "resource_type": "projects",
    }
    first = await client.post("/authorization/policies", json=payload)
    assert first.status_code == 201

    second = await client.post("/authorization/policies", json=payload)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_renaming_a_policy_to_an_existing_name_is_rejected(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    first_name = unique_policy_name()
    second_name = unique_policy_name()

    first = await client.post(
        "/authorization/policies",
        json={"name": first_name, "actions": ["projects:read"], "resource_type": "projects"},
    )
    assert first.status_code == 201

    second = await client.post(
        "/authorization/policies",
        json={"name": second_name, "actions": ["projects:read"], "resource_type": "projects"},
    )
    assert second.status_code == 201

    rename_resp = await client.put(f"/authorization/policies/{first_name}", json={"name": second_name})
    assert rename_resp.status_code == 409

    # Confirm it actually didn't take: the original policy is still reachable under its old name
    get_resp = await client.get(f"/authorization/policies/{first_name}")
    assert get_resp.status_code == 200
