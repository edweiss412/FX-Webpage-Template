/**
 * tests/e2e/published-review-modal.layout.spec.ts (admin-show-modal Task 12 —
 * spec §6.6 dimensional invariants)
 *
 * Real-browser layout assertions for <PublishedReviewModal> (the
 * `/admin?show=<slug>` published review surface in the ReviewModalShell
 * chrome). jsdom computes NO layout and this project's Tailwind v4 does NOT
 * default `.flex` to `align-items: stretch` (DESIGN.md §7) — the §6.6
 * panel-column equations must be measured in a real browser.
 *
 * STANDALONE static harness (no app boot / no Supabase / no seed), modelled on
 * tests/e2e/step3-review-modal.layout.spec.ts:
 *   1. `tsx` runs tests/e2e/_publishedReviewModalHarness.tsx OUT of process
 *      (its JSX + the imported real component tree break react-dom/server under
 *      Playwright's test transform) → { dfid, normal }. HASH_FOR_LOG_PEPPER is
 *      set for the subprocess only to satisfy a module-load guard on a
 *      transitively-imported auth helper; no email is ever hashed here.
 *   2. compile the real token CSS from app/globals.css via the Tailwind CLI
 *      with `@source` pointing at the rendered modal so every class generates.
 *   3. serve harness.html over node:http; measure `getBoundingClientRect()`.
 *
 * T-LAYOUT — modal-header-reconciliation §6.1/§8 rewrites the §6.6 equations
 * from TWO bands to THREE: the status strip moved out of the header, and since
 * 2026-08-25-review-modal-strip-dock §3.1 it lives in the shell's `footer`
 * rather than its `subHeader` band, so the panel column is
 * header + main + footer. Asserted (±0.5px) at 375×812 (sheet) and
 * 1280×900 (popup/two-pane):
 *   - sheet (<sm):  grab + header + main + footer === panel.clientHeight
 *   - ≥sm:          header + main + footer === panel.clientHeight
 *                   (grab hidden; the strip DOCKED to the footer in
 *                   2026-08-25-review-modal-strip-dock §3.1, so the modal now
 *                   supplies the shell `footer` prop and no longer supplies
 *                   `subHeader` — the band is gone, not emptied)
 *   - "main" = ShowReviewSurface's root node
 *     (`wizard-step3-card-<dfid>-review-main`), scoped INSIDE the
 *     `published-show-review` modal container — it fills to the panel bottom.
 *
 * Concrete failure modes: a non-shrink-0 header or band (or a body without
 * min-h-0 flex-1) breaks the sum (children overflow or leave slack in the
 * panel); a resurrected footer element breaks the no-footer term; a grab strip
 * that leaks into ≥sm breaks the popup equation; and a strip that was restyled
 * IN PLACE rather than moved leaves the band absent, so the three-term sum
 * cannot resolve at all.
 *
 * Measurements run under `prefers-reduced-motion: reduce` emulation:
 * app/globals.css collapses the [data-review-modal-panel] entrance animation
 * to none under reduced motion, so geometry is stable on load (documented
 * flake-avoidance choice, same as the step3 layout spec).
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer/Supabase):
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/published-review-modal.layout.spec.ts
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import sharp from "sharp";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { DIAGRAM_VARIANT_WIDTHS } from "@/lib/sync/diagramVariants";
import { diagramTileWidthAt } from "@/components/admin/wizard/step3ReviewSections";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import {
  scanForPhantomGaps,
  reconcilePhantomLedger,
  type PhantomLedgerRow,
} from "./helpers/phantomGap";

// CommonJS package — Playwright's CJS loader provides __dirname (mirrors the
// step3-review-modal.layout.spec.ts template; do NOT use import.meta.url here).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_MIN = 44;

// NOT imported from ./_publishedReviewModalHarness: Playwright's test transform
// rewrites JSX in every .tsx it loads into component-testing payloads that
// react-dom/server cannot render, so the harness runs via `tsx` in beforeAll.
// The dfid is duplicated here and cross-checked against the harness's JSON
// output so the two can never drift silently.
const HARNESS_DFID = "drive-pubmodal-1";

/** Shell-owned testids: `published-show-review-<name>` (testIdBase, spec §5). */
const BASE = "published-show-review";
const MODAL = `[data-testid="${BASE}-modal"]`;
const PANEL = "[data-review-modal-panel]";
const GRAB = `[data-testid="${BASE}-grab"]`;
const HEADER = `[data-testid="${BASE}-header"]`;
const FOOTER = `[data-testid="${BASE}-footer"]`;
/** The subHeader band (modal-header-reconciliation §6.1) — the strip's new home. */
const SUBHEADER = `[data-testid="${BASE}-subheader"]`;
/** ShowReviewSurface root ("main" in the §6.6 equations), scoped INSIDE the
 *  published modal container — never a page-wide match. */
const MAIN = `${MODAL} [data-testid="wizard-step3-card-${HARNESS_DFID}-review-main"]`;

/** Spec §6.6 named viewports (single source of truth for the loop below). */
const MODES = [
  { mode: "sheet", width: 375, height: 812 },
  { mode: "popup/two-pane", width: 1280, height: 900 },
] as const;

let server: Server;
const diagramBytes = new Map<string, Buffer>();
let diagramConst: { showId: string; rev: string; assetKey: string; widths: readonly number[] };
let baseUrl: string;
let workDir: string;

function pageHtml(cssHref: string, modalMarkup: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">${modalMarkup}</body></html>`;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "published-review-modal-layout-"));

  const pagesJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_publishedReviewModalHarness.tsx"), pagesJson],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      timeout: 120_000,
      // Satisfies the module-load guard in lib/email/hashForLog.ts reached via a
      // transitively-imported auth helper; the static render hashes nothing.
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" },
    },
  );
  const pages = JSON.parse(readFileSync(pagesJson, "utf8")) as {
    dfid: string;
    diagram: { showId: string; rev: string; assetKey: string; widths: readonly number[] };
    normal: string;
    capped: string;
    notLive: string;
    archived: string;
    crewWarnings: string;
    crewWarningsCapped: string;
    saturatedTitle: string;
  };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);
  diagramConst = pages.diagram;
  // The fixture must carry the FULL ingest ladder. A reduced one deletes tier
  // transitions from the derived boundary set below, silently shrinking the
  // cover rather than failing — asserted against the ingest constant, never a
  // literal, so widening the ladder widens this too.
  expect(
    [...diagramConst.widths],
    "harness ladder IS the ingest ladder (a reduced fixture cannot exhibit every tier transition)",
  ).toEqual([...DIAGRAM_VARIANT_WIDTHS]);

  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", pages.normal));
  // §6.6 cap page: the same tree with an over-cap alert count (T-ALERT-CAP).
  writeFileSync(join(workDir, "capped.html"), pageHtml("out.css", pages.capped));
  // §4.2 orange-budget pages (T-NO-ORANGE) — the other two rows of the table.
  writeFileSync(join(workDir, "notlive.html"), pageHtml("out.css", pages.notLive));
  writeFileSync(join(workDir, "archived.html"), pageHtml("out.css", pages.archived));
  // sheet-icon-link spec §7.7: saturated header title (action-side worst case).
  writeFileSync(join(workDir, "saturatedtitle.html"), pageHtml("out.css", pages.saturatedTitle));
  // crew-warning-attachment T5: matched (under-row) + unmatched (in-card group).
  writeFileSync(join(workDir, "crewwarnings.html"), pageHtml("out.css", pages.crewWarnings));
  // crewwarn-underrow-polish §4: capped mixed stack (banner + 3 warnings, one member).
  writeFileSync(
    join(workDir, "crewwarningscapped.html"),
    pageHtml("out.css", pages.crewWarningsCapped),
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  // EVERY page is a Tailwind source — a class that only one page uses (the
  // capped pill's longer label, the archived badge) must still generate, or
  // that page's assertion would measure unstyled markup.
  writeFileSync(
    entryCss,
    [
      "harness.html",
      "capped.html",
      "notlive.html",
      "archived.html",
      "crewwarnings.html",
      "crewwarningscapped.html",
    ]
      .map((f) => `@source "${join(workDir, f)}";\n`)
      .join("") + globals,
  );
  compileEntryCss({ entryCss: entryCss, outFile: join(workDir, "out.css") });

  // Real bytes for the diagram original and for EVERY variant key, each at its
  // OWN intrinsic width. The widths matter: the oracle reads `img.currentSrc`,
  // which is the candidate the browser actually chose, and a browser handed
  // identically-sized images for every descriptor is not making the choice this
  // test claims to observe.
  for (const w of [...diagramConst.widths, 0]) {
    const px = w === 0 ? 2048 : w;
    const key = w === 0 ? diagramConst.assetKey : `${diagramConst.assetKey}@${w}.webp`;
    diagramBytes.set(
      key,
      await sharp({
        create: {
          width: px,
          height: Math.round((px * 3) / 4),
          channels: 3,
          background: { r: 230, g: 232, b: 240 },
        },
      })
        .png()
        .toBuffer(),
    );
  }

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    if (url.startsWith("/api/asset/diagram/")) {
      const key = decodeURIComponent(url.split("/").pop() ?? "");
      const bytes = diagramBytes.get(key);
      if (!bytes) {
        res.statusCode = 404;
        res.end("unknown diagram key");
        return;
      }
      res.setHeader("content-type", "image/png");
      res.end(bytes);
      return;
    }
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const bodyBuf = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(bodyBuf);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

async function openHarness(page: Page, viewport: { width: number; height: number }, htmlPath = "") {
  // Reduced-motion emulation collapses the panel/scrim entrance animation
  // (app/globals.css `@media (prefers-reduced-motion: reduce)`) so geometry
  // is final on load — no animation-end waits, no flake.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(baseUrl + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(MODAL)).toBeVisible();
}

async function heightOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((el) => el.getBoundingClientRect().height);
}

/**
 * The rendered colour of a single viewport pixel, as `[r, g, b]`.
 *
 * T-CORNER needs PAINT, not hit-testing: Blink's `elementFromPoint` ignores a
 * rounded `overflow: hidden` clip entirely (it still returns the clipped child
 * at a corner the child no longer paints), so a DOM probe cannot tell a
 * square-cornered modal from a rounded one. A 1×1 screenshot can. `sharp` is
 * already a project dependency used by the help-screenshot pipeline.
 *
 * Not a baseline/byte gate: nothing is compared against a committed image, only
 * against other pixels sampled in the same run, so this carries none of the
 * pinned-capture-environment obligations of a screenshot-diff gate (AGENTS.md).
 */
async function pixelAt(page: Page, [x, y]: [number, number]): Promise<[number, number, number]> {
  const png = await page.screenshot({
    clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
  });
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return [data[0]!, data[1]!, data[2]!];
}

