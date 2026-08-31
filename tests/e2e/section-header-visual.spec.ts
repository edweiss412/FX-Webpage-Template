/**
 * Section-header pixel-baseline gate — spec
 * docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md §3.
 *
 * Committed PNG baselines over the 15-cell section-header matrix. Any future
 * pixel change on these surfaces fails CI until the baselines are deliberately
 * regenerated (spec §3.6). Subsumes BL-HEADER-PROBE-RESIDUAL-VACUITY findings
 * 2–4 by comparing pixels instead of enumerating the ways pixels can go
 * missing: interaction-state shifts (finding 2) are captured directly, SMIL
 * (finding 3) is closed structurally by the zero-SMIL DOM contract below plus
 * the diff catching capture-time displacement, and paint suppression however
 * expressed (finding 4) produces missing pixels under threshold 0.
 *
 * RUNS ONLY inside the pinned Playwright image (visual.config.ts env gate).
 * Baseline production: spec §3.6 — the gate's own failure artifact initially,
 * the regen workflow thereafter. Never capture baselines on a dev host.
 *
 * Serving mechanism mirrors tests/e2e/section-header-layout.layout.spec.ts:
 * the REAL component tree is rendered to static markup by the harness
 * subprocess (Playwright's loader would rewrite its JSX otherwise), the real
 * token CSS is compiled from app/globals.css, and both are served from a
 * local static server. No dev server, no Supabase.
 *
 * BLAST RADIUS, and why it is narrower than it looks. The idle capture is
 * `toHaveScreenshot(..., { fullPage: true })` -- NOT scoped to a cell -- so this
 * gate compares every pixel the served page paints. What keeps unrelated
 * component work out of it is not a selector but the PAGE: this harness builds
 * its own `composite-<width>.html` from the section-header matrix and imports no
 * other product surface, so a diff elsewhere cannot move these bytes.
 *
 * That is a property of the harness, not a guarantee of the gate. Widen this
 * page to render real app chrome -- a modal header cluster, a nav, a status
 * strip -- and every markup change anywhere inside it starts failing here, with
 * a diff image that points at the pixels rather than at the cause. Measured on
 * 2026-08-30: an attention-pill change landed with this gate green, and the
 * reason was exactly this and not a scoped capture.
 */
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Locator, Page } from "@playwright/test";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { ROW_WIDTHS } from "./_sectionHeaderWidths";

const REPO_ROOT = join(__dirname, "..", "..");

/** Deterministic env for the harness subprocess (lib/email/hashForLog.ts throws
 *  at import without a 32+ char pepper; the visual config loads no .env). */
const HARNESS_ENV = {
  ...process.env,
  HASH_FOR_LOG_PEPPER: "fxav-section-header-harness-pepper-32-chars-min",
  JWT_SIGNING_SECRET: "fxav-section-header-harness-jwt-secret-32-min",
};

/** Derived from ROW_WIDTHS, not duplicated (whole-diff R1 f2): a sixth matrix
 *  width automatically enters the capture grid, where its missing baseline
 *  fails the gate by default instead of being silently uncaptured. */
const WIDTHS = Object.keys(ROW_WIDTHS)
  .map(Number)
  .sort((a, b) => a - b);
const THEMES = ["light", "dark"] as const;
const STATE_CELL = "G1-clean";
const LINK_SEL = `[data-cell="${STATE_CELL}"] a[href]`;

let server: Server;
let baseUrl = "";
let cellCount = 0;
let workDir = "";

