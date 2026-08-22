import { create } from "zustand";

interface NetworkStatusState {
    isOnline: boolean;
}

function getInitialIsOnline(): boolean {
    // jsdom (the test environment) does implement navigator.onLine (defaulting
    // to true), but guard anyway for any future non-browser environment that
    // doesn't expose it at all - same reasoning as themeStore's matchMedia guard.
    if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return true;
    return navigator.onLine;
}

/**
 * Client-side UI state (not server state), so it lives in Zustand alongside
 * themeStore/authStore rather than TanStack Query - same split as every
 * other store in this folder.
 */
export const useNetworkStatusStore = create<NetworkStatusState>(() => ({
    isOnline: getInitialIsOnline(),
}));

// Module-level, not component-level: "is the network up" is one global
// browser signal for the app's entire lifetime, not state any single
// component owns - same "apply once at module load" reasoning as
// themeStore's own matchMedia read, except this has to keep listening
// instead of reading once, since connectivity can flip repeatedly during
// a session. Guarded the same way: jsdom provides addEventListener, but a
// future non-browser environment might not.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("online", () => useNetworkStatusStore.setState({ isOnline: true }));
    window.addEventListener("offline", () => useNetworkStatusStore.setState({ isOnline: false }));
}
