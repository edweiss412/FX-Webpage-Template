/**
 * tests/e2e/step3-grid-layout.spec.ts
 *
 * Real-browser layout assertions for the Step-3 review surface after the inline
 * expand was replaced by the "More" details overlay (<Step3DetailsDialog>).
 * jsdom computes no layout, so these run in a real browser:
 *
 *   1. GRID: every publish card is a UNIFORM cell — none spans full width and
 *      the grid never reflows (the old open-card-spans-full-width accordion is
 *      gone; details now open in a modal overlay).
 *   2. DESKTOP POPUP (>=640px): the overlay is a centered, width-capped popup
 *      whose breakdown lays out in a balanced MULTI-COLUMN flow, with the
 *      warnings panel a full-width callout below.
 *   3. MOBILE SHEET (<640px): the overlay is a bottom SHEET — full-width,
 *      anchored to the bottom edge — with a single-column breakdown.
 *
 * Harness pattern follows step3-card-dimensions.spec.ts: compile the REAL token
 * CSS from app/globals.css via the Tailwind CLI (so the grid / column / scrim /
 * sheet utilities resolve exactly as the build emits them), write a static
 * harness (the uniform grid + the open dialog markup, transcribed from the
 * components), serve it over HTTP, and measure getBoundingClientRect() in a real
 * browser.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no app boot / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 1;

function summary(i: number): string {
  return `
  <div class="flex items-start gap-3">
    <span aria-hidden="true" class="mt-0.5 size-5 shrink-0 rounded-sm border-2 border-border-strong bg-bg"></span>
    <div class="min-w-0 flex-1">
      <a href="https://docs.google.com/spreadsheets/d/df-${i}/edit" class="wrap-break-word text-base font-semibold text-text-strong hover:underline">Show ${i}</a>
      <dl class="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1">
        <dt class="text-xs font-semibold uppercase text-text-subtle">Venue</dt>
        <dd class="min-w-0 text-sm text-text-subtle"><span class="wrap-break-word text-text">The Drake Hotel</span></dd>
        <dt class="text-xs font-semibold uppercase text-text-subtle">City</dt>
        <dd class="min-w-0 text-sm text-text-subtle"><span class="wrap-break-word text-text">Chicago</span></dd>
      </dl>
    </div>
  </div>`;
}

// A collapsed publish card: summary + the quiet "More" button (no inline
// breakdown — the details live in the overlay below).
function cardHtml(i: number): string {
  return `<article data-testid="card-${i}" class="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile)">
    ${summary(i)}
    <button data-testid="card-${i}-more" class="inline-flex min-h-tap-min items-center gap-1 self-start text-sm font-medium text-text-strong hover:underline"><span>More</span></button>
  </article>`;
}

// The open details overlay, transcribed from <Step3DetailsDialog> + the card's
// breakdown grid (1-column sheet / 2-column popup) and full-width warnings panel.
function dialogHtml(): string {
  const sec = (label: string, n: number, lines: string[]) =>
    `<section data-testid="dlg-sec-${label}" class="flex flex-col gap-1.5">
      <h4 class="text-xs font-semibold uppercase text-text-subtle">${label} <span class="tabular-nums text-text-faint">(${n})</span></h4>
      <ul class="flex flex-col gap-0.5">${lines.map((l) => `<li class="text-sm text-text">${l}</li>`).join("")}</ul>
    </section>`;
  return `
  <div data-testid="details-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-h" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
    <button data-testid="details-backdrop" data-step3-details-scrim="" aria-hidden="true" tabindex="-1" class="absolute inset-0 bg-overlay-scrim"></button>
    <div data-testid="details-panel" data-step3-details-panel="" class="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-lg bg-surface text-text shadow-(--shadow-tile) sm:max-h-[80vh] sm:rounded-lg">
      <div class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-pill bg-border sm:hidden"></div>
      <header class="flex items-start justify-between gap-4 px-tile-pad py-3 sm:pt-4">
        <h3 id="dlg-h" class="min-w-0 wrap-break-word text-base font-semibold text-text-strong">Show 1</h3>
        <button data-testid="details-close" class="-mr-1 inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle">×</button>
      </header>
      <div data-testid="details-body" class="min-h-0 flex-1 overflow-y-auto px-tile-pad pb-tile-pad">
        <div data-testid="breakdown-grid" class="columns-1 gap-x-8 wrap-break-word sm:columns-2 [&>section]:mb-6 [&>section]:break-inside-avoid [&>section:last-child]:mb-0">
          ${sec("crew", 5, ["Eric Carroll", "Eric Weiss", "Connor Hester", "Calvin Saller", "Kari Rose"])}
          ${sec("schedule", 3, ["May 13", "May 14", "May 15"])}
          ${sec("rooms", 4, ["General Session", "LASALLE A", "WALTON ROOM", "Additional"])}
          ${sec("hotels", 1, ["The Drake Hotel"])}
        </div>
        <div data-testid="warnings-panel" class="mt-6 rounded-md border border-border-strong bg-warning-bg p-tile-pad">
          ${sec("warnings", 1, ["Show-day time unreadable"])}
        </div>
      </div>
    </div>
  </div>`;
}

function harnessHtml(): string {
  const cells = [0, 1, 2, 3, 4, 5]
    .map((i) => `<li data-testid="cell-${i}">${cardHtml(i)}</li>`)
    .join("\n");
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><main style="max-width:1200px;margin:0 auto;padding:32px;">
  <ul data-testid="card-grid" class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-3" style="list-style:none;margin:0;padding:0;">${cells}</ul>
</main>
${dialogHtml()}
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "step3-grid-"));
  writeFileSync(join(workDir, "harness.html"), harnessHtml());
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
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  return new Promise<void>((r) =>
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
      r();
    }),
  );
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

async function rect(page: import("@playwright/test").Page, testid: string) {
  return page.getByTestId(testid).evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width };
  });
}

// Measure the RESTING layout: the overlay plays a one-shot entrance animation
// (sheet rise / popup pop-in, [data-step3-details-panel] in globals.css), and a
// mid-flight `translateY` would confound getBoundingClientRect. Emulating
// reduced motion disables that animation (the component's `animation: none`
// reduced-motion override), so every measurement is the settled position — which
// is also exactly what a reduced-motion user sees on open.
test("desktop (xl): every grid cell is uniform — none spans full width; the grid stays multi-column", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto(baseUrl);

  const grid = await rect(page, "card-grid");
  const cells = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => rect(page, `cell-${i}`)));

  // No cell is full-width (the open-card-spans-full-width accordion is gone).
  for (let i = 0; i < cells.length; i++) {
    expect(cells[i]!.width, `cell ${i} is not full-width`).toBeLessThan(grid.width * 0.5);
  }
  // All cells share one width — uniform tiles (max−min spread within tolerance).
  const widths = cells.map((c) => c.width);
  expect(
    Math.max(...widths) - Math.min(...widths),
    `cells are uniform width (${widths.join(",")})`,
  ).toBeLessThanOrEqual(TOL);
  // Multi-column: at least two cells share a row (the grid did not collapse).
  const tops = cells.map((c) => Math.round(c.top));
  const maxOnARow = Math.max(...tops.map((t) => tops.filter((u) => u === t).length));
  expect(
    maxOnARow,
    "at least two cells share a row (grid stays multi-column)",
  ).toBeGreaterThanOrEqual(2);
});

test("desktop (sm+): the details popup is centered & width-capped; breakdown multi-column; warnings full-width below", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto(baseUrl);
  const viewport = page.viewportSize()!;

  // Centered, width-capped popup (NOT full-bleed).
  const panel = await rect(page, "details-panel");
  expect(panel.width, `popup is width-capped (${panel.width} < ${viewport.width})`).toBeLessThan(
    viewport.width,
  );
  const centerOffset = Math.abs((panel.left + panel.right) / 2 - viewport.width / 2);
  expect(
    centerOffset,
    `popup is horizontally centered (offset ${centerOffset})`,
  ).toBeLessThanOrEqual(2);

  // Breakdown spreads across >1 column.
  const labels = ["crew", "schedule", "rooms", "hotels"] as const;
  const lefts = await Promise.all(
    labels.map((l) => rect(page, `dlg-sec-${l}`).then((r) => Math.round(r.left))),
  );
  expect(
    new Set(lefts).size,
    `breakdown spreads across >1 column (lefts: ${lefts.join(",")})`,
  ).toBeGreaterThan(1);

  // Warnings panel is a full-width callout below the breakdown grid.
  const bgrid = await rect(page, "breakdown-grid");
  const wpanel = await rect(page, "warnings-panel");
  expect(
    Math.abs(wpanel.width - bgrid.width),
    `warnings panel is full content width (${wpanel.width} vs ${bgrid.width})`,
  ).toBeLessThanOrEqual(TOL);
  expect(wpanel.top, "warnings panel sits below the data grid").toBeGreaterThan(bgrid.top);
});

test("mobile (<sm): the overlay is a bottom SHEET (full-width, bottom-anchored) with a 1-column breakdown", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(baseUrl);
  const viewport = page.viewportSize()!;

  const panel = await rect(page, "details-panel");
  // Bottom-anchored sheet: the panel's bottom edge sits at the viewport bottom.
  expect(
    Math.abs(panel.bottom - viewport.height),
    `sheet is anchored to the bottom edge (${panel.bottom} vs ${viewport.height})`,
  ).toBeLessThanOrEqual(TOL);
  // Full-width sheet (w-full, below the max-w-2xl cap at this viewport).
  expect(
    Math.abs(panel.width - viewport.width),
    `sheet spans the full viewport width (${panel.width} vs ${viewport.width})`,
  ).toBeLessThanOrEqual(TOL);

  // Single-column breakdown: all four sections share one left edge.
  const labels = ["crew", "schedule", "rooms", "hotels"] as const;
  const lefts = await Promise.all(
    labels.map((l) => rect(page, `dlg-sec-${l}`).then((r) => Math.round(r.left))),
  );
  expect(
    new Set(lefts).size,
    `breakdown is a single column on mobile (lefts: ${lefts.join(",")})`,
  ).toBe(1);
});
