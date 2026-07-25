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

  // The HEIGHT branch of the same rule. Both cases above resolve widths, so the
  // block-axis calculation was unpinned and could regress on its own.
  test("a percentage ROW gap resolves against the block content box", async ({ page }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="box-sizing:border-box;height:40px;padding-block:20px;display:flex;flex-direction:column;row-gap:10%">
         <span style="width:10px;height:0"></span>
         <span ${ZERO}></span>
       </div>`,
    );
    // Block content box is 0, so the used row gap is 0 and nothing is charged.
    expect(found.unresolved).toEqual([]);
    expect(found.offenders).toEqual([]);
  });

  test("a percentage ROW gap over a real block content box is charged", async ({ page }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="box-sizing:border-box;height:240px;padding-block:20px;display:flex;flex-direction:column;row-gap:10%">
         <span style="width:10px;height:20px">a</span>
         <span data-testid="empty" ${ZERO}></span>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    // 10% of the 200px block content box.
    expect(found.offenders).toEqual([{ parent: "root", child: "empty", axis: "row-gap", gap: 20 }]);
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
  for (const mode of ["vertical-rl", "vertical-lr", "sideways-rl", "sideways-lr"] as const) {
    test(`${mode}: column-gap is measured against HEIGHT, and a zero-height item is the offender`, async ({
      page,
    }) => {
      const found = await scan(
        page,
        `<div id="root" data-testid="root" style="writing-mode:${mode};display:flex;column-gap:12px;height:80px">
           <span style="width:20px;height:10px">a</span>
           <span data-testid="empty" style="width:20px;height:0"></span>
         </div>`,
      );
      expect(found.unresolved).toEqual([]);
      expect(found.offenders).toEqual([
        { parent: "root", child: "empty", axis: "column-gap", gap: 12 },
      ]);
    });

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
  // EVERY transform input, not just `scale`. Each of `transform`, `scale`,
  // `rotate`, and `translate` is a separate predicate, and covering one left the
  // other three deletable with the suite still green.
  for (const [name, css] of [
    ["scale", "scale:0"],
    ["transform", "transform:scaleX(0)"],
    // 180deg, NOT 45: rotating a 0x10 box by 45deg gives the transformed rect a
    // nonzero WIDTH, so `vanishes()` returns at the rect check and never reads
    // the `rotate` predicate — the case passed with or without it. A half-turn
    // preserves the zero dimension and actually reaches the predicate.
    ["rotate", "rotate:180deg"],
    ["translate", "translate:1px"],
  ] as const) {
    test(`an SVG with a \`${name}\` transform is not reported`, async ({ page }) => {
      const found = await scan(
        page,
        `<div id="root" data-testid="root" style="display:flex;column-gap:12px">
           <span style="width:20px;height:10px">a</span>
           <svg data-testid="transformed" style="${css}" width="0" height="10"></svg>
         </div>`,
      );
      expect(found.unresolved).toEqual([]);
      expect(found.offenders).toEqual([]);
    });
  }

  test("an untransformed zero-width SVG IS reported", async ({ page }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="display:flex;column-gap:12px">
         <span style="width:20px;height:10px">a</span>
         <svg data-testid="flat" width="0" height="10"></svg>
       </div>`,
    );
    expect(found.unresolved).toEqual([]);
    expect(found.offenders).toEqual([
      { parent: "root", child: "flat", axis: "column-gap", gap: 12 },
    ]);
  });

  // `content-visibility: hidden` skips the SUBTREE'S OWN layout, so its internal
  // gaps are not rendered and zero-size descendants charge nothing. Tracked
  // separately from `display` because the boundary element still holds a box and
  // is still an item of ITS parent — and because `checkVisibility()` conflates
  // the two, which is why it is not used.
  test("a container that IS the content-visibility boundary is not measured", async ({ page }) => {
    const found = await scan(
      page,
      `<div id="root" data-testid="root" style="content-visibility:hidden;display:flex;column-gap:12px">
         <span style="width:20px;height:10px">a</span>
         <span ${ZERO}></span>
       </div>`,
    );
    expect(found.visited).toEqual([]);
    expect(found.offenders).toEqual([]);
  });

  test("a content-visibility boundary ABOVE the scan root suppresses the walk", async ({
    page,
  }) => {
    const found = await scan(
      page,
      `<div style="content-visibility:hidden">
         <div id="root" data-testid="root" style="display:flex;column-gap:12px">
           <span style="width:20px;height:10px">a</span>
           <span ${ZERO}></span>
         </div>
       </div>`,
    );
    expect(found.visited).toEqual([]);
    expect(found.offenders).toEqual([]);
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

  // IDENTITY, field by field. Every fixture above shares one triple, so deleting
  // any single comparison from the matcher left the suite green — an unrelated
  // offender of the same magnitude would then be silently consumed by this row.
  for (const [field, offender] of [
    ["parent", { ...OFFENDER, parent: "other-parent" }],
    ["child", { ...OFFENDER, child: "other-child" }],
    ["axis", { ...OFFENDER, axis: "column-gap" as const }],
  ] as const) {
    test(`an offender differing only in ${field} is NOT consumed`, () => {
      const { remaining, stale } = reconcilePhantomLedger([offender], [ROW], {
        surface: "s",
        width: 390,
      });
      expect(remaining).toEqual([offender]);
      expect(stale).toHaveLength(1);
    });
  }

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

  // A one-sided comparison would let a SHRINKING gap through, and the tolerance
  // itself has to be pinned in both directions or exact equality would satisfy
  // the suite while rejecting legitimate sub-pixel drift.
  test("a ledgered gap that SHRANK is not consumed", () => {
    const shrunk = { ...OFFENDER, gap: 1 };
    const { remaining, stale } = reconcilePhantomLedger([shrunk], [ROW], {
      surface: "s",
      width: 390,
    });
    expect(remaining).toEqual([shrunk]);
    expect(stale).toHaveLength(1);
  });

  test("sub-pixel drift within 0.5px still matches; beyond it does not", () => {
    const within = { ...OFFENDER, gap: 2.4 };
    const beyond = { ...OFFENDER, gap: 2.6 };
    expect(reconcilePhantomLedger([within], [ROW], { surface: "s", width: 390 })).toEqual({
      remaining: [],
      stale: [],
    });
    const outside = reconcilePhantomLedger([beyond], [ROW], { surface: "s", width: 390 });
    expect(outside.remaining).toEqual([beyond]);
    expect(outside.stale).toHaveLength(1);
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
  // `count: 0` alone did not pin `Number.isInteger`: a fractional count silently
  // consumed two matching offenders while reporting no stale row, hiding the
  // surplus. Negative counts are the same class.
  for (const count of [0, -1, 1.5, Number.NaN]) {
    test(`count ${count} throws, even for a row outside the scope`, () => {
      expect(() =>
        reconcilePhantomLedger([], [{ ...ROW, width: 1280, count }], {
          surface: "s",
          width: 390,
        }),
      ).toThrow(/non-positive-integer count/);
    });
  }
});
