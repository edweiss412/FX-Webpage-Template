/**
 * tests/e2e/agendaBreakdown.layout.spec.ts (Task 14 — spec §5.3 dimensional invariants)
 *
 * Real-browser layout-dimensions assertions for the AgendaBreakdown card's
 * `ready` state: the `agenda-schedule` block and its `grid-cols-[auto_minmax(0,1fr)]`
 * session rows. jsdom (unit suites) computes NO layout, and this project's
 * Tailwind v4 does NOT default `.flex` to `align-items: stretch` — so the
 * no-horizontal-overflow + long-title-wraps invariants must be verified
 * end-to-end in a real browser.
 *
 * HARNESS (standalone, no app boot): mirrors tests/e2e/agendaScheduleLayout.spec.ts:
 *   1. Compiles the REAL token CSS from app/globals.css via the Tailwind CLI
 *      (so `min-w-0`, `grid-cols-[auto_minmax(0,1fr)]`, `wrap-break-word`,
 *      `p-tile-pad`, etc. resolve exactly as the build emits them).
 *   2. Writes a static harness.html with the EXACT class structure transcribed
 *      from components/admin/wizard/Step3SheetCard.tsx (AgendaItemRow ready-state)
 *      + components/crew/AgendaScheduleBlock.tsx, inside a fixed-width card-column
 *      container, including a worst-case 90-char UNBREAKABLE session title.
 *   3. Serves it over HTTP (file:// is blocked in Chromium automation) and
 *      measures getBoundingClientRect() at 320 / 390 / 720px.
 *
 * §5.3 invariants asserted:
 *   - the `agenda-schedule` block stays within the card-column rect (±0.5px,
 *     no horizontal overflow) at 320 / 390 / 720px;
 *   - every `[data-testid="agenda-session"]` row stays within the column width
 *     (grid-cols-[auto_minmax(0,1fr)] must not push beyond the card edge);
 *   - a 90-char unbreakable title WRAPS (its row grows taller than a normal
 *     single-line session) instead of overflowing — `min-w-0` + `wrap-break-word`
 *     on the text cell must absorb the long token;
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

// CommonJS package — Playwright's CJS loader provides __dirname. Mirrors
// agendaScheduleLayout.spec.ts.
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const VIEWPORTS = [320, 390, 720] as const;
const BODY_PAD = 16; // mirrors px-4 gutter used on the Step3Review list column

// A worst-case session title: a single UNBREAKABLE long token (no spaces, no
// hyphens — hyphens are CSS soft-break opportunities). This is the adversarial
// input for the "long titles wrap, not overflow" invariant: `min-w-0` on the
// grid text cell + `wrap-break-word` (overflow-wrap: break-word) must break it
// across lines so it stays within the card column at 320px.
const LONG_TITLE =
  "AdaptingToUnpredictabilityInGlobalAssetManagementQuarterlyInvestorSummitKeynoteSessionXY"; // 90 chars

/**
 * Transcribes the `ready`-state AgendaBreakdown + AgendaScheduleBlock structure
 * VERBATIM from the components:
 *
 *   Step3SheetCard article.p-tile-pad
 *     └─ div.mt-6
 *          └─ section[data-testid="wizard-step3-card-xxx-agenda"].flex.flex-col.gap-2
 *               ├─ h4 "Agenda"
 *               └─ ul.flex.flex-col.gap-3
 *                    └─ li[data-testid="agenda-item"].flex.min-w-0.flex-col.gap-1.5
 *                         └─ AgendaScheduleBlock:
 *                              div[data-testid="agenda-schedule"].flex.min-w-0.flex-col.gap-4
 *                                └─ div.flex.min-w-0.flex-col.gap-2  (one day)
 *                                     ├─ h3 day heading
 *                                     └─ ul.flex.flex-col.gap-2
 *                                          ├─ li[data-testid="agenda-session"][data-session-kind="normal"]
 *                                          │    grid.grid-cols-[auto_minmax(0,1fr)].items-baseline.gap-x-3
 *                                          └─ li[data-testid="agenda-session"][data-session-kind="long"]
 *                                               same grid — text cell has min-w-0 + wrap-break-word
 */
