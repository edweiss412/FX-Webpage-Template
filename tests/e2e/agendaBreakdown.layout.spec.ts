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
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { LONG_TITLE, TOTAL_SESSIONS } from "./_agendaFixture";

// CommonJS package — Playwright's CJS loader provides __dirname. Mirrors
// agendaScheduleLayout.spec.ts.
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const VIEWPORTS = [320, 390, 720] as const;
const BODY_PAD = 16; // mirrors px-4 gutter used on the Step3Review list column

// A worst-case session title: a single UNBREAKABLE long token (no spaces, no
// hyphens — hyphens are CSS soft-break opportunities). This is the adversarial

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
 *                                          ├─ li[data-testid="agenda-session"]  (normal)
 *                                          │    grid.grid-cols-[auto_minmax(0,1fr)].items-baseline.gap-x-3
 *                                          └─ li[data-testid="agenda-session"]  (90-char token)
 *                                               same grid — text cell has min-w-0 + wrap-break-word
 */

/**
 * The REAL AgendaScheduleBlock, rendered out of process in its ADMIN shape (no viewerDays, so
 * every row is open and unmarked).
 *
 * This file used to transcribe that markup verbatim, and the whole-diff review caught that the
 * copy still described the pre-fold structure -- plain divs with an h3 -- after the component
 * had moved to <details>/<summary>. Same drift as the crew harness, in the second file, which
 * the original sweep missed. Shelling out is required because Playwright compiles loaded files
 * with its own JSX factory; see _renderAgendaScheduleHtml.ts.
 */
/**
 * KNOWN FIDELITY LIMIT of this harness, stated because a green run here is narrower than it looks.
 *
 * The inner block below is the REAL component. The surrounding article/section/ul/li chrome is
 * still hand-written, and the `li.min-w-0` in it is load-bearing for the long-token overflow
 * assertion -- so this file can stay green while the ACTUAL admin wrapper overflows. Production
 * Step 3 renders `AgendaBreakdown` (step3ReviewSections.tsx:3300), which has a modal-chrome branch
 * this harness does not reproduce.
 *
 * Not closed here because `AgendaBreakdown` is "use client" with ~30 hooks, needs a
 * driveFileId/wizardSessionId, and does an extract POST plus polling; rendering it statically needs
 * network and provider stubs, which is the unsound path. Filed as
 * BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY.
 */
function agendaScheduleHtml(): string {
  return execFileSync(
    "pnpm",
    ["exec", "tsx", join(REPO_ROOT, "tests/e2e/_renderAgendaScheduleHtml.ts"), "--admin"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 120_000 },
  );
}

function breakdownHtml(): string {
  return `
<article data-testid="card-col" class="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile)">
  <div class="mt-6">
    <section data-testid="wizard-step3-card-abc123-agenda" class="flex flex-col gap-2">
      <h4 class="text-xs font-semibold uppercase text-text-subtle" style="letter-spacing:var(--tracking-eyebrow)">Agenda</h4>
      <ul class="flex flex-col gap-3">
        <li data-testid="agenda-item" class="flex min-w-0 flex-col gap-1.5">
          <!-- AgendaScheduleBlock ready state (components/crew/AgendaScheduleBlock.tsx) -->
          ${agendaScheduleHtml()}
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

  compileEntryCss({ entryCss: entryCss, outFile: join(workDir, "out.css") });

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
    // Derived from the shared fixture: the admin shape opens every row, so every session
    // paints. A literal here is what pinned this harness to its own transcription.
    expect(n, `every fixture session paints in the admin shape @ ${vw}`).toBe(TOTAL_SESSIONS);
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
    // Selected by ORDER within the fixture, NOT by a `data-session-kind` attribute. That
    // attribute never existed in the component -- it was invented by this harness's own
    // transcription to label its hand-written markup, and then selected on, so the assertion
    // was comparing two elements the app does not render. The fixture puts the normal session
    // first and the 90-char token second in row 0 (see _agendaFixture.ts).
    const sessionRows = page.getByTestId("agenda-session");
    const normalSession = await rectOf(sessionRows.nth(0));
    const longSession = await rectOf(sessionRows.nth(1));
    // Guards the ordering this selection depends on: if the fixture is reordered, compare the
    // wrong pair and the height assertion below becomes meaningless rather than failing.
    await expect(sessionRows.nth(1)).toContainText(LONG_TITLE);
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
