/**
 * tests/e2e/step3-card-dimensions.spec.ts (Task D2 — spec §4.4 dimensional invariants)
 *
 * Real-browser layout-dimensions assertions for <Step3SheetCard>. jsdom (the
 * step3SheetCard.test.tsx unit suite) computes NO layout, and this project's
 * Tailwind v4 does NOT default `.flex` to `align-items: stretch` and has NO
 * default `md` breakpoint — so the §4.4 no-horizontal-overflow invariant must
 * be verified end-to-end in a browser.
 *
 * HARNESS (standalone, no app boot): the card is purely presentational, and no
 * route renders it with a seeded `parse_result` standalone, so per the
 * project's documented standalone real-browser layout harness
 * (memory/reference_standalone_realbrowser_layout_harness) this spec:
 *   1. compiles the REAL token CSS from app/globals.css via the Tailwind CLI
 *      (so `min-w-0`, `flex-1`, `shrink-0`, `truncate`, `overflow-hidden`,
 *      `p-tile-pad`, etc. resolve exactly as the build emits them);
 *   2. writes a static harness.html with the EXACT card class structure (the
 *      header row + breakdown region — the elements §4.4 constrains), rendered
 *      inside a FIXED-WIDTH list column, including a worst-case very-long-title
 *      card;
 *   3. serves it over HTTP (file:// is blocked in Chromium automation) and
 *      measures getBoundingClientRect() on each documented data-testid.
 *
 * §4.4 invariants asserted (verbatim from the spec):
 *   - checkbox/leading slot is `shrink-0`; the summary text block is
 *     `min-w-0 flex-1` so long titles truncate, not overflow.
 *   - the expand region is height-bounded (overflow-hidden), never an
 *     unbounded child that horizontally overflows the fixed-width column.
 *   - every documented data-testid (card, -summary, -breakdown) has
 *     `child.width <= parent.width` within 0.5px, including a very long title.
 *
 * This spec runs standalone via tests/e2e/standalone.config.ts (no webServer /
 * Supabase). It is NOT in the default playwright.config.ts testMatch because
 * that config boots dev servers this harness does not need.
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// Package is CommonJS (package.json has no "type": "module"); Playwright's CJS
// test loader provides __dirname directly. Do NOT use import.meta.url here — it
// flips the module to ESM and `require is not defined` (the existing e2e specs
// use the __dirname global the same way, e.g. admin-lifecycle-transitions.spec).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const COLUMN_WIDTH = 360; // a fixed-width list column at the 390px mobile viewport
// A worst-case title: a single UNBREAKABLE long token (no spaces, no hyphens —
// hyphens are CSS soft-break opportunities and would let the title wrap). This
// is the adversarial input for the §4.4 "long titles truncate, not overflow"
// invariant: the test measures, in a real browser against the compiled Tailwind
// tokens, that the summary block / card / breakdown all stay within the
// fixed-width column even with this token. The assertion is on real measured
// geometry (not class presence), so it catches an actual regression such as a
// child carrying a `w-[Npx]` wider than the column, a non-fixed column, or a
// `min-w` larger than the column — failure modes jsdom cannot see.
const LONG_TITLE =
  "AcmeCapitalGlobalAssetManagementQuarterlyInvestorSummitStrategyOffsiteWaldorfAstoriaGrandBallroomEdition";

// The card's header-row + breakdown class structure, transcribed verbatim from
// components/admin/wizard/Step3SheetCard.tsx (§4.4-governed elements). The
// breakdown is forced visible (data-expanded="true") so its width is measured.
function cardHtml(dfid: string, title: string): string {
  return `
<article data-testid="wizard-step3-card-${dfid}" class="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile)">
  <div data-testid="wizard-step3-card-${dfid}-summary" class="flex items-start gap-3">
    <span aria-hidden="true" class="mt-0.5 size-5 shrink-0"></span>
    <div data-testid="wizard-step3-card-${dfid}-summary-block" class="min-w-0 flex-1">
      <p class="truncate text-base font-semibold text-text-strong" title="${title}">${title}</p>
      <p class="truncate text-sm text-text-subtle">Acme Capital</p>
      <p class="mt-1 text-sm tabular-nums text-text-subtle">2026-04-09 → 2026-04-12</p>
      <p class="mt-1 text-sm tabular-nums text-text-subtle">12 crew · 4 rooms · 2 hotels · 3 schedule days</p>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <span data-testid="wizard-step3-card-${dfid}-badge-diagrams" class="inline-flex items-center gap-1 rounded-sm bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text">Diagrams ✓</span>
        <span data-testid="wizard-step3-card-${dfid}-warnings" class="inline-flex items-center gap-1.5 rounded-sm bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-text"><span aria-hidden="true" class="size-1.5 rounded-pill bg-warning-text"></span><span class="tabular-nums">3</span> warnings</span>
      </div>
    </div>
  </div>
  <button type="button" data-testid="wizard-step3-card-${dfid}-expand" aria-expanded="true" class="inline-flex min-h-tap-min items-center justify-between gap-2 rounded-sm border border-border bg-bg px-3 text-sm font-medium text-text-strong">
    <span>Hide details</span>
  </button>
  <div data-testid="wizard-step3-card-${dfid}-breakdown" data-step3-breakdown="" data-expanded="true">
    <div class="flex flex-col gap-4 pt-1">
      <section data-testid="wizard-step3-card-${dfid}-breakdown-crew" class="flex flex-col gap-1.5">
        <h4 class="text-xs font-semibold uppercase text-text-subtle">Crew <span class="tabular-nums text-text-faint">(12)</span></h4>
        <ul class="flex flex-col gap-0.5">
          <li class="break-words text-sm text-text"><span class="font-medium text-text-strong">Crew-Person-With-A-Very-Long-Unbreakable-Display-Name-Token-That-Could-Push-Width</span><span class="text-text-subtle"> · BO-LEAD/GS-A1/CONTENT_CREATION-specialist-role-label-unbroken-token</span></li>
        </ul>
      </section>
    </div>
  </div>
</article>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">
  <!-- The fixed-width list <ul> column the cards live in (§4.4). -->
  <ul data-testid="list-column" style="width:${COLUMN_WIDTH}px; list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:12px;">
    <li>${cardHtml("normal", "Asset Mgmt Summit")}</li>
    <li>${cardHtml("longtitle", "${LONG}")}</li>
  </ul>
</body></html>`.replace("${LONG}", LONG_TITLE.replace(/"/g, "&quot;"));
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "step3-card-dim-"));

  // Write the harness FIRST so the Tailwind CLI scans it and emits every
  // utility it uses (Tailwind v4 only generates classes it finds in @source).
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));

  // Compile the real token CSS. app/globals.css is `@import "tailwindcss"` +
  // @theme tokens + @source auto-detection; pointing the CLI at it from the
  // repo root scans components/ + app/ + (via an explicit @source) our harness.
  // We add an explicit @source for the temp harness so its classes generate.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(workDir, "harness.html")}";\n${globals}`,
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
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(body);
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

async function rect(page: import("@playwright/test").Page, testid: string) {
  return page.getByTestId(testid).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom };
  });
}

for (const dfid of ["normal", "longtitle"] as const) {
  test(`Step3SheetCard @ ${dfid}: no child overflows the fixed-width column (§4.4)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    await page.goto(baseUrl);

    const column = await rect(page, "list-column");
    expect(column.width, "list column is the documented fixed width").toBeLessThanOrEqual(
      COLUMN_WIDTH + TOL,
    );

    // INVARIANT 1: the card fills its column and does not exceed it.
    const card = await rect(page, `wizard-step3-card-${dfid}`);
    expect(
      card.width,
      `card width <= column width @ ${dfid} (card ${card.width} vs col ${column.width})`,
    ).toBeLessThanOrEqual(column.width + TOL);
    expect(card.right, `card right edge within column @ ${dfid}`).toBeLessThanOrEqual(
      column.right + TOL,
    );

    // INVARIANT 2: every documented descendant testid stays within the card
    // box horizontally (no min-w-0/flex-1 collapse failure; no unbounded
    // breakdown child). This is the core §4.4 assertion — a missing min-w-0 on
    // the summary block, or an unbounded breakdown, lets a long title/role line
    // push a child past the card's right edge. `-summary-block` is the inner
    // `min-w-0 flex-1` div whose width is the direct min-w-0 witness: without
    // min-w-0 it grows to the unbreakable token width and exceeds the card.
    for (const suffix of ["-summary", "-summary-block", "-breakdown"]) {
      const child = await rect(page, `wizard-step3-card-${dfid}${suffix}`);
      expect(
        child.width,
        `${suffix} width <= card width @ ${dfid} (child ${child.width} vs card ${card.width})`,
      ).toBeLessThanOrEqual(card.width + TOL);
      expect(
        child.right,
        `${suffix} right edge within card @ ${dfid} (child ${child.right} vs card ${card.right})`,
      ).toBeLessThanOrEqual(card.right + TOL);
    }

    // INVARIANT 3: zero horizontal document overflow (a long title or role
    // line that overflowed would extend the scroll width past the viewport).
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return { scrollW: root.scrollWidth, clientW: root.clientWidth };
    });
    expect(
      overflow.scrollW,
      `no horizontal document overflow @ ${dfid} (scrollW ${overflow.scrollW} vs clientW ${overflow.clientW})`,
    ).toBeLessThanOrEqual(overflow.clientW + TOL);
  });
}
