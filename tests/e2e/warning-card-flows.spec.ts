/**
 * tests/e2e/warning-card-flows.spec.ts
 * (warning-card-fixes spec §6.3, §16.2 "One full Save flow"; plan Task 15)
 *
 * One full Save flow on the wizard warning card, in a real browser: pick the other
 * reading, see Save and Cancel at the 44px tap floor, press Save, and watch the card
 * leave the active list with focus landing on the panel's focus anchor. jsdom cannot
 * prove where focus goes when the focused button unmounts under a real document, and it
 * computes no layout for the tap floors.
 *
 * HARNESS (standalone, no app boot, no Supabase), per the plan's checklist:
 *   1. bundles tests/e2e/_warningCardLiveEntry.tsx through
 *      tests/e2e/_step3ReviewModalBundle.mjs with an alias map that swaps the two staged
 *      action modules for tests/e2e/_warningCardActionStub.ts (which records calls on
 *      `window.__warningCardCalls`);
 *   2. compiles the real token CSS over app/globals.css with explicit @source lines for
 *      every file whose classes these assertions measure;
 *   3. serves live.html over node:http on port 0.
 * The entry's router refresh() swaps the harness state as a refresh would (the row
 * moves to the ignored partition, the saved decision persists).
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/warning-card-flows.spec.ts
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

// CommonJS package — Playwright's CJS loader provides __dirname.
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_FLOOR = 44;
const TILE_PAD_PX = "20px";

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "warning-card-flows-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  const stub = join(REPO_ROOT, "tests", "e2e", "_warningCardActionStub.ts");
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_warningCardLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
      JSON.stringify({
        "@/app/admin/onboarding/_actions/useRawStaged": stub,
        "@/app/admin/onboarding/_actions/stagedWarningIgnore": stub,
      }),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // A client-only mount: each file whose classes the assertions measure is sourced
  // explicitly, plus the modal shell and surface the rows sit in.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "step3ReviewSections.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "DataQualityWarningControls.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "UseRawControl.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "JudgmentCallTag.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "attentionMark.ts")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "Step3ReviewModal.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "ReviewModalShell.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "unsavedReadings.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "ShowReviewSurface.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "shared", "ReportButton.tsx")}";`,
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

test.describe("deferred reading choice (spec §6.3)", () => {
  test("pick, Save, the card leaves the active list and focus stays in the panel", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${baseUrl}?scenario=save`);
    await page.evaluate(() => document.fonts.ready);
    const raw = await page.locator("html").getAttribute("data-warning-card-save");
    if (!raw) throw new Error("live entry did not publish data-warning-card-save");
    const meta = JSON.parse(raw) as { dfid: string; row: number; sid: string };
    const rowId = `wizard-step3-card-${meta.dfid}-warning-${meta.row}`;
    const mainId = `dq-ignore-${meta.sid}`;
    const cancelId = `dq-cancel-${meta.sid}`;
    const anchorId = `wizard-step3-card-${meta.dfid}-warnings-focus-anchor`;
    const row = page.getByTestId(rowId);
    await expect(row).toBeVisible();

    // The attention menu auto-opens above `sm` and could sit over the row; settle it.
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
    const chip = page.getByTestId(`wizard-step3-card-${meta.dfid}-review-chip`);
    if ((await chip.count()) > 0 && (await chip.getAttribute("aria-expanded")) === "true") {
      await chip.click();
      await expect(chip).toHaveAttribute("aria-expanded", "false");
    }

    // CSS premise: real Tailwind emitted (the rows' panel resolves `p-tile-pad`).
    const padding = await page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) throw new Error(`missing ${id}`);
      const panel = el.closest('[data-testid$="-panel-card"]');
      if (!panel) throw new Error(`no panel card around ${id}`);
      return getComputedStyle(panel).paddingLeft;
    }, rowId);
    expect(padding, "CSS premise: the panel's p-tile-pad compiled to 20px").toBe(TILE_PAD_PX);

    // Pick the other reading: a draft, nothing written.
    await row.getByTestId("use-raw-toggle-on-list").click();
    await expect(page.getByTestId(mainId)).toHaveText("Save");
    await expect(page.getByTestId(cancelId)).toBeVisible();
    expect(await page.evaluate(() => window.__warningCardCalls ?? [])).toEqual([]);

    const heights = await page.evaluate(
      ([main, cancel]) => {
        const read = (id: string) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) throw new Error(`missing ${id}`);
          return el.getBoundingClientRect().height;
        };
        return { main: read(main!), cancel: read(cancel!) };
      },
      [mainId, cancelId],
    );
    expect(heights.main, "Save tap floor").toBeGreaterThanOrEqual(TAP_FLOOR - TOL);
    expect(heights.cancel, "Cancel tap floor").toBeGreaterThanOrEqual(TAP_FLOOR - TOL);

    // Save: the reading, then the accept, then the refresh moves the card.
    await page.getByTestId(mainId).click();
    await expect(page.getByTestId(rowId)).toHaveCount(0);
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? null,
    );
    expect(focused).toBe(anchorId);
    const calls = await page.evaluate(() => (window.__warningCardCalls ?? []).map((c) => c.name));
    expect(calls).toEqual(["setStagedUseRawDecisionAction", "setStagedWarningIgnore"]);
    // Review R1 C1 sweep: the reading sent is the one picked (the sheet's, useRaw true;
    // the staged action's args are session, sheet, warningRef, useRaw).
    const sent = await page.evaluate(() => window.__warningCardCalls?.[0]?.args[3]);
    expect(sent).toBe(true);
  });
});

test.describe("unsaved reading guard (spec §6.5)", () => {
  for (const width of [1280, 320]) {
    test(`closing with an unsaved pick asks first; the prompt fits and its buttons meet the floor (${width}px)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${baseUrl}?scenario=save`);
      await page.evaluate(() => document.fonts.ready);
      const raw = await page.locator("html").getAttribute("data-warning-card-save");
      if (!raw) throw new Error("live entry did not publish data-warning-card-save");
      const meta = JSON.parse(raw) as { dfid: string; row: number; sid: string };
      const row = page.getByTestId(`wizard-step3-card-${meta.dfid}-warning-${meta.row}`);
      await expect(row).toBeVisible();
      await page.evaluate(
        () =>
          new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      );
      const chip = page.getByTestId(`wizard-step3-card-${meta.dfid}-review-chip`);
      if ((await chip.count()) > 0 && (await chip.getAttribute("aria-expanded")) === "true") {
        await chip.click();
        await expect(chip).toHaveAttribute("aria-expanded", "false");
      }

      // A draft: the pick waits for Save.
      await row.getByTestId("use-raw-toggle-on-list").click();
      await expect(page.getByTestId(`dq-ignore-${meta.sid}`)).toHaveText("Save");

      const closeId = `wizard-step3-card-${meta.dfid}-review-close`;
      await page.getByTestId(closeId).click();
      const prompt = page.getByRole("alertdialog");
      await expect(prompt).toBeVisible();
      await expect(prompt).toHaveAccessibleName("You have 1 unsaved reading change");

      // CSS premise: real Tailwind emitted for the prompt (its panel resolves p-tile-pad).
      const geom = await page.evaluate(() => {
        const read = (id: string) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) throw new Error(`missing ${id}`);
          return el;
        };
        const panel = read("unsaved-readings-prompt-panel");
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
        };
        return {
          padding: getComputedStyle(panel).paddingLeft,
          panel: box(panel),
          goBack: box(read("unsaved-readings-prompt-go-back")),
          discard: box(read("unsaved-readings-prompt-discard")),
          focused: document.activeElement?.getAttribute("data-testid") ?? null,
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });
      expect(geom.padding, "CSS premise: the prompt's p-tile-pad compiled to 20px").toBe(
        TILE_PAD_PX,
      );
      expect(geom.focused, "Go back holds focus when the prompt opens").toBe(
        "unsaved-readings-prompt-go-back",
      );
      expect(geom.goBack.height, "Go back tap floor").toBeGreaterThanOrEqual(TAP_FLOOR - TOL);
      expect(geom.discard.height, "Discard tap floor").toBeGreaterThanOrEqual(TAP_FLOOR - TOL);
      expect(geom.panel.left, "panel inside the viewport (left)").toBeGreaterThanOrEqual(-TOL);
      expect(geom.panel.top, "panel inside the viewport (top)").toBeGreaterThanOrEqual(-TOL);
      expect(geom.panel.right, "panel inside the viewport (right)").toBeLessThanOrEqual(
        geom.vw + TOL,
      );
      expect(geom.panel.bottom, "panel inside the viewport (bottom)").toBeLessThanOrEqual(
        geom.vh + TOL,
      );

      // Go back: the prompt leaves, the draft stays, focus returns to the close button.
      await page.getByTestId("unsaved-readings-prompt-go-back").click();
      await expect(prompt).toHaveCount(0);
      await expect(page.getByTestId(`dq-ignore-${meta.sid}`)).toHaveText("Save");
      const back = await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? null,
      );
      expect(back).toBe(closeId);
    });
  }
});

/** Opens `?scenario=<name>`, settles the auto-opened attention menu and proves real
 *  Tailwind compiled (the panel's `p-tile-pad` resolves to 20px). */
