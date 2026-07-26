# Section Header Wide-Inline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the `sm` breakpoint and up, the show-modal section header renders as one left-aligned 44px row (name+count left, status pill right, corner glyph last); below `sm` the shipped #605 stacked layout is byte-identical.

**Architecture:** Single DOM tree, CSS-only viewport fork: the two wrapper divs flatten at `sm` (`sm:contents`) so the outer column becomes the flex row; a `sm:order-1` places the glyph last and `sm:ml-0.5` keeps its hit overlay tangent to the pill. All geometry verified in real browsers; jsdom pins class strings only.

**Tech Stack:** Next.js 16 / React, Tailwind v4 tokens, Playwright (standalone DB-free harness + real-route), Vitest/jsdom.

**Spec (canonical):** `docs/superpowers/specs/2026-07-26-section-header-wide-inline.md` — APPROVED, Codex R5. Its §1.1 decisions 1–7a are owner-ratified: do not relitigate. Its §4.2 rows A–Q are the COMPLETE reconciliation inventory for the two e2e suites.

## Global Constraints

- Below `sm` (640px, `app/globals.css:238`) the rendering is unchanged — the diff only ADDS `sm:` variants (+ `sm:pr-0` on the linkless branch). Spec decision 4.
- Single DOM tree: no duplicated pill or link markup, ever. Spec decision 6.
- Tokens only (DESIGN.md §10): `sm:ml-0.5`, `sm:gap-2.5`, `sm:min-h-tap-min` — no arbitrary px values.
- TDD (AGENTS invariant 1): each task's new assertions are run RED before the implementation lands, and the RED/GREEN counts are recorded in the commit message.
- Conventional commits, one task per commit (invariant 6); `--no-verify` (worktree hook contention).
- UI diff ⇒ impeccable critique + audit dual-gate before cross-model review (invariant 8).
- Measured constants (spec §1.1a/b): 640-viewport header content box = 552px; inline worst case 379.5px (172.5px slack); heights 44px / 72.8px (narrow pilled).

## Meta-test inventory (project writing-plans rule)

None of the registry meta-tests apply — no Supabase call boundary, sentinel text, admin alert, advisory lock, or email surface (pure presentational CSS fork; no mutation surfaces, so invariant 10 is untouched). Structural tests EXTENDED instead: the 15-cell matrix, the width-chain fixture (`tests/e2e/_sectionHeaderWidths.ts`), the transition audit, and a new single-DOM structural assertion (spec §4.4).

## e2e harness readiness (project writing-plans rule)

- `tests/e2e/section-header-layout.layout.spec.ts`: DB-free static harness under `tests/e2e/standalone.config.ts` (file already in its allow-list); no server, no hydration gate; markup + compiled product CSS served from a local static server.
- `tests/e2e/admin-layout-dimensions.spec.ts`: dev server :3000 (main `playwright.config.ts` webServer, `reuseExistingServer` locally), seeded DB (`pnpm db:seed`) + settled dashboard (suite handles it); readiness gate = the `:has(title)` MODAL selector (never networkidle). No `locator.evaluate` outlives its element (all reads inside single `page.evaluate` passes).
- CI: `.github/workflows/phantom-gap-e2e.yml:187` (standalone) and `:197` (`-g "width chain"`, desktop-chromium). Path filters at `:31`/`:63` already name both spec files. No new e2e files ⇒ no new wiring. The new jsdom file is picked up by vitest's default include.

---

### Task 1: The width fork — tests first, then the class change

