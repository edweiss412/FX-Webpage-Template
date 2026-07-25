/**
 * tests/e2e/phantomGapHelper.layout.spec.ts — branch coverage for the phantom-gap
 * walk itself (tests/e2e/helpers/phantomGap.ts).
 *
 * WHY THIS EXISTS. The four probe mounts measure real product trees, and those
 * trees contain no percentage gap, no `calc()` gap, no subgrid, no vertical or
 * sideways writing mode, and no transformed SVG. Every rule the walk carries for
 * those cases could therefore regress — silently, in the false-GREEN direction —
 * while all ten mounted cases stayed green. Each rule below was written in
 * response to a specific cross-model review finding; this is what keeps them
 * honest.
 *
 * REAL BROWSER, SYNTHETIC DOM. jsdom computes no layout, so the walk has nothing
 * to read there. These pages are hand-written rather than product markup on
 * purpose: the point is to construct the CSS condition under test directly,
 * including conditions this product should never contain.
 *
 * Runs under tests/e2e/standalone.config.ts — no dev server, no database.
 */
import { test, expect, type Page } from "@playwright/test";
import { scanForPhantomGaps, reconcilePhantomLedger } from "./helpers/phantomGap";

/** Render a bare page whose body is exactly `body`, then scan `#root`. */
async function scan(page: Page, body: string) {
  await page.setContent(`<!doctype html><html><body>${body}</body></html>`);
  return scanForPhantomGaps(page.locator("#root"));
}

const ZERO = 'style="width:0;height:0"';

