import { describe, expect, it } from "vitest";

import { formatHourMinute } from "@/translations/timeOfDay";

describe("formatHourMinute", () => {
    const morning = new Date("2026-01-15T09:30:00Z");

    it("formats English with AM/PM", () => {
        const result = formatHourMinute(morning, "en");

        expect(result).toMatch(/AM|PM/);
    });

    it("formats Hindi with a native day-period word instead of AM/PM", () => {
        const result = formatHourMinute(morning, "hi");

        expect(result).not.toMatch(/AM|PM/);
    });

    it("formats Marathi with a native day-period word instead of AM/PM", () => {
        const result = formatHourMinute(morning, "mr");

        expect(result).not.toMatch(/AM|PM/);
    });

    it("formats Gujarati with a native day-period word instead of AM/PM", () => {
        const result = formatHourMinute(morning, "gu");

        expect(result).not.toMatch(/AM|PM/);
    });
});
