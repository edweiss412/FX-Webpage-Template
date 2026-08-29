/**
 * tests/e2e/help-tour-layout-dimensions.spec.ts
 *
 * Real-browser layout contract for the /help tour card grids and the /help/errors
 * jump list. jsdom computes no layout, so none of this is expressible in a unit test.
 *
 * WHY COLUMN COUNTS AND NOT ONLY MEASURES. A permanently single-column page satisfies
 * every measure assertion here: one column is 65.8ch, well over the floor; it never
 * crosses the floor; it cannot overflow; and one column never wraps. The whole change
 * could fail to happen with every other criterion green. AC-1d is the criterion that
 * sees it, and it asserts COUNTS.
 *
 * WHY THESE VIEWPORTS. `auto-fit` has no breakpoint — the column count is continuous in
 * container width — and the shell adds a 240px sidebar plus a 24px gap at `md`, so the
 * container is NOT monotonic in viewport: it grows, DROPS at 768, then grows again. A
 * matrix of round numbers cannot see a transition, and this layout has three. Every
 * threshold below was measured by the 4px sweep in spec §2.3.
 */
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers/signInAs";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { premise, premiseHolds } from "@/tests/_shared/premise";

/** Measured floor for card body copy. NOT DESIGN.md §2.5's 65-75ch, which is a CAP on
 *  long-form prose: no multi-column card grid on an 856px column can reach it (three
 *  columns cannot exceed 24ch, two cannot exceed 38ch). Spec §8 states the derivation. */
const MEASURE_FLOOR_CH = 28;

/** DESIGN.md §2.5 caps body copy at 65-75ch. The floor above is this arc's own,
 *  derived in spec §8 because no multi-column card can reach 65ch; the CEILING is
 *  the documented one, and it still binds — a full-span card is single-column, the
 *  exact case the floor's derivation does not cover. */
const MEASURE_CEILING_CH = 75;

/** Sampled thresholds, from the spec §2.3 sweep. 752 and 1016 are the two-column
 *  switches; 768 is where the sidebar drops the container and the grid falls back to
 *  one column; 320 is the overflow pin; 390 is the mobile case asserted UNCHANGED. */
const TOUR_SEQUENCE: ReadonlyArray<{ vw: number; cols: number }> = [
  { vw: 390, cols: 1 },
  { vw: 752, cols: 2 },
  { vw: 768, cols: 1 },
  { vw: 1016, cols: 2 },
];
const ERRORS_SEQUENCE: ReadonlyArray<{ vw: number; cols: number }> = [
  { vw: 320, cols: 1 },
  { vw: 640, cols: 2 },
  { vw: 768, cols: 1 },
  { vw: 904, cols: 2 },
];
const MEASURE_VIEWPORTS = [752, 768, 1016, 1024, 1280] as const;
const MOBILE_BASELINE = { vw: 390, cols: 1, measureCh: 31.4 } as const;

/** One evaluate per viewport. `boundingBox()` is viewport-relative and actionability
 *  scrolls, so two separate Locator reads can report geometry that never coexisted. */