**Files:**
- Modify: `tests/e2e/_sectionHeaderWidths.ts` (ROW_WIDTHS, REAL_ROUTE_WIDTHS, derivation comment)
- Modify: `tests/e2e/section-header-layout.layout.spec.ts` (rows A–J of spec §4.2 + new §4.3 cases)
- Modify: `tests/e2e/admin-layout-dimensions.spec.ts` (rows K–N)
- Create: `tests/components/admin/wizard/modalSectionChromeClasses.test.tsx` (spec §4.5 tripwire)
- Modify: `components/admin/wizard/step3ReviewSections.tsx:908-1010` (the implementation + comment updates, spec §5.5)
- Modify: `tests/components/admin/showpage/publishedWarningsPanel.test.tsx` (comments only, spec §5.5)
- Modify: `tests/components/admin/wizard/sectionCountBoundary.test.tsx` (comments only, spec §5.5)

**Interfaces:**
- Produces: `ROW_WIDTHS = { 320: 280, 375: 335, 430: 390, 640: 552, 1280: 744 }`, `REAL_ROUTE_WIDTHS = [375, 640, 1280]`, `WIDE_VIEWPORTS: ReadonlySet<number>` (module-local in each spec file, `new Set([640, 1280])`). Later tasks rely on the final class strings listed in Step 3.

- [ ] **Step 1: Extend the width fixture**

In `tests/e2e/_sectionHeaderWidths.ts`, extend the two exports and the derivation comment block (spec rows A/Q):

```ts
export const ROW_WIDTHS = { 320: 280, 375: 335, 430: 390, 640: 552, 1280: 744 } as const;
export const REAL_ROUTE_WIDTHS = [375, 640, 1280] as const;
```

Derivation comment gains one line following the existing pattern: `640 -> 552   the sm-band popup pane floor, MEASURED on the real route (spec 2026-07-26 §1.1a)`. Update the file's "61-case" sentence per row P (exact count set in Step 6).

- [ ] **Step 2: Extend the standalone suite (rows A–J + §4.3)**

In `tests/e2e/section-header-layout.layout.spec.ts`:

(a) beforeAll literal (row A): add `640: 552` to the `.toEqual` object.

(b) Add after the `HEADER_WITH_PILL_PX` constant:

```ts
/** sm+ viewports: the inline single-row mode (spec 2026-07-26 §2). 320/375/430
 *  keep the stacked #605 contract verbatim. */
const WIDE_VIEWPORTS: ReadonlySet<number> = new Set([640, 1280]);
```

(c) Matrix loop (row B): widths become `[320, 375, 430, 640, 1280] as const`. The evaluate gains `headerLineWidth` (same rounding as the heights) and, in the assertion block, the geometry section forks (rows C/D/E):

```ts
      expect(m.lines, `${spec.cell} @ ${viewport}: the section name occupies ONE text line`).toBe(1);
      if (WIDE_VIEWPORTS.has(viewport)) {
        // sm+: the line-1 wrapper flattens (display: contents) — boxless is the
        // positive statement of the mode; the 44px row belongs to `outer`,
        // REGARDLESS of pill (spec §4.2 rows D/E).
        expect(m.headerLineWidth, `${spec.cell} @ ${viewport}: headerLine is boxless at sm+`).toBe(0);
        expect(m.headerLineHeight, `${spec.cell} @ ${viewport}: headerLine is boxless at sm+`).toBe(0);
        expect(m.outerHeight, `${spec.cell} @ ${viewport}: one 44px row, pill inline`).toBeCloseTo(
          HEADER_LINE_PX, 0,
        );
      } else {
        expect(
          m.headerLineHeight,
          `${spec.cell} @ ${viewport}: the header LINE stays ${HEADER_LINE_PX}px in every state`,
        ).toBeCloseTo(HEADER_LINE_PX, 0);
        expect(
          m.outerHeight,
          `${spec.cell} @ ${viewport}: whole header is ${spec.pill === "none" ? HEADER_LINE_PX : HEADER_WITH_PILL_PX}px`,
        ).toBeCloseTo(spec.pill === "none" ? HEADER_LINE_PX : HEADER_WITH_PILL_PX, 0);
      }
```

(d) Centring suite (row F): loop becomes `[320, 375, 430] as const`; update its doc comment ("centring is the below-`sm` contract; wide alignment is asserted by the wide-alignment suite below").