test.describe("phantomGap helper — the branches no product tree exercises", () => {
  test("a plain px gap with a zero-extent item reports it (the baseline this all rests on)", async ({
    page,
  }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:flex;column-gap:12px">
         <span style="width:20px;height:10px">a</span>
         <span data-testid="empty" ${ZERO}></span>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    expect(found.offenders).toEqual([
      { parent: "root", child: "empty", axis: "column-gap", gap: 12 },
    ]);
  });

  // `normal` is the INITIAL value of both gap properties, so nearly every
  // container in any tree reports it. Reading it as unresolved put every ordinary
  // container into the unresolved list — caught on this assertion's own first run.
  test("`normal` is read as zero, not as an unreadable gap", async ({ page }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:flex">
         <span style="width:20px;height:10px">a</span>
         <span ${ZERO}></span>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    expect(found.offenders).toEqual([]);
  });

  // The percentage basis is the CONTENT box. `getComputedStyle().width` is not it:
  // under `box-sizing: border-box` Chrome resolves that to the BORDER-box used
  // value, so a percentage gap resolving to 0 would have been treated as charged.
  test("a percentage gap resolves against the content box, not the border box", async ({
    page,
  }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="box-sizing:border-box;width:40px;padding-inline:20px;display:flex;column-gap:10%">
         <span style="width:0;height:10px"></span>
         <span ${ZERO}></span>
       </div>`,
    );
    // Content box is 0, so the used gap is 0 and NOTHING is charged — even though
    // both children are zero-width.
    expect(found.unresolved).toEqual([]);
    expect(found.offenders).toEqual([]);
  });

  test("a percentage gap over a real content box is resolved to px and charged", async ({
    page,
  }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="box-sizing:border-box;width:240px;padding-inline:20px;display:flex;column-gap:10%">
         <span style="width:20px;height:10px">a</span>
         <span data-testid="empty" ${ZERO}></span>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    // 10% of the 200px content box.
    expect(found.offenders).toEqual([
      { parent: "root", child: "empty", axis: "column-gap", gap: 20 },
    ]);
  });

  // A mixed length-percentage serializes as the math expression, so there is no
  // used value to read. Silently treating it as 0 dropped the axis entirely.
  test("an unreadable calc() gap is reported as unresolved, never as absent", async ({ page }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:flex;width:100px;column-gap:calc(10% + 5px)">
         <span style="width:20px;height:10px">a</span>
         <span ${ZERO}></span>
       </div>`,
    );
    expect(found.unresolved).toEqual(["root column-gap: calc(10% + 5px)"]);
  });

  // …but only for an axis that could realize a gutter. A nowrap row flex has one
  // line, so its ROW gap is never charged and an unreadable one is not a finding.
  test("an unreadable gap on an axis that cannot charge is NOT reported", async ({ page }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:flex;flex-wrap:nowrap;width:100px;row-gap:calc(10% + 5px)">
         <span style="width:20px;height:10px">a</span>
         <span style="width:20px;height:10px">b</span>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
  });

  test("an unreadable gap in a container that fails admission is NOT reported", async ({
    page,
  }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:flex;flex-direction:column;width:100px;row-gap:calc(10% + 5px)">
         <span style="width:20px;height:10px">only child</span>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
  });

  // Gap axes are LOGICAL. Under a vertical writing mode `row-gap` separates rows
  // that stack horizontally, so it is measured against physical WIDTH.
  // `sideways-*` are vertical too and do not start with "vertical".
  for (const mode of ["vertical-rl", "sideways-rl"] as const) {
    test(`${mode}: row-gap is measured against width, and a zero-WIDTH item is the offender`, async ({
      page,
    }) => {
      const found = await scan(
        page,
        `<div id="root" data-testid="root" style="writing-mode:${mode};display:flex;flex-direction:column;row-gap:12px;height:80px">
           <span style="width:20px;height:10px">a</span>
           <span data-testid="empty" style="width:0;height:10px"></span>
         </div>`,
      );
      expect(found.unresolved).toEqual([]);
      expect(found.offenders).toEqual([
        { parent: "root", child: "empty", axis: "row-gap", gap: 12 },
      ]);
    });
  }

  // A one-item subgrid spanning two parent tracks DOES realize the gutter between
  // them. The old `=== "subgrid"` test never matched the real serialization
  // (`subgrid [] [] []`), and the itemCount fallback rejected this case anyway.
  test("a single-item subgrid spanning two parent tracks is examined", async ({ page }) => {
    const found = await scan(
      page,
      `<div style="display:grid;grid-template-columns:60px 60px;column-gap:12px;width:132px">
         <div id="root" data-testid="root" style="display:grid;grid-template-columns:subgrid;column-gap:12px;grid-column:span 2">
           <span data-testid="empty" ${ZERO}></span>
         </div>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    expect(found.visited).toContain("root");
    expect(found.offenders).toEqual([
      { parent: "root", child: "empty", axis: "column-gap", gap: 12 },
    ]);
  });

  // A grid whose axis has ONE track charges nothing there however many items it
  // holds — the admin dashboard's 7-items-in-1-row header is the real instance.
  test("a single-track grid axis is not admitted, however many items it holds", async ({
    page,
  }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:grid;grid-template-columns:40px 40px 40px;grid-template-rows:20px;row-gap:16px;column-gap:0">
         <span style="width:40px;height:20px">a</span>
         <span style="width:40px;height:20px">b</span>
         <span data-testid="empty" style="width:40px;height:0"></span>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    expect(found.offenders).toEqual([]);
  });

  // SVG/MathML have no `offset*` metric, so a zero rect is reported only when no
  // transform of any kind is set. `scale: 0` is the case that matters: it never
  // appears in `transform`, and Tailwind v4's `scale-*` utilities compile to it.
  test("a transformed SVG is not reported; an untransformed zero-width one is", async ({
    page,
  }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:flex;column-gap:12px">
         <span style="width:20px;height:10px">a</span>
         <svg data-testid="scaled" style="scale:0" width="10" height="10"></svg>
         <svg data-testid="flat" width="0" height="10"></svg>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    expect(found.offenders).toEqual([
      { parent: "root", child: "flat", axis: "column-gap", gap: 12 },
    ]);
  });

  // A `display:none` ancestor ABOVE the scan root removes the whole subtree from
  // layout. Stopping the suppression walk at the root reported every item in it.
  test("a hidden ancestor above the scan root suppresses the whole walk", async ({ page }) => {
    const found = await scan(
      page,
      `<div style="display:none">
         <div id="root" data-testid="root" style="display:flex;column-gap:12px">
           <span style="width:20px;height:10px">a</span>
           <span ${ZERO}></span>
         </div>
       </div>`,
    );
    expect(found.visited).toEqual([]);
    expect(found.offenders).toEqual([]);
  });
});

test.describe("reconcilePhantomLedger", () => {
  const OFFENDER = {
    parent: "p",
    child: "c",
    axis: "row-gap" as const,
    gap: 2,
  };
  const ROW = {
    surface: "s",
    width: 390,
    parent: "p",
    child: "c",
    axis: "row-gap" as const,
    gap: 2,
    count: 1,
    why: "test",
  };

  test("consumes exactly its count, and a surplus survives as a new offender", () => {
    const { remaining, stale } = reconcilePhantomLedger([OFFENDER, OFFENDER], [ROW], {
      surface: "s",
      width: 390,
    });
    expect(stale).toEqual([]);
    expect(remaining).toEqual([OFFENDER]);
  });

  test("a repaid row fails as stale rather than passing quietly", () => {
    const { remaining, stale } = reconcilePhantomLedger([], [ROW], { surface: "s", width: 390 });
    expect(remaining).toEqual([]);
    expect(stale).toHaveLength(1);
  });

  // The debt is the MAGNITUDE, not merely the existence of a phantom item.
  test("a ledgered gap that GREW is not consumed", () => {
    const grown = { ...OFFENDER, gap: 32 };
    const { remaining, stale } = reconcilePhantomLedger([grown], [ROW], {
      surface: "s",
      width: 390,
    });
    expect(remaining).toEqual([grown]);
    expect(stale).toHaveLength(1);
  });

  test("rows outside the scope neither consume nor go stale", () => {
    const otherScope = { ...ROW, width: 1280 };
    const { remaining, stale } = reconcilePhantomLedger([OFFENDER], [otherScope], {
      surface: "s",
      width: 390,
    });
    expect(stale).toEqual([]);
    expect(remaining).toEqual([OFFENDER]);
  });

  // Validation covers the WHOLE ledger, including rows outside this scope — a
  // malformed row must not wait for some later run to be noticed.
  test("a non-positive-integer count throws, even out of scope", () => {
    expect(() =>
      reconcilePhantomLedger([], [{ ...ROW, width: 1280, count: 0 }], {
        surface: "s",
        width: 390,
      }),
    ).toThrow(/non-positive-integer count/);
  });
});
