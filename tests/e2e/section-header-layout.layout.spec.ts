/**
 * Section-header layout probe — real browser, no dev server, no database.
 *
 * Runs under tests/e2e/standalone.config.ts, whose `testMatch` is an explicit
 * allow-list: this file's name must appear there or it runs nowhere and silently
 * proves nothing.
 *
 * Contains so far:
 *   - T4 `hairline floor @ 240px row`: the decorative rule in the event-detail
 *     group row. Spec §3.2 chose a floor rather than a breakpoint because the rule
 *     never collapses in the supported range — measured 22.94px at the narrowest
 *     real row (240px), reaching 0 only at rows <=215px. `width > 0` and "the label
 *     does not wrap" therefore BOTH pass on the no-floor tree, so the assertion
 *     that makes this task red is the resolved `min-width`.
 *
 * The 15 matrix cases and the transition audit land in T2.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REPO_ROOT = join(__dirname, "..", "..");

/** Deterministic env for the harness subprocess: `lib/email/hashForLog.ts` throws at
 *  import without a 32+ char pepper, and the standalone config does not load
 *  `.env.local`, so these are supplied rather than assumed present. */
const HARNESS_ENV = {
  ...process.env,
  HASH_FOR_LOG_PEPPER: "fxav-section-header-harness-pepper-32-chars-min",
  JWT_SIGNING_SECRET: "fxav-section-header-harness-jwt-secret-32-min",
};

/** The floor T4 applies, asserted as a resolved pixel value. `min-w-4` is 16px on
 *  the project's 4px spacing scale — NOT `min-w-6` (24px), which exceeds the 22.94px
 *  the rule actually gets at a 240px row and would bind, wrapping the label. */
const EXPECTED_MIN_WIDTH_PX = 16;

let server: Server;
let baseUrl = "";
let workDir = "";

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "section-header-layout-"));

  // Render the REAL component tree to static markup OUTSIDE Playwright's loader.
  const cellsJson = join(workDir, "cells.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_sectionHeaderCellHarness.tsx"), cellsJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000, env: HARNESS_ENV },
  );
  const cells = JSON.parse(readFileSync(cellsJson, "utf8")) as {
    dfid: string;
    narrowestRowPx: number;
    hairline: string;
  };
  expect(cells.hairline, "harness emitted the hairline fixture").toBeTruthy();

  writeFileSync(
    join(workDir, "hairline.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<link rel="stylesheet" href="out.css"></head><body class="bg-bg">${cells.hairline}</body></html>`,
  );

  // Compile the real token CSS so computed styles are the product's, not defaults.
  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    `@source "${join(workDir, "hairline.html")}";\n` +
      readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"),
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "hairline.html" : url.replace(/^\//, "");
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

async function openHairline(page: Page) {
  // Reduced motion so entrance animation cannot perturb geometry. T2's transition
  // cases deliberately run with NORMAL motion, in their own group.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(`${baseUrl}hairline.html`, { waitUntil: "load" });
}

test("hairline floor @ 240px row", async ({ page }) => {
  await openHairline(page);

  const measured = await page.evaluate(() => {
    // Structural selection, deliberately: no production `data-testid` is added
    // ahead of this test. The rule is the `h-px` span that is the next element
    // sibling of the eyebrow label carrying the group title.
    const label = Array.from(document.querySelectorAll("span")).find((el) =>
      (el.textContent ?? "").trim().startsWith("Wardrobe"),
    );
    if (!label) return { error: "group title label not found" };
    const rule = label.nextElementSibling;
    if (!(rule instanceof HTMLElement)) return { error: "rule sibling not found" };

    const cs = getComputedStyle(rule);
    const labelCs = getComputedStyle(label);
    const lineHeight = parseFloat(labelCs.lineHeight);

    return {
      error: null,
      ruleWidth: Math.round(rule.getBoundingClientRect().width * 100) / 100,
      // A string like "16px" — parsed, never compared as text.
      minWidthPx: parseFloat(cs.minWidth),
      labelHeight: Math.round(label.getBoundingClientRect().height * 100) / 100,
      labelLineHeight: Number.isFinite(lineHeight) ? lineHeight : 0,
    };
  });

  expect(measured.error, "fixture shape").toBeNull();
  if (measured.error !== null) return;

  // (a) The rule is DRAWN. A permanently hidden rule would satisfy the phantom-gap
  //     probes while violating the intent, so this stays asserted.
  expect(measured.ruleWidth, "decorative rule is drawn at the narrowest real row").toBeGreaterThan(
    0,
  );

  // (b) THE RED ASSERTION. `width > 0` alone passes on today's no-floor tree
  //     (22.94px), so without this the task could not go red at all.
  expect(measured.minWidthPx, "resolved min-width is exactly min-w-4 (16px)").toBeCloseTo(
    EXPECTED_MIN_WIDTH_PX,
    1,
  );

  // (c) The label does NOT wrap — the property that rules `min-w-6` out, since 24px
  //     exceeds the width actually available and would push the label to two lines.
  //     Derived from the label's own line-height, never a hardcoded height.
  expect(
    measured.labelHeight,
    `group title stays on one line (h=${measured.labelHeight}, lh=${measured.labelLineHeight})`,
  ).toBeLessThan(measured.labelLineHeight * 1.5);
});
