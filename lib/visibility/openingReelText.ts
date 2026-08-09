/**
 * lib/visibility/openingReelText.ts — single source of truth for the §10
 * opening-reel URL-strip render contract (M4 Task 4.14).
 *
 * Why this exists:
 *
 *   The raw `event_details.opening_reel` cell can carry a Drive/Docs URL
 *   inline (e.g., `'YES - https://drive.google.com/file/d/abc/view'`).
 *   Rendering that string verbatim leaks Drive bytes-of-truth into the
 *   crew page — a violation of §10 / §7.3 (asset proxying is the only
 *   sanctioned path; raw URLs MUST NOT appear in crew DOM).
 *
 *   M4 ships URL-stripped TEXT only. Every `Opening reel: <value>` line
 *   on the crew page passes through this helper before it renders. The
 *   inline `<video src="/api/asset/reel/<show>">` element ships in M7
 *   Task 7.6 (additive — fed by post-Apply pin columns).
 *
 *   Crew DOM MUST NEVER contain `https://`, `drive.google.com`, or
 *   `docs.google.com` substrings for any opening-reel cell. The rule is
 *   pinned by `tests/visibility/openingReelText.ts`'s unit suite (the
 *   URL-strip value space) and by the crew-render assertion in
 *   `tests/components/crew/sections/GearSection.test.tsx`, which fails on
 *   any of those three substrings in the rendered section.
 *   `tests/e2e/empty-state.spec.ts` carried the AC-4.5 end-to-end variant;
 *   it was deleted 2026-08-09 (100% `describe.skip` against the retired
 *   ?crew= mock, executing in no workflow — spec docs/superpowers/specs/ci/
 *   2026-08-09-resurrect-mobile-safari-e2e-design.md §2.3). There is still no
 *   END-TO-END pin across the full documented value space.
 *
 * Strip rules:
 *
 *   1. Match `https?://(drive|docs).google.com/...` URL substrings and
 *      remove them. The pattern is intentionally substring-anchored
 *      (NOT line-anchored) — the URL can appear anywhere in the cell.
 *   2. Trim orphaned ` - ` connectors that the URL strip leaves behind
 *      (leading `- `, trailing ` -`). Doug's spreadsheet style uses
 *      ` - ` as the delimiter between status text and URL.
 *   3. Collapse whitespace runs to single spaces and trim outer
 *      whitespace.
 *
 * `null` input → empty string. Pure-URL cells (entire value is a Drive
 * URL → empty residue) also return empty string. Callers treat empty
 * residue as "hide the line" via `shouldHideOpeningReel` (see
 * `lib/visibility/emptyState.ts`).
 *
 * Pure function — no I/O, no side effects, deterministic.
 */

/**
 * Substring-anchored matcher for Google Drive / Docs URLs. The
 * `https?://` prefix is optional ONLY in name; in practice the spreadsheet
 * cells always carry it. Matching is greedy on non-whitespace so the
 * full URL (including query / fragment) is consumed.
 *
 * Mirrors `lib/parser/opening-reel.ts:15` — same regex shape, but emitted
 * here as `g` so repeated matches inside a single cell are all stripped.
 * The two modules deliberately don't share the constant: the parser
 * extracts the file id; this helper strips for render. Different
 * downstream contracts.
 */
const DRIVE_URL_RE = /(https?:\/\/)?(drive\.google\.com|docs\.google\.com)\/[^\s]+/g;

export function stripOpeningReelText(value: string | null): string {
  if (value == null) return "";
  return (
    value
      // 1. Strip every Drive/Docs URL substring.
      .replace(DRIVE_URL_RE, "")
      // 2a. Trailing orphan connector (`YES -` after URL strip).
      .replace(/\s*-\s*$/, "")
      // 2b. Leading orphan connector (`- YES`).
      .replace(/^\s*-\s*/, "")
      // 3. Collapse whitespace runs.
      .replace(/\s+/g, " ")
      .trim()
  );
}