/** Parses a computed `rgb(r, g, b)` / `rgba(...)` string into `[r, g, b]`. */
function parseRgb(value: string): [number, number, number] | null {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Exact-equal RGB. Every probe sits on flat fill, never on an antialiased edge. */
function rgbEq(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

test.describe("PublishedReviewModal — dimensional invariants (spec §6.6)", () => {
  for (const { mode, width, height: vh } of MODES) {
    const isSheet = mode === "sheet";

    test(`T-LAYOUT ${mode} @ ${width}×${vh}: ${
      isSheet ? "grab + header + main + footer" : "header + main + footer"
    } === panel.clientHeight (±0.5px)`, async ({ page }) => {
      await openHarness(page, { width, height: vh });

      const panelClientHeight = await page
        .locator(PANEL)
        .evaluate((el) => (el as HTMLElement).clientHeight);
      // PRESENCE FIRST, heights second — round 2 (P2) caught the same
      // absent-element trap I had just fixed for the subheader, now sitting on
      // the footer. `heightOf` goes through `locator.evaluate`, which WAITS: if
      // the footer disappears, asking for its height hangs to the test timeout
      // instead of reaching the fast, diagnostic count assertion below. Ordering
      // is the whole fix, so the count must precede every heightOf on it.
      await expect(page.locator(FOOTER), `exactly one footer @ ${mode}`).toHaveCount(1);
      await expect(
        page.locator(SUBHEADER),
        `the subheader band is GONE, not emptied @ ${mode}`,
      ).toHaveCount(0);

      const headerH = await heightOf(page, HEADER);
      const footerH = await heightOf(page, FOOTER);
      const mainH = await heightOf(page, MAIN);
      const grabH = await heightOf(page, GRAB);

      // The strip DOCKED (spec 2026-08-25-review-modal-strip-dock §3.1): the
      // term moved from the subheader band to the footer, and the band is gone
      // rather than emptied. Both halves are asserted, because a 0px leftover
      // band would let the old equation keep passing under the new name — the
      // same "real term, not a placeholder" argument this case has always made,
      // now pointed at the slot that actually holds the strip.
      expect(footerH, `footer has real height @ ${mode}`).toBeGreaterThan(0);

      // Non-vacuity: the fixture's content pane genuinely overflows the capped
      // panel, so "main fills to the panel bottom" is a min-h-0/flex-1 pin —
      // not a short column that happens to fit.
      const mainScroll = await page.locator(MAIN).evaluate((el) => {
        const scroller = el.querySelector('[data-testid$="-review-content"]');
        return scroller
          ? { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight }
          : null;
      });
      expect(mainScroll, "surface scroller present inside main").not.toBeNull();
      expect(
        mainScroll!.scrollHeight,
        `content pane overflows its viewport @ ${mode} (equation is non-vacuous)`,
      ).toBeGreaterThan(mainScroll!.clientHeight);

      const sum = headerH + mainH + footerH + (isSheet ? grabH : 0);
      expect(
        Math.abs(sum - panelClientHeight),
        `${isSheet ? `grab ${grabH} + ` : ""}header ${headerH} + main ${mainH}` +
          ` + footer ${footerH} === panel.clientHeight ${panelClientHeight} @ ${mode}`,
      ).toBeLessThanOrEqual(TOL);

      // No horizontal overflow at this viewport (§8): the strip's row must wrap,
      // never widen the panel. The claim survives the dock unchanged — it was
      // always about the row, not about which slot holds it.
      const hOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hOverflow, `no document h-scroll @ ${mode}`).toBe(false);

      if (isSheet) {
        // The grab strip is real in sheet mode (visible, tap-sized) — its
        // height is a genuine term in the sum, not a display:none 0×0 rect.
        expect(grabH, "grab strip rendered and tap-sized @ sheet").toBeGreaterThanOrEqual(
          TAP_MIN - TOL,
        );
      } else {
        // ≥sm: the grab strip is hidden (`sm:hidden`) — no grab term.
        expect(grabH, `grab strip hidden (display:none) @ ${mode}`).toBe(0);
      }

      // The footer now EXISTS and is the strip's home (spec
      // 2026-08-25-review-modal-strip-dock §3.1). This assertion previously
      // read "NO footer element exists in the published modal", which was true
      // for as long as the strip lived in the subheader band. It is asserted in
      // both modes for the same reason it was before: the shell renders the
      // wrapper only when a consumer supplies the slot, so exactly one is the
      // claim — a second would mean two strips.
      await expect(page.locator(FOOTER), `exactly one footer @ ${mode}`).toHaveCount(1);
    });

    // T-HUB-FLUSH (share-hub T4; replaces T-COPY-FLUSH, whose subject — the
    // standalone strip copy-link — was retired when the hub absorbed it). The
    // hub group carries `ml-auto shrink-0` — this does NOT test that `ml-auto`
    // is present. It tests that `ml-auto` resolves against a FULL-BAND-WIDTH
    // row: the band is deliberately not a flex container, so without `w-full`
    // on the strip root the strip shrink-wraps and the group flushes to the
    // strip's own right edge, well short of the band.
    //
    // Measured against the BAND'S CONTENT BOX, never the panel's: the band
    // carries `px-tile-pad`, so a panel-relative assertion would be off by
    // exactly that padding — and the tempting "fix" would be to delete the
    // padding, which is the wrong repair.
    test(`T-HUB-FLUSH @ ${width}: the share-hub group's right edge sits at the footer's content-box right edge`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const flush = await page.locator(FOOTER).evaluate((band) => {
        const copy = band.querySelector('[data-testid="share-hub-group"]');
        if (copy === null) return null;
        const bandRect = band.getBoundingClientRect();
        const padRight = parseFloat(getComputedStyle(band).paddingRight);
        return {
          contentRight: bandRect.right - padRight,
          copyRight: copy.getBoundingClientRect().right,
          padRight,
        };
      });

      // Anti-vacuity: a null here would silently skip the whole assertion, and
      // the harness fixture is published + tokened precisely so the button exists.
      expect(
        flush,
        "share-hub group present in the band (fixture is published + non-archived)",
      ).not.toBeNull();
      expect(
        flush!.padRight,
        "band carries px-tile-pad (assertion is not panel-relative)",
      ).toBeGreaterThan(0);
      expect(
        Math.abs(flush!.copyRight - flush!.contentRight),
        `hub right ${flush!.copyRight} === band content-box right ${flush!.contentRight} @ ${width}`,
      ).toBeLessThanOrEqual(1);
    });

    // T-HUB-POPOVER lives in published-review-modal.interactions.spec.ts, not
    // here. This spec renders a STATIC harness (no hydration), so clicking a
    // trigger cannot open anything — T-HUB-FLUSH works because the trigger
    // group is in the server-rendered markup, but the popover only exists
    // after a real click. Asserting it here failed on a correct
    // implementation; the interactions spec runs against the hydrated app.

    // REWRITTEN, not deleted and not retuned (modal-header-reconciliation
    // §6.1/§14.1). The old "header rhythm" test policed the gap between the
    // title row and the strip INSIDE the header wrapper. That premise
    // DISSOLVES with this change: they are now separate bands, so there is no
    // intra-header gap between them to measure and no number to retune. The
    // replacement pins what actually governs the seam now — that the header and
    // the band are two distinct bordered bands stacked in the panel column, and
    // that the strip's own row gap lives entirely inside the band.
    //
    // Concrete failure modes caught: the strip is restyled in place and the
    // band never lands (band absent, or not a sibling directly below the
    // header); the band loses its bottom seam so the panel reads as one
    // undifferentiated block; the strip re-acquires vertical padding of its own
    // and double-counts against the band's `py-2`.
    test(`chrome composition @ ${width}: header and footer are distinct seamed ends of the column`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const comp = await page.locator(FOOTER).evaluate((footer) => {
        const panel = footer.parentElement!;
        const header = panel.querySelector('[data-testid$="-header"]')!;
        const footerStyle = getComputedStyle(footer);
        const headerStyle = getComputedStyle(header);
        const strip = footer.querySelector('[data-testid="show-status-strip"]')!;
        const stripStyle = getComputedStyle(strip);
        const kids = Array.from(panel.children);
        return {
          footerIsLastChild: kids.indexOf(footer) === kids.length - 1,
          headerBorderBottom: parseFloat(headerStyle.borderBottomWidth),
          // The footer seams UPWARD (`border-t`), where the band seamed
          // downward — the seam always faces the body, and the body is now on
          // the other side of it.
          footerBorderTop: parseFloat(footerStyle.borderTopWidth),
          footerBottomGap:
            panel.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom,
          footerPadTop: parseFloat(footerStyle.paddingTop),
          footerPadBottom: parseFloat(footerStyle.paddingBottom),
          stripPadTop: parseFloat(stripStyle.paddingTop),
          stripPadBottom: parseFloat(stripStyle.paddingBottom),
        };
      });

      // DOCKED (spec 2026-08-25-review-modal-strip-dock §3.1). The claim this
      // case has always made is that the strip's slot is a distinct seamed
      // child of the panel's flex column, with the slot owning the vertical
      // inset and the strip owning none. All of that survives the move; what
      // inverts is WHERE in the column it sits and which way its seam faces.
      expect(comp.footerIsLastChild, `footer is the panel's LAST child @ ${mode}`).toBe(true);
      expect(comp.headerBorderBottom, `header keeps its own seam @ ${mode}`).toBeGreaterThan(0);
      expect(comp.footerBorderTop, `footer carries its own seam @ ${mode}`).toBeGreaterThan(0);
      // Flush to the panel floor, which is the whole point of docking: a gap
      // here would mean the footer is not actually pinned to the bottom of the
      // flex column, and the strip would drift with the body's height again.
      expect(
        Math.abs(comp.footerBottomGap),
        `footer sits flush at the panel floor @ ${mode}`,
      ).toBeLessThanOrEqual(TOL);
      // The slot owns the vertical inset; the strip owns none, so the two can
      // never double-count.
      expect(comp.footerPadTop, `footer supplies the vertical inset @ ${mode}`).toBeGreaterThan(0);
      expect(comp.footerPadBottom, `footer supplies the vertical inset @ ${mode}`).toBeGreaterThan(
        0,
      );
      expect(comp.stripPadTop, `strip has no own top padding @ ${mode}`).toBe(0);
      expect(comp.stripPadBottom, `strip has no own bottom padding @ ${mode}`).toBe(0);
    });

    // T-CORNER. The panel declares `rounded-t-md` / `sm:rounded-md`, but its
    // direct children (header, subheader) and the two-pane side rail all paint
    // an OPAQUE `bg-surface` with square corners of their own. Without a clip
    // on the panel those bands cover the panel's rounded corners and the modal
    // renders with square edges — the panel's own `border-radius` keeps
    // computing as 12px the whole time, so a `getComputedStyle(panel)`
    // assertion would pass against the bug. This is therefore a PAINT probe
    // (see `pixelAt`): the pixel just inside the panel's bounding-box corner
    // but OUTSIDE the rounded arc must not be painted with the band's fill.
    //
    // The probe offset is derived from the panel's own computed radius, never
    // hardcoded: a point at (left+d, top+d) lies outside a quarter-circle of
    // radius r whenever d < r·(1 − 1/√2) ≈ 0.293r.
    //
    // `d = r/8`, NOT `r/4`. The sampled pixel's CENTRE is what gets rasterized,
    // so the effective offset is d + 0.5, and at r = 12 `r/4` gives 3.5px
    // against a 3.515px bound — a 0.015px margin that a fractional panel top
    // (121.8125 at 375×812) pushes to the wrong side of the arc entirely. It
    // passed only because Blink's antialiasing left that pixel at 227-229
    // rather than the band's 255; a CI rasterizer that rounds it to full
    // coverage would fail deterministically. `r/8` gives ~2.85px of margin.
    //
    // Sheet mode (<sm) clips only the TOP corners — the panel is flush to the
    // viewport bottom (`rounded-t-md`), so bottom probes are meaningless there.
    test(`T-CORNER @ ${width}: opaque bands do not paint over the panel's rounded corners`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const geom = await page.locator(PANEL).evaluate((el, sheet: boolean) => {
        const panel = el as HTMLElement;
        const rect = panel.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius);
        const d = radius / 8;
        const corners: Record<string, [number, number]> = {
          "top-left": [rect.left + d, rect.top + d],
          "top-right": [rect.right - d - 1, rect.top + d],
        };
        if (!sheet) {
          corners["bottom-left"] = [rect.left + d, rect.bottom - d - 1];
          corners["bottom-right"] = [rect.right - d - 1, rect.bottom - d - 1];
        }
        return {
          radius,
          d,
          corners,
          // The band reference is the header's DECLARED fill, not a pixel
          // sampled at a guessed coordinate. A positional sample is wrong two
          // ways: in sheet mode `top + 2r` lands in the transparent grab strip
          // rather than the header, and any future element at that coordinate
          // would silently redirect every corner comparison below to some
          // other colour.
          bandDeclared: getComputedStyle(panel.querySelector('[data-testid$="-header"]')!)
            .backgroundColor,
          // ABOVE the panel, not beside it: in sheet mode the panel is
          // full-bleed, so `rect.left - 8` clamps to x=0 — inside the panel —
          // and the band-vs-scrim discriminating-power guard below goes
          // vacuous at exactly the viewport it matters most.
          outside: [rect.left + rect.width / 2, Math.max(0, rect.top - 8)] as [number, number],
        };
      }, isSheet);

      // Non-vacuity: with a 0 radius every probe would sit on a square corner
      // that is CORRECTLY painted, and the test would police nothing.
      expect(geom.radius, `panel has a real corner radius @ ${mode}`).toBeGreaterThan(0);

      const band = parseRgb(geom.bandDeclared);
      const outside = await pixelAt(page, geom.outside);
      expect(band, `header fill parses as opaque rgb @ ${mode}`).not.toBeNull();
      // Discriminating power: if the band and the scrim rendered the same
      // colour, every corner assertion below would be satisfiable by the bug.
      expect(
        rgbEq(band!, outside),
        `band ${band} and scrim ${outside} are distinguishable colours @ ${mode}`,
      ).toBe(false);

      // EVERY corner is probed before asserting: a per-corner assert would
      // abort on the first offender and hide the others, so a repair that fixed
      // only the top corners would read as fully green.
      const painted: string[] = [];
      for (const [corner, point] of Object.entries(geom.corners)) {
        const px = await pixelAt(page, point as [number, number]);
        // Compared against the BAND, not against the scrim: the panel casts
        // `shadow-tile`, which darkens the scrim in exactly this
        // ring, so a correct render reads scrim-plus-shadow (neither pure
        // colour). What can never be true is the band's own fill landing here.
        if (rgbEq(px, band!)) painted.push(corner);
      }
      expect(
        painted,
        `@ ${mode}: ${geom.d.toFixed(2)}px inside the panel's bounding box is OUTSIDE its` +
          ` ${geom.radius}px arc, so the band fill ${band} must paint at NO corner` +
          ` (scrim reads ${outside})`,
      ).toEqual([]);
    });

    // T-NOSCROLLPORT. The panel clips so its opaque bands stop painting over
    // its rounded corners — but the clip must NOT make the panel a scroll
    // container. Nothing gives the user a way to scroll it back: it has no
    // scrollbar, and the wheel/touch target is the surface's own inner
    // scroller. `scrollIntoView`, however, walks every scrollable ancestor,
    // and two live call sites reach this one — PublishedReviewModal.tsx (the
    // bell-alert deep link, on mount) and ShowReviewSurface.tsx (hash restore).
    // Under `overflow-hidden` the deep link left scrollTop at 154 with the
    // header pushed 110px above the panel's top edge, permanently. Under
    // `overflow-clip` (not a scroll container) it stays 0, matching the
    // pre-clip `overflow: visible` baseline exactly.
    //
    // Asserted on BOTH axes: `overflow-x: hidden` alone would reintroduce it,
    // since a scrollable box on either axis scrolls on both.
    test(`T-NOSCROLLPORT @ ${width}: the corner clip did not make the panel a scroll port`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const probe = await page.locator(PANEL).evaluate((el) => {
        const panel = el as HTMLElement;
        const cs = getComputedStyle(panel);
        const header = panel.querySelector('[data-testid$="-header"]')!;
        // The real deep-link targets: an id inside the panel, chosen the same
        // way the two live call sites choose theirs.
        const ids = [...panel.querySelectorAll("[id]")].map((n) => n.id).filter(Boolean);
        const pick =
          ids.find((i) => /share|access/i.test(i)) ?? ids.find((i) => /overview/i.test(i));
        const target = pick != null ? panel.querySelector(`#${CSS.escape(pick)}`) : null;
        if (target instanceof HTMLElement) target.scrollIntoView({ block: "center" });
        return {
          target: pick ?? null,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          scrollTop: panel.scrollTop,
          scrollRange: panel.scrollHeight - panel.clientHeight,
          headerPushedAboveTop: +(
            panel.getBoundingClientRect().top - header.getBoundingClientRect().top
          ).toFixed(1),
        };
      });

      // Anti-vacuity: with no deep-link target the scroll never fires and the
      // assertions below hold trivially.
      expect(probe.target, `a deep-link target exists in the panel @ ${mode}`).not.toBeNull();

      expect(
        [probe.overflowX, probe.overflowY],
        `panel clips without scrolling @ ${mode} — 'hidden' on either axis makes` +
          ` it a scroll port that scrollIntoView can move and the user cannot move back`,
      ).toEqual(["clip", "clip"]);
      expect(
        probe.scrollTop,
        `deep-link to #${probe.target} left the panel unscrolled @ ${mode}` +
          ` (scroll range ${probe.scrollRange})`,
      ).toBe(0);
      expect(
        probe.headerPushedAboveTop,
        `the header is not pushed above the panel's top edge @ ${mode}`,
      ).toBeLessThanOrEqual(0);
    });

    // T-TAP (modal-header-reconciliation §11.1). A HIT-BEHAVIOR probe, NOT a
    // rect measurement — this distinction is the whole point.
    //
    // The alert pill reaches the 44px floor through a `::before` pseudo-element
    // (`before:-inset-y-3`), which `getBoundingClientRect()` on the anchor
    // CANNOT see: the rect returns the ~24px visible pill. Asserting
    // `rect.height >= 44` would therefore FAIL a CORRECT implementation, and
    // the natural "fix" would be inflating the visible pill — destroying the
    // slim header treatment the design requires. So we probe what a finger
    // actually hits: elementFromPoint at the vertical extremes of the intended
    // band must resolve to the anchor or a node it contains.
    //
    // The sheet-link clause rides along, now in the SheetIconLink overlay form
    // (sheet-icon-link spec §7.1): anti-inflation (visible 20px box, both axes)
    // plus the resolved-inset target and the row floor. The anti-inflation half
    // was the RED edge of the box→overlay migration.
    test(`T-TAP @ ${width}: the alert pill's hit band spans 44px (::before probe, not its rect)`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const pill = page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`);
      await expect(pill, `alert pill present @ ${mode} (fixture has open alerts)`).toHaveCount(1);

      const probe = await pill.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        // 21px above / below center → 42px spanned, comfortably inside the 44
        // the ::before supplies, and outside the ~24px visible pill.
        const topY = box.top + box.height / 2 - 21;
        const botY = box.top + box.height / 2 + 21;
        const hits = (y: number) => {
          const hit = document.elementFromPoint(cx, y);
          return hit !== null && (hit === el || el.contains(hit));
        };
        return { visibleHeight: box.height, top: hits(topY), bottom: hits(botY) };
      });

      // Non-vacuity: the probe only proves anything if the VISIBLE pill is
      // genuinely shorter than the band it is claimed to cover. If someone
      // inflated the pill to 44px the probe would pass trivially — and that is
      // the design regression this test exists to prevent.
      expect(
        probe.visibleHeight,
        `visible pill stays slim (${probe.visibleHeight}px) — the ::before, not the box, supplies the 44px floor`,
      ).toBeLessThan(TAP_MIN);
      expect(probe.top, `21px ABOVE the pill's center hits the pill @ ${mode}`).toBe(true);
      expect(probe.bottom, `21px BELOW the pill's center hits the pill @ ${mode}`).toBe(true);

      // Rider, SheetIconLink form (sheet-icon-link spec §7.1). Two halves:
      // (a) ANTI-INFLATION, the red edge of the box→overlay migration: the
      //     anchor's own rect stays 20px on BOTH axes — a rect ≥44 means the
      //     boxed idiom crept back;
      // (b) the 44px target lives in the ::before overlay, read from the four
      //     resolved insets (asymmetric: 10px title-side, 14px trailing), and
      //     the row's min-h-tap-min floor contains it vertically.
      const sheet = await page
        .locator(`${MODAL} [data-testid="${BASE}-sheetlink"]`)
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el, "::before");
          const row = el.parentElement!.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            targetW:
              r.width -
              parseFloat(cs.insetInlineStart || "0") -
              parseFloat(cs.insetInlineEnd || "0"),
            targetH:
              r.height -
              parseFloat(cs.insetBlockStart || "0") -
              parseFloat(cs.insetBlockEnd || "0"),
            rowH: row.height,
          };
        });
      expect(sheet.w, `visible sheet link stays 20px wide @ ${mode}`).toBeLessThan(TAP_MIN);
      expect(sheet.h, `visible sheet link stays 20px tall @ ${mode}`).toBeLessThan(TAP_MIN);
      expect(sheet.targetW, `overlay target width @ ${mode}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
      expect(sheet.targetH, `overlay target height @ ${mode}`).toBeGreaterThanOrEqual(
        TAP_MIN - TOL,
      );
      expect(sheet.rowH, `title row holds the 44px floor @ ${mode}`).toBeGreaterThanOrEqual(
        TAP_MIN - TOL,
      );
    });
  }

  // Bleed invariant by RECT INTERSECTION (sheet-icon-link spec §5/§7.7): the
  // overlay rect — anchor rect expanded by the four resolved ::before insets —
  // must not cover any pixel of any neighbouring content box. Pure geometry:
  // hand-picked probe coordinates cannot be guaranteed to land inside a
  // neighbour (sublines start after margins; items-start offsets the cluster).
  // The SATURATED title page is what makes the action-side cases real — with
  // the short fixture title the link sits in free flex space and the cluster
  // cases would be vacuously green. Neighbour rects are asserted non-degenerate
  // for the same reason.
  for (const { width, height } of [
    { width: 375, height: 812 },
    { width: 1280, height: 900 },
  ] as const) {
    test(`sheet-link overlay intersects NO neighbouring box @ ${width} (saturated title)`, async ({
      page,
    }) => {
      await openHarness(page, { width, height }, "saturatedtitle.html");
      const m = await page.evaluate((base) => {
        const link = document.querySelector(`[data-testid="${base}-sheetlink"]`);
        if (!(link instanceof HTMLElement)) return { error: "sheetlink not found" };
        const r = link.getBoundingClientRect();
        const cs = getComputedStyle(link, "::before");
        const overlay = {
          left: r.left + parseFloat(cs.insetInlineStart || "0"),
          top: r.top + parseFloat(cs.insetBlockStart || "0"),
          right: r.right - parseFloat(cs.insetInlineEnd || "0"),
          bottom: r.bottom - parseFloat(cs.insetBlockEnd || "0"),
        };
        const named = (name: string, el: Element | null | undefined) => {
          if (!(el instanceof HTMLElement)) return null;
          const b = el.getBoundingClientRect();
          return { name, left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        };
        const header = link.closest("header");
        const title = named("title", document.querySelector(`[data-testid="${base}-title"]`));
        const subline = named("subline", document.querySelector(`[data-testid="${base}-subline"]`));
        // The actions cluster is the header's last direct child (shrink-0 group
        // beside the flex-1 text block); its FIRST element child is the nearest
        // box the 14px trailing reach could touch, and the close button is the
        // nearest interactive one.
        const cluster = header ? header.children[header.children.length - 1] : null;
        const clusterFirst = named("cluster-first", cluster?.firstElementChild);
        const close = named("close", document.querySelector(`[data-testid="${base}-close"]`));
        const neighbours = [title, subline, clusterFirst, close].filter(
          (n): n is NonNullable<typeof n> => n !== null,
        );
        return { error: null, overlay, neighbours };
      }, BASE);
      expect(m.error, "fixture shape").toBeNull();
      if (m.error !== null) return;
      expect(
        m.neighbours!.map((n) => n.name),
        "title, subline, cluster and close all measured",
      ).toEqual(expect.arrayContaining(["title", "subline", "cluster-first", "close"]));
      // SATURATION IS ASSERTED, not assumed (whole-diff review F3): the long
      // title must actually push the link against the cluster clearance —
      // trailing edge to cluster-first box within mr-0.5(2) + gap-3(12) + TOL.
      // Free flex space here would green-wash every action-side intersection.
      const clusterFirst = m.neighbours!.find((n) => n.name === "cluster-first")!;
      expect(
        clusterFirst.left - (m.overlay!.right - 14),
        `saturated title leaves <= 14px+TOL to the cluster @ ${width}`,
      ).toBeLessThanOrEqual(14 + 1);
      for (const n of m.neighbours!) {
        expect(n.right - n.left, `${n.name} rect non-degenerate (width)`).toBeGreaterThan(0);
        expect(n.bottom - n.top, `${n.name} rect non-degenerate (height)`).toBeGreaterThan(0);
        const w = Math.min(m.overlay!.right, n.right) - Math.max(m.overlay!.left, n.left);
        const h = Math.min(m.overlay!.bottom, n.bottom) - Math.max(m.overlay!.top, n.top);
        expect(
          Math.max(0, w) * Math.max(0, h),
          `overlay does not cover the ${n.name} @ ${width}`,
        ).toBe(0);
      }
      // elementFromPoint spot check (whole-diff review F2): geometry says the
      // 44×44 target exists; only a hit test says paint order, clipping, and
      // stacking leave it CLICKABLE. Centre + four corners, 1px inside.
      const hits = await page.evaluate(
        ({ base, box }) => {
          const link = document.querySelector(`[data-testid="${base}-sheetlink"]`);
          const probe = (x: number, y: number) => {
            const hit = document.elementFromPoint(x, y);
            return hit !== null && (hit === link || (link?.contains(hit) ?? false));
          };
          return [
            probe((box.left + box.right) / 2, (box.top + box.bottom) / 2),
            probe(box.left + 1, box.top + 1),
            probe(box.right - 1, box.top + 1),
            probe(box.left + 1, box.bottom - 1),
            probe(box.right - 1, box.bottom - 1),
          ];
        },
        { base: BASE, box: m.overlay! },
      );
      expect(hits, `overlay centre + corners all hit the link @ ${width}`).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);
    });
  }

  // T-ALERT-CAP @375px (modal-header-reconciliation §6.6). `alertCount` is
  // unbounded and the pill lives in the header's shrink-0 right group beside
  // Close, so a four-digit count widens that group and squeezes the title —
  // breaking the Step 3 frame this change exists to adopt.
  //
  // The assertion is DELIBERATELY NOT "same width as the 2-alert case":
  // "99+ alerts" is legitimately wider than "2 alerts", so an equal-width
  // assertion would be false-red, and the tempting fix would be dropping the
  // visible unit §6.6 requires. What is asserted is that the group stays a
  // MINORITY of the header and leaves the title real width.
  test("T-ALERT-CAP @375: a 1200-alert count stays capped and never starves the title", async ({
    page,
  }) => {
    await openHarness(page, { width: 375, height: 812 }, "capped.html");

    const pill = page.locator(`${MODAL} [data-testid="${BASE}-alert-pill"]`);
    await expect(pill).toHaveCount(1);

    // Visible text is capped — with the sr-only exact count stripped, since
    // that node is precisely what must NOT satisfy a "visible text" claim.
    const visible = await pill.evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sr-only, [aria-hidden="true"]').forEach((n) => n.remove());
      return clone.textContent!.replace(/\s+/g, " ").trim();
    });
    expect(
      visible,
      "the UNIT stays visible past the cap — a bare '99+' is not self-explanatory",
    ).toBe("99+ issues");

    const geom = await page.locator(HEADER).evaluate((header) => {
      const title = header.querySelector('[data-testid$="-title"]')!;
      const pillEl = header.querySelector('[data-testid$="-alert-pill"]')!;
      // The right group is the shrink-0 cluster (pill + close). The pill now
      // nests in a `relative` menu-anchor wrapper, so climb to the flex group.
      const group = pillEl.closest(".shrink-0") ?? pillEl.parentElement!;
      return {
        headerWidth: header.getBoundingClientRect().width,
        groupWidth: group.getBoundingClientRect().width,
        titleWidth: title.getBoundingClientRect().width,
      };
    });

    expect(
      geom.groupWidth,
      `right group ${geom.groupWidth} ≤ 50% of header ${geom.headerWidth}`,
    ).toBeLessThanOrEqual(geom.headerWidth / 2);
    expect(geom.titleWidth, "title keeps non-zero width at 375px").toBeGreaterThan(0);

    const hOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hOverflow, "no document h-scroll with a capped four-digit count @ 375").toBe(false);
  });

  // T-CONTRAST (modal-header-reconciliation §6.4 / §7.1 / §7.2, Task 6).
  // share-hub T4 retargeted the SUBJECT from the retired outline Copy button to
  // the hub's KEBAB trigger — the band's remaining transparent-background
  // control, which is exactly what this sampling method exists for. (The
  // primary trigger is a solid accent fill when published, so it would make the
  // walk-up trivial and test nothing.) Method and rationale unchanged; the
  // sampled value is the icon's currentColor rather than a text label.
  //
  // The sampling method IS the test. The kebab trigger is
  // `background: transparent`, so reading `backgroundColor` off the element
  // itself yields rgba(0,0,0,0) and ANY ratio computed against it is
  // meaningless — a correct implementation fails, or a broken one passes. The
  // "fix" that failure invites is giving the button a solid fill, which undoes
  // the neutral treatment this task exists to introduce. So the backdrop is
  // resolved by WALKING UP to the first ancestor that actually paints (§7.2 —
  // by walking, not by assuming a fixed ancestor depth).
  //
  // LABEL ONLY, deliberately: there is NO border-ratio assertion. Watchpoint 8 /
  // §7.1 record that `border-border-strong` measures ~1.6:1 on the band surface
  // in BOTH themes; a 3:1 border rule is unsatisfiable with the mandated token
  // and would force either weakening the test or abandoning the token system.
  // The visible label does the identifying work.
  for (const theme of ["light", "dark"] as const) {
    test(`T-CONTRAST ${theme}: the hub kebab's icon color clears WCAG 1.4.3 (>=4.5:1) on its real backdrop`, async ({
      page,
    }) => {
      await openHarness(page, { width: 1280, height: 900 });
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);

      // MUST settle before sampling. The button carries `transition-colors`, so
      // flipping the theme starts a color transition and an immediate read
      // returns a MID-TRANSITION value — measured here as rgb(27,28,32), one
      // step off the light-mode text color, on a page that was already dark.
      // That produced a ~1.04:1 ratio and would have been "fixed" by weakening
      // the threshold. Waiting on getAnimations() is exact (CSS transitions are
      // animations); a fixed sleep would be a guess.
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
      });

      const sample = await page
        .locator(`${FOOTER} [data-testid="share-hub-kebab"]`)
        .evaluate((btn) => {
          const parse = (c: string): [number, number, number, number] => {
            const n = c.match(/[\d.]+/g)!.map(Number);
            return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
          };
          const self = getComputedStyle(btn);
          // Walk up until something genuinely paints (alpha > 0).
          let node: HTMLElement | null = btn.parentElement;
          let backdrop: [number, number, number, number] | null = null;
          let depth = 0;
          while (node !== null) {
            depth += 1;
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (bg[3] > 0) {
              backdrop = bg;
              break;
            }
            node = node.parentElement;
          }
          return {
            ownBg: parse(self.backgroundColor),
            label: parse(self.color),
            backdrop,
            depth,
            backdropTestId: node?.getAttribute("data-testid") ?? null,
          };
        });

      // The premise of the whole method: the control really is transparent, so
      // a naive same-element sample would have been meaningless. If this ever
      // fails, the button gained a fill and the neutral treatment is gone.
      expect(sample.ownBg[3], "the outline control is transparent-backed (§7.2 premise)").toBe(0);
      expect(sample.backdrop, "a painting ancestor was found by walking up").not.toBeNull();

      const luminance = (c: number[]): number => {
        const lin = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
      };
      const l1 = luminance(sample.label);
      const l2 = luminance(sample.backdrop!);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      expect(
        ratio,
        `${theme}: label rgb(${sample.label.slice(0, 3).join(",")}) on backdrop rgb(${sample
          .backdrop!.slice(0, 3)
          .join(
            ",",
          )}) (${sample.depth} level(s) up, testid ${sample.backdropTestId}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  // ── modal-header-reconciliation §4.2 / §6.7 (Task 7) ─────────────────────

  // T-NO-ORANGE. ENUMERATES the accent-resolving set; it does NOT assert the
  // absence of `bg-accent`. That absence check is doubly wrong: it MISSES the
  // live dot (`bg-status-live`, a different class resolving to the same hue via
  // globals.css:89) and it cannot catch a future third orange — a new token
  // alias, a raw hex, or an inline style.
  //
  // Discovery is therefore BY COMPUTED COLOR (§4.2 step 3): resolve
  // --color-accent once, normalize it to rgb(), walk the header + subheader
  // bands, and flag any element whose computed backgroundColor OR borderColor
  // equals it. Elements are grouped by their nearest ancestor-or-self testid so
  // the assertion reads as the spec's table does ({publish toggle, live dot}) —
  // the live dot legitimately paints twice (dot + ping halo).
  //
  // Transient state styles are OUT of scope (§4.2 step 4): focus-visible rings
  // and :hover are legitimately accent, so the probe runs with nothing focused
  // and no pointer over the region. `color` is out of scope too — this rule is
  // about FILLS and BORDERS.
  //
  // DECLARED NOT RED on the pre-change tree, in the plan's own
  // honest-declaration idiom (00-overview.md §Rule 2). The plan predicted red
  // on the theory that the accent trigger would be a third element in the
  // region — but pre-change the trigger is in OVERVIEW, outside the header
  // region entirely, so all three rows report their post-change sets already.
  // VERIFIED by running it, not reasoned: the two non-archived rows initially
  // failed only because the expected LABELS were wrong (the walk resolves the
  // innermost testid, `published-toggle` / `status-dot-live`, not the strip
  // wrappers). Its value is undiminished and immediate: it fails the moment
  // the trigger lands in the band as an AccentButton, which is precisely the
  // "treat the demotion as style-only" failure this task guards against.
  const ORANGE_STATES = [
    {
      name: "!archived, isLive: true",
      page: "",
      expected: ["published-toggle", "status-dot-live"],
    },
    { name: "!archived, isLive: false", page: "notlive.html", expected: ["published-toggle"] },
    // The STRONGEST row: the only state that proves the probe is measuring
    // rather than matching a hardcoded expectation.
    { name: "archived: true", page: "archived.html", expected: [] as string[] },
  ] as const;

  for (const { name, page: htmlPath, expected } of ORANGE_STATES) {
    test(`T-NO-ORANGE [${name}]: the accent-resolving set in the modal chrome is EXACTLY ${
      expected.length === 0 ? "{}" : `{${expected.join(", ")}}`
    }`, async ({ page }) => {
      await openHarness(page, { width: 1280, height: 900 }, htmlPath);

      // No focus ring, no hover: both are legitimately accent and excluded.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(0, 0);

      const found = await page.evaluate(
        ({ modalSel, headerSel, footerSel }) => {
          // Normalize the token through the browser rather than parsing hex
          // ourselves — that is what makes an aliased token still compare equal.
          const probe = document.createElement("span");
          probe.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(
            "--color-accent",
          );
          document.body.appendChild(probe);
          const accent = getComputedStyle(probe).backgroundColor;
          probe.remove();

          const modal = document.querySelector(modalSel)!;
          // The modal's CHROME: the header, plus whichever slot holds the
          // control strip. That was the subheader band; after the dock (spec
          // 2026-08-25-review-modal-strip-dock §3.1) it is the footer. The
          // invariant was never about a particular slot — it is that accent
          // resolves on exactly the sanctioned controls wherever the chrome
          // puts them, and `published-toggle` and `status-dot-live` travelled
          // with the strip.
          const regions = [modal.querySelector(headerSel), modal.querySelector(footerSel)].filter(
            (n): n is Element => n !== null,
          );

          const labels = new Set<string>();
          let rawCount = 0;
          for (const region of regions) {
            for (const el of [region, ...Array.from(region.querySelectorAll("*"))]) {
              // Only what the browser actually PAINTS: a display:none node
              // (e.g. the live ping under reduced motion) is not orange on screen.
              if ((el as HTMLElement).getClientRects().length === 0) continue;
              const cs = getComputedStyle(el);
              // PER-SIDE colour AND that side's own WIDTH. Round 3 (P2): every
              // side's colour was gated on `borderTopWidth >= 0`, which is
              // always true for a computed width, and never on the width of the
              // side being tested. A probe set an accent `borderRightColor`
              // with all four widths at 0px and the census reported it painted.
              // Zero-width border colours also commonly resolve from
              // `currentColor`, so this misread accent TEXT as an accent border
              // — inflating the very set this case exists to hold at exactly
              // the sanctioned members.
              const paintedBorder = (
                [
                  [cs.borderTopColor, cs.borderTopWidth],
                  [cs.borderRightColor, cs.borderRightWidth],
                  [cs.borderBottomColor, cs.borderBottomWidth],
                  [cs.borderLeftColor, cs.borderLeftWidth],
                ] as const
              ).some(([c, w]) => c === accent && parseFloat(w) > 0);
              const hit = cs.backgroundColor === accent || paintedBorder;
              if (!hit) continue;
              rawCount += 1;
              let node: Element | null = el;
              let label: string | null = null;
              while (node !== null && node !== region.parentElement) {
                const id = node.getAttribute("data-testid");
                if (id !== null) {
                  label = id;
                  break;
                }
                node = node.parentElement;
              }
              labels.add(label ?? `<untestid'd ${el.tagName.toLowerCase()}>`);
            }
          }
          return { accent, labels: Array.from(labels).sort(), rawCount };
        },
        { modalSel: MODAL, headerSel: `[data-testid="${BASE}-header"]`, footerSel: FOOTER },
      );

      // Non-vacuity: if --color-accent failed to resolve, `accent` would be
      // transparent and every state would trivially report an empty set —
      // including the two that must NOT be empty.
      expect(found.accent, "--color-accent resolved to a real painted color").not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(found.labels, `accent-resolving set @ ${name}`).toEqual([...expected].sort());
      if (expected.length === 0) {
        // Belt-and-braces on the strongest row: not merely "no labelled group",
        // but no accent-painting ELEMENT at all.
        expect(found.rawCount, "archived paints zero accent elements").toBe(0);
      }
    });
  }

  // T-STATUS-INLINE (modal-header-reconciliation §4.5 / §8, Task 8). The
  // headline delta: the stacked two-line synced/edited block collapses to ONE
  // row — dot · "Synced {rel}" · 3px bullet · "Edited {rel}".
  //
  // GENUINELY RED pre-change: the two text nodes lived in a `flex flex-col`
  // column (StatusStrip.tsx:211 before this task), so their
  // getBoundingClientRect().top values differed by a full line-height (~14px at
  // text-xs/tight) — an order of magnitude past the 2px tolerance. This is the
  // ONLY assertion in the suite that catches an implementer who restyles the
  // colors and order but leaves the column in place; every other status
  // assertion (null-edited, error-bucket, dot color, time source) passes
  // against the stacked layout.
  //
  // The harness fixture is `ok` with both stamps present, so editedRel is
  // non-null and both nodes render (a vacuous pass is impossible — both
  // locators are asserted visible first).
  test("T-STATUS-INLINE @1280: Synced and Edited share one row, separated by a 3px bullet", async ({
    page,
  }) => {
    await openHarness(page, { width: 1280, height: 900 });
    const synced = page.locator(`${FOOTER} [data-testid="strip-synced-line"]`);
    const edited = page.locator(`${FOOTER} [data-testid="strip-edited-age"]`);
    const bullet = page.locator(`${FOOTER} [data-testid="strip-status-bullet"]`);
    await expect(synced).toBeVisible();
    await expect(edited).toBeVisible();

    // PRIMARY CLAUSE FIRST, deliberately: the shared-row measurement is the
    // delta, and ordering it ahead of the bullet's existence check is what
    // proves the red phase came from the LAYOUT, not merely from a new testid
    // that does not exist yet. Verified pre-implementation: this failed with a
    // 14px top delta.
    const syncedBox = await synced.evaluate((el) => el.getBoundingClientRect());
    const editedBox = await edited.evaluate((el) => el.getBoundingClientRect());
    expect(
      Math.abs(syncedBox.top - editedBox.top),
      `Synced top ${syncedBox.top} vs Edited top ${editedBox.top} — one row (2px)`,
    ).toBeLessThanOrEqual(2);

    await expect(bullet).toBeVisible();
    const bulletBox = await bullet.evaluate((el) => el.getBoundingClientRect());
    // The separator is BETWEEN them horizontally, and is the 3px pill (§7's
    // separator size — not an inherited text glyph).
    expect(bulletBox.left, "bullet sits right of the Synced text").toBeGreaterThanOrEqual(
      syncedBox.right - TOL,
    );
    expect(bulletBox.right, "bullet sits left of the Edited text").toBeLessThanOrEqual(
      editedBox.left + TOL,
    );
    expect(bulletBox.height, "3px separator height").toBeLessThanOrEqual(3 + TOL);
    expect(bulletBox.height, "3px separator is painted, not collapsed").toBeGreaterThan(0);
  });

  // T-TAP (ghost Re-sync trigger). Unlike the alert pill, the trigger reaches
  // the 44px floor with a REAL box (`min-h-tap-min`/`min-w-tap-min`), because
  // `AccentButton` used to supply `minWidthTap` and a raw <button> drops it.
  // So this one IS a rect measurement — the mock's ~30px box is below the floor.
  test("T-TAP @1280: the ghost Re-sync trigger's own box clears 44px", async ({ page }) => {
    await openHarness(page, { width: 1280, height: 900 });
    const box = await page
      .locator(`${FOOTER} [data-testid="admin-resync-button"]`)
      .evaluate((el) => el.getBoundingClientRect());
    expect(box.height, "ghost trigger height").toBeGreaterThanOrEqual(TAP_MIN - TOL);
    expect(box.width, "ghost trigger width").toBeGreaterThanOrEqual(TAP_MIN - TOL);
  });

  // T-CONTRAST (ghost Re-sync label), §7.1 / §7.2. Same sampling method as the
  // Copy label above and for the same reason: the ghost trigger has no
  // background at all, so a same-element sample is meaningless and the "fix" it
  // invites is giving the lowest-affordance control in the strip a fill.
  // LABEL ONLY — no border ratio (the ghost has no border to measure).
  for (const theme of ["light", "dark"] as const) {
    test(`T-CONTRAST ${theme}: the ghost Re-sync label clears WCAG 1.4.3 (>=4.5:1) on its real backdrop`, async ({
      page,
    }) => {
      await openHarness(page, { width: 1280, height: 900 });
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      // MUST settle: the trigger carries `transition-colors`, so an immediate
      // read after the theme flip returns a MID-TRANSITION color. (Task 6 hit
      // exactly this and measured a ~1.04:1 ratio.) getAnimations() is exact;
      // a fixed sleep would be a guess.
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
      });

      const sample = await page
        .locator(`${FOOTER} [data-testid="admin-resync-button"]`)
        .evaluate((btn) => {
          const parse = (c: string): [number, number, number, number] => {
            const n = c.match(/[\d.]+/g)!.map(Number);
            return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
          };
          const self = getComputedStyle(btn);
          let node: HTMLElement | null = btn.parentElement;
          let backdrop: [number, number, number, number] | null = null;
          while (node !== null) {
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (bg[3] > 0) {
              backdrop = bg;
              break;
            }
            node = node.parentElement;
          }
          return {
            ownBg: parse(self.backgroundColor),
            label: parse(self.color),
            backdrop,
            backdropTestId: node?.getAttribute("data-testid") ?? null,
          };
        });

      expect(sample.ownBg[3], "the ghost trigger is transparent-backed (§7.2 premise)").toBe(0);
      expect(sample.backdrop, "a painting ancestor was found by walking up").not.toBeNull();

      const luminance = (c: number[]): number => {
        const lin = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
      };
      const l1 = luminance(sample.label);
      const l2 = luminance(sample.backdrop!);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      expect(
        ratio,
        `${theme}: ghost label rgb(${sample.label.slice(0, 3).join(",")}) on backdrop rgb(${sample
          .backdrop!.slice(0, 3)
          .join(",")}) (testid ${sample.backdropTestId}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// crew-warning-attachment T5 (spec 2026-07-23 §2 Dimensional invariants):
// real-browser containment for crew warning placement. jsdom computes no
// layout, so "inside the panel card" and "between the rows" are measured here.
//
// Dimensional invariants under test (from the spec):
//   - the under-row stack ([data-testid="crew-warn-stack-<key>"]) sits INSIDE
//     the crew section's panel-card border box, below its member's row and
//     above the next row;
//   - the fallback group block ([data-testid="section-warning-controls-crew"])
//     is fully contained in the crew panel card rect (left/right/top/bottom);
//   - card bottom >= extras bottom (no overflow out of the border);
//   - the under-row stack FILLS its member's row horizontally — same left edge,
//     same width (BL-CREW-WARN-STACK-E2E-GEOMETRY, the residual of PR #534's
//     descoped Task 10: containment bounds the stack loosely inside the card,
//     it does not pin the stack to the row it belongs to).
//
// Fixture (crewwarnings.html): "Crew Member A (5/3 ONLY)" raw blockRef name →
// strips to the rendered "Crew Member A" row (under-row); "Ghost Crew" matches
// no roster row (fallback into the in-card group).
test.describe("crew warning placement — containment (crew-warning-attachment T5)", () => {
  const CREW_SECTION = `[data-testid="wizard-step3-card-${HARNESS_DFID}-review-section-crew"]`;
  const STACK = '[data-testid="crew-warn-stack-crew member a"]';
  const GROUP = '[data-testid="section-warning-controls-crew"]';

  /** The crew section's §5.2 panel card, anchored from the ROSTER (anti-tautology:
   *  never matched by border+list shape alone — the extras block also has a border-t
   *  and its cards render lists, so a shape probe can select the very element under
   *  test). Walk UP from a roster row to the first bordered ancestor div inside the
   *  section: the extras block is never an ancestor of a roster row, before OR after
   *  the in-card move. */
  async function cardRect(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
    return page.locator(CREW_SECTION).evaluate((section) => {
      const rows = [...section.querySelectorAll("li")];
      const rosterRow = rows.find((li) => li.textContent?.includes("Crew Member A"));
      if (!rosterRow) throw new Error("roster row 'Crew Member A' not found in crew section");
      let el: HTMLElement | null = rosterRow.parentElement as HTMLElement | null;
      while (el && el !== section) {
        if (
          el instanceof HTMLDivElement &&
          Number.parseFloat(getComputedStyle(el).borderTopWidth) > 0
        ) {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }
        el = el.parentElement as HTMLElement | null;
      }
      throw new Error(
        "no bordered ancestor div (panel card) between the roster row and the section",
      );
    });
  }

  test("T-WARN-UNDERROW @1280: matched warning's stack sits inside the card, between its row and the next", async ({
    page,
  }) => {
    await openHarness(page, { width: 1280, height: 900 }, "crewwarnings.html");
    await expect(page.locator(STACK), "under-row stack present for the stripped key").toHaveCount(
      1,
    );

    const card = await cardRect(page);
    const stack = (await page.locator(STACK).boundingBox())!;
    const rowA = (await page
      .locator(`${CREW_SECTION} li`, { hasText: "Crew Member A" })
      .first()
      .boundingBox())!;
    const rowB = (await page
      .locator(`${CREW_SECTION} li`, { hasText: "Crew Member B" })
      .first()
      .boundingBox())!;

    expect(stack.x, "stack left inside card").toBeGreaterThanOrEqual(card.x - TOL);
    expect(stack.x + stack.width, "stack right inside card").toBeLessThanOrEqual(
      card.x + card.w + TOL,
    );
    expect(stack.y, "stack top inside card").toBeGreaterThanOrEqual(card.y - TOL);
    expect(stack.y + stack.height, "stack bottom inside card").toBeLessThanOrEqual(
      card.y + card.h + TOL,
    );
    // Between its member's row and the next member's row (the hosting <li>
    // wraps both the row content and the stack, so rowA CONTAINS the stack).
    expect(stack.y, "stack starts inside its member's li").toBeGreaterThanOrEqual(rowA.y - TOL);
    expect(stack.y + stack.height, "stack ends before the next row begins").toBeLessThanOrEqual(
      rowB.y + TOL,
    );
  });

  /** Border box AND content box (`left`/`width` only) for one element.
   *  BOTH are needed: `box-sizing: border-box` keeps horizontal padding INSIDE
   *  the border box, so a `pl-6` hoisted from the per-kind wrapper onto the
   *  stack leaves `getBoundingClientRect()` byte-identical while insetting
   *  every card by 24px. Only the content box sees it. */
  type Span = { borderLeft: number; borderW: number; contentLeft: number; contentW: number };

  /** The under-row stack's spans, plus its member ROW's spans — the row derived
   *  from the rendered NAME (never from the stack's own parent, which would make
   *  the equality a restatement of `display: block`): find the name span, walk up
   *  to the direct child of the hosting <li>. Throws if the resolved row turns
   *  out to CONTAIN the stack, so a future markup collapse fails the test instead
   *  of satisfying it vacuously. */
  async function stackVsRowSpans(
    page: Page,
    stackSel: string,
  ): Promise<{ stack: Span; row: Span; liW: number }> {
    return page.locator(CREW_SECTION).evaluate((section, sel) => {
      const spanOf = (el: Element): Span => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const padL = Number.parseFloat(cs.paddingLeft);
        const padR = Number.parseFloat(cs.paddingRight);
        const bL = Number.parseFloat(cs.borderLeftWidth);
        const bR = Number.parseFloat(cs.borderRightWidth);
        return {
          borderLeft: r.x,
          borderW: r.width,
          contentLeft: r.x + bL + padL,
          contentW: r.width - bL - bR - padL - padR,
        };
      };
      const stack = section.querySelector(sel);
      if (!stack) throw new Error(`stack ${sel} not found in crew section`);
      const li = stack.closest("li");
      if (!li) throw new Error("stack has no hosting <li>");
      const nameSpan = [...li.querySelectorAll("span")].find(
        (s) => s.textContent?.trim() === "Crew Member A",
      );
      if (!nameSpan) throw new Error("name span 'Crew Member A' not found in the hosting li");
      let row: HTMLElement = nameSpan as HTMLElement;
      while (row.parentElement && row.parentElement !== li) {
        row = row.parentElement as HTMLElement;
      }
      if (row.contains(stack)) {
        throw new Error("resolved row CONTAINS the stack — equality would be tautological");
      }
      return {
        stack: spanOf(stack),
        row: spanOf(row),
        liW: spanOf(li).contentW,
      };
    }, stackSel);
  }

  for (const vp of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    // T-WARN-WIDTHFILL (BL-CREW-WARN-STACK-E2E-GEOMETRY). `w-full` on
    // CrewUnderRowStack is unit-asserted for class PRESENCE only
    // (tests/admin/wizard/crewWarnStack.test.tsx) — jsdom computes no layout, so
    // nothing proves the class resolves to the row's extent.
    //
    // Concrete failure modes this catches (each verified by mutation):
    //   - `w-fit` on the stack shrinks it to its widest card instead of filling
    //     the row (border-box width). Caught at 1280 only: at 390 the widest card
    //     already fills the narrow row, so shrink-to-fit and fill are
    //     geometrically identical there — hence BOTH viewports run;
    //   - the 24px per-kind indent (crewwarn-underrow-polish §2, `pl-6` on the
    //     wrapper INSIDE the stack, so each kind opts in) hoisted onto the stack
    //     itself, double-indenting every kind (content box only — the border box
    //     is unchanged, which is why both spans are measured);
    //   - a horizontal margin on the stack, or x-padding added to the hosting
    //     <li> that the row picks up and the stack does not (or vice versa).
    test(`T-WARN-WIDTHFILL @${vp.width}: under-row stack fills its member's row (border box + content box)`, async ({
      page,
    }) => {
      await openHarness(page, vp, "crewwarnings.html");
      await expect(page.locator(STACK), "under-row stack present for the stripped key").toHaveCount(
        1,
      );

      const { stack, row, liW } = await stackVsRowSpans(page, STACK);

      // Anti-vacuity floor: a collapsed layout (both boxes ~0-wide) satisfies any
      // equality. The row spans the panel card, so it is a large fraction of the
      // viewport at BOTH widths measured here.
      expect(row.contentW, "row has real extent").toBeGreaterThan(vp.width * 0.4);
      expect(Math.abs(row.borderW - liW), "row itself fills the hosting li").toBeLessThanOrEqual(
        TOL,
      );

      expect(
        Math.abs(stack.borderLeft - row.borderLeft),
        "stack border-box left === row border-box left",
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(stack.borderW - row.borderW),
        "stack border-box width === row border-box width",
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(stack.contentLeft - row.contentLeft),
        "stack content-box left === row content-box left (no inset of its own)",
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(stack.contentW - row.contentW),
        "stack content-box width === row content-box width",
      ).toBeLessThanOrEqual(TOL);
    });
  }

  test("T-WARN-INCARD @1280: unmatched warning's fallback group is contained in the crew panel card", async ({
    page,
  }) => {
    await openHarness(page, { width: 1280, height: 900 }, "crewwarnings.html");
    await expect(
      page.locator(GROUP),
      "fallback group present (Ghost Crew matches no rendered row)",
    ).toHaveCount(1);
    // Conservation guard: the matched warning renders ONLY under its row — the
    // group must not also carry a card for it (scoped text probe on the group).
    await expect(
      page.locator(GROUP),
      "matched warning's card does not double-render in the group",
    ).not.toContainText("Crew phone for row 1");

    const card = await cardRect(page);
    const group = (await page.locator(GROUP).boundingBox())!;
    expect(group.x, "group left inside card").toBeGreaterThanOrEqual(card.x - TOL);
    expect(group.x + group.width, "group right inside card").toBeLessThanOrEqual(
      card.x + card.w + TOL,
    );
    expect(group.y, "group top inside card").toBeGreaterThanOrEqual(card.y - TOL);
    expect(group.y + group.height, "group bottom inside card (no overflow)").toBeLessThanOrEqual(
      card.y + card.h + TOL,
    );
  });
});