async function openScenario(
  page: import("@playwright/test").Page,
  scenario: string,
  premiseTestId: string,
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}?scenario=${scenario}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId(premiseTestId)).toBeVisible();
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  const chip = page.locator('[data-testid$="-review-chip"]');
  if ((await chip.count()) > 0 && (await chip.first().getAttribute("aria-expanded")) === "true") {
    await chip.first().click();
    await expect(chip.first()).toHaveAttribute("aria-expanded", "false");
  }
  const padding = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) throw new Error(`missing ${id}`);
    const panel = el.closest('[data-testid$="-panel-card"]');
    if (!panel) throw new Error(`no panel card around ${id}`);
    return getComputedStyle(panel).paddingLeft;
  }, premiseTestId);
  expect(padding, "CSS premise: the panel's p-tile-pad compiled to 20px").toBe(TILE_PAD_PX);
}

/** Height of one element by rect, read in the page with a named failure when absent. */
async function rectHeight(page: import("@playwright/test").Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) throw new Error(`missing ${id}`);
    return el.getBoundingClientRect().height;
  }, testId);
}

/** Whether the element matching `selector` carries the one-shot flash and lies inside the
 *  review scroller's rect. */
async function flashedInView(
  page: import("@playwright/test").Page,
  scrollerTestId: string,
  selector: string,
): Promise<boolean> {
  return page.evaluate(
    ([sid, sel]) => {
      const scroller = document.querySelector(`[data-testid="${sid}"]`);
      if (!scroller) throw new Error(`missing scroller ${sid}`);
      const target = scroller.querySelector(sel!);
      if (!target || !target.hasAttribute("data-step3-warning-flash")) return false;
      const s = scroller.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      return t.top >= s.top - 0.5 && t.bottom <= s.bottom + 0.5;
    },
    [scrollerTestId, selector],
  );
}

