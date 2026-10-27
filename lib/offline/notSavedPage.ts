/**
 * The page the service worker serves when the network fails and no saved copy of
 * the URL exists (spec 4.7.5). The worker returns it as a whole document of its own,
 * so it loads nothing: no Next chunk, no stylesheet, no font, no image. Everything it
 * needs is in the string, because a request would fail again with no signal.
 *
 * It reloads itself when the browser says the network is back, and that is the whole
 * script. It follows the phone's light or dark setting, since the page has no theme
 * toggle and the app's stylesheet is not there to read one.
 *
 * Pure and dependency-free: the worker bundle imports this file, and Vitest imports
 * the same source.
 */

// Hex values are the runtime color tokens in app/globals.css (--color-bg-runtime,
// --color-text-runtime, --color-text-subtle-runtime), light and dark. They are copies,
// because this page cannot read the app's stylesheet; tests/lib/offline/palette.test.ts
// ties each one to its token so a palette change cannot leave this page off-palette.
const LIGHT = { bg: "#fafaf9", text: "#1a1b1f", subtle: "#5a5b62" };
const DARK = { bg: "#0f1014", text: "#e8e6e0", subtle: "#9c9a93" };

// The heading doubles as the tab title, so the page carries no copy beyond the spec's.
const HEADING = "No signal, and this show isn't saved on this phone yet.";
const BODY =
  "Open this link once while you have signal or wifi. After that it works here even with no signal.";
const NOTE = "This page reloads by itself when signal comes back.";

const CSS = [
  `body { margin: 0; background-color: ${LIGHT.bg}; color: ${LIGHT.text}; ` +
    `font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }`,
  `main { box-sizing: border-box; max-width: 30rem; margin: 0 auto; padding: 3rem 1.5rem; }`,
  `h1 { margin: 0 0 1rem; font-size: 1.375rem; font-weight: 600; line-height: 1.3; }`,
  `p { margin: 0 0 1.5rem; }`,
  `small { display: block; color: ${LIGHT.subtle}; font-size: 0.875rem; }`,
  `@media (prefers-color-scheme: dark) { ` +
    `body { background-color: ${DARK.bg}; color: ${DARK.text}; } ` +
    `small { color: ${DARK.subtle}; } }`,
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
    `<small>${NOTE}</small>`,
    "</main>",
    '<script>window.addEventListener("online", () => window.location.reload());</script>',
    "</body>",
    "</html>",
  ].join("\n");
}
