/**
 * tests/e2e/step3-grid-layout.spec.ts
 *
 * Real-browser layout assertions for the two Step-3 layout fixes that jsdom cannot
 * verify (jsdom computes no layout):
 *
 *   1. GRID: opening a card spans ONLY that card's cell to full width
 *      (`lg:col-span-2 xl:col-span-3`) while the grid STAYS multi-column and
 *      `grid-flow-row-dense` backfills the gap — so the other cards keep their grid
 *      positions. (The reported regression collapsed the WHOLE grid to one column,
 *      making every card full-width.)
 *   2. BREAKDOWN: the expanded card's details lay out in a balanced MULTI-COLUMN
 *      flow on desktop (`sm:columns-2 xl:columns-3`), filling the horizontal space
 *      a single narrow column left behind.
 *
 * Harness pattern follows step3-card-dimensions.spec.ts: compile the REAL token CSS
 * from app/globals.css via the Tailwind CLI (so the responsive grid/column/col-span
 * utilities resolve exactly as the build emits them), write a static grid harness,
 * serve it over HTTP, and measure getBoundingClientRect() in a real browser.
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
const EXPANDED = 1; // the open card (cell index 1)

function summary(i: number): string {
  return `
  <div class="flex items-start gap-3">
    <span aria-hidden="true" class="mt-0.5 size-5 shrink-0 rounded-sm border-2 border-border-strong bg-bg"></span>
    <div class="min-w-0 flex-1">
      <p class="truncate text-base font-semibold text-text-strong">Show ${i}</p>
      <dl class="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1">
        <dt class="text-xs font-semibold uppercase text-text-subtle">Venue</dt>
        <dd class="min-w-0 text-sm text-text-subtle"><span class="wrap-break-word text-text">The Drake Hotel</span><span class="block text-xs text-text-subtle">Chicago</span></dd>
      </dl>
    </div>
  </div>`;
}

function breakdown(i: number): string {
  const sec = (label: string, n: number, lines: string[]) =>
    `<section data-testid="card-${i}-sec-${label}" class="flex flex-col gap-1.5">
      <h4 class="text-xs font-semibold uppercase text-text-subtle">${label} <span class="tabular-nums text-text-faint">(${n})</span></h4>
      <ul class="flex flex-col gap-0.5">${lines.map((l) => `<li class="text-sm text-text">${l}</li>`).join("")}</ul>
    </section>`;
  return `
  <div data-testid="card-${i}-breakdown-grid" class="columns-1 gap-x-8 wrap-break-word pt-1 sm:columns-2 xl:columns-3 [&>section]:mb-6 [&>section]:break-inside-avoid [&>section:last-child]:mb-0">
    ${sec("crew", 5, ["Eric Carroll", "Eric Weiss", "Connor Hester", "Calvin Saller", "Kari Rose"])}
    ${sec("schedule", 3, ["May 13", "May 14", "May 15"])}
    ${sec("rooms", 4, ["General Session", "LASALLE A", "WALTON ROOM", "Additional"])}
    ${sec("hotels", 1, ["The Drake Hotel"])}
    ${sec("warnings", 1, ["Show-day time unreadable"])}
  </div>`;
}

function cardHtml(i: number, expanded: boolean): string {
  return `<article data-testid="card-${i}" class="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile)">
    ${summary(i)}
    <button class="inline-flex min-h-tap-min items-center justify-between gap-2 rounded-sm border border-border bg-bg px-3 text-sm">${expanded ? "Hide details" : "Show details"}</button>
    ${expanded ? breakdown(i) : ""}
  </article>`;
}

function harnessHtml(): string {
  const cells = [0, 1, 2, 3, 4, 5]
    .map(
      (i) =>
        `<li data-testid="cell-${i}" class="${i === EXPANDED ? "lg:col-span-2 xl:col-span-3" : ""}">${cardHtml(i, i === EXPANDED)}</li>`,
    )
    .join("\n");
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><main style="max-width:1200px;margin:0 auto;padding:32px;">
  <ul data-testid="card-grid" class="grid grid-flow-row-dense grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-3" style="list-style:none;margin:0;padding:0;">${cells}</ul>
</main></body></html>`;
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
    return { left: b.left, right: b.right, top: b.top, width: b.width };
  });
}

test("desktop (xl): ONLY the open card's cell spans full width; the rest stay in the multi-column grid", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto(baseUrl);

  const grid = await rect(page, "card-grid");
  const expandedCell = await rect(page, `cell-${EXPANDED}`);
  // The open cell is full grid width.
  expect(
    Math.abs(expandedCell.width - grid.width),
    `expanded cell spans full grid width (${expandedCell.width} vs ${grid.width})`,
  ).toBeLessThanOrEqual(TOL);

  // Every OTHER cell is roughly one grid column (~1/3 at xl) — i.e. NOT full-width:
  // the regression made every card full-width.
  for (const i of [0, 2, 3, 4, 5]) {
    const cell = await rect(page, `cell-${i}`);
    expect(cell.width, `collapsed cell ${i} is not full-width`).toBeLessThan(grid.width * 0.5);
  }

  // The other cells still share rows (multi-column), proving the grid did not
  // collapse to a single column: at least two non-expanded cells share a `top`.
  const tops = await Promise.all(
    [0, 2, 3, 4, 5].map((i) => rect(page, `cell-${i}`).then((r) => Math.round(r.top))),
  );
  const maxOnARow = Math.max(...tops.map((t) => tops.filter((u) => u === t).length));
  expect(
    maxOnARow,
    "at least two collapsed cells share a row (grid stays multi-column)",
  ).toBeGreaterThanOrEqual(2);
});

test("desktop (xl): the expanded card's breakdown uses a balanced multi-column flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto(baseUrl);

  const labels = ["crew", "schedule", "rooms", "hotels", "warnings"] as const;
  const lefts = await Promise.all(
    labels.map((l) => rect(page, `card-${EXPANDED}-sec-${l}`).then((r) => Math.round(r.left))),
  );
  const distinctColumns = new Set(lefts).size;
  expect(
    distinctColumns,
    `breakdown spreads across >1 column (lefts: ${lefts.join(",")})`,
  ).toBeGreaterThan(1);
});
