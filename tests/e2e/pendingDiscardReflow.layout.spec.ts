/**
 * tests/e2e/pendingDiscardReflow.layout.spec.ts
 * Real-browser layout-dimensions proof for DESTRUCT-1 (spec 2026-07-17 §4).
 *
 * jsdom computes no layout, so the "armed morph does not relocate the confirm
 * hit-target" invariant must be verified end-to-end. Four transcribed panels:
 *   fixed-*  = shipped classes (basis-full sm:basis-auto)  -> idle box == armed box
 *   nofix-*  = pre-fix classes (no basis)                  -> armed reflows to a new row
 * The nofix panels are the NEGATIVE CONTROL: they prove the harness reproduces
 * the reported reflow, so the fixed-panel equality is not tautological.
 *
 * Harness mirrors tests/e2e/agendaBreakdown.layout.spec.ts: compile the REAL
 * token CSS from app/globals.css via the Tailwind CLI, serve over HTTP, measure
 * getBoundingClientRect() at 360px (hazard viewport) and 720px (>= sm).
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const BODY_PAD = 16; // admin px-4 gutter

// Shipped classes (Task 1). Kept in sync with the component via the drift-guard test below.
const STACK = "basis-full sm:basis-auto";
const cls = (...parts: string[]) => parts.filter(Boolean).join(" ");
const IGNORE_ARMED = (stack: string) =>
  cls(
    "inline-flex",
    stack,
    "min-h-tap-min items-center justify-center rounded-sm border border-transparent bg-warning-text px-3 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90",
  );
const IGNORE_IDLE = (stack: string) =>
  cls(
    "inline-flex",
    stack,
    "min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken",
  );
const DEFER = (stack: string) =>
  cls(
    "inline-flex",
    stack,
    "min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken",
  );

function panel(id: string, stack: string, armed: boolean): string {
  const ignoreClass = armed ? IGNORE_ARMED(stack) : IGNORE_IDLE(stack);
  const ignoreLabel = armed ? "Confirm stop tracking this sheet permanently" : "Permanently ignore";
  return `
  <div data-panel="${id}">
    <div class="flex flex-col gap-2">
      <div data-testid="row" class="flex flex-wrap gap-2">
        <button data-testid="defer" class="${DEFER(stack)}">Defer until modified</button>
        <button data-testid="ignore" class="${ignoreClass}">${ignoreLabel}</button>
        <span role="status" class="sr-only">${armed ? "Tap again to confirm." : ""}</span>
      </div>
    </div>
  </div>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg" style="margin:0; padding-left:${BODY_PAD}px; padding-right:${BODY_PAD}px;">
  ${panel("fixed-idle", STACK, false)}
  ${panel("fixed-armed", STACK, true)}
  ${panel("nofix-idle", "", false)}
  ${panel("nofix-armed", "", true)}
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "pending-discard-reflow-"));
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));
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

type Box = { nx: number; ny: number; w: number; h: number; ignoreTop: number; deferBottom: number };
async function measure(page: import("@playwright/test").Page, panelId: string): Promise<Box> {
  return page.evaluate((pid) => {
    const root = document.querySelector(`[data-panel="${pid}"]`)!;
    const row = root.querySelector('[data-testid="row"]')!.getBoundingClientRect();
    const ignore = root.querySelector('[data-testid="ignore"]')!.getBoundingClientRect();
    const defer = root.querySelector('[data-testid="defer"]')!.getBoundingClientRect();
    return {
      nx: ignore.left - row.left,
      ny: ignore.top - row.top,
      w: ignore.width,
      h: ignore.height,
      ignoreTop: ignore.top,
      deferBottom: defer.bottom,
    };
  }, panelId);
}

test("fixed panel: armed ignore box == idle ignore box at 360px (no reflow)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(baseUrl);
  const idle = await measure(page, "fixed-idle");
  const armed = await measure(page, "fixed-armed");
  expect(Math.abs(armed.nx - idle.nx)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(armed.ny - idle.ny)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(armed.w - idle.w)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(armed.h - idle.h)).toBeLessThanOrEqual(TOL);
  // Both states: ignore occupies its own row below Defer (full-width stack).
  expect(idle.ignoreTop).toBeGreaterThanOrEqual(idle.deferBottom - TOL);
  expect(armed.ignoreTop).toBeGreaterThanOrEqual(armed.deferBottom - TOL);
});

test("NEGATIVE CONTROL: pre-fix classes DO reflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(baseUrl);
  const idle = await measure(page, "nofix-idle");
  const armed = await measure(page, "nofix-armed");
  // idle ignore rides line 1 next to Defer; armed ignore drops to a new row.
  expect(idle.ignoreTop).toBeLessThan(idle.deferBottom - TOL); // same row as Defer
  expect(armed.ignoreTop).toBeGreaterThanOrEqual(armed.deferBottom - TOL); // wrapped below
  expect(Math.abs(armed.ny - idle.ny)).toBeGreaterThan(TOL); // the box moved
});

test("fixed panel: >= sm the row does NOT wrap (buttons side by side)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto(baseUrl);
  const armed = await measure(page, "fixed-armed");
  // basis-auto restored: armed ignore shares Defer's row (top above Defer's bottom).
  expect(armed.ignoreTop).toBeLessThan(armed.deferBottom - TOL);
});

test("drift-guard: shipped component still carries the stack fragment", () => {
  const src = readFileSync(
    join(REPO_ROOT, "components/admin/PendingPanelDiscardButtons.tsx"),
    "utf8",
  );
  // both discard buttons must keep the responsive stack the harness assumes
  expect(src).toContain("basis-full");
  expect(src).toContain("sm:basis-auto");
});
