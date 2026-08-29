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
 * WHY THE BLEED IS ASSERTED SEPARATELY. Column counts and measures are both satisfied
 * by a grid that never escapes the 70ch cap at all — the cap is wide enough for two
 * 22rem columns, so a grid capped at the measure still reports 2 columns at 752 and
 * 1016 and still clears the floor. The change's whole point is the escape, and spec §4
 * states it with numbers (728 at 1024, 856 at 1280). Those numbers are asserted below.
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

/** Spec §4, stated with numbers: the shell is `max-w-6xl px-4` (1152 - 32 = 1120)
 *  minus a 240px sidebar and a 24px gap at `md`, so the main column is 856 at 1280.
 *
 *  ONLY 1280 CARRIES AN ABSOLUTE. §4 also names 728 at 1024, and that number is
 *  arithmetic on a 1024px viewport with NO scrollbar: below 1184 the container is
 *  limited by the VIEWPORT rather than by `max-w-6xl`, so a classic scrollbar takes
 *  its width straight out of the result and a correct layout reports 713. At 1280
 *  `max-w-6xl` binds and 856 is independent of it. Asserting a scrollbar's width is
 *  not asserting the layout. 1024 is covered by the two claims below instead, both
 *  scrollbar-independent, and neither satisfied by a grid that never bled. */
const BLED_GRID_WIDTH: ReadonlyArray<{ vw: number; width: number }> = [{ vw: 1280, width: 856 }];

/** The viewports where a bled grid must be measurably wider than a capped sibling.
 *  This is the direct statement of the change: `.help-prose > p` still stops at the
 *  70ch measure (704.4px measured) and the grid does not. It compares two elements
 *  on the same page whose widths differ ONLY because of the bleed, so it needs no
 *  absolute and cannot be satisfied by a grid that never escaped the cap. */
const BLEED_VIEWPORTS = [1024, 1280] as const;

const TOL = 0.5;

/** One evaluate per viewport. `boundingBox()` is viewport-relative and actionability
 *  scrolls, so two separate Locator reads can report geometry that never coexisted. */
