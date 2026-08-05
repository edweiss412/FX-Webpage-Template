/**
 * tests/e2e/step3-review-modal.agenda.spec.ts
 *
 * Real-browser containment gate for the agenda breakdown INSIDE THE REAL
 * <Step3ReviewModal> chrome. Replaces tests/e2e/agendaBreakdown.layout.spec.ts,
 * whose surrounding card chrome was HAND-TRANSCRIBED from the component — a
 * transcription can only ever prove itself, and it is the real modal wrapper
 * (`li[data-testid="agenda-item"]` inside the section chrome,
 * `step3ReviewSections.tsx:3239`) plus the real agenda subtree beneath it that
 * together have to absorb an unbreakable token. Spec
 * `docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md` §4.
 *
 * HARNESS (standalone, no app boot) — same shape as
 * step3-review-modal.interactions.spec.ts:
 *   1. tsx-renders the static harness page (the Tailwind @source for the modal
 *      chrome classes) out of process;
 *   2. esbuild-bundles tests/e2e/_step3ReviewModalAgendaEntry.tsx, which mounts
 *      the REAL modal with a NON-EMPTY agendaBaseline and stubs the extract POST
 *      so the breakdown reaches its `ready` state;
 *   3. compiles the token CSS (globals.css + the two agenda component sources,
 *      which the static page cannot supply because the modal chrome renders no
 *      agenda section without a baseline);
 *   4. serves it over node:http.
 *
 * Readiness: assertions wait for the agenda block's `ready` state — the parsing
 * status line gone AND every fixture session painted — never `networkidle`.
 * Sessions render only in `ready` (`showBlock = state === "ready" && …`,
 * step3ReviewSections.tsx), so the session count IS the ready gate.
 *
 * Invariants asserted (the re-home contract for the deleted spec, §4.4):
 *   - the real `li` agenda-item wrapper stays inside the agenda section and
 *     within the viewport at 320 / 390 / 720px;
 *   - the real `ul` list container never grows horizontally (scrollWidth ===
 *     clientWidth). NOTE on what actually carries this: the agenda `ul` is
 *     `flex flex-col` (step3ReviewSections.tsx), so the automatic-minimum-size
 *     floor applies to its VERTICAL main axis and the `li`'s `min-w-0` is inert
 *     horizontally — verified by mutation (dropping `min-w-0` from the `li` at
 *     step3ReviewSections.tsx:3239 leaves all six cases green). The load-bearing
 *     declaration is `wrap-break-word` on the session title
 *     (components/crew/AgendaScheduleBlock.tsx:166); dropping it turns these
 *     cases red. The `li` assertions still earn their place: they pin the real
 *     wrapper's box against the real section chrome, which the deleted
 *     hand-transcribed spec could only ever pin against its own copy;
 *   - the session COUNT is derived from the shared fixture (never a literal),
 *     and EVERY session row stays within the schedule block and the section;
 *   - the 88-char unbreakable session title WRAPS (its row grows taller than the
 *     normal single-line session) instead of widening the card;
 *   - zero horizontal document overflow.
 *
 * Runs on the desktop-chromium project (step3-live-bundle.yml) and standalone:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/step3-review-modal.agenda.spec.ts
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Locator, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { LONG_TITLE, TOTAL_SESSIONS } from "./_agendaFixture";

// CommonJS package — Playwright's CJS loader provides __dirname (mirrors
// step3-review-modal.interactions.spec.ts; do NOT use import.meta.url here).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const VIEWPORTS = [320, 390, 720] as const;

// NOT imported from the harness (a spec that imports a .tsx gets Playwright's
// JSX transform); duplicated here and cross-checked against the harness JSON so
// the two can never drift silently.
const HARNESS_DFID = "drive-abc-123";

const PANEL = "[data-step3-review-panel]";
const AGENDA_SECTION = `[data-testid="wizard-step3-card-${HARNESS_DFID}-agenda"]`;
const AGENDA_PARSING = `[data-testid="wizard-step3-card-${HARNESS_DFID}-agenda-parsing"]`;
const AGENDA_ITEM = '[data-testid="agenda-item"]';
const AGENDA_SCHEDULE = '[data-testid="agenda-schedule"]';
const AGENDA_SESSION = '[data-testid="agenda-session"]';

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "step3-review-modal-agenda-"));

  // 1. Static render of the harness fixture — the Tailwind @source for the
  //    modal's own chrome classes, plus the dfid drift cross-check.
  const pagesJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalHarness.tsx"), pagesJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const pages = JSON.parse(readFileSync(pagesJson, "utf8")) as { dfid: string; normal: string };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);
  writeFileSync(
    join(workDir, "harness.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8"></head><body class="bg-bg">${pages.normal}</body></html>`,
  );

  // 2. The LIVE page: empty #root + the esbuild bundle.
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // 3. Bundle the agenda entry through the Step-3 bundler (it replicates Next's
  //    "use server" elision and empties node builtins — see its own header).
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalAgendaEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // 4. Compile the real token CSS. The static harness page carries NO agenda
  //    section (its baseline is empty), so the two components that render the
  //    breakdown are sourced explicitly — otherwise every agenda class
  //    (`grid-cols-[auto_minmax(0,1fr)]`, `wrap-break-word`, `min-w-0`) would be
  //    absent and the containment assertions would measure unstyled markup.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(workDir, "harness.html")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "step3ReviewSections.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "crew", "AgendaScheduleBlock.tsx")}";`,
      globals,
    ].join("\n"),
  );
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
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

type Rect = { left: number; right: number; width: number; height: number };

/** Measured through a FRESH locator every call (detach-safety). */
async function rectOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return { left: box.x, right: box.x + box.width, width: box.width, height: box.height };
}