async function readTour(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main") as HTMLElement;
    const grids = Array.from(
      document.querySelectorAll("main .help-prose div.grid"),
    ) as HTMLElement[];
    const w = (el: Element) => +el.getBoundingClientRect().width.toFixed(1);
    return {
      mainWidth: w(main),
      grids: grids.map((g) => {
        // EVERY card, not the first. Sampling one card per grid missed the
        // col-span-full card entirely — it is card 3 of grid 1, and it is the
        // widest thing on the page, so it is exactly the one a floor-only
        // assertion on card 1 cannot see.
        const cards = Array.from(g.querySelectorAll("a[data-tour-card]")) as HTMLElement[];
        const bodies = cards
          .map((c) => c.querySelector("p") as HTMLElement | null)
          .filter((b): b is HTMLElement => b !== null);
        let ch = 0;
        const body = bodies[0] ?? null;
        if (body) {
          const cs = getComputedStyle(body);
          const ctx = document.createElement("canvas").getContext("2d");
          if (ctx) {
            ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            ch = ctx.measureText("0".repeat(50)).width / 50;
          }
        }
        const tracks = getComputedStyle(g).gridTemplateColumns.trim();
        // The resolved width of the FIRST track. A minimum that cannot shrink
        // overflows the TRACK while the grid element stays at container width, so
        // an element-vs-container comparison can never see it.
        const firstTrack = /repeat\(|minmax\(|none/.test(tracks) ? -1 : parseFloat(tracks);
        return {
          // Refuse a count we cannot resolve rather than reporting one that is not a
          // number: on a non-grid element this string is the unresolved repeat(...).
          cols:
            !tracks || tracks === "none" || /repeat\(|minmax\(/.test(tracks)
              ? -1
              : tracks.split(/\s+/).length,
          gridWidth: w(g),
          firstTrack,
          cardCount: g.querySelectorAll("a[data-tour-card]").length,
          measureCh: body && ch ? +(w(body) / ch).toFixed(1) : -1,
          // every card body's measure, so a ceiling can be asserted over all of them
          measuresCh: ch ? bodies.map((b) => +(w(b) / ch).toFixed(1)) : [],
        };
      }),
    };
  });
}

test.describe("/help/tour card grids — real-browser layout", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("AC-1d: the tour's column sequence holds, including the drop at md", async ({ page }) => {
    await page.goto("/help/tour", { waitUntil: "networkidle" });
    // Readiness gate. `networkidle` alone is not one: it says the network went quiet,
    // not that the grid laid out.
    await expect(page.locator("main .help-prose div.grid").first()).toBeVisible();

    for (const { vw, cols } of TOUR_SEQUENCE) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await readTour(page);
      premise(`the tour renders card grids at ${vw}px`, m.grids.length, 0);
      for (const [i, g] of m.grids.entries()) {
        premiseHolds(`grid ${i + 1} resolves a column count at ${vw}px`, g.cols > 0);
        premise(`grid ${i + 1} renders cards at ${vw}px`, g.cardCount, 0);
        expect(g.cols, `grid ${i + 1} at ${vw}px`).toBe(cols);
      }
    }
  });

  test("AC-1: every card body clears the measure floor at each desktop threshold", async ({
    page,
  }) => {
    await page.goto("/help/tour", { waitUntil: "networkidle" });
    await expect(page.locator("main .help-prose div.grid").first()).toBeVisible();

    for (const vw of MEASURE_VIEWPORTS) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await readTour(page);
      premise(`the tour renders card grids at ${vw}px`, m.grids.length, 0);
      for (const [i, g] of m.grids.entries()) {
        premise(`grid ${i + 1} measures a card body at ${vw}px`, g.measureCh, 0);
        premise(`grid ${i + 1} measures EVERY card at ${vw}px`, g.measuresCh.length, 0);
        for (const [j, measure] of g.measuresCh.entries()) {
          expect(measure, `grid ${i + 1} card ${j + 1} measure at ${vw}px`).toBeGreaterThanOrEqual(
            MEASURE_FLOOR_CH,
          );
          // A CEILING as well as a floor. DESIGN.md §2.5 caps body copy at 75ch, and
          // an AC-1 with only a floor cannot see a card that is too WIDE — which is
          // exactly what the impeccable gate found: the col-span-full card reached
          // 80.9ch inside a bled grid, up from 65.8ch before this change. A floor-only
          // criterion called that an improvement.
          expect(measure, `grid ${i + 1} card ${j + 1} measure at ${vw}px`).toBeLessThanOrEqual(
            MEASURE_CEILING_CH,
          );
        }
      }
    }
  });

  test("AC-1a: the mobile case is UNCHANGED, not improved", async ({ page }) => {
    await page.goto("/help/tour", { waitUntil: "networkidle" });
    await expect(page.locator("main .help-prose div.grid").first()).toBeVisible();
    await page.setViewportSize({ width: MOBILE_BASELINE.vw, height: 900 });

    const m = await readTour(page);
    premise("the tour renders card grids at 390px", m.grids.length, 0);
    for (const [i, g] of m.grids.entries()) {
      expect(g.cols, `grid ${i + 1} stays single-column at 390px`).toBe(MOBILE_BASELINE.cols);
      // Within a character of the recorded baseline: this is a desktop change and
      // mobile must not move. A repair that improved desktop by touching mobile
      // would pass every other criterion here.
      expect(g.measureCh, `grid ${i + 1} measure at 390px`).toBeGreaterThan(
        MOBILE_BASELINE.measureCh - 1,
      );
      expect(g.measureCh, `grid ${i + 1} measure at 390px`).toBeLessThan(
        MOBILE_BASELINE.measureCh + 1,
      );
    }
  });

  test("AC-1c: no grid overflows its container, pinned at the narrowest real width", async ({
    page,
  }) => {
    await page.goto("/help/tour", { waitUntil: "networkidle" });
    await expect(page.locator("main .help-prose div.grid").first()).toBeVisible();

    for (const vw of [320, 390, 752, 1280]) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await readTour(page);
      premise(`the tour renders card grids at ${vw}px`, m.grids.length, 0);
      for (const [i, g] of m.grids.entries()) {
        // The TRACK, not the grid element. A grid element is a block child and sits
        // at container width whatever its tracks do, so comparing it to the container
        // is a tautology — it can never fail. The violation inventory caught exactly
        // that: staging a bare 22rem minimum produced NO red here until this line
        // read the track instead.
        premiseHolds(`grid ${i + 1} resolves a track width at ${vw}px`, g.firstTrack > 0);
        expect(
          g.firstTrack,
          `grid ${i + 1} track within its container at ${vw}px`,
        ).toBeLessThanOrEqual(m.mainWidth + 0.5);
      }
    }
  });
});

test.describe("/help/errors jump list — real-browser layout", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("AC-1b and AC-1d: no item wraps, and the column sequence holds", async ({ page }) => {
    await page.goto("/help/errors", { waitUntil: "networkidle" });
    await expect(page.locator("main .help-prose nav ul.grid")).toBeVisible();

    for (const { vw, cols } of ERRORS_SEQUENCE) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await page.evaluate(() => {
        const ul = document.querySelector("main .help-prose nav ul.grid") as HTMLElement;
        const items = Array.from(ul.querySelectorAll("li")) as HTMLElement[];
        const first = items[0];
        if (!first) return { cols: -1, items: 0, wrapped: -1 };
        const cs = getComputedStyle(first);
        const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
        const tracks = getComputedStyle(ul).gridTemplateColumns.trim();
        return {
          cols:
            !tracks || tracks === "none" || /repeat\(|minmax\(/.test(tracks)
              ? -1
              : tracks.split(/\s+/).length,
          items: items.length,
          // A wrapped item is taller than one line. Derived from the item's own
          // computed line-height, never a hardcoded pixel count.
          wrapped: items.filter((li) => li.getBoundingClientRect().height > lineH * 1.6).length,
        };
      });

      premise(`the jump list renders items at ${vw}px`, m.items, 0);
      premiseHolds(`the jump list resolves a column count at ${vw}px`, m.cols > 0);
      expect(m.cols, `jump list columns at ${vw}px`).toBe(cols);
      expect(m.wrapped, `wrapped jump-list items at ${vw}px`).toBe(0);
    }
  });
});
