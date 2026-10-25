import { describe, expect, it } from "vitest";

import { formatNumber } from "@/translations/numerals";

describe("formatNumber", () => {
    it("returns a placeholder for an undefined value", () => {
        expect(formatNumber(undefined, "en")).toBe("-");
    });

    it("leaves ASCII digits as-is for English", () => {
        expect(formatNumber(128, "en")).toBe("128");
    });

    it("converts digits to Devanagari for Hindi", () => {
        expect(formatNumber(128, "hi")).toBe("१२८");
    });

    it("converts digits to Devanagari for Marathi", () => {
        expect(formatNumber(128, "mr")).toBe("१२८");
    });

    it("converts digits to Gujarati numerals", () => {
        expect(formatNumber(128, "gu")).toBe("૧૨૮");
    });

    it("accepts a string value, same as a number", () => {
        expect(formatNumber("42", "hi")).toBe("४२");
    });
});