(e) NEW wide-alignment suite (spec §4.3), after the centring suite:

```ts
/**
 * T2 — the sm+ inline row: left alignment, trailing edge, pill row-band.
 * Spec 2026-07-26 §2.2/§4.3. Measured against `outer` — the line-1 wrapper is
 * deliberately boxless at these widths (its narrow twin carries the box).
 * Trailing edge per cell class: linked cells end in the glyph; linkless+pilled
 * cells end in the pill; linkless clean cells: the name group itself reaches the
 * row edge. Failure mode caught: the stacked-at-wide regression (centred name,
 * pill on its own row) and any pusher/slot leftovers (padding-right != 0).
 */
const EDGE_TOLERANCE_PX = 1;

for (const viewport of [640, 1280] as const) {
  test(`wide inline row @ ${viewport}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: viewport, height: 900 });

    for (const spec of MATRIX) {
      await page.goto(`${baseUrl}${spec.cell}-${viewport}.html`, { waitUntil: "load" });
      const m = await page.evaluate(
        ({ cell }) => {
          const root = document.querySelector(`[data-cell="${cell}"]`);
          if (!(root instanceof HTMLElement)) return { error: `cell root not found: ${cell}` };
          const icon = root.querySelector('span[aria-hidden="true"]');
          const headerLine = icon?.parentElement ?? null;
          const outer = headerLine?.parentElement ?? null;
          const heading = root.querySelector("h3, h4");
          const group = heading?.parentElement ?? null;
          if (
            !(icon instanceof HTMLElement) ||
            !(outer instanceof HTMLElement) ||
            !(heading instanceof HTMLElement) ||
            !(group instanceof HTMLElement)
          ) {
            return { error: "structure not found" };
          }
          const link = root.querySelector("a[href]");
          const pill = root.querySelector('[class*="rounded-pill"]');
          const outerRect = outer.getBoundingClientRect();
          const outerCs = getComputedStyle(outer);
          const contentLeft = outerRect.left + parseFloat(outerCs.paddingLeft || "0");
          const contentRight = outerRect.right - parseFloat(outerCs.paddingRight || "0");
          const headingRect = heading.getBoundingClientRect();
          const rowCentreY = (outerRect.top + outerRect.bottom) / 2;
          return {
            error: null,
            iconWidth: icon.getBoundingClientRect().width,
            rowGap: parseFloat(outerCs.columnGap || "0"),
            groupPadRight: parseFloat(getComputedStyle(group).paddingRight || "0"),
            headingLeft: headingRect.left,
            contentLeft,
            contentRight,
            rowCentreY,
            headingCentreY: (headingRect.top + headingRect.bottom) / 2,
            groupRight: group.getBoundingClientRect().right,
            linkRight: link instanceof HTMLElement ? link.getBoundingClientRect().right : null,
            linkLeft: link instanceof HTMLElement ? link.getBoundingClientRect().left : null,
            pillRight: pill instanceof HTMLElement ? pill.getBoundingClientRect().right : null,
            pillLeft: pill instanceof HTMLElement ? pill.getBoundingClientRect().left : null,
            pillCentreY:
              pill instanceof HTMLElement
                ? (pill.getBoundingClientRect().top + pill.getBoundingClientRect().bottom) / 2
                : null,
          };
        },
        { cell: spec.cell },
      );
      expect(m.error, `${spec.cell} fixture shape`).toBeNull();
      if (m.error !== null) return;

      // Left alignment: the heading starts one icon + one gap in from the edge.
      expect(
        Math.abs(m.headingLeft - (m.contentLeft + m.iconWidth + m.rowGap)),
        `${spec.cell} @ ${viewport}: name is left-aligned after the icon`,
      ).toBeLessThan(EDGE_TOLERANCE_PX);
      // No slot compensation at sm+ (spec decision 7).
      expect(m.groupPadRight, `${spec.cell} @ ${viewport}: sm:pr-0 on the group`).toBeCloseTo(0, 1);
      // Pill: inline in the row band, right of the name group's content.
      if (spec.pill !== "none") {
        expect(m.pillCentreY, `${spec.cell} @ ${viewport}: pill measured`).not.toBeNull();
        expect(
          Math.abs((m.pillCentreY ?? 0) - m.rowCentreY),
          `${spec.cell} @ ${viewport}: pill sits in the row band`,
        ).toBeLessThanOrEqual(0.5);
      }
      // Trailing edge per cell class (spec §2.2 table).
      if (spec.link) {
        expect(
          Math.abs((m.linkRight ?? 0) - m.contentRight),
          `${spec.cell} @ ${viewport}: glyph flush with the row edge`,
        ).toBeLessThan(EDGE_TOLERANCE_PX);
        if (spec.pill !== "none") {
          expect(
            (m.pillRight ?? 0) < (m.linkLeft ?? 0),
            `${spec.cell} @ ${viewport}: pill left of the glyph`,
          ).toBe(true);
        }
      } else if (spec.pill !== "none") {
        expect(
          Math.abs((m.pillRight ?? 0) - m.contentRight),
          `${spec.cell} @ ${viewport}: pill flush with the row edge (linkless)`,
        ).toBeLessThan(EDGE_TOLERANCE_PX);
      } else {
        expect(
          Math.abs(m.groupRight - m.contentRight),
          `${spec.cell} @ ${viewport}: name group reaches the row edge (linkless clean)`,
        ).toBeLessThan(EDGE_TOLERANCE_PX);
      }
    }
  });
}

