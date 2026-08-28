/**
 * Diagram tile geometry — the `sizes` string the tile ships and the width it
 * actually occupies, in ONE module so they cannot disagree.
 *
 * It lives apart from `step3ReviewSections.tsx` for a mechanical reason, not a
 * stylistic one: `tests/e2e/published-review-modal.layout.spec.ts` imports
 * `diagramTileWidthAt` as its oracle, and that spec is matched by the MAIN
 * Playwright config, which `tests/ci/_metaSpecRegistration.test.ts` enumerates
 * with `playwright test --list`. Importing the 4,500-line `"use client"`
 * component from a spec made that enumeration exit 1 on CI while passing
 * locally in every form tried, `CI=true` included. This module has no JSX, no
 * `"use client"`, and no component imports, so listing it costs nothing.
 *
 * The oracle still reads the SHIPPED value: the component imports
 * `DIAGRAM_TILE_SIZES` from here and passes it as the `sizes` prop, so there is
 * exactly one definition and the test cannot drift from what renders.
 */

/**
 * The grid the tiles live in, expressed for `next/image`'s `sizes`.
 *
 * Exact rather than approximate, and the exactness is load-bearing: an
 * approximation of this layout ("(min-width: 1024px) 170px, (min-width: 640px)
 * 23vw, 25vw") selects a DIFFERENT ladder tier from the true width at 215 of the
 * 3,843 (viewport, DPR) points between 320 and 1600 — in both directions, so it
 * both ships bytes nobody needs and ships a blurry thumbnail.
 *
 * `calc()` is deliberate. next's `getWidths` scans `sizes` with
 * /(^|\s)(1?\d?\d)vw/g; inside `calc(25vw` the digits are preceded by `(`, so
 * nothing matches and next falls back to the full candidate list, which is the
 * most generous set. The browser then evaluates the calc precisely.
 */
export const DIAGRAM_TILE_SIZES =
  "(min-width: 1072px) 169.5px, (min-width: 1024px) calc(25vw - 98.5px), (min-width: 640px) calc(25vw - 38.5px), calc(33.3333vw - 32.6667px)";

/** Every term of the chain above, named once so `DIAGRAM_TILE_SIZES` and the
 *  real-browser measurement have one source to disagree with. */
const MODAL_OUTER_PAD = 48; // sm:p-6, both sides — ReviewModalShell.tsx
const MODAL_PANEL_MAX = 1024; // sm:max-w-5xl
const MODAL_RAIL = 240; // w-60, shown at lg: — ShowReviewSurface.tsx
const CONTENT_PAD = 40; // p-tile-pad, both sides
const CARD_BOX = 42; // p-tile-pad both sides + 1px border both sides
const TILE_GAP = 8; // gap-2

/**
 * The CSS width one diagram tile occupies at a given viewport.
 *
 * The tile is constant only from 1072px up, not from 1024px: the panel does not
 * reach its max-width until the modal's own outer padding is paid.
 */
export function diagramTileWidthAt(viewportPx: number): number {
  const panel = Math.min(viewportPx - (viewportPx >= 640 ? MODAL_OUTER_PAD : 0), MODAL_PANEL_MAX);
  const main = viewportPx >= 1024 ? panel - MODAL_RAIL : panel;
  const card = main - CONTENT_PAD - CARD_BOX;
  const cols = viewportPx >= 640 ? 4 : 3;
  return (card - TILE_GAP * (cols - 1)) / cols;
}
