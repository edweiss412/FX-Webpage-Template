// The frozen mono manifest.
//
// WHY A MANIFEST AT ALL, rather than classifying each element by the family its
// cascade selects. That is circular: the oracle would derive its expectation
// from the thing it is supposed to validate, and BOTH directions escape --
//
//   delete `font-mono` from ShowsTableHeading  -> the deliberately monospace
//     heading inherits Inter, is classified as sans, and passes the Inter check
//   add `font-mono` to the <h1> on /me         -> a deliberately sans heading is
//     classified as mono and receives no Inter check at all
//
// Every static row, subset probe and face-set assertion stays green in both
// cases, because the rendering IS a genuine committed family -- just the wrong
// one for that element. Membership has to be the expectation, and the rendering
// the thing under test, or they are the same object.
//
// THE IDENTITY MODEL IS THE LOAD-BEARING PART, and the obvious keys are
// circular too. Keying on `.font-mono`, or on `code`/`pre` tag names, would mean
// deleting the class or changing the tag also changes the expected set -- which
// is exactly the defect above, one level up. Entries key on identity that
// SURVIVES a typography change: a `data-testid` where one exists, otherwise a
// role-plus-accessible-name pair.
//
// A deliberate typography change therefore requires editing this file in the
// same diff. That is the property wanted, not an inconvenience: "someone
// changed which elements are monospace" is precisely the event that should
// require review.

/** How much of the matched subtree is expected to render monospace. */
export type MonoScope = "element" | "subtree";

export interface MonoSurface {
  /** Route the entry applies to, as the census navigates it. */
  readonly route: string;
  /** Stable selector: a data-testid, or a role/name pair rendered as a selector. */
  readonly selector: string;
  /** `subtree` when a container carries the utility for a whole region. */
  readonly scope: MonoScope;
  /** Why this surface is deliberately monospace. */
  readonly reason: string;
}

/**
 * Seeded from an AST walk of every tracked `.tsx` under `app/` and
 * `components/`, measured 2026-08-04:
 *
 *   semantic mono elements (code/kbd/samp/pre):  26 across 6 files
 *   font-mono utilities:                          9 across 6 files
 *
 * Derived with a TypeScript JSX walk, never a line grep -- a grep counts
 * matching LINES and miscounts in both directions here: `<pre` matches the word
 * `<prefix>` in prose, and a documentation placeholder `<code>` is not a
 * rendered surface. Re-derive before trusting these numbers; the walk is the
 * instrument, the counts are its output on that date.
 *
 * Plus the `<code>` elements MDX compiles to across the 13 help pages, which
 * Tailwind preflight puts on the mono stack via `code, kbd, samp, pre`.
 */
export const MONO_SURFACES: readonly MonoSurface[] = [
  {
    route: "/admin",
    // Anchored to the SIBLING's data-testid, because the heading itself carries
    // none and its accessible name is the folder name -- dynamic, so unusable
    // as a stable key. A structural selector is what the manifest's own doc
    // comment promised and what `collectFontFindings` now evaluates in-page.
    selector: '[data-testid="shows-heading-eyebrow"] ~ h3',
    scope: "element",
    reason:
      "components/admin/ShowsTableHeading.tsx:39 renders the watched Drive FOLDER NAME in " +
      "font-mono, paired with its 'Watched folder' eyebrow: an identifier, treated like one. " +
      "Missed when this manifest was seeded because the AST walk that seeded it produced " +
      "COUNTS (9 font-mono utilities across 6 files), never per-route coverage -- so a site " +
      "that was counted still had no row. Found by real CI on mobile-safari, where the " +
      "heading renders and the census expected Inter.",
  },
  {
    route: "/admin/dev",
    selector: "main",
    scope: "subtree",
    reason:
      "app/admin/dev/page.tsx puts font-mono on the entire <main>, so every descendant inherits " +
      "it. One subtree entry rather than 17 element entries.",
  },
  {
    route: "/admin/dev/attention-gallery",
    selector: "code",
    scope: "element",
    reason: "semantic <code> in the gallery's caption",
  },
  {
    route: "/help/errors",
    selector: "code",
    scope: "element",
    reason:
      "error codes rendered as semantic <code>; Tailwind preflight puts code/kbd/samp/pre on " +
      "the mono stack",
  },
] as const;

/**
 * Routes whose MDX body compiles inline backticks to `<code>`.
 *
 * Listed as a class rather than one entry per element: the count moves with
 * every documentation edit, and pinning it would make prose changes fail a
 * typography guard. What is pinned is that `<code>` on a help route is
 * EXPECTED-mono, which is preflight's own rule.
 */
export const MDX_CODE_ROUTE_PREFIX = "/help";

/**
 * True when an element on `route` matching `selector` is expected to render
 * monospace.
 *
 * Elements matching no entry are expected-Inter, so THE DEFAULT IS THE
 * ASSERTION and a new surface is covered without anyone adding a row.
 */
export function isExpectedMono(
  route: string,
  matches: (selector: string) => boolean,
  tagName: string,
): boolean {
  if (route.startsWith(MDX_CODE_ROUTE_PREFIX) && tagName === "CODE") return true;
  return MONO_SURFACES.some((entry) => entry.route === route && matches(entry.selector));
}

/**
 * Entries that apply to a route, for the census's freshness assertion.
 *
 * FRESHNESS RUNS IN THE CENSUS ONLY, never in the shared fixture. "Every entry
 * matches at least one element on its route" is a claim about REAL ROUTES;
 * evaluated against a harness document -- which has no route at all, since
 * setContent leaves the URL at about:blank -- it would mark every entry stale
 * and fail all 32 callers the moment the fixture landed.
 */
export function entriesForRoute(route: string): readonly MonoSurface[] {
  return MONO_SURFACES.filter((entry) => entry.route === route);
}
