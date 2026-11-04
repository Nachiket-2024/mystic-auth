import type { SupportedLanguage } from "./translations";
import { formatNumber } from "./numerals";

/**
 * Hour:minute formatting per language. English keeps "8:58 PM". Hindi, Marathi
 * and Gujarati do not use AM/PM naturally: CLDR splits the day into four native
 * words (morning, afternoon, evening, night) placed before the time, e.g.
 * "सुबह 9:30". Digits go through formatNumber afterward so callers get one
 * consistent digit style (see numerals.ts DIGIT_MAPS).
 */
const LOCALE_TAGS: Record<SupportedLanguage, string> = {
    en: "en-US",
    hi: "hi-IN",
    mr: "mr-IN",
    gu: "gu-IN",
};

export function formatHourMinute(date: Date, language: SupportedLanguage): string {
    const formatted = language === "en"
        ? date.toLocaleTimeString(LOCALE_TAGS.en, { hour: "numeric", minute: "2-digit", hour12: true })
        : new Intl.DateTimeFormat(LOCALE_TAGS[language], { hour: "numeric", minute: "2-digit", dayPeriod: "short" }).format(date);
    return formatNumber(formatted, language);
}