test.beforeAll(async () => {
  // INSIDE the repo, not os.tmpdir(): the Tailwind CLI resolves the entry's
  // `@import "tailwindcss"` by walking ancestors of the INPUT file for a
  // node_modules dir. From /tmp that depends on a CLI-location fallback which
  // proved environment-sensitive (green on the bare runner and in an
  // emulated local container, red on the native CI container — first gate
  // run of PR #617). From node_modules/.cache the walk-up reaches the repo's
  // own node_modules deterministically, the same mechanism `next build`
  // exercises in-container daily. The dir is inside node_modules so git never
  // sees it; afterAll removes it best-effort.
  const cacheRoot = join(REPO_ROOT, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  workDir = mkdtempSync(join(cacheRoot, "section-header-visual-"));

  const cellsJson = join(workDir, "cells.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_sectionHeaderCellHarness.tsx"), cellsJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000, env: HARNESS_ENV },
  );
  const harness = JSON.parse(readFileSync(cellsJson, "utf8")) as {
    rowWidths: Record<string, number>;
    cells: Record<string, Record<string, string>>;
  };

  // DOM-contract half 1 (harness side): all 15 matrix cells, rendered at the
  // shared widths — the same anti-tautology anchors the layout spec pins.
  cellCount = Object.keys(harness.cells).length;
  expect(cellCount, "harness emitted all 15 matrix cells").toBe(15);
  expect(harness.rowWidths, "harness rendered the shared ROW_WIDTHS").toEqual(ROW_WIDTHS);
  expect(harness.cells[STATE_CELL], "the state-capture cell exists").toBeTruthy();

  const pageOf = (markup: string) =>
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<link rel="stylesheet" href="out.css"></head><body class="bg-bg">${markup}</body></html>`;

  const sources: string[] = [];
  for (const width of WIDTHS) {
    // Composite idle page: the 15 width-wrapped cells stacked, each preceded
    // by a plain-text label so a diff artifact is navigable by eye.
    const composite = Object.entries(harness.cells)
      .map(([cell, perWidth]) => {
        const markup = perWidth[String(width)];
        if (!markup) throw new Error(`harness cell ${cell} missing width ${width}`);
        return `<div style="padding:8px 0 2px;font:11px monospace">${cell} @ ${width}</div>${markup}`;
      })
      .join("\n");
    const compositeFile = join(workDir, `composite-${width}.html`);
    writeFileSync(compositeFile, pageOf(composite));
    sources.push(compositeFile);

    // Single-cell page for the interaction-state captures.
    const stateFile = join(workDir, `state-${width}.html`);
    writeFileSync(stateFile, pageOf(harness.cells[STATE_CELL]![String(width)]!));
    sources.push(stateFile);
  }

  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    `${sources.map((f) => `@source "${f}";`).join("\n")}\n` +
      readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"),
  );
  compileEntryCss({ entryCss: entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url.replace(/^\//, "");
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
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

/** Fresh-navigation setup shared by every capture (spec §3.3 isolation): the
 *  requested theme is REAPPLIED after navigation (pages default to light) and
 *  asserted immediately, so a dark-named baseline can never silently record
 *  light pixels. */
async function openPage(page: Page, file: string, width: number, theme: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${baseUrl}${file}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  const applied = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(applied, "requested theme is applied before capture").toBe(theme);
  // DOM-contract half 2 (page side): zero SMIL elements — the structural
  // closure of residual finding 3. A screenshot alone is temporally escapable
  // (a begin-delayed animation diffs nothing), so the day an SMIL element
  // enters this tree, this fails and forces deliberate handling.
  const smil = await page.evaluate(
    () => document.querySelectorAll("animate, animateTransform, animateMotion, set").length,
  );
  expect(smil, "the tree contains no SMIL animation elements").toBe(0);
}

/** The state-page link plus its pseudo-state oracle (spec §3.3): asserts the
 *  named state ACTUALLY holds (exclusively, where reachable) immediately
 *  before capture — a capture can never record idle pixels under a
 *  state-named baseline. */
async function expectLinkState(link: Locator, sel: string) {
  const holds = await link.evaluate((el, s) => el.matches(s), sel);
  expect(holds, `link matches ${sel} at capture time`).toBe(true);
}

/** Tab until the link holds keyboard focus (pointer parked first by callers).
 *  The single-cell page has one interactive element, but the loop is bounded
 *  rather than assumed. */
async function keyboardFocusLink(page: Page, link: Locator) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    if (await link.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("Tab never reached the corner link");
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`idle composite @ ${width} ${theme}`, async ({ page }) => {
      await openPage(page, `composite-${width}.html`, width, theme);
      const cells = await page.locator("[data-cell]").count();
      expect(cells, "composite page renders all 15 cells").toBe(cellCount);
      // Cell-identity oracle (whole-diff R1 f5, spec §3.2): each cell renders
      // DISTINCT content — 15 differently-keyed copies of one fixture would
      // pass the count alone and the metadata would become the oracle.
      const cellTexts = await page
        .locator("[data-cell]")
        .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
      expect(
        new Set(cellTexts).size,
        "all 15 cells render distinct content (not one fixture 15 times)",
      ).toBe(cellCount);
      expect(
        cellTexts.every((t) => t.length > 0),
        "no cell renders empty",
      ).toBe(true);
      await expect(page).toHaveScreenshot(`idle-${width}-${theme}.png`, { fullPage: true });
    });
  }
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`hover @ ${width} ${theme}`, async ({ page }) => {
      await openPage(page, `state-${width}.html`, width, theme);
      const link = page.locator(LINK_SEL);
      await link.hover();
      await expectLinkState(link, ":hover:not(:focus-visible)");
      await expect(page.locator(`[data-cell="${STATE_CELL}"]`)).toHaveScreenshot(
        `hover-${width}-${theme}.png`,
      );
    });

    test(`focus @ ${width} ${theme}`, async ({ page }) => {
      await openPage(page, `state-${width}.html`, width, theme);
      // Park the pointer away first — the hover-contamination trap the layout
      // spec documents: focusing straight after a hover measures hover+focus.
      await page.mouse.move(2, 2);
      const link = page.locator(LINK_SEL);
      await keyboardFocusLink(page, link);
      await expectLinkState(link, ":focus-visible:not(:hover)");
      await expect(page.locator(`[data-cell="${STATE_CELL}"]`)).toHaveScreenshot(
        `focus-${width}-${theme}.png`,
      );
    });

    test(`active @ ${width} ${theme}`, async ({ page }) => {
      await openPage(page, `state-${width}.html`, width, theme);
      const link = page.locator(LINK_SEL);
      // A real press inherently hovers; this baseline deliberately records the
      // pressed-while-hovered rendering — the only reachable real-press state.
      const box = await link.boundingBox();
      if (!box) throw new Error("corner link has no box");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expectLinkState(link, ":active");
      const focusVisible = await link.evaluate((el) => el.matches(":focus-visible"));
      expect(focusVisible, "pointer press must not read as keyboard focus").toBe(false);
      await expect(page.locator(`[data-cell="${STATE_CELL}"]`)).toHaveScreenshot(
        `active-${width}-${theme}.png`,
      );
      await page.mouse.up();
    });

    test(`hover+focus @ ${width} ${theme}`, async ({ page }) => {
      await openPage(page, `state-${width}.html`, width, theme);
      await page.mouse.move(2, 2);
      const link = page.locator(LINK_SEL);
      await keyboardFocusLink(page, link);
      await link.hover();
      await expectLinkState(link, ":hover:focus-visible");
      await expect(page.locator(`[data-cell="${STATE_CELL}"]`)).toHaveScreenshot(
        `hover-focus-${width}-${theme}.png`,
      );
    });
  }
}
