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
import sharp from "sharp";

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
    capped: string;
    notLive: string;
    archived: string;
    crewWarnings: string;
  };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);

  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", pages.normal));
  // §6.6 cap page: the same tree with an over-cap alert count (T-ALERT-CAP).
  writeFileSync(join(workDir, "capped.html"), pageHtml("out.css", pages.capped));
  // §4.2 orange-budget pages (T-NO-ORANGE) — the other two rows of the table.
  writeFileSync(join(workDir, "notlive.html"), pageHtml("out.css", pages.notLive));
  writeFileSync(join(workDir, "archived.html"), pageHtml("out.css", pages.archived));
  // crew-warning-attachment T5: matched (under-row) + unmatched (in-card group).
  writeFileSync(join(workDir, "crewwarnings.html"), pageHtml("out.css", pages.crewWarnings));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  // EVERY page is a Tailwind source — a class that only one page uses (the
  // capped pill's longer label, the archived badge) must still generate, or
  // that page's assertion would measure unstyled markup.
  writeFileSync(
    entryCss,
    ["harness.html", "capped.html", "notlive.html", "archived.html", "crewwarnings.html"]
      .map((f) => `@source "${join(workDir, f)}";\n`)
      .join("") + globals,
  );
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

async function openHarness(page: Page, viewport: { width: number; height: number }, htmlPath = "") {
  // Reduced-motion emulation collapses the panel/scrim entrance animation
  // (app/globals.css `@media (prefers-reduced-motion: reduce)`) so geometry
  // is final on load — no animation-end waits, no flake.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(baseUrl + htmlPath);
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
    test(`T-HUB-FLUSH @ ${width}: the share-hub group's right edge sits at the band's content-box right edge`, async ({
      page,
    }) => {
      await openHarness(page, { width, height: vh });

      const flush = await page.locator(SUBHEADER).evaluate((band) => {
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
        // `shadow-(--shadow-tile)`, which darkens the scrim in exactly this
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
    // The sheet-link clause rides along and is DECLARED NOT RED (plan §11 map):
    // the anchor is already `size-tap-min` and is ratified unchanged
    // (Watchpoint 1). It guards the header restructure against dropping it.
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

      // Rider (declared NOT red): the sheet deep-link's own box is ≥44px.
      const sheet = await page
        .locator(`${MODAL} [data-testid="${BASE}-sheetlink"]`)
        .evaluate((el) => el.getBoundingClientRect());
      expect(sheet.height, `sheet link height @ ${mode}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
      expect(sheet.width, `sheet link width @ ${mode}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
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
    ).toBe("99+ to confirm");

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
        .locator(`${SUBHEADER} [data-testid="share-hub-kebab"]`)
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
    test(`T-NO-ORANGE [${name}]: the accent-resolving set in the header region is EXACTLY ${
      expected.length === 0 ? "{}" : `{${expected.join(", ")}}`
    }`, async ({ page }) => {
      await openHarness(page, { width: 1280, height: 900 }, htmlPath);

      // No focus ring, no hover: both are legitimately accent and excluded.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(0, 0);

      const found = await page.evaluate(
        ({ modalSel, headerSel, subSel }) => {
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
          const regions = [modal.querySelector(headerSel), modal.querySelector(subSel)].filter(
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
              const hit =
                cs.backgroundColor === accent ||
                [
                  cs.borderTopColor,
                  cs.borderRightColor,
                  cs.borderBottomColor,
                  cs.borderLeftColor,
                ].some((c) => c === accent && parseFloat(cs.borderTopWidth) >= 0);
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
        { modalSel: MODAL, headerSel: `[data-testid="${BASE}-header"]`, subSel: SUBHEADER },
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
    const synced = page.locator(`${SUBHEADER} [data-testid="strip-synced-line"]`);
    const edited = page.locator(`${SUBHEADER} [data-testid="strip-edited-age"]`);
    const bullet = page.locator(`${SUBHEADER} [data-testid="strip-status-bullet"]`);
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
      .locator(`${SUBHEADER} [data-testid="admin-resync-button"]`)
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
        .locator(`${SUBHEADER} [data-testid="admin-resync-button"]`)
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
//   - card bottom >= extras bottom (no overflow out of the border).
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
        if (el instanceof HTMLDivElement && Number.parseFloat(getComputedStyle(el).borderTopWidth) > 0) {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }
        el = el.parentElement as HTMLElement | null;
      }
      throw new Error("no bordered ancestor div (panel card) between the roster row and the section");
    });
  }

  test("T-WARN-UNDERROW @1280: matched warning's stack sits inside the card, between its row and the next", async ({
    page,
  }) => {
    await openHarness(page, { width: 1280, height: 900 }, "crewwarnings.html");
    await expect(page.locator(STACK), "under-row stack present for the stripped key").toHaveCount(1);

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
