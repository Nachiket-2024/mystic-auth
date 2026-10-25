// The production nginx stamps a fresh random nonce into index.html's
// <meta name="csp-nonce"> on every response and allows exactly that nonce
// in the CSP's style-src-elem. A few third-party primitives (Radix's scroll
// lock and Select viewport) must inject a <style> element at runtime, which
// a CSP without 'unsafe-inline' only permits when the element carries it.
//
// The Vite dev server and tests serve the file with the placeholder still
// in place (their CSP allows inline styles), so the placeholder means "no
// nonce".
const PLACEHOLDER = "__CSP_NONCE__";

function readNonce(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
  return value && value !== PLACEHOLDER ? value : undefined;
}

export const cspNonce = readNonce();

// react-remove-scroll-bar (behind every Radix dialog, menu and popover)
// reads this global through get-nonce when it injects its scroll-lock style.
if (cspNonce) {
  (window as unknown as { __webpack_nonce__?: string }).__webpack_nonce__ = cspNonce;
}
