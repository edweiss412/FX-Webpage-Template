/**
 * tests/_shared/zLevel.ts
 *
 * The numeric stacking level a class string resolves to — ONE copy.
 *
 * There were two, and that is the whole reason this file exists. When the
 * semantic band scale landed (BL-ADMIN-SEMANTIC-Z-INDEX-SCALE, M-wave 2 §2.6),
 * `shareHub.test.tsx`'s copy learned the band names and
 * `publishedReviewModal.test.tsx`'s copy did not — so a `z-30` swept to `z-nav`
 * read as level 0 in one file and 30 in the other, and the elevation assertion
 * went red against a correct implementation. A helper duplicated across two
 * suites is a guard that is only as current as its least-maintained copy.
 *
 * Assertions on ORDERING stay numeric on purpose: the rule being encoded is
 * "this must sit above that", and the bands are names for the numbers, not a
 * replacement for them.
 */

/** The band scale declared in `app/globals.css` `@theme`. */
export const Z_BAND_LEVELS: Record<string, number> = {
  raised: 10,
  dropdown: 20,
  nav: 30,
  banner: 40,
  overlay: 50,
  "dev-controls": 60,
  "sticky-banner": 100,
};

/**
 * Highest stacking level any token in `cls` sets, or 0 if none does.
 *
 * Handles the four shapes a level can take: a band name (`z-nav`), a bare
 * numeral (`z-30`), an arbitrary value (`z-[30]`), and a negative (`-z-10`,
 * which reads as -10 and therefore never raises the max above 0). A variant
 * prefix is allowed before the token and a trailing `!` after it — Tailwind
 * v4's important modifier is a real and plausible way to force an elevation.
 */
export function maxZLevel(cls: string): number {
  let max = 0;
  for (const tok of cls.split(/\s+/).filter(Boolean)) {
    const m = /(?:^|:)(-?)z-(?:\[(-?\d+)\]|(\d+)|([a-z-]+))!?$/.exec(tok);
    if (!m) continue;
    const raw = m[2] ?? m[3] ?? (m[4] !== undefined ? String(Z_BAND_LEVELS[m[4]] ?? "") : "");
    if (raw === "") continue;
    const n = (m[1] === "-" ? -1 : 1) * Number(raw);
    if (n > max) max = n;
  }
  return max;
}
