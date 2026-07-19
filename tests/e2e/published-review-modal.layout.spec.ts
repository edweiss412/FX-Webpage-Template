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
 * from TWO bands to THREE: the status strip has moved out of the header and
 * into the shell's `subHeader` band, so the panel column is
 * header + subheader + main. Asserted (±0.5px) at 375×812 (sheet) and
 * 1280×900 (popup/two-pane):
 *   - sheet (<sm):  grab + header + subheader + main === panel.clientHeight
 *   - ≥sm:          header + subheader + main === panel.clientHeight
 *                   (grab hidden, and NO footer element exists — the published
 *                   modal omits the shell `footer` prop entirely)
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
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

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
    normal: string;
  };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);

  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", pages.normal));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
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

async function openHarness(page: Page, viewport: { width: number; height: number }) {
  // Reduced-motion emulation collapses the panel/scrim entrance animation
  // (app/globals.css `@media (prefers-reduced-motion: reduce)`) so geometry
  // is final on load — no animation-end waits, no flake.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(baseUrl);
  await expect(page.locator(MODAL)).toBeVisible();
}

async function heightOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((el) => el.getBoundingClientRect().height);
}

test.describe("PublishedReviewModal — dimensional invariants (spec §6.6)", () => {
  for (const { mode, width, height: vh } of MODES) {
    const isSheet = mode === "sheet";

    test(`T-LAYOUT ${mode} @ ${width}×${vh}: ${
      isSheet ? "grab + header + subheader + main" : "header + subheader + main"
    } === panel.clientHeight (±0.5px)`, async ({ page }) => {
      await openHarness(page, { width, height: vh });

      const panelClientHeight = await page
        .locator(PANEL)
        .evaluate((el) => (el as HTMLElement).clientHeight);
      const headerH = await heightOf(page, HEADER);
      const subHeaderH = await heightOf(page, SUBHEADER);
      const mainH = await heightOf(page, MAIN);
      const grabH = await heightOf(page, GRAB);

      // The band is a REAL term, not a 0px placeholder that would let the
      // two-band equation keep passing under a three-band name.
      expect(subHeaderH, `subheader band has real height @ ${mode}`).toBeGreaterThan(0);
      await expect(page.locator(SUBHEADER), `exactly one band @ ${mode}`).toHaveCount(1);

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

      const sum = headerH + subHeaderH + mainH + (isSheet ? grabH : 0);
      expect(
        Math.abs(sum - panelClientHeight),
        `${isSheet ? `grab ${grabH} + ` : ""}header ${headerH} + subheader ${subHeaderH}` +
          ` + main ${mainH} === panel.clientHeight ${panelClientHeight} @ ${mode}`,
      ).toBeLessThanOrEqual(TOL);

      // No horizontal overflow at this viewport (§8): the band's row must wrap,
      // never widen the panel.
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

      // NO footer element exists in the published modal — the shell renders the
      // footer wrapper only when the consumer provides one, and the published
      // modal omits it (spec §6.1: publish toggle lives in the StatusStrip,
      // archive in Overview). Asserted in BOTH modes.
      await expect(page.locator(FOOTER), `no footer element @ ${mode}`).toHaveCount(0);
    });

    // T-COPY-FLUSH (modal-header-reconciliation §8). The copy button carries
    // `ml-auto shrink-0` and ALWAYS did (StatusStrip.tsx) — this does NOT test
    // that `ml-auto` is present. It tests that `ml-auto` resolves against a
    // FULL-BAND-WIDTH row: the band is deliberately not a flex container, so
    // without `w-full` on the strip root the strip shrink-wraps its content and
    // the button flushes to the strip's own right edge, well short of the band.
    //
    // Measured against the BAND'S CONTENT BOX, never the panel's: the band
    // carries `px-tile-pad`, so a panel-relative assertion would be off by
    // exactly that padding — and the tempting "fix" would be to delete the
    // padding, which is the wrong repair.
    test(`T-COPY-FLUSH @ ${width}: Copy's right edge sits at the band's content-box right edge`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const flush = await page.locator(SUBHEADER).evaluate((band) => {
        const copy = band.querySelector('[data-testid="strip-copy-link"]');
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
        "copy-link present in the band (fixture is published + tokened)",
      ).not.toBeNull();
      expect(
        flush!.padRight,
        "band carries px-tile-pad (assertion is not panel-relative)",
      ).toBeGreaterThan(0);
      expect(
        Math.abs(flush!.copyRight - flush!.contentRight),
        `copy right ${flush!.copyRight} === band content-box right ${flush!.contentRight} @ ${width}`,
      ).toBeLessThanOrEqual(1);
    });

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
    test(`band composition @ ${width}: header and subheader are distinct stacked seams`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const comp = await page.locator(SUBHEADER).evaluate((band) => {
        const panel = band.parentElement!;
        const header = panel.querySelector('[data-testid$="-header"]')!;
        const bandStyle = getComputedStyle(band);
        const headerStyle = getComputedStyle(header);
        const strip = band.querySelector('[data-testid="show-status-strip"]')!;
        const stripStyle = getComputedStyle(strip);
        const kids = Array.from(panel.children);
        return {
          bandFollowsHeader: kids.indexOf(band) === kids.indexOf(header) + 1,
          headerBorderBottom: parseFloat(headerStyle.borderBottomWidth),
          bandBorderBottom: parseFloat(bandStyle.borderBottomWidth),
          gapBetween: band.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
          bandPadTop: parseFloat(bandStyle.paddingTop),
          bandPadBottom: parseFloat(bandStyle.paddingBottom),
          stripPadTop: parseFloat(stripStyle.paddingTop),
          stripPadBottom: parseFloat(stripStyle.paddingBottom),
        };
      });

      expect(
        comp.bandFollowsHeader,
        `band is the panel child right after the header @ ${mode}`,
      ).toBe(true);
      expect(comp.headerBorderBottom, `header keeps its own seam @ ${mode}`).toBeGreaterThan(0);
      expect(comp.bandBorderBottom, `band carries its own seam @ ${mode}`).toBeGreaterThan(0);
      // Stacked, not spaced: the seams abut. A gap here would mean the band is
      // not actually in the panel's flex column.
      expect(Math.abs(comp.gapBetween), `header and band abut @ ${mode}`).toBeLessThanOrEqual(TOL);
      // The band owns the vertical inset; the strip owns none, so the two can
      // never double-count.
      expect(comp.bandPadTop, `band supplies the vertical inset @ ${mode}`).toBeGreaterThan(0);
      expect(comp.bandPadBottom, `band supplies the vertical inset @ ${mode}`).toBeGreaterThan(0);
      expect(comp.stripPadTop, `strip has no own top padding @ ${mode}`).toBe(0);
      expect(comp.stripPadBottom, `strip has no own bottom padding @ ${mode}`).toBe(0);
    });
  }
});
