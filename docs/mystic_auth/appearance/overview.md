# Appearance: Per-User Brand Color

Lets a signed-in user pick their own brand accent color from Account Settings, re-skinning buttons, focus rings, the page-background gradient, the in-app logo badge, and the browser-tab favicon for themselves, on any device they sign into. This is separate from the app-wide static theme (`frontend/src/app/theme.ts`, merged over `frontend/src/mystic_auth/theme/system.ts`, see [Frontend Customization: Theme](../template-usage/frontend-customization.md#frontend-customization)), which sets the *default* brand color every user starts from. A user's own pick, once saved, overrides that default client-side, only for them; it never changes what anyone else sees.

## Feature map

| Layer | Files | Responsibility |
|---|---|---|
| Persistence | `backend/alembic/versions/c8e2a4f6b9d3_add_user_brand_color.py`, `backend/mystic_auth/user_table/user_model.py`, `user_schema.py` | Nullable `users.brand_color` column (`#rrggbb`, max length 7). `NULL` means "use the app default," never a stored literal default, so re-skinning `app/theme.ts` still reaches every user who hasn't set their own. |
| API | `PUT /users/me` (`UserUpdate.brand_color`, validated against a hex-color regex) | Same route self-service name/password updates go through; an explicit `null` resets to the app default, using the same `exclude_unset` semantics as every other field on that schema. |
| Client cache | `frontend/src/mystic_auth/store/appearanceStore.ts` | Zustand store holding the active `brandColor` (`string \| null`), backed by a `localStorage` cache (`brand-color` key), the same "store + localStorage" split used for color mode, font size, and language. |
| Theme rebuild | `frontend/src/mystic_auth/theme/AppearanceThemeProvider.tsx`, `theme/appearanceThemeOverrides.ts` | Subscribes to the store and rebuilds Chakra's entire `system` (via `createSystem`) whenever `brandColor` changes, rather than overriding CSS variables post hoc. |
| Scale generation | `frontend/src/mystic_auth/theme/generateBrandScale.ts` | Turns one picked hex into a full Chakra-shaped 50-900 color scale. |
| Favicon/meta | `frontend/src/mystic_auth/theme/applyFaviconAndMetaColor.ts`, `theme/brandIcon.ts` | Updates the `<link rel="icon">` and `<meta name="theme-color">` DOM elements directly, since those sit outside Chakra's system entirely. |
| UI | `frontend/src/mystic_auth/account_settings/AppearanceCard.tsx` | The Account Settings card: color picker, hex input, live light/dark preview, contrast warning, Save/Reset. |
| Server reconciliation | `frontend/src/mystic_auth/auth/current_user/useCurrentUserQuery.ts` (`useAuthSession`) | Applies the server's real, stored `brand_color` once `GET /auth/me` resolves, overriding whatever the local cache guessed. |

---

## Why the system gets rebuilt, not CSS variables overridden

An earlier version of this feature tried to apply a picked color by overriding Chakra CSS variables after the fact, and silently failed to apply dark-mode values. `AppearanceThemeProvider.tsx` instead rebuilds Chakra's `system` itself (`buildSystem` from `theme/system.ts`, merged with `buildAppearanceThemeOverrides`'s `SystemConfig` fragment) on every `brandColor` change, wrapped in `useMemo` so unrelated re-renders don't pay for it. `buildAppearanceThemeOverrides` returns `null` when nothing is customized, so the overwhelmingly common case (no per-user color set) reuses the shared default `system` object with zero extra work.

Because `AppearanceCard.tsx` reads and writes the same store `AppearanceThemeProvider` subscribes to, every pick applies live across the whole app immediately: there is no separate preview mechanism to keep in sync. The color picker's own preview boxes call `generateBrandScale`/`deriveCanvasFrom` directly, so what's shown on the card is provably the same output the rest of the app will render, not an approximation of it.

---

## Color scale generation

`generateBrandScale(hex)` (`theme/generateBrandScale.ts`) keeps the picked color's hue (and roughly its saturation) fixed, and interpolates lightness across a `LIGHTNESS_LADDER` calibrated against the shipped amber scale (`app/theme.ts`'s `brand.50-900`, itself Tailwind's amber scale), so an arbitrary input hue lands at roughly the same visual weight and contrast per step as that hand-tuned scale, without per-color manual re-tuning. Saturation is tapered slightly at the darkest steps (`SATURATION_MULTIPLIER`) so `900` doesn't read as an oversaturated near-black. `contrastRatio(a, b)` (WCAG contrast, via the `colord` `a11y` plugin) backs `AppearanceCard.tsx`'s low-contrast warning, checked against `scale["600"]` on white.

The page background gradient's start color (`bg.canvasFrom`, the semantic token every `AppLayout`/`AuthLayout`/`LandingPage` gradient reads) is derived from this same scale rather than picked separately: `brand.100` in light mode, and a 65/35 blend of Chakra's stock `gray.900` with `brand.900` in dark mode (`deriveCanvasFrom` in `appearanceThemeOverrides.ts`), the same treatment `app/theme.ts`'s own shipped override gets. A flat `brand.900` wash read as too strong at the top of a dark viewport; plain gray alone read as unbranded. `bg.canvas`, `bg.canvasTo`, and `bg.surface` stay at their stock values in both modes; only the gradient's start color moves with the user's pick.

```mermaid
flowchart LR
    Hex["User picks a hex color\n(native color input or typed hex)"] --> Scale["generateBrandScale(hex)\n50-900 Chakra scale"]
    Scale --> Overrides["buildAppearanceThemeOverrides()\nbrand.* tokens + bg.canvasFrom"]
    Scale --> Icon["getBrandIconDataUri(hex)\nbrandIcon.ts"]
    Overrides --> System["AppearanceThemeProvider\nrebuilds Chakra system"]
    Icon --> Favicon["applyFaviconAndMetaColor()\nfavicon link + theme-color meta"]
    System --> Live["Live everywhere: buttons,\nfocus rings, canvas gradient, logo badge"]
```

---

## Applying and persisting a pick

1. **Every drag/keystroke on the picker** updates `AppearanceCard`'s own local `draftBrand` state immediately (cheap, local only), so the swatch and this card's own preview boxes track the pointer with no lag.
2. **Committing to `appearanceStore`** (which triggers the expensive `AppearanceThemeProvider` system rebuild) is debounced 100ms (`COMMIT_DEBOUNCE_MS`). Committing on every single `input` event while dragging the native color picker's saturation/hue square previously blocked the main thread continuously: Chromium's built-in color picker popup shares the page's renderer process, so a busy main thread stalls the picker's own drag tracking too, not just React's re-render.
3. **Save** (`handleSave`) commits the debounced value immediately, then calls `PUT /users/me` with `{ brand_color: draftBrand }` via `useUpdateMyAccountMutation`, which invalidates the current-user query on success.
4. **Reset** (`handleReset`) sets the local store back to `null` (the shipped default color, `#d97706`, shown in the picker) and calls `PUT /users/me` with `{ brand_color: null }`, clearing the stored override.
5. Both mutations reuse the same `PUT /users/me` route self-service name/password changes go through; a `brand_color` change alone never rotates session cookies (only a password change does, see `sessionRotationGuard.ts`).

### Reconciliation on login and across devices

The store's `initialBrandColor` (read from `localStorage` at module load, before React's first paint, same as `themeStore.ts`'s color-mode handling) is only ever a locally cached guess, applied eagerly so there's no flash of the default color before the app finishes loading. `useAuthSession` (`useCurrentUserQuery.ts`) is the source of truth: once `GET /auth/me` resolves, it calls `appearance.setBrandColor(data.brand_color ?? null)` with the server's real, stored value, overriding whatever the local cache guessed, e.g. after picking a color on another device, or on a browser that never set anything locally. On a failed/expired session, it resets to `null` (the app default) the same way.

---

## Production checks

- Backend unit tests cover `UserUpdate.brand_color`'s hex-format validation and the `PUT /users/me` handler's null-reset behavior.
- Frontend unit tests cover `generateBrandScale`'s output shape and `contrastRatio`, and `AppearanceCard.tsx`'s debounced commit, save, and reset flows.

## Where to go next

- [Frontend Customization](../template-usage/frontend-customization.md): the app-wide default brand color (`app/theme.ts`) this feature overrides per user.
- [Frontend Architecture](../architecture/frontend.md): where `theme/` and `store/` fit into the rest of `frontend/src/mystic_auth/`.
