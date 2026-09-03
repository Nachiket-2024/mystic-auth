// Use the "/vitest" entry point, not the bare package: it types jest-dom's
// matchers (like `.not`) against Vitest's `expect` instead of Jest's.
import "@testing-library/jest-dom/vitest";

// Loads real English translations before any test renders a component.
// Without this, useTranslation() has nothing loaded and renders raw keys
// (e.g. "passwordRules.minLength") instead of the text tests assert against.
import "../translations/translations";

// jsdom has no EventSource. useSessionEventsStream mounts app-wide, so any
// test that renders the authenticated app tree needs this stand-in just to
// avoid a ReferenceError; tests checking its actual behavior mock it themselves.
class MockEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    close(): void {}
}

// @ts-expect-error - a minimal stand-in for tests, not a full EventSource implementation
globalThis.EventSource = MockEventSource;

// jsdom also has no ResizeObserver. Chakra's popover components (Select,
// Combobox; see LanguageToggle.tsx) use it via floating-ui to track their
// trigger's position while open, so opening one throws without this stand-in.
class MockResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

globalThis.ResizeObserver = MockResizeObserver;

// jsdom also has no Element.scrollTo. Chakra's Select (LanguageToggle.tsx)
// calls it on selection to reset scroll position for next open.
if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
}