test.describe("jumps (spec §5.4, §5.5)", () => {
  test("the Hotels reservation marker jumps to its card in Sheet warnings", async ({ page }) => {
    await openScenario(page, "jumps", "wizard-step3-hotel-judgment-marker");
    const raw = await page.locator("html").getAttribute("data-warning-card-jumps");
    if (!raw) throw new Error("live entry did not publish data-warning-card-jumps");
    const meta = JSON.parse(raw) as { dfid: string; guestRow: number; hotelIndex: number };

    // The marker sits on the judged reservation, and only there.
    const marker = page.getByTestId("wizard-step3-hotel-judgment-marker");
    await expect(marker).toHaveCount(1);
    await expect(
      page
        .locator(`[data-hotel-index="${meta.hotelIndex}"]`)
        .getByTestId("wizard-step3-hotel-judgment-marker"),
    ).toHaveCount(1);

    const jump = page.getByTestId("wizard-step3-hotel-judgment-jump");
    await jump.scrollIntoViewIfNeeded();
    expect(
      await rectHeight(page, "wizard-step3-hotel-judgment-jump"),
      "jump tap floor",
    ).toBeGreaterThanOrEqual(TAP_FLOOR - TOL);

    await jump.click();
    const scroller = `wizard-step3-card-${meta.dfid}-review-content`;
    await expect
      .poll(() => flashedInView(page, scroller, `[data-warning-index="${meta.guestRow}"]`), {
        message: "the guest split card flashes inside the scroller",
      })
      .toBe(true);
  });

  test("a warning card jumps to Pack list and to its reservation (spec §8.3, §5.5)", async ({
    page,
  }) => {
    await openScenario(page, "jumps", "wizard-step3-hotel-judgment-marker");
    const raw = await page.locator("html").getAttribute("data-warning-card-jumps");
    if (!raw) throw new Error("live entry did not publish data-warning-card-jumps");
    const meta = JSON.parse(raw) as {
      dfid: string;
      guestRow: number;
      archivedRow: number;
      hotelIndex: number;
    };
    const jumpId = (row: number) => `wizard-step3-card-${meta.dfid}-warning-${row}-section-jump`;
    const scrollerId = `wizard-step3-card-${meta.dfid}-review-content`;
    const railItem = (id: string) => `wizard-step3-card-${meta.dfid}-review-rail-item-${id}`;

    // Go to Pack list, from the archived pull sheet card.
    const packJump = page.getByTestId(jumpId(meta.archivedRow));
    await expect(packJump).toHaveAttribute("data-jump", "packlist");
    await expect(packJump).toHaveAccessibleName(/^Go to Pack list for /);
    await packJump.scrollIntoViewIfNeeded();
    expect(
      await rectHeight(page, jumpId(meta.archivedRow)),
      "Pack list jump tap floor",
    ).toBeGreaterThanOrEqual(TAP_FLOOR - TOL);
    await packJump.click();
    // Settled: two consecutive scrollTop reads agree.
    let last = Number.NaN;
    await expect
      .poll(
        async () => {
          const top = await page.evaluate((id) => {
            const el = document.querySelector(`[data-testid="${id}"]`);
            if (!el) throw new Error(`missing ${id}`);
            return el.scrollTop;
          }, scrollerId);
          const settled = top === last;
          last = top;
          return settled;
        },
        { message: "the scroller settles after the Pack list jump" },
      )
      .toBe(true);
    const landing = await page.evaluate(
      ([sid, sectionId]) => {
        const scroller = document.querySelector(`[data-testid="${sid}"]`);
        const section = document.querySelector(`[data-testid="${sectionId}"]`);
        if (!scroller) throw new Error(`missing scroller ${sid}`);
        if (!section) throw new Error(`missing section ${sectionId}`);
        return section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      },
      [scrollerId, `wizard-step3-card-${meta.dfid}-review-section-packlist`],
    );
    expect(
      Math.abs(landing),
      "Pack list's top sits within 8px of the scroller's top",
    ).toBeLessThanOrEqual(8);
    await expect(page.getByTestId(railItem("packlist"))).toHaveAttribute("aria-current", "true");

    // Go to this reservation in Hotels, from the guest split card.
    const hotelJump = page.getByTestId(jumpId(meta.guestRow));
    await expect(hotelJump).toHaveAttribute("data-jump", "reservation");
    await expect(hotelJump).toHaveAccessibleName(/^Go to this reservation in Hotels for /);
    await hotelJump.scrollIntoViewIfNeeded();
    expect(
      await rectHeight(page, jumpId(meta.guestRow)),
      "reservation jump tap floor",
    ).toBeGreaterThanOrEqual(TAP_FLOOR - TOL);
    await hotelJump.click();
    await expect
      .poll(() => flashedInView(page, scrollerId, `[data-hotel-index="${meta.hotelIndex}"]`), {
        message: "the judged reservation flashes inside the scroller",
      })
      .toBe(true);
  });
});
