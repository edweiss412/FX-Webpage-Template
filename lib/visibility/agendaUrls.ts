/**
 * lib/visibility/agendaUrls.ts — render-time URL sanitizer for AGENDA
 * run-of-show free-text fields (title / room / av), Phase-2 §4.3.
 *
 * Broader than stripOpeningReelText's DRIVE_URL_RE (Drive/Docs only): agenda
 * cells can paste Zoom / Teams / signed-CDN links, so this strips EVERY schemed
 * URL plus scheme-less Google links. The DOM invariant it upholds is exactly:
 * no `https://`, `http://`, `drive.google.com`, or `docs.google.com` substring
 * in the crew DOM.
 *
 * DOCUMENTED LIMITATION (spec §4.3, do-not-relitigate): a scheme-less NON-Google
 * bare domain (e.g. `zoom.us/j/1`, `teams.microsoft.com/l/…`) is NOT stripped —
 * deliberately, because (i) pasted links carry a scheme in practice and (ii) a
 * general `\w+\.\w+/\S+` stripper would over-strip legitimate agenda text
 * (`A/V`, a room labeled `5/6`, `Q&A w/ X`).
 *
 * Pure function — no I/O, deterministic. Reuses the orphan-connector +
 * whitespace cleanup chain from stripOpeningReelText (openingReelText.ts:62-68).
 */

/**
 * Every schemed URL (greedy on non-whitespace) — covers Zoom/Teams/CDN/Drive/Docs
 * WITH a scheme. CASE-INSENSITIVE (`i`): `HTTPS://…`, `Https://…` must strip too,
 * else the lowercased-DOM invariant (`out.toLowerCase()` must not contain
 * `https://`/`http://`) is violated by an uppercase paste.
 */
const SCHEMED_URL_RE = /https?:\/\/\S+/gi;
/**
 * Scheme-less Google Drive/Docs links (Doug sometimes omits the scheme).
 * CASE-INSENSITIVE (`i`): `Drive.Google.com/…` / `DOCS.GOOGLE.COM/…` must strip too,
 * else the lowercased-DOM `drive.google.com`/`docs.google.com` invariant leaks.
 */
const SCHEMELESS_GOOGLE_RE = /(?:drive|docs)\.google\.com\/\S+/gi;

export function stripAgendaUrls(value: string): string {
  return (
    value
      .replace(SCHEMED_URL_RE, "")
      .replace(SCHEMELESS_GOOGLE_RE, "")
      // Orphan connectors the URL strip leaves behind (mirrors openingReelText).
      .replace(/\s*-\s*$/, "")
      .replace(/^\s*-\s*/, "")
      // Collapse whitespace runs + trim.
      .replace(/\s+/g, " ")
      .trim()
  );
}