// crewwarn-underrow-polish §2/§4: hop-by-hop width invariants + the capped mixed
// stack (banner consumes a cap slot; per-kind widths in ONE stack). TOL = 0.5px.
test.describe("crew warning indent + cap (crewwarn-underrow-polish)", () => {
  const STACK = '[data-testid="crew-warn-stack-crew member a"]';
  const MORE = '[data-testid="crew-warn-more-crew member a"]';
  const CARD = '[data-testid="compact-alert-card"]';

  async function widthOf(page: Page, selector: string, nth = 0): Promise<number> {
    const box = await page.locator(selector).nth(nth).boundingBox();
    expect(box, `no box for ${selector} [${nth}]`).not.toBeNull();
    return box!.width;
  }

  /** Asserts the FULL visible-card chain wrapper→ul→li→card for the pl-6 wrapper
   *  rooted at `wrapperSel` (nth), against the given parent width. */
  async function expectCardChain(
    page: Page,
    wrapperSel: string,
    nth: number,
    parentWidth: number,
  ): Promise<void> {
    const w = await widthOf(page, wrapperSel, nth);
    expect(Math.abs(w - parentWidth), `wrapper vs parent`).toBeLessThanOrEqual(TOL);
    const ulW = await widthOf(page, `${wrapperSel} > ul`, nth);
    expect(Math.abs(ulW - (w - 24)), `ul vs wrapper - 24`).toBeLessThanOrEqual(TOL);
    const liW = await widthOf(page, `${wrapperSel} > ul > li`, nth);
    expect(Math.abs(liW - ulW), `li vs ul`).toBeLessThanOrEqual(TOL);
    const cardW = await widthOf(page, `${wrapperSel} > ul > li > ${CARD}`, nth);
    expect(Math.abs(cardW - liW), `card vs li`).toBeLessThanOrEqual(TOL);
  }

  test("T-WARN-INDENT @1280: single-warning page, full visible chain", async ({ page }) => {
    await openHarness(page, { width: 1280, height: 900 }, "crewwarnings.html");
    const stackW = await widthOf(page, STACK);
    await expect(page.locator(`${STACK} > div.pl-6`)).toHaveCount(1);
    await expectCardChain(page, `${STACK} > div.pl-6`, 0, stackW);
  });

  for (const vp of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`T-WARN-CAP @${vp.width}: banner + 1 warning visible, "2 more" hidden, per-kind widths, both subtrees hop-by-hop`, async ({
      page,
    }) => {
      await openHarness(page, vp, "crewwarningscapped.html");
      const stackW = await widthOf(page, STACK);

      // Cap slots: exactly 1 banner + 1 visible warning wrapper as DIRECT children.
      const bannerSel = `${STACK} > [data-testid^="attention-banner-"]`;
      await expect(page.locator(bannerSel)).toHaveCount(1);
      await expect(page.locator(`${STACK} > div.pl-6`)).toHaveCount(1);

      // Per-kind widths in ONE stack (spec §1.1 #2 + §2) + full visible chain.
      expect(Math.abs((await widthOf(page, bannerSel)) - stackW)).toBeLessThanOrEqual(TOL);
      await expectCardChain(page, `${STACK} > div.pl-6`, 0, stackW);

      // Disclosure subtree, closed state first: details spans the stack, summary
      // spans the details, hidden wrappers exist but are NOT visible.
      const detailsSel = `${STACK} > details`;
      expect(Math.abs((await widthOf(page, detailsSel)) - stackW)).toBeLessThanOrEqual(TOL);
      const summary = page.locator(`${MORE} > summary`);
      await expect(summary).toContainText("2 more");
      const sBox = await summary.boundingBox();
      expect(sBox).not.toBeNull();
      expect(sBox!.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(sBox!.width - (await widthOf(page, detailsSel)))).toBeLessThanOrEqual(TOL);
      await expect(page.locator(`${MORE} div.pl-6`)).toHaveCount(2);
      await expect(page.locator(`${MORE} div.pl-6`).first()).toBeHidden();

      // Open natively; disclosure body + BOTH hidden card chains (spec §2 table).
      await summary.click();
      const bodySel = `${MORE} > div`;
      expect(
        Math.abs((await widthOf(page, bodySel)) - (await widthOf(page, detailsSel))),
      ).toBeLessThanOrEqual(TOL);
      const bodyW = await widthOf(page, bodySel);
      for (const nth of [0, 1]) {
        await expect(page.locator(`${MORE} div.pl-6`).nth(nth)).toBeVisible();
        await expectCardChain(page, `${bodySel} > div.pl-6`, nth, bodyW);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phantom-gap invariants (overview-phantom-gap fix, 2026-07-24).
//
// A wrapper that ALWAYS renders but whose entire content is state-gated becomes a
// ZERO-HEIGHT flex item when the gate is false. A zero-height item is invisible,
// but it is still an item: its parent's `gap` is charged for it, so the surface
// shows a doubled seam that no element accounts for. Reported against the
// published modal's Overview section: `overview-sheet-sync` renders empty on every
// non-archived show, adding a full `--spacing-section-gap` (32px) on top of the
// content pane's own `gap-6`, so the alert card sat 56px from the Venue heading
// where every other section pair sits 24px apart.
//
// jsdom cannot see this at all — it computes no layout, so the empty wrapper has
// no box and no gap either way, and a class-presence assertion would only restate
// the fix. Both tests below measure real geometry.
test.describe("phantom gap — zero-height flex items charge their parent's gap", () => {
  const OVERVIEW = `${MODAL} #overview`;

  for (const { mode, width, height: vh } of MODES) {
    // T-OVERVIEW-TIGHT. The section's bottom edge must sit on its last VISIBLE
    // content, not on a zero-height slot below it.
    //
    // Deliberately NOT "section height === sum of child heights + gaps": every
    // zero-height child contributes 0 to that sum AND extends the section by a
    // gap, so the equation is satisfiable by the bug. Deliberately NOT "the
    // section's last child's bottom === the section's bottom" either — the empty
    // wrapper IS the last child and its rect bottom sits exactly on the section
    // bottom, so that form passes against the bug too. What is measured is the
    // slack between the last child with REAL EXTENT and the section's own edge.
    test(`T-OVERVIEW-TIGHT ${mode} @ ${width}: no vertical slack below the Overview section's last visible content`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const probe = await page.locator(OVERVIEW).evaluate((section) => {
        const kids = Array.from(section.children) as HTMLElement[];
        const boxes = kids.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            testId: el.getAttribute("data-testid") ?? el.tagName.toLowerCase(),
            display: getComputedStyle(el).display,
            height: r.height,
            bottom: r.bottom,
          };
        });
        const visible = boxes.filter((b) => b.display !== "none" && b.height > 0);
        return {
          rowGap: parseFloat(getComputedStyle(section).rowGap),
          sectionBottom: section.getBoundingClientRect().bottom,
          sectionHeight: section.getBoundingClientRect().height,
          childCount: kids.length,
          boxes,
          visible,
        };
      });

      // Non-vacuity: the fixture is a non-archived show WITH attention items, so
      // the section has real content and its own row gap is live. Without both,
      // "no slack" would hold trivially.
      expect(probe.visible.length, `Overview has visible content @ ${mode}`).toBeGreaterThan(0);
      expect(probe.rowGap, `Overview's own row gap is live @ ${mode}`).toBeGreaterThan(0);
      expect(probe.sectionHeight, `Overview has real height @ ${mode}`).toBeGreaterThan(0);

      const lastVisibleBottom = Math.max(...probe.visible.map((b) => b.bottom));
      expect(
        probe.sectionBottom - lastVisibleBottom,
        `@ ${mode}: Overview bottom ${probe.sectionBottom} sits ${(
          probe.sectionBottom - lastVisibleBottom
        ).toFixed(1)}px below its last visible content — children: ${JSON.stringify(probe.boxes)}`,
      ).toBeLessThanOrEqual(TOL);
    });

    // The seam between Overview and the section after it is the content pane's
    // OWN gap and nothing more. This is the user-visible symptom, measured
    // against the pane's computed gap rather than a hardcoded 24 — a token change
    // must not be able to turn this test red.
    test(`T-OVERVIEW-SEAM ${mode} @ ${width}: the Overview→next-section seam equals the content pane's gap`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const seam = await page.locator(OVERVIEW).evaluate((section) => {
        // The scroll pane is the gapped flex column; Overview is wrapped in a
        // ref-carrying box that is one of its children (ShowReviewSurface's
        // renderExtraPanel), so walk up to the child whose parent is the pane.
        const pane = section.closest('[data-testid$="-review-content"]');
        if (pane === null) return null;
        // `Element`, not `HTMLElement`: `parentElement` widens to
        // HTMLElement | SVGElement | MathMLElement, which does not narrow back
        // under exactOptionalPropertyTypes. Only rects are read below.
        let box: Element = section;
        while (box.parentElement !== null && box.parentElement !== pane) {
          box = box.parentElement;
        }
        // The seam's endpoint is the next sibling that PARTICIPATES IN THE FLEX
        // LAYOUT. `display:none` and out-of-flow (absolute/fixed) siblings are
        // skipped because they charge no gap and shift nothing — failing on them
        // would reject a correct tree (an overlay host or a hidden anchor between
        // two sections is layout-neutral). Everything else is kept, INCLUDING a
        // zero-height in-flow child: that is a genuine phantom item and must reach
        // the assertions below rather than be skipped past, or this test recreates
        // the exact hole it was repaired for.
        let next: Element | null = box.nextElementSibling;
        const skipped: string[] = [];
        while (next !== null) {
          const ncs = getComputedStyle(next);
          if (ncs.display !== "none" && ncs.position !== "absolute" && ncs.position !== "fixed") {
            break;
          }
          skipped.push(next.getAttribute("data-testid") ?? `<${next.tagName.toLowerCase()}>`);
          next = next.nextElementSibling;
        }
        if (next === null) return null;
        const nextRect = next.getBoundingClientRect();
        return {
          paneRowGap: parseFloat(getComputedStyle(pane).rowGap),
          gap: nextRect.top - box.getBoundingClientRect().bottom,
          nextTestId: next.getAttribute("data-testid"),
          nextHeight: nextRect.height,
          skipped,
        };
      });

      expect(seam, `Overview has a following in-flow sibling @ ${mode}`).not.toBeNull();
      expect(seam!.paneRowGap, `content pane declares a row gap @ ${mode}`).toBeGreaterThan(0);
      // IDENTITY, not merely extent. Extent alone leaves the hole this assertion
      // exists to close: a 1px placeholder — or an empty div with padding, a
      // border, or a min-height — is displayed, has positive height, and begins
      // exactly one `paneRowGap` after Overview, so it satisfies every arithmetic
      // check while Venue still starts a second gap further down and the
      // user-visible Overview→Venue seam stays doubled. What makes the endpoint
      // trustworthy is that it IS a rail section. Matched by shape rather than by
      // naming `venue`, so reordering the rail cannot make this false-red.
      expect(
        seam!.nextTestId ?? "(no testid)",
        `the element after Overview is a rail section @ ${mode}` +
          (seam!.skipped.length > 0
            ? ` (skipped layout-neutral siblings: ${seam!.skipped.join(", ")})`
            : ""),
      ).toMatch(/-review-section-[a-z]+$/);
      // A rail section with no extent would still charge the pane a second gap
      // below itself, so the endpoint must also be real.
      expect(
        seam!.nextHeight,
        `the section after Overview has real extent @ ${mode} (testid ${seam!.nextTestId})`,
      ).toBeGreaterThan(0);
      expect(
        Math.abs(seam!.gap - seam!.paneRowGap),
        `@ ${mode}: seam to ${seam!.nextTestId} measured ${seam!.gap.toFixed(1)}px, pane gap is ${
          seam!.paneRowGap
        }px`,
      ).toBeLessThanOrEqual(TOL);
    });
  }

  // T-SLOT-PAINTS is the negative-regression half of the fix, and the ONLY test
  // that can fail if `empty:hidden` over-reaches. `:empty` matches on child-node
  // count, so a slot with content must stay in flow — but every other assertion
  // here is satisfied by a slot that is hidden ALWAYS, and T-NOPHANTOM
  // specifically skips `display:none` subtrees, so an over-broad `hidden` would
  // read as green everywhere else. The archived page is the only fixture where
  // this slot has a child.
  //
  // jsdom cannot stand in: the existing unit test
  // (tests/components/admin/showpage/overviewSection.test.tsx) proves the notice
  // is in the DOM, which is exactly what a `display:none` regression would also
  // allow. Only a real browser resolves the class to a computed display.
  test("T-SLOT-PAINTS [archived] @1280: the sheet/sync slot stays in flow when it HAS content", async ({
    page,
  }) => {
    await openHarness(page, { width: 1280, height: 900 }, "archived.html");

    const slot = await page
      .locator(`${MODAL} [data-testid="overview-sheet-sync"]`)
      .evaluate((el) => {
        const notice = el.querySelector('[data-testid="admin-show-resync-archived"]');
        const rect = el.getBoundingClientRect();
        return {
          display: getComputedStyle(el).display,
          height: rect.height,
          childCount: el.children.length,
          noticeText: notice?.textContent?.trim() ?? null,
          noticeHeight: notice?.getBoundingClientRect().height ?? 0,
        };
      });

    // Premise: the fixture really does fill the slot. Without a child, `:empty`
    // matches legitimately and the rest of this test would be about nothing.
    expect(slot.childCount, "archived fixture fills the sheet/sync slot").toBeGreaterThan(0);
    expect(slot.noticeText, "the Re-sync-paused notice is the child").toContain(
      "Re-sync is paused",
    );

    expect(slot.display, "a populated slot is NOT display:none").not.toBe("none");
    expect(slot.height, "a populated slot has real height").toBeGreaterThan(0);
    expect(slot.noticeHeight, "the notice itself paints").toBeGreaterThan(0);
  });

  // T-NOPHANTOM is the CLASS defense, not a second look at the same element: it
  // discovers zero-extent flex/grid items anywhere in the rendered modal instead
  // of naming the one that was reported. A new always-rendered, fully-gated
  // wrapper fails this the moment it lands, in any section. It is what surfaced
  // the ScheduleDayRow instance, which the bug report never mentioned.
  //
  // The walk itself, what it can and cannot see, and every design decision behind
  // it now live in tests/e2e/helpers/phantomGap.ts — it is shared with the crew
  // page and admin dashboard mounts (BL-PHANTOM-GAP-PROBE-OTHER-SURFACES). Read
  // that file before treating a green run here as broader than it is. What stays
  // below is only what is specific to THIS surface: the fixture pages, the
  // non-vacuity anchors, and this tree's debt ledger.
  //
  // Coverage: every fixture page the harness builds, at BOTH viewports. The
  // responsive tree genuinely differs (the `lg:hidden` rail is proof), and a
  // wrapper populated in one state can empty out in another — restricting this to
  // one page at one width was the probe's largest blind spot. Client-only states
  // (mid-publish, open popovers) remain unreachable: this harness does not
  // hydrate.
  const NOPHANTOM_PAGES = [
    { page: "", label: "normal (published, not archived)" },
    { page: "archived.html", label: "archived" },
    { page: "capped.html", label: "capped alert count" },
    { page: "notlive.html", label: "not live" },
    { page: "crewwarnings.html", label: "crew warnings" },
    { page: "crewwarningscapped.html", label: "crew warnings capped" },
  ] as const;

  /**
   * KNOWN, DEFERRED instances on THIS surface — a debt ledger, not a mute switch.
   * Why rows are scoped and counted rather than matched on the label triple is in
   * `PhantomLedgerRow` (tests/e2e/helpers/phantomGap.ts); read it before adding a row.
   *
   * EMPTY. The one row this ledger ever carried — BulkIgnoreControls' eyebrow
   * hairline (`h-px flex-1 bg-border`) collapsing to 0 width in a crowded
   * `gap-2` row at 375px — was PAID OFF, not re-deferred: the rule is now
   * `hidden` below 480px (spec 2026-07-24-dq-eyebrow-divider-and-confirm-bar
   * §3.1, BulkIgnoreControls.tsx:175), so it charges no gap and
   * BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW is closed. A row kept past its debt masks
   * a later offender with the same label triple, which is why the stale-row
   * assertion below fails on one.
   */
  const KNOWN_PHANTOM_ITEMS: PhantomLedgerRow[] = [];

  for (const { page: htmlPath, label } of NOPHANTOM_PAGES) {
    for (const { mode, width, height: vh } of MODES) {
      test(`T-NOPHANTOM [${label}] ${mode} @ ${width}: no zero-extent flex/grid item inside any gapped container`, async ({
        page,
      }) => {
        await openHarness(page, { width, height: vh }, htmlPath);

        const found = await scanForPhantomGaps(page.locator(MODAL));

        // NON-VACUITY BY NAMED ANCHOR, not by a magic container count. A count
        // floor is satisfiable by eleven unrelated controls while the subtree that
        // actually matters is absent or suppressed, and it fails a legitimate
        // refactor that reduces the number of gapped containers.
        //
        // The anchor is the SCROLL PANE — `flex flex-col gap-6`, holding every rail
        // section, and the container whose gap the reported bug doubled. It renders
        // on every fixture page at every width with many items.
        //
        // NOT the Overview section itself, which would be wrong in an instructive
        // way: now that the fix lands, Overview holds exactly ONE in-flow item on
        // every non-archived page, so the ≥2-items rule correctly skips it and it
        // never enters `visited`. An anchor that only holds while the bug is
        // present is not an anchor.
        // TWO anchors, both named, no magic counts. The pane proves the walk
        // entered the section column; a container belonging to a rail SECTION
        // proves it descended INTO the sections rather than stopping at the top
        // level. (An earlier `itemsExamined > 20` was just the rejected container
        // floor in another costume: 21 unrelated items satisfy it, and a legitimate
        // simplification breaks it.) The pane is matched with the harness's own
        // dfid, so an unrelated future testid ending `-review-content` cannot
        // satisfy it.
        expect(
          found.visited.filter((v) => v === `wizard-step3-card-${HARNESS_DFID}-review-content`),
          `the walk reached the section scroll pane [${label} @ ${width}]`,
        ).not.toEqual([]);
        expect(
          found.visited.filter((v) => /-review-section-|-section-[a-z]+-panel-card/.test(v)),
          `the walk descended into the rail sections, not just the pane [${label} @ ${width}]`,
        ).not.toEqual([]);

        // LEDGER RECONCILIATION, one-to-one. Each row consumes exactly `count`
        // occurrences of its triple on its own page and width. A surplus survives
        // into `remaining` and fails as a new offender; a shortfall fails as a stale
        // row. Neither a new instance beside a known one nor a row whose debt was
        // repaid can hide.
        // A gap whose used value the walk could not read (a mixed `calc()`) means
        // the axis was SKIPPED — indistinguishable from a clean surface unless it
        // is asserted on.
        expect(
          found.unresolved,
          `every gap in the modal resolved to a used length [${label} @ ${width}]`,
        ).toEqual([]);

        const { remaining, stale } = reconcilePhantomLedger(found.offenders, KNOWN_PHANTOM_ITEMS, {
          surface: htmlPath,
          width,
        });
        expect(
          stale,
          `stale KNOWN_PHANTOM_ITEMS rows [${label} @ ${width}] — the instance is gone, so delete` +
            ` the row (a row kept past its debt masks a later offender with the same label triple)`,
        ).toEqual([]);
        expect(
          remaining,
          `zero-extent items charge their parent's gap and show as a seam no element accounts for [${label} @ ${width}]`,
        ).toEqual([]);
      });
    }
  }
});