/** Breakpoint boundary (spec §4.3): same 552px container, viewports either side
 *  of 640. Catches any responsive utility scoped into the 430-639 band. */
test("boundary pair: stacked at 639, inline at 640 (same container)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [viewport, mode] of [
    [639, "stacked"],
    [640, "inline"],
  ] as const) {
    await page.setViewportSize({ width: viewport, height: 900 });
    await page.goto(`${baseUrl}G1-flagged-640.html`, { waitUntil: "load" });
    const m = await page.evaluate(() => {
      const root = document.querySelector('[data-cell="G1-flagged"]');
      const icon = root?.querySelector('span[aria-hidden="true"]');
      const headerLine = icon?.parentElement ?? null;
      const outer = headerLine?.parentElement ?? null;
      if (!(headerLine instanceof HTMLElement) || !(outer instanceof HTMLElement)) {
        return { error: "structure not found" };
      }
      return {
        error: null,
        headerLineWidth: headerLine.getBoundingClientRect().width,
        outerHeight: Math.round(outer.getBoundingClientRect().height * 100) / 100,
      };
    });
    expect(m.error, `boundary fixture @ ${viewport}`).toBeNull();
    if (m.error !== null) return;
    if (mode === "stacked") {
      expect(m.headerLineWidth, "639: line-1 wrapper still has its box").toBeGreaterThan(0);
      expect(m.outerHeight, "639: two-row flagged header").toBeCloseTo(HEADER_WITH_PILL_PX, 0);
    } else {
      expect(m.headerLineWidth, "640: line-1 wrapper is boxless").toBe(0);
      expect(m.outerHeight, "640: one 44px row").toBeCloseTo(HEADER_LINE_PX, 0);
    }
  }
});

/** Hit-area tangency (spec §4.3, R1 f4): the glyph's expanded target must not
 *  bleed into the inline pill. elementFromPoint is the oracle — pseudo-element
 *  hit areas are invisible to rects. */
