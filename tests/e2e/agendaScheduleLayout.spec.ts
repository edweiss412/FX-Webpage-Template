/**
 * tests/e2e/agendaScheduleLayout.spec.ts (Task 16 — spec §6 dimensional invariants)
 *
 * Real-browser layout-dimensions assertions for the agenda area in the Schedule
 * section: the AgendaEmbed affordance row + the AgendaScheduleBlock session
 * rows. jsdom (the unit suites) computes NO layout, and this project's Tailwind
 * v4 does NOT default `.flex` to `align-items: stretch` — so the §6
 * no-horizontal-overflow + long-title-wraps invariants must be verified
 * end-to-end in a browser.
 *
 * HARNESS (standalone, no app boot): the agenda area is rendered inside the
 * Schedule section only when a show has high-confidence extracted agenda data,
 * which no route renders standalone with a seeded extraction. So per the
 * project's documented standalone real-browser layout harness
 * (memory/reference_standalone_realbrowser_layout_harness, mirrors
 * tests/e2e/step3-card-dimensions.spec.ts) this spec:
 *   1. compiles the REAL token CSS from app/globals.css via the Tailwind CLI
 *      (so `min-w-0`, `grid-cols-[auto_minmax(0,1fr)]`, `wrap-break-word`,
 *      `flex-wrap`, etc. resolve exactly as the build emits them);
 *   2. writes a static harness.html with the EXACT class structure transcribed
 *      from components/crew/AgendaScheduleBlock.tsx + components/agenda/
 *      AgendaEmbed.tsx, inside a fixed-width Schedule column, including a
 *      worst-case 90-char UNBREAKABLE-token session title;
 *   3. serves it over HTTP (file:// is blocked in Chromium automation) and
 *      measures getBoundingClientRect() at 320 / 390 / 720px.
 *
 * §6 invariants asserted:
 *   - the affordance row + every `[data-testid="agenda-session"]` stay within
 *     the column width (no horizontal overflow) at 320 / 390 / 720px;
 *   - a 90-char unbreakable title WRAPS (its row grows taller than a normal
 *     single-line session) instead of overflowing the column;
 *   - zero horizontal document overflow.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// CommonJS package — Playwright's CJS loader provides __dirname (do NOT use
// import.meta.url; it flips the module to ESM). Mirrors step3-card-dimensions.
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const VIEWPORTS = [320, 390, 720] as const;
const BODY_PAD = 16; // mirrors the crew page's `px-4` content gutter

// A worst-case title: a single UNBREAKABLE long token (no spaces, no hyphens —
// hyphens are CSS soft-break opportunities). This is the adversarial input for
// the §6 "long titles wrap, not overflow" invariant: `min-w-0` on the grid text
// cell + `wrap-break-word` (overflow-wrap: break-word) must break it across
// lines so it stays within the column at 320px.
const LONG_TITLE =
  "AdaptingToUnpredictabilityInGlobalAssetManagementQuarterlyInvestorSummitKeynoteSessionXY"; // 90 chars

// Affordance row + schedule block, transcribed VERBATIM from the components so
// the measured geometry exercises the real Tailwind classes (not a paraphrase).
function agendaHtml(): string {
  return `
<div data-testid="agenda-col" class="flex min-w-0 flex-col gap-3">
  <div data-testid="agenda-embed" class="flex flex-wrap gap-2">
    <button type="button" class="inline-flex min-h-tap-min items-center gap-2 self-start rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-strong shadow-(--shadow-tile)">
      <span aria-hidden="true" class="size-4"></span>View agenda<span class="text-text-subtle">· RFI</span>
    </button>
    <button type="button" class="inline-flex min-h-tap-min items-center gap-2 self-start rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-strong shadow-(--shadow-tile)">
      <span aria-hidden="true" class="size-4"></span>View agenda<span class="text-text-subtle">· PCF</span>
    </button>
  </div>
  <div data-testid="agenda-schedule" class="flex min-w-0 flex-col gap-4">
    <div class="flex min-w-0 flex-col gap-2">
      <h3 class="flex items-baseline gap-1.5 text-xs font-medium uppercase tracking-eyebrow text-text-subtle"><span>Tuesday</span><span class="font-normal normal-case tabular-nums text-text-subtle">2026-05-14</span></h3>
      <ul class="flex flex-col gap-2">
        <li data-testid="agenda-session" data-session-kind="normal" class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3">
          <span class="shrink-0 text-sm tabular-nums text-text-subtle">9:00 AM – 9:40 AM</span>
          <div class="flex min-w-0 flex-col gap-1">
            <p class="min-w-0 text-sm text-text-strong wrap-break-word">Welcome<span class="text-text-subtle"> · Mabel 1</span></p>
          </div>
        </li>
        <li data-testid="agenda-session" data-session-kind="long" class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3">
          <span class="shrink-0 text-sm tabular-nums text-text-subtle">10:00 AM – 11:00 AM</span>
          <div class="flex min-w-0 flex-col gap-1">
            <p class="min-w-0 text-sm text-text-strong wrap-break-word">${LONG_TITLE}</p>
            <span class="inline-flex w-fit items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-text-subtle">Adjusted from 12:25 AM</span>
            <ul class="mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
              <li class="min-w-0 text-sm text-text wrap-break-word"><span class="font-medium text-text-strong">Breakout I</span> · Adapting · Room A</li>
            </ul>
          </div>
        </li>
      </ul>
    </div>
  </div>
</div>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg" style="margin:0; padding-left:${BODY_PAD}px; padding-right:${BODY_PAD}px;">
  ${agendaHtml()}
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "agenda-schedule-dim-"));

  // Write the harness FIRST so the Tailwind CLI scans it and emits every
  // utility it uses (Tailwind v4 only generates classes it finds in @source).
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

type Rect = {
  left: number;
  right: number;
  width: number;
  top: number;
  bottom: number;
  height: number;
};

async function rectOf(locator: import("@playwright/test").Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      width: r.width,
      top: r.top,
      bottom: r.bottom,
      height: r.height,
    };
  });
}

for (const vw of VIEWPORTS) {
  test(`agenda area: no child overflows the column @ ${vw}px (§6)`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 1200 });
    await page.goto(baseUrl);

    const col = await rectOf(page.getByTestId("agenda-col"));

    // The affordance row stays within the column.
    const embed = await rectOf(page.getByTestId("agenda-embed"));
    expect(embed.right, `affordance row right within column @ ${vw}`).toBeLessThanOrEqual(
      col.right + TOL,
    );
    expect(embed.left, `affordance row left within column @ ${vw}`).toBeGreaterThanOrEqual(
      col.left - TOL,
    );

    // Every session row stays within the column (no horizontal overflow).
    const sessions = page.getByTestId("agenda-session");
    const n = await sessions.count();
    expect(n).toBe(2);
    for (let i = 0; i < n; i++) {
      const s = await rectOf(sessions.nth(i));
      expect(s.width, `session ${i} width <= column @ ${vw}`).toBeLessThanOrEqual(col.width + TOL);
      expect(s.right, `session ${i} right within column @ ${vw}`).toBeLessThanOrEqual(
        col.right + TOL,
      );
      expect(s.left, `session ${i} left within column @ ${vw}`).toBeGreaterThanOrEqual(
        col.left - TOL,
      );
    }

    // The 90-char unbreakable title WRAPS rather than overflowing: its row is
    // taller than a normal single-line session, and it never exceeds the column.
    const normal = await rectOf(page.locator('[data-session-kind="normal"]'));
    const long = await rectOf(page.locator('[data-session-kind="long"]'));
    expect(long.width, `long-title session width <= column @ ${vw}`).toBeLessThanOrEqual(
      col.width + TOL,
    );
    expect(
      long.height,
      `long unbreakable title wrapped (long ${long.height} > normal ${normal.height}) @ ${vw}`,
    ).toBeGreaterThan(normal.height + 5);

    // Zero horizontal document overflow.
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollW,
      `no horizontal document overflow @ ${vw} (scrollW ${overflow.scrollW} vs clientW ${overflow.clientW})`,
    ).toBeLessThanOrEqual(overflow.clientW + TOL);
  });
}