// ── BL-ADMIN-DIAGRAM-NEXT-IMAGE: the `sizes` oracle ─────────────────────────
//
// This is the ONLY real-browser surface with a variant ladder, which is why the
// oracle lives here rather than in the staged step-3 harness: a width-independent
// loader maps every srcset descriptor to one URL, so `img.currentSrc` there names
// no tier and the assertion would be vacuous.
//
// Nothing below re-implements the selection. The BROWSER picks a candidate from
// the declared `sizes` string, and the test reads which one it picked. The only
// arithmetic here is the ladder tier a MEASURED width warrants, which is what the
// declared string is being judged against.
const ALL_CANDIDATE_WIDTHS = [
  ...imageConfigDefault.imageSizes,
  ...imageConfigDefault.deviceSizes,
].sort((a, b) => a - b);

/** The tier a request of `needPx` device pixels must land on: the smallest
 *  next/image candidate that covers it, clamped up to a ladder tier. */
function tierFor(needPx: number): number {
  const candidate = ALL_CANDIDATE_WIDTHS.find((w) => w >= needPx) ?? ALL_CANDIDATE_WIDTHS.at(-1)!;
  return (
    [...DIAGRAM_VARIANT_WIDTHS].find((w) => w >= candidate) ?? [...DIAGRAM_VARIANT_WIDTHS].at(-1)!
  );
}