test("wide inline row: pill's right edge is not the link's hit area @ 640", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(`${baseUrl}G1-flagged-640.html`, { waitUntil: "load" });
  const m = await page.evaluate(() => {
    const root = document.querySelector('[data-cell="G1-flagged"]');
    const link = root?.querySelector("a[href]");
    const pill = root?.querySelector('[class*="rounded-pill"]');
    if (!(link instanceof HTMLElement) || !(pill instanceof HTMLElement)) {
      return { error: "link/pill not found" };
    }
    const r = pill.getBoundingClientRect();
    const hit = document.elementFromPoint(r.right - 1, (r.top + r.bottom) / 2);
    return {
      error: null,
      hitIsPill: hit === pill || pill.contains(hit),
      hitIsLink: hit === link || link.contains(hit),
    };
  });
  expect(m.error, "fixture shape").toBeNull();
  if (m.error !== null) return;
  expect(m.hitIsLink, "the link's overlay does not reach into the pill").toBe(false);
  expect(m.hitIsPill, "the pill's own right edge hits the pill").toBe(true);
});

/** Mounted-node snap at 640 (spec §4.2 row H): pill add/remove keeps the single
 *  44px row and is instant in both directions. */
test("transition audit: wide header keeps 44px when its pill changes on a mounted node", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(`${baseUrl}G1-flagged-640.html`, { waitUntil: "load" });
  const m = await page.evaluate(() => {
    const root = document.querySelector('[data-cell="G1-flagged"]');
    const icon = root?.querySelector('span[aria-hidden="true"]');
    const header = icon?.parentElement?.parentElement;
    const pill = root?.querySelector('[class*="rounded-pill"]');
    if (!(header instanceof HTMLElement) || !(pill instanceof HTMLElement)) {
      return { error: "structure not found" };
    }
    const h = () => Math.round(header.getBoundingClientRect().height * 100) / 100;
    const withPill = h();
    pill.style.display = "none";
    const withoutPill = h();
    pill.style.display = "";
    const restored = h();
    return { error: null, withPill, withoutPill, restored };
  });
  expect(m.error, "fixture shape").toBeNull();
  if (m.error !== null) return;
  expect(m.withPill, "one row with the pill inline").toBeCloseTo(HEADER_LINE_PX, 0);
  expect(m.withoutPill, "still one row without it — same task, instant").toBeCloseTo(
    HEADER_LINE_PX, 0,
  );
  expect(m.restored, "instant in both directions").toBeCloseTo(HEADER_LINE_PX, 0);
});
```

(f) Structural single-DOM assertion (spec §4.4) — add inside the matrix test's evaluate: `links: root.querySelectorAll("a[href]").length, pills: root.querySelectorAll('[class*="rounded-pill"]').length`, and assert after cell membership: `expect(m.links).toBe(spec.link ? 1 : 0)` and `expect(m.pills).toBe(spec.pill === "none" ? 0 : 1)` (runs at every width including 375 and 1280 — pins decision 6).

(g) Transition audit (row I): loop and `sweepCell` viewport type gain 640; the `:793` message and the file-header comments (`:692-694`, `:700`) become 276 per spec §2.5.

- [ ] **Step 3: Extend the real-route suite (rows K–N)**

In `tests/e2e/admin-layout-dimensions.spec.ts`:

(a) Row K (width chain, `:691-712`): measure `outer` — in the evaluate, after `const row = group?.parentElement`, add `const outerEl = row?.parentElement` (validated `instanceof HTMLElement`, else skip the heading as today) and compute `contentWidth` from `outerEl` instead of `row`. Update the local comment ("the element with the box at every width is the OUTER block; its content box equals the line-1 wrapper's at narrow — spec 2026-07-26 §4.2 row K").

(b) Rows L/M/N (§5 width-link chain): the test receives `width`; pass `isWide: width >= 640` into the evaluate. Then:

```ts
          // Narrow: the line-1 wrapper carries the box (spec 2026-07-25). Wide:
          // it is deliberately boxless (display: contents) — the link is dropped
          // and REPLACED by a counted assertion so the substitution cannot
          // silently not-run (spec 2026-07-26 §4.2 rows L/N).
          if (!isWide) {
            addLink(headerLine, column);
          } else {
            if (headerLine.getBoundingClientRect().width !== 0) {
              return { error: `headerLine has a box at a wide width: ${card.dataset.testid}` };
            }
            boxlessHeaders += 1;
          }

          const pill = column.querySelector('[class*="rounded-pill"]');
          if (pill !== null) pillLinesPresent += 1;
          const pillLine = headerLine.nextElementSibling;
          if (!isWide) {
            if (pillLine instanceof HTMLElement && pillLine.contains(pill)) {
              addLink(pillLine, column);
              pillLinesMeasured += 1;
            }
          } else if (pill instanceof HTMLElement) {
            // Row M: the pill participates in the single row — its centre sits in
            // the heading's band. The wrapper still .contains(pill) but is boxless,
            // so linking it would compare 0 against the column width.
            const headingEl = column.querySelector("h3, h4");
            if (headingEl instanceof HTMLElement) {
              const hb = headingEl.getBoundingClientRect();
              const pb = pill.getBoundingClientRect();
              if (Math.abs((pb.top + pb.bottom) / 2 - (hb.top + hb.bottom) / 2) <= 0.5) {
                pillLinesMeasured += 1;
              }
            }
          }