async function openAgenda(page: Page, width: number) {
  // Reduced motion: the panel's entrance animation is collapsed by globals.css,
  // so geometry is final on load and no animation wait is needed.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(baseUrl + "live.html");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(PANEL)).toBeVisible();
  // READY GATE: the parsing status line is SILENT and every fixture session has
  // painted. Sessions render only in the `ready` state, so this IS the state
  // gate — and the count comes from the fixture, never a literal.
  //
  // The gate used to read `toHaveCount(0)`. The region is now permanently
  // mounted with toggled text (BL-ANNOUNCE-REGION-UNMOUNT-CLASS: a `role="status"`
  // inserted together with its text is never announced, so "parsing started" —
  // exactly the transition a reader needs — was silent). Emptiness, not absence,
  // is what "no longer parsing" means, and asserting BOTH count and text is
  // strictly stronger than the disappearance check it replaces: it would now
  // catch the region being deleted outright, which `toHaveCount(0)` welcomed.
  await expect(page.locator(AGENDA_PARSING)).toHaveCount(1);
  await expect(page.locator(AGENDA_PARSING)).toHaveText("");
  await expect(page.locator(AGENDA_SESSION)).toHaveCount(TOTAL_SESSIONS);
  await page.locator(AGENDA_SECTION).scrollIntoViewIfNeeded();
}

