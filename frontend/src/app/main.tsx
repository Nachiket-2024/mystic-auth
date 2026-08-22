import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App.tsx';
import ErrorBoundary from '../mystic_auth/ui/routing/ErrorBoundary.tsx';

// Wraps <App> in Chakra's ChakraProvider, rebuilding the system with the
// signed-in user's own brand/background colors (appearanceStore.ts) merged
// in - see AppearanceThemeProvider.tsx's own docstring for why this lives
// here instead of a static `<ChakraProvider value={system}>`.
import AppearanceThemeProvider from '../mystic_auth/theme/AppearanceThemeProvider.tsx';

// Self-hosted (not a Google Fonts CDN request, consistent with this
// template's other self-hosted defaults - Bugsink, no external trackers) -
// registers "InterVariable" as an installed font before first paint, which
// system.ts's fonts.heading/fonts.body tokens then reference. A CSS-only
// import (no JS export), so it has no direct consumer - imported here purely
// for that load side effect, same reasoning as themeStore.ts below.
import '@fontsource-variable/inter';

// Auth/permissions state itself lives in Zustand (store/authStore.ts),
// which needs no Provider since it's a module-level singleton reachable
// from any component directly.
import { queryClient } from "../mystic_auth/core/queryClient.ts";

// Imported here, eagerly, purely for its module-load side effect of
// applying the persisted/OS color mode class to <html> BEFORE the first
// paint. Importing it later (e.g. only from Navbar, where the toggle
// button lives) would apply that class after React's first render,
// causing a visible flash of the wrong theme for a user who previously
// chose dark mode.
import '../mystic_auth/store/themeStore.ts';

// Same reasoning as themeStore.ts above, for the persisted/custom brand and
// background colors: this only applies the favicon/meta tag before first
// paint (the Chakra tokens themselves are applied by
// AppearanceThemeProvider.tsx's very first render, using this same
// module's cached initial state - see appearanceStore.ts). This is only
// the locally cached guess either way; useAuthSession reconciles it
// against the account's real, server-stored value once GET /auth/me
// resolves.
import '../mystic_auth/store/appearanceStore.ts';

// Same reasoning as themeStore.ts above, for the persisted font-size
// preference: applies before first paint, avoiding a flash of the default
// size for a user who previously chose small/large.
import '../mystic_auth/store/fontSizeStore.ts';

// Same reasoning as themeStore.ts above, for the persisted/browser language
// preference: languageStore.ts itself eagerly imports and initializes
// translations/translations.ts, so this one import both configures translations and applies the
// chosen language before the first paint.
import '../mystic_auth/store/languageStore.ts';

// Must be called once, before the app renders, so every API call made
// during the initial session check is already covered.
import { setupAuthInterceptor } from "../mystic_auth/auth/session_lifecycle/setupAuthInterceptor.ts";

// A no-op unless VITE_SENTRY_DSN is set, see core/errorMonitoring.ts and
// docs/mystic_auth/error-monitoring/overview.md. Called before render so a crash during the
// app's very first render is still reportable.
import { initErrorMonitoring } from "../mystic_auth/core/errorMonitoring.ts";

const rootElement = document.getElementById('root') as HTMLElement;

setupAuthInterceptor();
initErrorMonitoring();

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <AppearanceThemeProvider>
                    <App />
                </AppearanceThemeProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>
);
