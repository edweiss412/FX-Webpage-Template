/**
 * lib/ui/scrollSpy.ts: the scroll-spy rule both section rails share.
 *
 * The admin review rail (`components/admin/review/ShowReviewSurface.tsx`) and
 * the crew page's wide nav (`components/crew/CrewWideNav.tsx`) both mark the
 * section in view with this rule and hold it still while a nav click scrolls
 * (crew page redesign spec §5.3). It lives outside `components/admin/**` so the
 * crew page never imports admin code. `ShowReviewSurface` re-exports every name
 * here, so its importers resolve them from the old path unchanged.
 *
 * Behavioral thresholds, not rendered visual values: they never paint a px
 * (DESIGN.md §5.5).
 *
 * Pure and server-safe.
 */

/** Scroll-spy anchor offset: a section is "active" once its top passes this
 *  many px below the scroller's top (admin spec §6.3a). */
export const SCROLL_SPY_OFFSET_PX = 90;
/** §A2 fallback release of the nav-click scroll-spy suppression when a
 *  programmatic glide never settles (zero-event and interrupted glides).
 *  Measured from the click/jump AND from every suppressed scroll-progress
 *  frame (the spy's evaluate restarts it while the glide is in flight), so a
 *  healthy glide longer than this window is NOT cut short. */
export const NAV_SCROLL_SETTLE_TIMEOUT_MS = 700;
/** §A2 settle tolerance: |scrollTop − target| at/below this many px releases
 *  the nav-click scroll-spy suppression. */
export const NAV_SCROLL_SETTLE_EPSILON_PX = 2;

/**
 * Pure scroll-spy rule (spec §6.3a): the active section is the LAST one whose
 * top is at/above `scrollTop + SCROLL_SPY_OFFSET_PX`; when the pane is scrolled
 * to the bottom the last section wins (it may be too short to ever cross the
 * offset line).
 */
export function activeSectionFor(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  // Phase 2 (spec §5/§10): rail item ids are `SectionId | ExtraSection.id`
  // (`"overview"`/`"changes"`), so the pure spy rule reads string ids.
  sectionTops: ReadonlyArray<{ id: string; top: number }>,
): string {
  const first = sectionTops[0];
  if (!first) return "warnings"; // registry always renders ≥11 sections; defensive only
  const last = sectionTops[sectionTops.length - 1] ?? first;
  if (scrollTop + clientHeight >= scrollHeight - 1) return last.id;
  let current = first.id;
  for (const s of sectionTops) {
    if (s.top <= scrollTop + SCROLL_SPY_OFFSET_PX) current = s.id;
    else break;
  }
  return current;
}
