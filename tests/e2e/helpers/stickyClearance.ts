/**
 * tests/e2e/helpers/stickyClearance.ts: whether an element the crew page
 * scrolled to, and the focus ring drawn around it, are clear of the page's
 * sticky chrome (crew page redesign UI-gate re-run, audit P1-1 and P3-1).
 *
 * `toBeInViewport()` measures intersection with the viewport, not what covers
 * the element: a run-of-show line that a search reveal parked fully under the
 * sticky header still intersects the viewport, so the gate's own reveal test
 * passed while the line could not be seen. This reads occlusion instead:
 *   - the topmost element one pixel inside the target's top edge is the target
 *     or something inside it, never the header or the preview banner;
 *   - the row one ring-width above that edge, where the focus ring's top is
 *     drawn, is on screen and not in the header or the banner;
 *   - the ring's top sits at or below the lowest sticky edge on the page.
 *
 * The page is read once its scroll has settled: a smooth scroll carries the
 * target up from below, clear of the header on every frame but its last, so a
 * read (or a poll) during the glide would pass on the frame before the defect.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * How far the focus ring reaches past its element: the global `:focus-visible`
 * rule's 3px outline at a 2px offset (app/globals.css). The search reveal's own
 * ring (`[data-search-reveal]`, 2px at 2px) reaches less, so this covers both.
 */
export const FOCUS_RING_REACH_PX = 5;

/** The crew page's sticky chrome: the header (sticky from 1024px) and the preview banner. */
const CHROME = '[data-testid="page-header"], [data-testid="admin-preview-banner"]';

/** Resolves once `window.scrollY` has held still for several frames, or after 3s. */
export async function settleScroll(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const deadline = performance.now() + 3_000;
        let last = window.scrollY;
        let still = 0;
        const tick = () => {
          if (window.scrollY === last) still += 1;
          else {
            still = 0;
            last = window.scrollY;
          }
          if (still >= 6 || performance.now() > deadline) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

export type StickyClearance = {
  top: number;
  /** The lowest bottom edge among the sticky or fixed chrome on screen; 0 when none sticks. */
  chromeBottom: number;
  /** What `elementFromPoint` returns one pixel inside the target's top edge. */
  topHit: string;
  topIsTarget: boolean;
  /** The focus ring's top row is inside the viewport. */
  ringOnScreen: boolean;
  /** The focus ring's top row is drawn under the header or the banner. */
  ringUnderChrome: boolean;
};

/** One in-page read of the target against the sticky chrome. */
export async function readStickyClearance(target: Locator): Promise<StickyClearance> {
  return target.evaluate(
    (el, { reach, chrome }) => {
      const describe = (n: Element | null) =>
        n === null
          ? "nothing"
          : (n.closest("[data-testid]")?.getAttribute("data-testid") ?? n.tagName.toLowerCase());
      const r = el.getBoundingClientRect();
      let chromeBottom = 0;
      for (const c of document.querySelectorAll(chrome)) {
        const position = getComputedStyle(c).position;
        if (position !== "sticky" && position !== "fixed") continue;
        chromeBottom = Math.max(chromeBottom, c.getBoundingClientRect().bottom);
      }
      const x = r.left + r.width / 2;
      const atTop = document.elementFromPoint(x, r.top + 1);
      const ringY = r.top - reach;
      const atRing = ringY >= 0 ? document.elementFromPoint(x, ringY) : null;
      return {
        top: r.top,
        chromeBottom,
        topHit: describe(atTop),
        topIsTarget: atTop !== null && el.contains(atTop),
        ringOnScreen: ringY >= 0,
        ringUnderChrome: atRing?.closest(chrome) != null,
      };
    },
    { reach: FOCUS_RING_REACH_PX, chrome: CHROME },
  );
}

/** Asserts the target and its focus ring are clear of the sticky chrome, once scroll settles. */
export async function expectClearOfStickyChrome(target: Locator, label: string): Promise<void> {
  await settleScroll(target.page());
  const m = await readStickyClearance(target);
  const at = `${label} ${JSON.stringify(m)}`;
  expect(m.topIsTarget, `${label}: its top edge is covered ${at}`).toBe(true);
  expect(m.ringOnScreen, `${label}: its focus ring's top is above the viewport ${at}`).toBe(true);
  expect(m.ringUnderChrome, `${label}: its focus ring's top is under the chrome ${at}`).toBe(false);
  expect(
    m.top - FOCUS_RING_REACH_PX,
    `${label}: its focus ring starts above the sticky edge ${at}`,
  ).toBeGreaterThanOrEqual(m.chromeBottom - 0.5);
}