async function readTour(page: Page) {
  return page.evaluate(() => {
    const w = (el: Element) => +el.getBoundingClientRect().width.toFixed(1);
    /** Content width, not border-box: spec §4's comparand is the CONTENT box, and
     *  `getBoundingClientRect` includes padding. Comparing a grid to a padded
     *  border-box would fail a correct layout by exactly the padding. */
    const contentWidth = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return +(
        el.clientWidth -
        parseFloat(cs.paddingLeft || "0") -
        parseFloat(cs.paddingRight || "0")
      ).toFixed(1);
    };
    /** Per element. Applying the FIRST body's metric to every body misreports any
     *  body rendered at a different size — and the full-span card is exactly the
     *  one whose measure a shared metric would get wrong. */
    const chOf = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return 0;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return ctx.measureText("0".repeat(50)).width / 50;
    };
    const main = document.querySelector("main") as HTMLElement | null;
    const prose = document.querySelector("main .help-prose") as HTMLElement | null;
    const grids = Array.from(
      document.querySelectorAll("main .help-prose div.grid"),
    ) as HTMLElement[];
    return {
      mainWidth: main ? w(main) : -1,
      mainContentWidth: main ? contentWidth(main) : -1,
      proseContentWidth: prose ? contentWidth(prose) : -1,
      // A direct prose child, which the measure still caps. The grid's width is
      // meaningful only relative to this: it is what the grid looked like before the
      // bleed, still rendered on the same page at the same viewport.
      cappedChildWidth: (() => {
        const el = document.querySelector("main .help-prose > p") as HTMLElement | null;
        return el ? w(el) : -1;
      })(),
      grids: grids.map((g) => {
        // EVERY card, not the first. Sampling one card per grid missed the
        // col-span-full card entirely — it is card 3 of grid 1, and it is the
        // widest thing on the page, so it is exactly the one a floor-only
        // assertion on card 1 cannot see.
        const cards = Array.from(g.querySelectorAll("a[data-tour-card]")) as HTMLElement[];
        const bodies = cards
          .map((c) => c.querySelector("p") as HTMLElement | null)
          .filter((b): b is HTMLElement => b !== null);
        const tracks = getComputedStyle(g).gridTemplateColumns.trim();
        // Refuse a count we cannot resolve rather than reporting one that is not a
        // number: on a non-grid element this string is the unresolved repeat(...).
        const unresolved = !tracks || tracks === "none" || /repeat\(|minmax\(/.test(tracks);
        const parsed = unresolved ? [] : tracks.split(/\s+/).map((t) => parseFloat(t));
        // The RESOLVED track widths. A minimum that cannot shrink overflows the
        // TRACK while the grid element stays at container width, so an
        // element-vs-container comparison can never see it.
        const trackWidths = parsed.some((n) => !Number.isFinite(n)) ? [] : parsed;
        // The full-span card, found by its resolved placement rather than by index:
        // `grid-column: 1 / -1` computes to an end of -1 whatever the track count.
        const fullSpan = cards.filter((c) => getComputedStyle(c).gridColumnEnd === "-1");
        return {
          cols: trackWidths.length === 0 ? -1 : trackWidths.length,
          trackWidths: trackWidths.map((n) => +n.toFixed(1)),
          gridWidth: w(g),
          // The DIRECT overflow reading. Per-track catches a minimum that cannot
          // shrink; this catches tracks that each fit while their sum plus the
          // gaps does not. Integers, so the tolerance is a pixel.
          gridScrollWidth: g.scrollWidth,
          gridClientWidth: g.clientWidth,
          cardCount: cards.length,
          // Pinned against cardCount by the caller: `bodies` is a FILTER, and a
          // card that lost its <p> would leave every measure bound satisfied by
          // the cards that remain.
          bodyCount: bodies.length,
          fullSpanCount: fullSpan.length,
          fullSpanWidths: fullSpan.map(w),
          measureCh:
            bodies[0] && chOf(bodies[0]) ? +(w(bodies[0]) / chOf(bodies[0])).toFixed(1) : -1,
          // every card body's measure, each in its OWN font context
          measuresCh: bodies.map((b) => {
            const ch = chOf(b);
            return ch ? +(w(b) / ch).toFixed(1) : -1;
          }),
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

  test("§4: the bled grids take the whole main column, not the measure", async ({ page }) => {
    await page.goto("/help/tour", { waitUntil: "networkidle" });
    await expect(page.locator("main .help-prose div.grid").first()).toBeVisible();

    for (const vw of BLEED_VIEWPORTS) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await readTour(page);
      premise(`the tour renders card grids at ${vw}px`, m.grids.length, 0);
      premiseHolds(`main resolves a content width at ${vw}px`, m.mainContentWidth > 0);
      premiseHolds(
        `the prose wrapper resolves a content width at ${vw}px`,
        m.proseContentWidth > 0,
      );
      premiseHolds(`a capped prose child renders at ${vw}px`, m.cappedChildWidth > 0);
      // The premise that makes the comparison mean anything: at these viewports the
      // measure must actually BIND on a capped child. Where the container is narrower
      // than the measure it does not, every element is container-width, and "wider
      // than a capped sibling" would be unsatisfiable rather than false.
      premise(
        `the measure binds on a prose child at ${vw}px`,
        m.mainContentWidth,
        m.cappedChildWidth,
      );

      // §4 row 3: the wrapper carries no max-width after the cap moved to its children.
      expect(m.proseContentWidth, `.help-prose content width at ${vw}px`).toBeCloseTo(
        m.mainContentWidth,
        1,
      );

      for (const [i, g] of m.grids.entries()) {
        // §4 rows 2 and 4, relative form.
        expect(g.gridWidth, `grid ${i + 1} width at ${vw}px`).toBeCloseTo(m.mainContentWidth, 1);
        // And the form a grid still under the cap fails: WIDER than the sibling the
        // cap still binds on. Without this, every assertion here is satisfied by a
        // page where the bleed never happened and both boxes are 704.4px.
        expect(
          g.gridWidth,
          `grid ${i + 1} must exceed the capped prose child at ${vw}px`,
        ).toBeGreaterThan(m.cappedChildWidth + 1);
        // §4 row 7: equal column widths. `1fr` tracks are equal by construction, so
        // this fails only if the track list stopped being uniform.
        premiseHolds(`grid ${i + 1} resolves its tracks at ${vw}px`, g.trackWidths.length > 0);
        const [firstTrack, ...restTracks] = g.trackWidths;
        premiseHolds(`grid ${i + 1} resolves a first track at ${vw}px`, firstTrack !== undefined);
        for (const [t, tw] of restTracks.entries()) {
          expect(tw, `grid ${i + 1} track ${t + 2} at ${vw}px`).toBeCloseTo(
            firstTrack as number,
            1,
          );
        }
      }
    }

    // The one absolute §4 states that no scrollbar can move.
    for (const { vw, width } of BLED_GRID_WIDTH) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await readTour(page);
      premise(`the tour renders card grids at ${vw}px`, m.grids.length, 0);
      expect(m.mainContentWidth, `main content width at ${vw}px`).toBeCloseTo(width, 1);
      for (const [i, g] of m.grids.entries()) {
        expect(g.gridWidth, `grid ${i + 1} width at ${vw}px`).toBeCloseTo(width, 1);
      }
    }
  });

  test("§4: the parse-warnings card spans every column, whatever the count", async ({ page }) => {
    await page.goto("/help/tour", { waitUntil: "networkidle" });
    await expect(page.locator("main .help-prose div.grid").first()).toBeVisible();

    // Both column counts, so `col-span-full` is proved to track the live count rather
    // than to coincide with it. `md:col-span-2` would pass at 1016 and fail at 768.
    for (const vw of [768, 1016]) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await readTour(page);
      const spanning = m.grids.filter((g) => g.fullSpanCount > 0);
      premise(`the tour renders a full-span card at ${vw}px`, spanning.length, 0);
      for (const g of spanning) {
        for (const [k, fw] of g.fullSpanWidths.entries()) {
          expect(fw, `full-span card ${k + 1} at ${vw}px`).toBeCloseTo(g.gridWidth, 1);
        }
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
        // EVERY card, pinned to the card count. Without this the body list is a
        // FILTER: drop the <p> from the card that breaks a bound and both bounds
        // still pass on the cards that are left.
        expect(g.bodyCount, `grid ${i + 1} card bodies at ${vw}px`).toBe(g.cardCount);
        expect(g.measuresCh.length, `grid ${i + 1} measured bodies at ${vw}px`).toBe(g.cardCount);
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
      premiseHolds(`main resolves a content width at ${vw}px`, m.mainContentWidth > 0);
      for (const [i, g] of m.grids.entries()) {
        // The TRACKS, not the grid element. A grid element is a block child and sits
        // at container width whatever its tracks do, so comparing it to the container
        // is a tautology — it can never fail. The violation inventory caught exactly
        // that: staging a bare 22rem minimum produced NO red here until this line
        // read the tracks instead.
        premiseHolds(`grid ${i + 1} resolves its tracks at ${vw}px`, g.trackWidths.length > 0);
        // EVERY track, not the first: a first track that fits says nothing about the
        // others once the track list stops being uniform.
        for (const [t, tw] of g.trackWidths.entries()) {
          expect(
            tw,
            `grid ${i + 1} track ${t + 1} within its container at ${vw}px`,
          ).toBeLessThanOrEqual(m.mainContentWidth + TOL);
        }
        // And the direct reading, which catches the case per-track cannot: N tracks
        // that each fit while their sum plus the gaps does not.
        expect(
          g.gridScrollWidth,
          `grid ${i + 1} content overflows its own box at ${vw}px`,
        ).toBeLessThanOrEqual(g.gridClientWidth + 1);
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
        const main = document.querySelector("main") as HTMLElement | null;
        const ul = document.querySelector("main .help-prose nav ul.grid") as HTMLElement;
        const items = Array.from(ul.querySelectorAll("li")) as HTMLElement[];
        const first = items[0];
        const mainContentWidth = main
          ? +(
              main.clientWidth -
              parseFloat(getComputedStyle(main).paddingLeft || "0") -
              parseFloat(getComputedStyle(main).paddingRight || "0")
            ).toFixed(1)
          : -1;
        // The list and the sections it points at are rendered from ONE array
        // (`groups` in app/help/errors/page.tsx), so the section ids are the
        // derived expectation for the list's hrefs. A hardcoded count would go
        // stale the day a family is added; this cannot.
        const sectionIds = (
          Array.from(document.querySelectorAll("main .help-prose > h2[id]")) as HTMLElement[]
        )
          .map((h) => h.id)
          .sort();
        const linkTargets = (
          Array.from(ul.querySelectorAll('li a[href^="#"]')) as HTMLAnchorElement[]
        )
          .map((a) => (a.getAttribute("href") ?? "").slice(1))
          .sort();
        if (!first) {
          return {
            cols: -1,
            items: 0,
            wrapped: -1,
            sectionIds,
            linkTargets,
            mainContentWidth,
            trackWidths: [] as number[],
            scrollWidth: -1,
            clientWidth: -1,
          };
        }
        const cs = getComputedStyle(first);
        const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
        const tracks = getComputedStyle(ul).gridTemplateColumns.trim();
        const unresolved = !tracks || tracks === "none" || /repeat\(|minmax\(/.test(tracks);
        const parsed = unresolved ? [] : tracks.split(/\s+/).map((t) => parseFloat(t));
        const trackWidths = parsed.some((n) => !Number.isFinite(n)) ? [] : parsed;
        return {
          cols: trackWidths.length === 0 ? -1 : trackWidths.length,
          trackWidths: trackWidths.map((n) => +n.toFixed(1)),
          items: items.length,
          // A wrapped item is taller than one line. Derived from the item's own
          // computed line-height, never a hardcoded pixel count.
          wrapped: items.filter((li) => li.getBoundingClientRect().height > lineH * 1.6).length,
          sectionIds,
          linkTargets,
          mainContentWidth,
          scrollWidth: ul.scrollWidth,
          clientWidth: ul.clientWidth,
        };
      });

      premise(`the jump list renders items at ${vw}px`, m.items, 0);
      premiseHolds(`the jump list resolves a column count at ${vw}px`, m.cols > 0);
      // Cardinality, derived from the page's own sections. Without it the wrap count
      // is a FILTER result: delete the items that wrap and zero wrap.
      premise(`the errors page renders family sections at ${vw}px`, m.sectionIds.length, 0);
      expect(m.linkTargets, `jump-list targets at ${vw}px`).toEqual(m.sectionIds);
      expect(m.items, `jump-list item count at ${vw}px`).toBe(m.sectionIds.length);
      expect(m.cols, `jump list columns at ${vw}px`).toBe(cols);
      expect(m.wrapped, `wrapped jump-list items at ${vw}px`).toBe(0);
    }
  });

  test("AC-1c: the errors jump list does not overflow its container either", async ({ page }) => {
    await page.goto("/help/errors", { waitUntil: "networkidle" });
    await expect(page.locator("main .help-prose nav ul.grid")).toBeVisible();

    // AC-1c says "no grid on EITHER page", and 320 is the pin: a bare 18rem minimum
    // overflows a 288px container by 32px, so this is what proves the `min(...,100%)`
    // on the jump list is doing work rather than decorating the declaration.
    for (const vw of [320, 390, 640, 1280]) {
      await page.setViewportSize({ width: vw, height: 900 });
      const m = await page.evaluate(() => {
        const main = document.querySelector("main") as HTMLElement | null;
        const ul = document.querySelector("main .help-prose nav ul.grid") as HTMLElement | null;
        if (!main || !ul)
          return {
            mainContentWidth: -1,
            trackWidths: [] as number[],
            scrollWidth: -1,
            clientWidth: -1,
          };
        const mcs = getComputedStyle(main);
        const tracks = getComputedStyle(ul).gridTemplateColumns.trim();
        const unresolved = !tracks || tracks === "none" || /repeat\(|minmax\(/.test(tracks);
        const parsed = unresolved ? [] : tracks.split(/\s+/).map((t) => parseFloat(t));
        return {
          mainContentWidth: +(
            main.clientWidth -
            parseFloat(mcs.paddingLeft || "0") -
            parseFloat(mcs.paddingRight || "0")
          ).toFixed(1),
          trackWidths: parsed.some((n) => !Number.isFinite(n))
            ? []
            : parsed.map((n) => +n.toFixed(1)),
          scrollWidth: ul.scrollWidth,
          clientWidth: ul.clientWidth,
        };
      });

      premiseHolds(`main resolves a content width at ${vw}px`, m.mainContentWidth > 0);
      premiseHolds(`the jump list resolves its tracks at ${vw}px`, m.trackWidths.length > 0);
      for (const [t, tw] of m.trackWidths.entries()) {
        expect(tw, `jump-list track ${t + 1} within its container at ${vw}px`).toBeLessThanOrEqual(
          m.mainContentWidth + TOL,
        );
      }
      expect(
        m.scrollWidth,
        `jump-list content overflows its own box at ${vw}px`,
      ).toBeLessThanOrEqual(m.clientWidth + 1);
    }
  });
});
