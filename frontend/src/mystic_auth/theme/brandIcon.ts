/**
 * Same badge shape as public/favicon.svg, parameterized by fill color. This
 * is the one place "brand color -> logo/favicon color" is generated, so the
 * browser tab icon (applyFaviconAndMetaColor.ts) and the in-app logo badge
 * (Logo.tsx) are provably the same source rather than two things that
 * happen to match. Falls back to the static /favicon.svg file (via a null
 * hex) when no custom color is set, so the default case stays a plain,
 * cacheable static asset with zero runtime cost.
 */
export function getBrandIconDataUri(hex: string): string {
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">` +
        `<rect width="24" height="24" rx="5" fill="${hex}"/>` +
        `<g transform="translate(6 6) scale(0.5)">` +
        `<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="16.5" cy="7.5" r=".5" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</g>` +
        `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
