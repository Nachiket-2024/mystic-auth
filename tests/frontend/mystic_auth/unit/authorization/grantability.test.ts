import { describe, expect, it } from "vitest";

import { canGrantAction, canGrantPolicy } from "@/authorization/grantability";

describe("grantability", () => {
    it("requires the caller to hold built-in actions", () => {
        expect(canGrantAction("users:delete_any", () => false)).toBe(false);
        expect(canGrantAction("users:delete_any", () => true)).toBe(true);
    });

    it("requires the caller to hold custom business actions too", () => {
        expect(canGrantAction("projects:archive", () => false)).toBe(false);
        expect(canGrantAction("projects:archive", () => true)).toBe(true);
    });

    it("requires every built-in action in a policy to be held", () => {
        const can = (action: string) => action === "users:list_all";
        expect(canGrantPolicy({ actions: ["users:list_all"] }, can)).toBe(true);
        expect(canGrantPolicy({ actions: ["users:list_all", "users:delete_any"] }, can)).toBe(false);
    });

    it("lets a system_superuser holder grant app-owned actions it does not hold", () => {
        expect(canGrantAction("raag:write_official", () => false, true)).toBe(true);
        expect(canGrantPolicy({ actions: ["raag:read_all", "taal:read_all"] }, () => false, true)).toBe(true);
    });

    it("lets a system_superuser holder grant built-in actions too", () => {
        expect(canGrantAction("users:delete_any", () => false, true)).toBe(true);
        expect(canGrantPolicy({ actions: ["raag:read_all", "users:delete_any"] }, () => false, true)).toBe(true);
    });

    it("gives no bypass to a caller without system_superuser", () => {
        expect(canGrantAction("raag:write_official", () => false, false)).toBe(false);
    });
});