function breakdownHtml(): string {
  return `
<article data-testid="card-col" class="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile)">
  <div class="mt-6">
    <section data-testid="wizard-step3-card-abc123-agenda" class="flex flex-col gap-2">
      <h4 class="text-xs font-semibold uppercase text-text-subtle" style="letter-spacing:var(--tracking-eyebrow)">Agenda</h4>
      <ul class="flex flex-col gap-3">
        <li data-testid="agenda-item" class="flex min-w-0 flex-col gap-1.5">
          <!-- AgendaScheduleBlock ready state (components/crew/AgendaScheduleBlock.tsx) -->
          <div data-testid="agenda-schedule" class="flex min-w-0 flex-col gap-4">
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="flex items-baseline gap-1.5 text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                <span>Tuesday</span>
                <span class="font-normal normal-case tabular-nums text-text-subtle">2026-05-14</span>
              </h3>
              <ul class="flex flex-col gap-2">
                <!-- Normal session — single-line title, reference height baseline -->
                <li data-testid="agenda-session" data-session-kind="normal"
                    class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3">
                  <span class="shrink-0 text-sm tabular-nums text-text-subtle">9:00 AM – 9:40 AM</span>
                  <div class="flex min-w-0 flex-col gap-1">
                    <p class="min-w-0 text-sm text-text-strong wrap-break-word">
                      Welcome<span class="text-text-subtle"> · Mabel 1</span>
                    </p>
                  </div>
                </li>
                <!-- Long-title session — 90-char unbreakable token must WRAP, not overflow -->
                <li data-testid="agenda-session" data-session-kind="long"
                    class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3">
                  <span class="shrink-0 text-sm tabular-nums text-text-subtle">10:00 AM – 11:00 AM</span>
                  <div class="flex min-w-0 flex-col gap-1">
                    <p class="min-w-0 text-sm text-text-strong wrap-break-word">${LONG_TITLE}</p>
                    <span data-testid="agenda-drift"
                          class="inline-flex w-fit items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-text-subtle">
                      Adjusted from 12:25 AM
                    </span>
                    <ul class="mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                      <li data-testid="agenda-track"
                          class="min-w-0 text-sm text-text wrap-break-word">
                        <span class="font-medium text-text-strong">Breakout I</span>
                        <span> · Adapting</span>
                        <span class="text-text-subtle"> · Room A</span>
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <!-- PDF link rendered in ready state when href is present -->
          <a href="#" target="_blank" rel="noopener noreferrer" data-testid="agenda-open-pdf"
             class="self-start text-xs font-medium text-text-strong underline underline-offset-2">
            Open PDF <span aria-hidden="true">↗</span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</article>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg" style="margin:0; padding-left:${BODY_PAD}px; padding-right:${BODY_PAD}px;">
  ${breakdownHtml()}
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "agenda-breakdown-dim-"));

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
  test(`AgendaBreakdown ready: no overflow, session rows contained, long title wraps @ ${vw}px (§5.3)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vw, height: 1200 });
    await page.goto(baseUrl);

    // Mid-viewport band-sweep: measure one element to establish the column rect,
    // then sweep all children against it (per layout-gate band-sweep convention).
    const card = page.getByTestId("card-col");
    const cardRect = await rectOf(card);

    // The agenda-schedule block must be contained within the card column.
    const scheduleBlock = page.getByTestId("agenda-schedule");
    const scheduleRect = await rectOf(scheduleBlock);
    expect(scheduleRect.left, `agenda-schedule left >= card left @ ${vw}`).toBeGreaterThanOrEqual(
      cardRect.left - TOL,
    );
    expect(scheduleRect.right, `agenda-schedule right <= card right @ ${vw}`).toBeLessThanOrEqual(
      cardRect.right + TOL,
    );

    // Every session row must stay within the card column (no horizontal overflow).
    const sessions = page.getByTestId("agenda-session");
    const n = await sessions.count();
    expect(n).toBe(2);
    for (let i = 0; i < n; i++) {
      const s = await rectOf(sessions.nth(i));
      expect(s.width, `session ${i} width <= schedule block width @ ${vw}`).toBeLessThanOrEqual(
        scheduleRect.width + TOL,
      );
      expect(s.right, `session ${i} right <= card right @ ${vw}`).toBeLessThanOrEqual(
        cardRect.right + TOL,
      );
      expect(s.left, `session ${i} left >= card left @ ${vw}`).toBeGreaterThanOrEqual(
        cardRect.left - TOL,
      );
    }

    // The 90-char unbreakable title must WRAP rather than overflow: its row is
    // taller than the normal single-line session, and it never exceeds the column.
    // `min-w-0` + `wrap-break-word` on the text cell (`p.min-w-0.wrap-break-word`)
    // inside `grid-cols-[auto_minmax(0,1fr)]` is what makes this hold.
    const normalSession = await rectOf(page.locator('[data-session-kind="normal"]'));
    const longSession = await rectOf(page.locator('[data-session-kind="long"]'));
    expect(longSession.right, `long-title session right <= card right @ ${vw}`).toBeLessThanOrEqual(
      cardRect.right + TOL,
    );
    expect(
      longSession.height,
      `long unbreakable title wrapped (long ${longSession.height}px > normal ${normalSession.height}px) @ ${vw}`,
    ).toBeGreaterThan(normalSession.height + 5);

    // Zero horizontal document overflow at every viewport.
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
