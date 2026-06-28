/**
 * tests/e2e/step3-schedule-bookend-layout.spec.ts (Task 15 — spec §13 dimensional invariant)
 *
 * Real-browser layout assertion for the admin <ScheduleDayRow> 2-track grid
 * (components/admin/wizard/Step3SheetCard.tsx:214 —
 * `grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5`).
 *
 * INVARIANT (spec §13): a synthetic entry (a `Strike` / `Load Out` row whose
 * title cell carries an uppercase badge) sits in the SAME two tracks as a plain
 * agenda row — its `start` in the `auto` time track, its title (+badge) in the
 * `1fr` title track. The badge sits INSIDE the title cell, so it must NOT push
 * the title into a different column or introduce a third grid column. Concretely:
 *   - every `…-sched-time` cell shares ONE left edge (±0.5px), agenda + synthetic;
 *   - every `…-sched-title` cell shares ONE left edge (±0.5px), agenda + synthetic;
 *   - the badge's left edge coincides with its title cell's left edge (it lives
 *     inside the 1fr cell, it is not a 3rd track).
 *
 * A "badge as a 3rd grid item" regression would, under `grid-cols-[auto_1fr]`
 * (exactly two tracks), wrap the per-row items across implicit rows and shatter
 * the shared time/title left edges — which these assertions catch. jsdom computes
 * NO layout, so this MUST be verified end-to-end in a real browser.
 *
 * HARNESS (standalone, no app boot): modelled on tests/e2e/step3-card-dimensions
 * .spec.ts — compile the REAL token CSS from app/globals.css via the Tailwind CLI
 * (so `grid-cols-[auto_1fr]`, `items-baseline`, `tracking-eyebrow`,
 * `bg-surface-sunken`, the `text-*` tokens, etc. resolve exactly as the build
 * emits them), write a static harness.html with the EXACT ScheduleDayRow grid
 * markup INCLUDING two synthetic rows with the badge span, serve over HTTP
 * (file:// is blocked in Chromium automation), measure getBoundingClientRect().
 *
 * Runs via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// Package is CommonJS (no "type": "module"); Playwright's CJS test loader
// provides __dirname directly. Do NOT use import.meta.url — it flips the module
// to ESM and `require is not defined` (the sibling standalone specs use the
// __dirname global the same way).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const COLUMN_WIDTH = 360; // a fixed-width breakdown column at the 390px mobile viewport
const DFID = "synthrow";

type Row = { start: string; title: string; kind: "agenda" | "strike" | "loadout" };

// schedKindLabel (Step3SheetCard.tsx:183) — STRIKE / LOAD OUT, null for agenda.
function badgeLabel(kind: Row["kind"]): string | null {
  return kind === "strike" ? "STRIKE" : kind === "loadout" ? "LOAD OUT" : null;
}

// A day with ≥2 agenda rows + 1 strike + 1 load-out. Class strings are
// transcribed VERBATIM from components/admin/wizard/Step3SheetCard.tsx
// (the <li>, the date <span>, the grid <div>, the time <span>, the title
// <span>, and the badge <span>) so the compiled Tailwind resolves identically.
const ROWS: Row[] = [
  { start: "08:00", title: "Doors / House Open", kind: "agenda" },
  { start: "19:30", title: "Show Start", kind: "agenda" },
  { start: "23:00", title: "Strike", kind: "strike" },
  { start: "23:45", title: "Load Out", kind: "loadout" },
];

function dayHtml(): string {
  const cells = ROWS.map((e) => {
    const badge = badgeLabel(e.kind);
    const badgeSpan = badge
      ? `<span data-testid="wizard-step3-card-${DFID}-sched-kind-badge" data-agenda-kind="${e.kind}" class="mr-1.5 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium uppercase tracking-eyebrow text-text-subtle">${badge}</span>`
      : "";
    return `<span data-testid="wizard-step3-card-${DFID}-sched-time" class="whitespace-nowrap text-sm tabular-nums text-text-subtle">${e.start}</span><span data-testid="wizard-step3-card-${DFID}-sched-title" class="text-sm text-text">${badgeSpan}${e.title}</span>`;
  }).join("");
  return `<li class="flex flex-col gap-1">
  <span class="text-xs font-medium tabular-nums text-text-strong">Thu, Apr 9</span>
  <div data-testid="wizard-step3-card-${DFID}-sched-grid" class="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5">${cells}</div>
</li>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">
  <ul data-testid="schedule-column" style="width:${COLUMN_WIDTH}px; list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px;">
    ${dayHtml()}
  </ul>
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "step3-sched-bookend-"));

  // Write the harness FIRST so the Tailwind CLI scans it and emits every utility
  // it uses (Tailwind v4 only generates classes it finds in @source).
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));

  // Compile the real token CSS. app/globals.css is `@import "tailwindcss"` +
  // @theme tokens; we prepend an explicit @source for the temp harness so its
  // classes generate.
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
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

// Multiple cells share each data-testid (one per row), so locate the SET and
// measure all of them — getByTestId().evaluate() would throw under strict mode.
async function rects(page: import("@playwright/test").Page, testid: string) {
  return page.locator(`[data-testid="${testid}"]`).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, top: r.top };
    }),
  );
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

test("ScheduleDayRow: synthetic badge keeps the 2-track grid aligned (spec §13)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto(baseUrl);

  const timeCells = await rects(page, `wizard-step3-card-${DFID}-sched-time`);
  const titleCells = await rects(page, `wizard-step3-card-${DFID}-sched-title`);
  const badges = await rects(page, `wizard-step3-card-${DFID}-sched-kind-badge`);

  // Cell counts prove there is no 3rd grid track: exactly one time + one title
  // cell per row (4 each), and exactly the two synthetic rows carry a badge.
  expect(timeCells.length, "one time cell per row (2 agenda + 2 synthetic)").toBe(ROWS.length);
  expect(titleCells.length, "one title cell per row").toBe(ROWS.length);
  expect(badges.length, "exactly the 2 synthetic rows carry a badge").toBe(2);

  // INVARIANT 1: every time cell shares ONE left edge (the `auto` track start),
  // agenda and synthetic alike. A badge promoted to a 3rd grid item would wrap
  // the per-row items across implicit rows under `grid-cols-[auto_1fr]` and
  // scatter these left edges.
  const timeLefts = timeCells.map((c) => c.left);
  expect(spread(timeLefts), `time cells share one left edge (lefts: ${timeLefts.join(", ")})`).toBeLessThanOrEqual(TOL);

  // INVARIANT 2: every title cell shares ONE left edge (the `1fr` track start),
  // agenda and synthetic alike — the badge does NOT push synthetic titles into a
  // different column.
  const titleLefts = titleCells.map((c) => c.left);
  expect(spread(titleLefts), `title cells share one left edge (lefts: ${titleLefts.join(", ")})`).toBeLessThanOrEqual(TOL);

  // INVARIANT 3: the title track is strictly to the right of the time track
  // (two distinct columns, gap-x-2 between them) — guards against a collapse to
  // a single column that would make invariants 1+2 vacuously pass.
  expect(
    Math.min(...titleLefts),
    `title column starts right of the time column (title ${Math.min(...titleLefts)} > time-right ${Math.max(...timeCells.map((c) => c.right))})`,
  ).toBeGreaterThan(Math.max(...timeCells.map((c) => c.right)));

  // INVARIANT 4: each synthetic badge's left edge coincides with its title
  // cell's left edge — i.e. the badge lives INSIDE the 1fr title cell, flush to
  // its start, not as its own track. Synthetic rows are the last 2 (indices 2,3).
  const syntheticTitleLefts = titleCells.slice(ROWS.length - badges.length).map((c) => c.left);
  for (let i = 0; i < badges.length; i++) {
    expect(
      Math.abs(badges[i]!.left - syntheticTitleLefts[i]!),
      `badge ${i} sits at the start of its title cell (badge ${badges[i]!.left} vs title ${syntheticTitleLefts[i]!})`,
    ).toBeLessThanOrEqual(TOL);
  }
});