/**
 * Every viewport at which the tier CHANGES, plus the pixel before each — the
 * two-sidedness is the point. A one-sided set samples the transition and not its
 * predecessor, so a boundary that fires one pixel early passes unseen; probed,
 * nudging the >=640px slot by +0.25px moves exactly the two viewports only a
 * predecessor sample can catch.
 *
 * DERIVED from the shipped model and the shipped ladder, never pasted, so a
 * layout change moves the cover with it.
 */
function boundaryViewports(dpr: number): number[] {
  const points: number[] = [];
  let prev: number | null = null;
  for (let vw = 320; vw <= 1600; vw += 1) {
    const tier = tierFor(diagramTileWidthAt(vw) * dpr);
    if (tier !== prev) {
      if (vw > 320) points.push(vw - 1);
      points.push(vw);
      prev = tier;
    }
  }
  return points;
}

test.describe("diagram tile sizes oracle (published manifest, real ladder)", () => {
  // DPR is a browser-context option, so each one costs its own context. 1 and 2
  // get the whole derived set; 3 gets only its sub-640 points, because DPR 3 on a
  // desktop admin surface is the phone-width case. DOCUMENTED LIMIT: the DPR-3
  // points at and above 640 are not covered.
  for (const dpr of [1, 2, 3]) {
    test(`declared sizes selects the tier the measured width warrants @ dpr ${dpr}`, async ({
      browser,
    }) => {
      const all = boundaryViewports(dpr);
      const viewports = dpr === 3 ? all.filter((vw) => vw < 640) : all;

      // The cover must be non-empty, or the loop below proves nothing.
      expect(viewports.length, `derived boundary set is non-empty @ dpr ${dpr}`).toBeGreaterThan(0);
      // Two-sidedness is the point WHERE A TRANSITION EXISTS. At DPR 1 the tile
      // never exceeds 256 device pixels anywhere in 320-1600, so the tier is
      // constant and there is no boundary to sample either side of — asserted
      // rather than assumed, so a layout change that introduces one is caught by
      // the pair requirement instead of silently skipping it.
      const hasTransition = viewports.some((vw) => viewports.includes(vw + 1));
      if (hasTransition) {
        expect(
          hasTransition,
          `derived set contains a predecessor/transition PAIR @ dpr ${dpr}`,
        ).toBe(true);
      } else {
        const tiers = new Set(viewports.map((vw) => tierFor(diagramTileWidthAt(vw) * dpr)));
        expect(
          [...tiers],
          `no tier transition exists @ dpr ${dpr}, so the tier must be constant across the range`,
        ).toHaveLength(1);
      }

      const context = await browser.newContext({ deviceScaleFactor: dpr });
      const page = await context.newPage();
      try {
        for (const vw of viewports) {
          await openHarness(page, { width: vw, height: 900 });
          const tile = page
            .locator(`[data-testid^="wizard-step3-card-${HARNESS_DFID}-diagram-tile-"]`)
            .first();
          // next/image is lazy by default, so an off-screen tile has selected
          // nothing and `currentSrc` is "". Scroll it in and wait for the decode
          // to finish: the browser's CHOICE is what this test reads, and an
          // unloaded image has not made one.
          await tile.scrollIntoViewIfNeeded();
          await expect
            .poll(
              async () => await tile.evaluate((el) => el.querySelector("img")?.complete ?? false),
              { message: `tile image finished loading @ ${vw}px dpr ${dpr}` },
            )
            .toBe(true);
          const observed = await tile.evaluate((el) => {
            const img = el.querySelector("img");
            if (!img) return null;
            return { width: el.getBoundingClientRect().width, currentSrc: img.currentSrc };
          });

          expect(
            observed,
            `the published tile mounted an image @ ${vw}px dpr ${dpr}`,
          ).not.toBeNull();
          const { width: measured, currentSrc } = observed!;

          // 1. The shipped model describes the real layout. If this drifts, the
          //    `sizes` string is being judged against the wrong number.
          expect(
            Math.abs(measured - diagramTileWidthAt(vw)),
            `measured tile ${measured} === diagramTileWidthAt(${vw}) ${diagramTileWidthAt(vw)}`,
          ).toBeLessThanOrEqual(0.5);

          // 2. The browser's OWN choice names the tier that width warrants.
          const wanted = tierFor(measured * dpr);
          expect(
            currentSrc,
            `browser chose the ${wanted}px tier @ ${vw}px dpr ${dpr} (measured ${measured})`,
          ).toContain(`@${wanted}.webp`);
        }
      } finally {
        await context.close();
      }
    });
  }
});
