/**
 * The page the service worker serves when the network fails and no saved copy of
 * the URL exists (spec 4.7.5). The worker returns it as a whole document of its own,
 * so it loads nothing: no Next chunk, no stylesheet, no font, no image. Everything it
 * needs is in the string, because a request would fail again with no signal.
 *
 * Its one script retries: every 30 seconds while the phone reports a connection (the
 * bar's probe cadence, PROBE_INTERVAL_MS in components/offline/SavedCopyBar.tsx), when
 * the tab comes back into view, and on the `online` event. A retry fetches this URL past
 * every cache and reloads only when the answer is ok, so a phone that reports a
 * connection but carries no data (venue wifi with a dead uplink, one bar of signal)
 * keeps this page instead of flashing the browser's own error page. The fetch is not a
 * navigation, so the worker lets it through to the network. "Try again" reloads at once.
 * It follows the phone's light or dark setting, since the page has no theme toggle and
 * the app's stylesheet is not there to read one.
 *
 * Pure and dependency-free: the worker bundle imports this file, and Vitest imports
 * the same source.
 */

// Hex values are the runtime color tokens in app/globals.css (--color-bg-runtime,
// --color-text-runtime, --color-text-subtle-runtime, and for the button
// --color-surface-runtime, --color-text-faint-runtime, --color-focus-ring-runtime,
// --color-surface-sunken-runtime, --color-accent-on-bg-runtime), light and dark. They
// are copies, because this page cannot read the app's stylesheet;
// tests/lib/offline/palette.test.ts ties each one to its token so a palette change
// cannot leave this page off-palette. The button is the app's secondary-action recipe:
// a surface fill, a text-faint outline (3:1 against both grounds, DESIGN.md 1.2) and
// the focus ring of the app's own :focus-visible rule. Its pressed and hover states are
// the app's own for a surface-filled control with that outline
// (components/admin/dev/SwitcherControls.tsx): a surface-sunken fill while pressed, an
// accent-on-bg outline under a hovering pointer. Neither touches the outline property,
// so the focus ring draws over both.
const LIGHT = {
  bg: "#fafaf9",
  text: "#1a1b1f",
  subtle: "#5a5b62",
  surface: "#ffffff",
  outline: "#8b8c92",
  ring: "#e06000",
  pressed: "#f4f3f1",
  hover: "#a65000",
};
const DARK = {
  bg: "#0f1014",
  text: "#e8e6e0",
  subtle: "#9c9a93",
  surface: "#16171c",
  outline: "#74736d",
  ring: "rgba(255, 160, 71, 0.65)",
  pressed: "#0b0c10",
  hover: "#ffa047",
};

// The heading doubles as the tab title, so the page carries no copy beyond the spec's.
const HEADING = "No signal, and this show isn't saved on this phone yet.";
const BODY =
  "Open this link once while you have signal or wifi. After that it works here even with no signal.";
const RETRY_LABEL = "Try again";
const NOTE = "This page reloads by itself once it can reach the server.";

/** How often the page retries while the phone reports a connection: the bar's probe cadence. */
const RETRY_INTERVAL_MS = 30_000;

// The whole script. `retry` is the only path to an automatic reload, and it reloads
// only on an ok answer; the button reloads at once, which the worker answers with this
// page again if the network is still down.
const SCRIPT =
  "(() => {" +
  'const retry = () => fetch(location.href, { cache: "no-store" })' +
  ".then((response) => { if (response.ok) location.reload(); })" +
  ".catch(() => {});" +
  `setInterval(() => { if (navigator.onLine) retry(); }, ${RETRY_INTERVAL_MS});` +
  'document.addEventListener("visibilitychange", () => ' +
  '{ if (document.visibilityState === "visible") retry(); });' +
  'window.addEventListener("online", retry);' +
  'document.querySelector("button").addEventListener("click", () => location.reload());' +
  "})();";

const CSS = [
  `body { margin: 0; background-color: ${LIGHT.bg}; color: ${LIGHT.text}; ` +
    `font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }`,
  `main { box-sizing: border-box; max-width: 30rem; margin: 0 auto; padding: 3rem 1.5rem; }`,
  `h1 { margin: 0 0 1rem; font-size: 1.375rem; font-weight: 600; line-height: 1.3; }`,
  `p { margin: 0 0 1.5rem; }`,
  `small { display: block; color: ${LIGHT.subtle}; font-size: 0.875rem; }`,
  `button { box-sizing: border-box; min-height: 44px; margin: 0 0 1.5rem; padding: 0 1rem; ` +
    `font: inherit; font-size: 0.875rem; font-weight: 500; color: ${LIGHT.text}; ` +
    `background-color: ${LIGHT.surface}; border: 1px solid ${LIGHT.outline}; ` +
    `border-radius: 6px; cursor: pointer; }`,
  `button:active { background-color: ${LIGHT.pressed}; }`,
  // Longhands, so the palette test can read the ring's colour back by name.
  `button:focus-visible { outline-width: 3px; outline-style: solid; ` +
    `outline-color: ${LIGHT.ring}; outline-offset: 2px; }`,
  // Only a pointer that hovers: a tap must not leave the hover outline stuck on.
  `@media (hover: hover) { button:hover { border-color: ${LIGHT.hover}; } }`,
  `@media (prefers-color-scheme: dark) { ` +
    `body { background-color: ${DARK.bg}; color: ${DARK.text}; } ` +
    `small { color: ${DARK.subtle}; } ` +
    `button { color: ${DARK.text}; background-color: ${DARK.surface}; ` +
    `border-color: ${DARK.outline}; } ` +
    `button:active { background-color: ${DARK.pressed}; } ` +
    `button:focus-visible { outline-color: ${DARK.ring}; } }`,
  `@media (hover: hover) and (prefers-color-scheme: dark) { ` +
    `button:hover { border-color: ${DARK.hover}; } }`,
].join("\n");

/** The complete HTML document, ready to be the body of a `text/html` response. */
export function notSavedPageHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${HEADING}</title>`,
    `<style>\n${CSS}\n</style>`,
    "</head>",
    "<body>",
    "<main>",
    `<h1>${HEADING}</h1>`,
    `<p>${BODY}</p>`,
    `<button type="button">${RETRY_LABEL}</button>`,
    `<small>${NOTE}</small>`,
    "</main>",
    `<script>${SCRIPT}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
