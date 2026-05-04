/**
 * tests/e2e/helpers/layout.ts — shared scaffolding for the §8.4
 * dimensional-invariant suite (M4 Task 4.13 layout-dimensions Playwright
 * tests; AC-4.4).
 *
 * The layout-dimensions suite has 12+ test cases that all repeat the
 * same setViewportSize → goto(`/show/${slug}?crew=${crewId}`) prelude.
 * Concentrating that boilerplate here keeps the spec file scannable and
 * forces every author to use the same canonical navigation step (so a
 * future change — pre-render wait, network-idle gate, etc. — has a
 * single edit site).
 *
 * Mirrors the in-repo style of `helpers/rightNow.ts` (lookupSeededShow,
 * pinClock, advanceClock).
 */
import type { Page } from "@playwright/test";

export type Viewport = { width: number; height: number };

/**
 * Common viewports for the §8.4 invariants. Named because the tile-grid
 * column count (Invariant 2) hinges on Tailwind breakpoints — 390px
 * (mobile, 2 cols), 800px (tablet inside [640,1024), 3 cols), 1200px
 * (desktop ≥1024, 4 cols), 1024px (boundary used by Invariant 1).
 */
export const VIEWPORTS = {
  mobile390: { width: 390, height: 844 },
  /** 800px sits comfortably inside Tailwind's `sm` (≥640) range and
   * below `lg` (≥1024) — exercises the 3-column tablet layout. */
  tablet800: { width: 800, height: 800 },
  desktop1024: { width: 1024, height: 800 },
  desktop1200: { width: 1200, height: 800 },
  /** Tall mobile viewport for the §8.4 invariant 5 short-content
   * branch — picks a height generous enough to fit the full stripped
   * page so the `mt-auto` footer anchors to the viewport bottom. */
  mobile390Tall: { width: 390, height: 2400 },
} as const;

/**
 * Set the viewport (if provided) and navigate to the crew-page URL.
 * Centralizes the duplicated setViewportSize → goto sequence used by
 * every layout-dimensions test case.
 *
 * Usage:
 *   await gotoCrewPage(page, slug, crewId, { viewport: VIEWPORTS.mobile390 });
 *
 * Omit `viewport` to inherit Playwright's default (e.g., when a test
 * resizes between assertions and doesn't want a setup-time resize).
 */
export async function gotoCrewPage(
  page: Page,
  slug: string,
  crewId: string,
  options?: { viewport?: Viewport },
): Promise<void> {
  if (options?.viewport) {
    await page.setViewportSize(options.viewport);
  }
  await page.goto(`/show/${slug}?crew=${crewId}`);
}

/**
 * Read `getComputedStyle(tileGrid).gridTemplateColumns` and return the
 * canonical column count, robust to BOTH of Tailwind v4's emitted
 * forms:
 *
 *   • Expanded form  → "1fr 1fr 1fr"        (today's default — 3 cols)
 *   • Repeat form    → "repeat(3, 1fr)"     (some plugin / token tweaks
 *                                            switch to this; we must
 *                                            handle it without lying)
 *
 * The naive approach (`cols.trim().split(/\s+/).length`) misreports the
 * repeat() form as 1 — that's the Important 2 finding from review.
 *
 * Path:
 *   1. Sanity-check that the resolved string starts with a digit OR
 *      with `repeat(` — fail loudly if Tailwind ever emits a third
 *      form we haven't accounted for (e.g., `minmax(...)` direct).
 *   2. If `repeat(N, ...)`, parse N out of the prefix.
 *   3. Otherwise, count whitespace-separated track tokens.
 *
 * Returns `{ cols, count }` so callers can include the raw value in
 * their assertion message.
 */
export async function tileGridColumnCount(
  page: Page,
): Promise<{ cols: string; count: number }> {
  const cols = await page
    .getByTestId("tile-grid")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns);

  // Step 1: shape sanity. If the browser ever returns "none" (no grid)
  // or some unanticipated function syntax, we want a screaming failure
  // here, not a silent miscount downstream.
  if (!/^(\d|repeat\()/.test(cols)) {
    throw new Error(
      `tileGridColumnCount: unexpected gridTemplateColumns shape — got "${cols}". ` +
        `Expected either an expanded "Npx Npx ..." / "1fr 1fr ..." form or a "repeat(N, …)" form. ` +
        `If Tailwind v4 changed its emission, update this helper.`,
    );
  }

  // Step 2: repeat(N, ...) form — extract N from the prefix.
  const repeatMatch = cols.match(/^repeat\(\s*(\d+)\s*,/);
  if (repeatMatch) {
    return { cols, count: Number(repeatMatch[1]) };
  }

  // Step 3: expanded form — count whitespace-separated tokens.
  const count = cols.trim().split(/\s+/).filter(Boolean).length;
  return { cols, count };
}
