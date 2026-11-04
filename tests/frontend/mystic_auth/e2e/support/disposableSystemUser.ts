import { execFileSync } from "node:child_process";

export const SEEDED_PASSWORD = "PlaywrightPass123!";

// Keep the default CI/local Compose behavior, while allowing isolated test
// stacks to select their own project without touching another stack's volume.
const composeProjectName = process.env.PLAYWRIGHT_COMPOSE_PROJECT_NAME;
const composeArgs = [
  "compose",
  ...(composeProjectName ? ["-p", composeProjectName] : []),
  "-f", "docker/mystic_auth/compose/docker-compose.dev.yml",
  "-f", "docker/app/compose/docker-compose.dev.yml",
  "--env-file", "env/mystic_auth/.env.dev",
  "--env-file", "env/app/.env.dev",
];

export function seededSystemEmail(projectName: string) {
  const suffix = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
  return `playwright-system-${suffix}@example.com`;
}

export function seedBrowserSystemUser(email: string) {
  execFileSync("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "-e",
    "EMAIL_ENABLED=false",
    "-e",
    `PLAYWRIGHT_SYSTEM_EMAIL=${email}`,
    "-e",
    `PLAYWRIGHT_SYSTEM_PASSWORD=${SEEDED_PASSWORD}`,
    "backend",
    "python",
    "-c",
    seedPython,
  ], {
    cwd: process.cwd().endsWith("/frontend") ? ".." : ".",
    stdio: "pipe",
    env: { ...process.env, EMAIL_ENABLED: "false" },
  });
}

export function deleteBrowserSystemUser(email: string) {
  execFileSync("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "-e",
    "EMAIL_ENABLED=false",
    "-e",
    `PLAYWRIGHT_SYSTEM_EMAIL=${email}`,
    "backend",
    "python",
    "-c",
    deletePython,
  ], {
    cwd: process.cwd().endsWith("/frontend") ? ".." : ".",
    stdio: "pipe",
    env: { ...process.env, EMAIL_ENABLED: "false" },
  });
}

/**
 * Pretends the user logged in `minutes` ago so the passkey step-up window
 * (15 minutes since login) has lapsed, without waiting in real time.
 */
export function ageBrowserSessions(email: string, minutes: number) {
  execFileSync("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "-e",
    `PLAYWRIGHT_SYSTEM_EMAIL=${email}`,
    "-e",
    `PLAYWRIGHT_SESSION_AGE_MINUTES=${minutes}`,
    "backend",
    "python",
    "-c",
    ageSessionsPython,
  ], {
    cwd: process.cwd().endsWith("/frontend") ? ".." : ".",
    stdio: "pipe",
  });
}

/** Inserts `count` placeholder passkey rows (no real authenticator behind them) for list/bulk-removal UI checks. */
export function seedBrowserPasskeyRows(email: string, count: number) {
  execFileSync("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "-e",
    `PLAYWRIGHT_SYSTEM_EMAIL=${email}`,
    "-e",
    `PLAYWRIGHT_PASSKEY_ROWS=${count}`,
    "backend",
    "python",
    "-c",
    seedPasskeyRowsPython,
  ], {
    cwd: process.cwd().endsWith("/frontend") ? ".." : ".",
    stdio: "pipe",
  });
}

const seedPasskeyRowsPython = String.raw`
import asyncio
import os
from sqlalchemy import text
from mystic_auth.database.connection import database

async def main():
    async for db in database.get_session():
        for i in range(int(os.environ["PLAYWRIGHT_PASSKEY_ROWS"])):
            await db.execute(
                text("INSERT INTO passkey_credentials (user_id, credential_id, public_key, sign_count, name) VALUES ((SELECT id FROM users WHERE email = :e), :cid, :pk, 0, :n)"),
                {"e": os.environ["PLAYWRIGHT_SYSTEM_EMAIL"], "cid": os.urandom(16), "pk": b"placeholder", "n": f"Seeded key {i + 1}"},
            )
        await db.commit()
        return

asyncio.run(main())
`;

const ageSessionsPython = String.raw`
import asyncio
import os
from sqlalchemy import text
from mystic_auth.database.connection import database

async def main():
    async for db in database.get_session():
        await db.execute(
            text("UPDATE user_sessions SET created_at = now() - make_interval(mins => :m) WHERE user_id = (SELECT id FROM users WHERE email = :e)"),
            {"m": int(os.environ["PLAYWRIGHT_SESSION_AGE_MINUTES"]), "e": os.environ["PLAYWRIGHT_SYSTEM_EMAIL"]},
        )
        await db.commit()
        return

asyncio.run(main())
`;

const seedPython = String.raw`
import asyncio
import os
from mystic_auth.auth.password_logic.password_service import password_service
from mystic_auth.authorization.policies.default_policies import SELF_SERVICE_POLICY_NAME, SYSTEM_SUPERUSER_POLICY_NAME, USER_MANAGEMENT_POLICY_NAME
from mystic_auth.authorization.repositories.policy_repository import policy_repository
from mystic_auth.database.connection import database
from mystic_auth.user.user_crud_collector import user_crud
from mystic_auth.user.user_model import UserRole

EMAIL = os.environ["PLAYWRIGHT_SYSTEM_EMAIL"]
PASSWORD = os.environ["PLAYWRIGHT_SYSTEM_PASSWORD"]

async def main():
    async for db in database.get_session():
        user = await user_crud.get_by_email(EMAIL, db)
        hashed = await password_service.hash_password(PASSWORD)
        if user:
            await user_crud.update(user, {"name": "Playwright System", "role": UserRole.system, "hashed_password": hashed, "is_verified": True, "is_active": True}, db)
        else:
            user = await user_crud.create({"name": "Playwright System", "email": EMAIL, "hashed_password": hashed, "role": UserRole.system, "is_verified": True, "is_active": True}, db)
        for name in (SELF_SERVICE_POLICY_NAME, USER_MANAGEMENT_POLICY_NAME, SYSTEM_SUPERUSER_POLICY_NAME):
            policy = await policy_repository.get_by_name(name, db)
            await policy_repository.assign_policy_to_user(user.id, policy.id, db, assigned_by="playwright", user_email=EMAIL)
        await db.commit()
        return

asyncio.run(main())
`;

const deletePython = String.raw`
import asyncio
import os
from sqlalchemy import text
from mystic_auth.database.connection import database

EMAILS = (
    os.environ["PLAYWRIGHT_SYSTEM_EMAIL"],
    "playwright-system@example.com",
    "playwright-system@example.test",
)

async def main():
    async for db in database.get_session():
        await db.execute(text("DELETE FROM user_policies WHERE user_id IN (SELECT id FROM users WHERE email = ANY(:emails))"), {"emails": list(EMAILS)})
        await db.execute(text("DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email = ANY(:emails))"), {"emails": list(EMAILS)})
        await db.execute(text("DELETE FROM users WHERE email = ANY(:emails)"), {"emails": list(EMAILS)})
        await db.commit()
        return

asyncio.run(main())
`;
