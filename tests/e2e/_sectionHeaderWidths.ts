/**
 * The header-row content-box widths the section-header probes measure at.
 *
 * ONE definition, imported by three consumers, because they answer two halves of
 * one question and a drift between them would make both halves vacuous:
 *
 *   - `_sectionHeaderCellHarness.tsx` renders each of the 15 matrix cells INTO a
 *     container of this width, so every geometry assertion in
 *     `section-header-layout.layout.spec.ts` is conditioned on it.
 *   - `admin-layout-dimensions.spec.ts` asserts the REAL `ShowReviewSurface` mount
 *     produces exactly these widths at the same viewports. Without that, the whole
 *     61-case matrix could be measuring a width the product never renders — the
 *     numbers were derived by measurement once, and nothing pinned them afterwards.
 *
 * Plain `.ts` on purpose: the real-route spec runs under the main Playwright
 * config, whose loader rewrites JSX in every `.tsx` it touches. Importing the
 * harness for this constant would drag the whole component tree through that
 * transform. Values, not components, are what both sides need.
 *
 * Derivation, so a future viewport can be added without re-measuring blind:
 *   320 -> 280   the sheet presentation's pane, minus 20px tile padding per side
 *   375 -> 335   same, at the reference phone width
 *   430 -> 390   same, at the largest phone width supported
 *  1280 -> 744   the two-pane popup's content pane, MEASURED on the real route
 *
 * The 1280 figure was 561 until the real-route assertion first ran and reported
 * 744 on all twelve rendered sections. 561 was a spec-time estimate of the pane,
 * never a measurement, and nothing had compared it to the product — which is the
 * whole reason the chain assertion exists. The phone widths are unchanged: 375
 * passed at 335 on the same run, confirming the viewport-minus-40 derivation.
 */
export const ROW_WIDTHS = { 320: 280, 375: 335, 430: 390, 1280: 744 } as const;

/** Viewport widths the real-route width-chain assertion covers — the subset of
 *  `ROW_WIDTHS` the hydrated modal suite already loads. */
export const REAL_ROUTE_WIDTHS = [375, 1280] as const;