```

`boxlessHeaders` initialised alongside the pill counters and returned; after the per-card loop the assertions fork (row N):

```ts
      const LINK_FLOOR = width >= 640 ? 4 : 5;
      expect(
        found.perCard.filter((c) => c.links < LINK_FLOOR),
        `every card contributed at least ${LINK_FLOOR} chain links [@ ${width}]`,
      ).toEqual([]);
      if (width >= 640) {
        expect(
          found.boxlessHeaders,
          `every card's header line verified boxless [@ ${width}]`,
        ).toBe(found.cards);
      }
```

(the existing `>= 5` filter is replaced by this block; the comment above it gains the wide caveat). The `pillLinesMeasured === pillLinesPresent` equality and the total-accounting assertion stay verbatim.

(c) Row P: update the two "61-case" comments (`:638`, `:645`) with the post-extension count from Step 6.

- [ ] **Step 4: jsdom class tripwire (spec §4.5)**

Create `tests/components/admin/wizard/modalSectionChromeClasses.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * Class-string tripwire for the sm+ inline header fork (spec 2026-07-26 §4.5).
 * Geometry lives in the real-browser suites; this fails FAST on a class typo.
 * jsdom computes no layout, so nothing here asserts visibility or size.
 * Mount pattern from tests/components/admin/wizard/sectionCountBoundary.test.tsx:33-48
 * (chrome in context; BreakdownSection routes through ModalSectionChrome).
 */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  BreakdownSection,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";

function renderChrome(overrides: Partial<Step3SectionChrome>) {
  const chrome: Step3SectionChrome = {
    Icon: (() => null) as never,
    label: "Rooms & scope",
    flagged: false,
    dfid: "drive-x",
    sectionId: "rooms",
    ...overrides,
  };
  return render(
    <Step3SectionChromeContext.Provider value={chrome}>
      <BreakdownSection testId="chrome-classes" label="Rooms & scope" count={4}>
        <div />
      </BreakdownSection>
    </Step3SectionChromeContext.Provider>,
  );
}

