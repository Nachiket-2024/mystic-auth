import { describe, expect, it } from "vitest";

import {
    namespaceMatches,
    namespaceSearchText,
    scopedMatches,
    scopedSearchText,
} from "@/translations/searchText";

describe("searchText", () => {
    it("namespaceSearchText flattens every leaf string in a namespace, lowercased", () => {
        const text = namespaceSearchText("ui_text", "en");

        expect(text).toContain("prev");
        expect(text.toLowerCase()).toBe(text);
    });

    it("namespaceMatches excludes strings that still contain an unresolved {{placeholder}}", () => {
        const matches = namespaceMatches("ui_text", "en", "page");

        expect(matches.some((m) => m.includes("{{"))).toBe(false);
    });

    it("namespaceMatches is case-insensitive and returns original casing", () => {
        const matches = namespaceMatches("ui_text", "en", "PREV");

        expect(matches).toContain("Previous");
    });

    it("scopedSearchText only includes strings under the given dot-paths", () => {
        const scoped = scopedSearchText("ui_text", "en", ["pagination.prev"]);

        expect(scoped).toBe("previous");
    });

    it("scopedSearchText returns an empty string for a path that does not exist", () => {
        expect(scopedSearchText("ui_text", "en", ["does.not.exist"])).toBe("");
    });

    it("scopedMatches only searches within the given dot-paths", () => {
        const matches = scopedMatches("ui_text", "en", ["pagination.prev"], "prev");

        expect(matches).toEqual(["Previous"]);
    });

    it("scopedMatches returns nothing for a path that does not exist", () => {
        expect(scopedMatches("ui_text", "en", ["does.not.exist"], "prev")).toEqual([]);
    });
});
