/**
 * What the service worker adds to a saved copy before it serves it (spec 4.7.1):
 * a `<meta name="fxav-served">` that tells `<SavedCopyBar>` the serve mode and
 * the save time, and a `<style>` block that paints a sticky `body::before`
 * notice until the bar sets `data-fxav-bar="mounted"` on `<html>`.
 *
 * The notice is the part that matters. It is CSS, so it needs no element in the
 * body for React to reconcile, and it shows even when the page's JavaScript
 * never loads or never hydrates: a saved copy cannot appear without a notice.
 *
 * Pure and dependency-free: the worker bundle imports this file, and Vitest
 * imports the same source. The caller drops the stored `content-length` and
 * `content-encoding` headers when it builds the response; this only rewrites
 * the HTML.
 */
import { startTags } from "@/lib/offline/marker";
import type { ServeMode } from "@/lib/offline/navigation";

export type InjectOptions = {
  mode: ServeMode;
  /** The ISO time the copy was saved; written to `data-saved-at` for the bar to format. */
  savedAt: string;
  /** `Saved copy from {time}`, or `Saved copy` when the time is unknown. */
  noticeText: string;
};

/** Shown when the caller hands over a blank text: a served copy always says what it is. */
const FALLBACK_NOTICE = "Saved copy";

// A record, not a list, so a new ServeMode member fails to compile until it is added here.
const SERVE_MODES: Record<ServeMode, true> = {
  offline: true,
  slow: true,
  "server-error": true,
  ended: true,
};
const SERVE_MODE_NAMES: ReadonlySet<string> = new Set(Object.keys(SERVE_MODES));

/**
 * Inserts the meta and the style immediately after the first `<head>` start tag
 * (attributes allowed). A document with no head start tag gets both prepended:
 * the notice still shows, and nothing is dropped silently. Throws for a `mode`
 * outside the four serve modes; the caller only ever passes the union.
 */
export function injectSavedCopyHead(html: string, options: InjectOptions): string {
  if (!SERVE_MODE_NAMES.has(options.mode)) {
    throw new Error("injectSavedCopyHead: unknown saved-copy serve mode");
  }
  const meta =
    `<meta name="fxav-served" content="${options.mode}" ` +
    `data-saved-at="${escapeAttribute(options.savedAt)}">`;
  const style = `<style>${noticeCss(options.noticeText)}</style>`;

  const at = headStartTagEnd(html);
  return html.slice(0, at) + meta + style + html.slice(at);
}

/** The offset just past the first `<head ...>` start tag, or 0 when the document has none. */
function headStartTagEnd(html: string): number {
  for (const tag of startTags(html)) {
    if (tag.name === "head") return tag.end;
  }
  return 0;
}

// Enough for a double-quoted attribute value: the ampersand starts a reference and
// the quote ends the value.
const ATTRIBUTE_ESCAPES: ReadonlyMap<string, string> = new Map([
  ["&", "&amp;"],
  ['"', "&quot;"],
]);

function escapeAttribute(value: string): string {
  return value.replace(/[&"]/g, (char) => ATTRIBUTE_ESCAPES.get(char) ?? char);
}

// --- The notice ---------------------------------------------------------------

// Hex values are the runtime tokens in app/globals.css (--color-bg-runtime,
// --color-text-runtime, --color-border-runtime), light and dark. The page's own
// stylesheet is cached with every saved copy, so the custom properties resolve and
// follow the theme; the hex fallbacks cover a page whose stylesheet is missing.
const LIGHT = { bg: "#fafaf9", text: "#1a1b1f", border: "#e5e4e0" };
const DARK = { bg: "#0f1014", text: "#e8e6e0", border: "#2a2b30" };

const NOT_MOUNTED = 'html:not([data-fxav-bar="mounted"])';
const NOTICE_TARGET = `${NOT_MOUNTED} body::before`;
// The same two routes into dark that app/globals.css takes.
const DARK_BY_OS = `html:not([data-theme="light"]):not([data-fxav-bar="mounted"]) body::before`;
const DARK_BY_THEME = `html[data-theme="dark"]:not([data-fxav-bar="mounted"]) body::before`;

function colors(fallback: typeof LIGHT): string {
  return (
    `background: var(--color-bg, ${fallback.bg}); ` +
    `color: var(--color-text, ${fallback.text}); ` +
    `border-bottom: 1px solid var(--color-border, ${fallback.border});`
  );
}

function noticeCss(noticeText: string): string {
  const text = noticeText.trim() === "" ? FALLBACK_NOTICE : noticeText;
  const dark = `{ ${colors(DARK)} }`;
  return [
    `${NOTICE_TARGET} { content: "${escapeCssString(text)}"; position: sticky; top: 0; display: block; ` +
      `z-index: var(--z-index-sticky-banner, 100); box-sizing: border-box; padding: 0.5rem 1rem; ` +
      `font-size: 0.875rem; font-weight: 600; line-height: 1.4; ${colors(LIGHT)} }`,
    `@media (prefers-color-scheme: dark) { ${DARK_BY_OS} ${dark} }`,
    `${DARK_BY_THEME} ${dark}`,
  ].join("\n");
}

// A CSS string cannot hold a raw backslash, double quote or line break, and the
// text sits inside a <style> element, where "<" could start "</style>". Each is
// written as a CSS escape; the trailing space of a hex escape is its terminator.
const CSS_STRING_ESCAPES: ReadonlyMap<string, string> = new Map([
  ["\\", "\\\\"],
  ['"', '\\"'],
  ["<", "\\3C "],
  ["\n", "\\A "],
  ["\r", "\\D "],
  ["\f", "\\C "],
]);

function escapeCssString(text: string): string {
  return text.replace(/[\\"<\n\r\f]/g, (char) => CSS_STRING_ESCAPES.get(char) ?? char);
}