describe("ModalSectionChrome sm+ classes", () => {
  test("outer carries the sm row classes; line1 flattens; glyph orders last", () => {
    const { container } = renderChrome({ flagged: true });
    const icon = container.querySelector('span[aria-hidden="true"]');
    const line1 = icon?.parentElement ?? null;
    const outer = line1?.parentElement ?? null;
    expect(outer?.className).toMatch(/sm:min-h-tap-min/);
    expect(outer?.className).toMatch(/sm:flex-row/);
    expect(outer?.className).toMatch(/sm:items-center/);
    expect(outer?.className).toMatch(/sm:gap-2\.5/);
    expect(line1?.className).toMatch(/sm:contents/);
    const link = container.querySelector("a[href]");
    expect(link?.className).toMatch(/sm:order-1/);
    expect(link?.className).toMatch(/sm:ml-0\.5/);
    const pillWrapper = container.querySelector('[class*="rounded-pill"]')?.parentElement;
    expect(pillWrapper?.className).toMatch(/sm:contents/);
  });

  test("linkless branch: slot compensation is narrow-only", () => {
    const { container } = renderChrome({ dfid: "", sectionId: "rooms" });
    const heading = container.querySelector("h3");
    const group = heading?.parentElement ?? null;
    expect(group?.className).toMatch(/pr-header-link-slot/);
    expect(group?.className).toMatch(/sm:pr-0/);
    expect(group?.className).toMatch(/sm:justify-start/);
    expect(container.querySelector("a[href]")).toBeNull();
  });

  test("judgment pill wrapper also flattens", () => {
    const { container } = renderChrome({ judgment: true });
    const pillWrapper = container.querySelector('[class*="rounded-pill"]')?.parentElement;
    expect(pillWrapper?.className).toMatch(/sm:contents/);
  });
});
```

(Types verified against the live module this session: `Step3SectionChrome` requires `Icon`/`label`/`flagged` with optional `judgment`/`headingLevel`/`dfid`/`sectionId` (`components/admin/wizard/step3ReviewSections.tsx:448`); the context is `Step3SectionChrome | null` (`components/admin/wizard/step3ReviewSections.tsx:551`). The linkless variant passes `{ dfid: "" }` — same falsy-dfid route the harness's defensive cells use.)

- [ ] **Step 5: Run everything RED**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts --reporter line
pnpm exec vitest run tests/components/admin/wizard/modalSectionChromeClasses.test.tsx
```