for (const vw of VIEWPORTS) {
  test(`agenda breakdown is contained by the REAL modal wrapper @ ${vw}px`, async ({ page }) => {
    await openAgenda(page, vw);

    await expect(async () => {
      const sectionRect = await rectOf(page.locator(AGENDA_SECTION));
      const itemRect = await rectOf(page.locator(AGENDA_ITEM).first());

      // The real li wrapper: inside the section, never wider than the viewport.
      expect(itemRect.width, `agenda item width <= viewport @ ${vw}`).toBeLessThanOrEqual(vw + TOL);
      expect(itemRect.left, `agenda item left >= section left @ ${vw}`).toBeGreaterThanOrEqual(
        sectionRect.left - TOL,
      );
      expect(itemRect.right, `agenda item right <= section right @ ${vw}`).toBeLessThanOrEqual(
        sectionRect.right + TOL,
      );

      // The real ul list container must not grow horizontally. What keeps it
      // from growing is `wrap-break-word` on the session title
      // (AgendaScheduleBlock.tsx:166) — NOT the li's `min-w-0`, which is inert
      // inside a `flex-col` ul (see the header note). Drop `wrap-break-word` and
      // the unbreakable token widens the list and this reports a positive delta.
      const listOverflow = await page
        .locator(AGENDA_ITEM)
        .first()
        .evaluate((el) => {
          const ul = el.parentElement;
          if (!ul) throw new Error("agenda item has no list parent");
          return ul.scrollWidth - ul.clientWidth;
        });
      expect(listOverflow, `agenda list has no horizontal overflow @ ${vw}`).toBeLessThanOrEqual(
        TOL,
      );

      // The agenda-schedule BLOCK itself stays inside the section. The deleted
      // spec asserted this against its hand-written `card-col`; without it the
      // schedule could overhang the section while every session row still sat
      // inside the (equally overhanging) schedule, and the per-row loop below
      // would stay green. Re-homed here against the REAL section chrome.
      const scheduleRect = await rectOf(page.locator(AGENDA_SCHEDULE).first());
      expect(
        scheduleRect.left,
        `agenda-schedule left >= section left @ ${vw}`,
      ).toBeGreaterThanOrEqual(sectionRect.left - TOL);
      expect(
        scheduleRect.right,
        `agenda-schedule right <= section right @ ${vw}`,
      ).toBeLessThanOrEqual(sectionRect.right + TOL);

      // EVERY session row (not nth=0 only) stays within the schedule block and
      // the section — the assertion family re-homed from the deleted spec.
      const sessions = page.locator(AGENDA_SESSION);
      const n = await sessions.count();
      expect(n, `every fixture session paints in the admin shape @ ${vw}`).toBe(TOTAL_SESSIONS);
      for (let i = 0; i < n; i++) {
        const s = await rectOf(sessions.nth(i));
        expect(s.width, `session ${i} width <= schedule width @ ${vw}`).toBeLessThanOrEqual(
          scheduleRect.width + TOL,
        );
        expect(s.right, `session ${i} right <= section right @ ${vw}`).toBeLessThanOrEqual(
          sectionRect.right + TOL,
        );
        expect(s.left, `session ${i} left >= section left @ ${vw}`).toBeGreaterThanOrEqual(
          sectionRect.left - TOL,
        );
      }

      // Zero horizontal document overflow.
      const doc = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(
        doc.scrollW,
        `no horizontal document overflow @ ${vw} (scrollW ${doc.scrollW} vs clientW ${doc.clientW})`,
      ).toBeLessThanOrEqual(doc.clientW + TOL);
    }).toPass();
  });

  test(`the 88-char unbreakable session title wraps inside the real wrapper @ ${vw}px`, async ({
    page,
  }) => {
    await openAgenda(page, vw);

    await expect(async () => {
      const sessions = page.locator(AGENDA_SESSION);
      // Ordering guard: the fixture puts the normal session first and the long
      // token second in row 0 (_agendaFixture.ts). Reordering it must fail here
      // rather than silently comparing the wrong pair.
      await expect(sessions.nth(1)).toContainText(LONG_TITLE);
      const normal = await rectOf(sessions.nth(0));
      const long = await rectOf(sessions.nth(1));
      const sectionRect = await rectOf(page.locator(AGENDA_SECTION));

      expect(long.right, `long-title session right <= section right @ ${vw}`).toBeLessThanOrEqual(
        sectionRect.right + TOL,
      );
      // Derived from the measured single-line height, never a hardcoded pixel
      // literal: the wrapped row must be taller than the single-line row.
      expect(
        long.height,
        `long unbreakable title wrapped (long ${long.height}px > normal ${normal.height}px) @ ${vw}`,
      ).toBeGreaterThan(normal.height + 5);
    }).toPass();
  });
}
