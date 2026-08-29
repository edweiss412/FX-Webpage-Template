/**
 * TEMPORARY measurement, deleted once its result lands in the spec's §10.
 * Task 0 of docs/superpowers/plans/2026-08-29-attention-auto-open-phone-suppression.md.
 *
 * Answers ONE question at three phone viewports: with the wizard attention menu
 * auto-opened, is any control an operator needs being hit-tested to something
 * INSIDE the panel? Not "does the panel overlap a control" — the panel's own
 * rows are buttons, so that reads positive by construction.
 */
import { expect, test } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");
const HARNESS_DFID = "drive-abc-123";
const PANEL = "[data-step3-review-panel]";
const CHIP = `[data-testid="wizard-step3-card-${HARNESS_DFID}-review-chip"]`;
const MENU = `[data-testid="wizard-step3-card-${HARNESS_DFID}-review-attention-menu"]`;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "p1-wizard-probe-"));
  const pagesJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalHarness.tsx"), pagesJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const pages = JSON.parse(readFileSync(pagesJson, "utf8")) as { dfid: string; normal: string };
  expect(pages.dfid).toBe(HARNESS_DFID);
  writeFileSync(
    join(workDir, "harness.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8"></head><body class="bg-bg">${pages.normal}</body></html>`,
  );
  // The LIVE page is what `?attention=1` drives. Serving the static harness as
  // `/` was this probe's first bug: no React, so no auto-open, and the arrival
  // assertion failed for a harness reason that reads exactly like a product
  // finding. Mirrors wizard-attention-menu.spec.ts's own boot.
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(workDir, "harness.html")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "Step3ReviewModal.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "WizardAttentionMenu.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "showpage", "AttentionMenu.tsx")}";`,
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
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

for (const [w, h] of [
  [375, 667],
  [375, 844],
  [390, 560],
] as const) {
  test(`P-1 measurement @${w}x${h}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${baseUrl}?attention=1`);
    await page.locator(CHIP).waitFor();
    await expect(page.locator(CHIP)).toHaveAttribute("aria-expanded", "true");
    await page.locator(MENU).waitFor({ state: "visible" });
    await page.waitForFunction(
      (sel) => getComputedStyle(document.querySelector(sel)!).scale === "1",
      MENU,
    );

    const report = await page.evaluate(
      ({ clipSel, panelSel, triggerSel, sel }) => {
        const clip = document.querySelector(clipSel)!;
        const panel = document.querySelector(panelSel)!;
        const trigger = document.querySelector(triggerSel);
        const name = (el: Element) =>
          el.getAttribute("data-testid") ?? `<${el.tagName.toLowerCase()}>`;
        const controls = [...clip.querySelectorAll(sel)].filter((el) => {
          if (panel.contains(el)) return false;
          if (el.closest('[data-testid$="-backdrop"]') !== null) return false;
          if (trigger !== null && (el === trigger || trigger.contains(el) || el.contains(trigger)))
            return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const hits: { control: string; interceptedBy: string; at: string; insidePanel: boolean }[] = [];
        for (const c of controls) {
          const r = c.getBoundingClientRect();
          const pts: [string, number, number][] = [
            ["centre", r.left + r.width / 2, r.top + r.height / 2],
            ["tl", r.left + r.width / 4, r.top + r.height / 4],
            ["tr", r.left + (3 * r.width) / 4, r.top + r.height / 4],
            ["bl", r.left + r.width / 4, r.top + (3 * r.height) / 4],
            ["br", r.left + (3 * r.width) / 4, r.top + (3 * r.height) / 4],
          ];
          for (const [at, x, y] of pts) {
            const hit = document.elementFromPoint(x, y);
            if (hit !== null && hit !== c && !c.contains(hit)) {
              hits.push({ control: name(c), interceptedBy: name(hit), at, insidePanel: panel.contains(hit) });
            }
          }
        }
        return { controlCount: controls.length, controls: controls.map(name), hits };
      },
      { clipSel: PANEL, panelSel: MENU, triggerSel: CHIP, sel: INTERACTIVE },
    );

    const byPanel = report.hits.filter((i) => i.insidePanel);
    console.log(
      `P1RESULT ${w}x${h} ` +
        JSON.stringify({ controlCount: report.controlCount, controls: report.controls, byPanel }),
    );
    expect(report.controlCount).toBeGreaterThan(0);
  });
}