Expected: the NEW wide cases fail (stacked rendering at 640/1280: `headerLine` has a box, `outer` is 72.8px on pilled cells, pill below the row, class strings absent); all 320/375/430 cases still PASS (baseline was 69/69 green). Record the exact failed/passed counts. (The real-route suite's RED is exercised in Step 7 — it needs the dev server; the retargeted narrow behavior there is GREEN-preserving by construction, and 640 is a new width.)

- [ ] **Step 6: The implementation**

`components/admin/wizard/step3ReviewSections.tsx` — exact class edits (spec §2.1; everything else in the component untouched):

```
outer  (:922)  ${sub ? "mb-2" : "mb-3"} flex w-full flex-col items-stretch gap-1.5
               sm:min-h-tap-min sm:flex-row sm:items-center sm:gap-2.5
line1  (:923)  flex w-full min-h-tap-min items-center gap-2.5 sm:contents
group  (:942)  flex min-w-0 flex-1 items-center justify-center gap-1.5 sm:justify-start
               + linkless branch string: " pr-header-link-slot sm:pr-0"
glyph  (:988)  + sm:order-1 sm:ml-0.5   (appended to the existing class list)
line2  (:998, :1005)  flex w-full justify-center sm:contents   (both pill branches)
```

Comment updates in the same edit (spec §5.5): the 908–921 header comment describes BOTH modes and the `min-h-tap-min` carry trap ("`display: contents` removes the line-1 box at `sm`+, so the 44px floor moves to the outer element via `sm:min-h-tap-min`"); 936–941 gains "below `sm`" scoping; 994–996 gains "below `sm`" scoping. Also update the two test-file comment sites (`publishedWarningsPanel.test.tsx:235-243,317` scoped to narrow; `sectionCountBoundary.test.tsx:80,105,120` "centred group" → "name group").

Then recount for rows P: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts --list | tail -1` and write that case count into `_sectionHeaderWidths.ts:12` and `admin-layout-dimensions.spec.ts:638,645`.

- [ ] **Step 7: Run everything GREEN**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts --reporter line
pnpm exec vitest run tests/components/admin/wizard tests/components/admin/showpage/publishedWarningsPanel.test.tsx
pnpm exec playwright test tests/e2e/admin-layout-dimensions.spec.ts --project desktop-chromium -g "width chain|T-NOPHANTOM" --reporter line
```

The third command runs under the main `playwright.config.ts` with the local dev server on :3000 (`reuseExistingServer` picks up a running one; boot per the harness-readiness section if absent). Expected: all pass, width chain now at 375/640/1280.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/_sectionHeaderWidths.ts tests/e2e/section-header-layout.layout.spec.ts \
  tests/e2e/admin-layout-dimensions.spec.ts tests/components/admin/wizard/modalSectionChromeClasses.test.tsx \
  components/admin/wizard/step3ReviewSections.tsx tests/components/admin/showpage/publishedWarningsPanel.test.tsx \
  tests/components/admin/wizard/sectionCountBoundary.test.tsx
git commit --no-verify -m "feat(admin): inline section-header row at sm+ (spec 2026-07-26)"
```

Commit body records the RED and GREEN counts from Steps 5/7.

### Task 2: Documentation sweep (spec §5)

**Files:**
- Modify: `DESIGN.md:201` (token row), `DESIGN.md:344-349` (§7a pattern), `DESIGN.md:352` (verification line)
- Modify: `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md:35-36` (supersession notes)
- Modify: `BACKLOG.md:113-116` (three prose updates)

**Interfaces:** none (prose only).

- [ ] **Step 1: Apply the six edits, verbatim scope from spec §5**

1. `DESIGN.md:344` pattern intro gains: "This column shape is the **below-`sm`** treatment. At `sm`+ the same tree flattens to one left-aligned row — name+count left, pill inline right, glyph last — via `sm:contents` on both wrappers; the 44px floor moves to the outer element (`sm:min-h-tap-min`), because `display: contents` removes the wrapper's box. Spec: `docs/superpowers/specs/2026-07-26-section-header-wide-inline.md`."
2. The "column, not a row" and `pr-header-link-slot` bullets gain "(below `sm`)" qualifiers.
3. `DESIGN.md:352`: widths become 320/375/430/640/1280 and the sentence gains the 2026-07-26 spec pointer.
4. `DESIGN.md:201` token row appends: "(narrow-only as of 2026-07-26: at `sm`+ the name is left-aligned and no compensation applies)".
5. Old spec `:35` and `:36` each gain a trailing sentence: "**Superseded at `sm`+** by `2026-07-26-section-header-wide-inline.md` (owner re-decision); stands below `sm`."
6. `BACKLOG.md:113` below-`sm` qualifier + "pill-side bleed resolved at `sm`+ by `sm:ml-0.5`"; `:114` footprint attribution (`headerLine` below `sm`, `outer` at `sm`+); `:116` "superseded at `sm`+ by the 2026-07-26 spec (owner re-decision); still out of bounds below `sm`".

- [ ] **Step 2: Verify + commit**

```bash
pnpm exec vitest run tests/docs 2>/dev/null || true   # doc-pinned suites (designSevenAEmptyHiddenSites et al) stay green
pnpm spec:lint docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md
git add DESIGN.md BACKLOG.md docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md
git commit --no-verify -m "docs: width-qualify the centred-header pattern; supersession + backlog notes"
```

### Task 3: Impeccable dual-gate (invariant 8)

- [ ] **Step 1:** Run `/impeccable critique` on the diff (canonical v3 setup: `context.mjs` context load, register read). 
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix P0/P1 findings or defer via `DEFERRED.md` with rationale; re-run affected suites; commit as `fix(admin): impeccable dispositions` if any change lands. Record findings + dispositions for the handoff/PR body.

### Task 4: Full local gates

- [ ] **Step 1:** `git checkout -- lib/admin/__generated__/devPanelPresent.ts` if the dev server dirtied it (build artifact — never commit).
- [ ] **Step 2:** `pnpm test` (full suite, ~16 min — scoped runs miss registry suites), `pnpm typecheck` (both tsconfigs), `pnpm lint`, `pnpm format:check`. All green before push; failures are fixed, not bypassed.
