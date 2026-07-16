/**
 * tests/e2e/developer-toggle-layout.spec.ts (developer-tier Task 18b — spec §13
 * dimensional invariants)
 *
 * Real-browser layout-dimensions assertions for the per-row DeveloperToggleButton
 * (components/admin/settings/DeveloperToggleButton.tsx). jsdom computes NO layout,
 * and this project's Tailwind v4 does NOT default `.flex` to `align-items: stretch`
 * (AGENTS.md / DESIGN §7) — so the §13 invariants (the tap target meets the 44px
 * min AND the AdminRow does not collapse when the toggle is added) must be verified
 * end-to-end in a browser.
 *
 * HARNESS (standalone, no app boot): the toggle lives inside AdministratorsSection's
 * AdminRow, and no route renders it standalone, so per the project's documented
 * standalone real-browser layout harness (memory/reference_standalone_realbrowser_
 * layout_harness) this spec:
 *   1. compiles the REAL token CSS from app/globals.css via the Tailwind CLI (so
 *      `min-h-tap-min` / `min-w-tap-min` resolve `--spacing-tap-min: 44px`, and the
 *      switch track sizing resolves exactly as the build emits);
 *   2. writes a static harness.html transcribing the EXACT class structure of an
 *      AdminRow <li> containing the DeveloperToggleButton (interactive + locked)
 *      alongside a sibling control (Revoke), verbatim from the component;
 *   3. serves it over HTTP (file:// is blocked in Chromium automation) and measures
 *      getBoundingClientRect() on each documented data-testid.
 *
 * §13 invariants asserted:
 *   (a) the `developer-toggle` tap target is >= 44px in BOTH height and width (the
 *       button IS the tap target; the 28px visual track sits inside it).
 *   (b) the AdminRow does not collapse: the row is at least as tall as the toggle
 *       (row.height >= toggle.height), the toggle is fully contained vertically
 *       within the row (no clip/overflow), and two identical rows have EQUAL height
 *       within 0.5px (the toggle addition is deterministic, no per-row collapse).
 *
 * The ONLY hardcoded number is the 44px min (the documented tap floor) + the ±0.5px
 * tolerance; equal-row-height expectations are DERIVED from the measured sibling row.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// Package is CommonJS; Playwright's CJS loader provides __dirname. Do NOT use
// import.meta.url (flips to ESM → `require is not defined`).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_MIN = 44; // --spacing-tap-min: 44px (app/globals.css)
const COLUMN_WIDTH = 480;

// Class strings transcribed VERBATIM from DeveloperToggleButton.tsx.
const TAP_TARGET =
  "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60";
const TRACK_ON =
  "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors duration-fast border-accent-edge bg-accent";
const TRACK_OFF =
  "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors duration-fast border-border-strong bg-surface-sunken";
const THUMB_ON =
  "inline-block h-5 w-5 rounded-full bg-bg shadow-(--shadow-tile) transition-transform duration-fast translate-x-6";
const THUMB_OFF =
  "inline-block h-5 w-5 rounded-full bg-bg shadow-(--shadow-tile) transition-transform duration-fast translate-x-1";

/** Interactive toggle DOM (verbatim from InteractiveDeveloperToggle). */
function interactiveToggle(on: boolean): string {
  const track = on ? TRACK_ON : TRACK_OFF;
  const thumb = on ? THUMB_ON : THUMB_OFF;
  return `
<div class="flex flex-col items-end gap-1">
  <div class="flex items-center gap-2">
    <span class="text-xs font-medium text-text-subtle">Developer</span>
    <form class="shrink-0">
      <input type="hidden" name="email" value="bob@example.com" />
      <input type="hidden" name="is_developer" value="true" />
      <button type="submit" role="switch" aria-checked="${on}" data-testid="developer-toggle" class="${TAP_TARGET}">
        <span aria-hidden="true" class="${track}"><span class="${thumb}"></span></span>
      </button>
    </form>
  </div>
</div>`;
}

/** Locked indicator DOM (verbatim from LockedDeveloperIndicator). */
function lockedToggle(on: boolean): string {
  const track = on ? TRACK_ON : TRACK_OFF;
  const thumb = on ? THUMB_ON : THUMB_OFF;
  return `
<div class="flex flex-col items-end gap-1">
  <div class="flex items-center gap-2">
    <span class="inline-flex items-center gap-1 text-xs font-medium text-text-subtle">
      <svg class="size-3" viewBox="0 0 24 24"></svg>Developer
    </span>
    <button type="button" role="switch" aria-checked="${on}" aria-disabled="true" disabled data-testid="developer-toggle" class="${TAP_TARGET}">
      <span aria-hidden="true" class="${track}"><span class="${thumb}"></span></span>
    </button>
  </div>
</div>`;
}

/** A Revoke sibling control (min-h-tap-min button) — a peer control in the row. */
const REVOKE_SIBLING = `<button type="button" class="inline-flex min-h-tap-min items-center rounded-sm border border-border-strong px-3 text-sm font-medium text-text-strong">Revoke</button>`;

/** An AdminRow <li> transcribed from AdministratorsSection.AdminRow. */
function adminRow(dataRow: string, control: string): string {
  return `
<li data-testid="admin-allowlist-row" data-row="${dataRow}" class="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
  <div class="min-w-0 flex-1">
    <div class="flex flex-wrap items-center gap-2">
      <p class="wrap-break-word text-base font-medium text-text-strong">bob@example.com</p>
    </div>
    <p class="mt-1 text-xs text-text-subtle">Added 1 month ago</p>
  </div>
  ${REVOKE_SIBLING}
  ${control}
</li>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">
  <ul data-testid="admin-active-list" style="width:${COLUMN_WIDTH}px; list-style:none; margin:0; padding:0;" class="divide-y divide-border">
    ${adminRow("a", interactiveToggle(false))}
    ${adminRow("b", interactiveToggle(false))}
    ${adminRow("c", interactiveToggle(false))}
    ${adminRow("locked", lockedToggle(true))}
  </ul>
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "dev-toggle-dim-"));
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

async function rectOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  });
}

test.describe("DeveloperToggleButton layout invariants (spec §13)", () => {
  test.setTimeout(120_000);

  test("(a) every developer-toggle tap target is >= 44px in height AND width", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto(baseUrl);

    for (const dataRow of ["a", "b", "c", "locked"] as const) {
      const sel = `li[data-row="${dataRow}"] [data-testid="developer-toggle"]`;
      await expect(page.locator(sel), `${dataRow} toggle must render`).toBeVisible();
      const box = await rectOf(page, sel);
      expect(
        box.height,
        `${dataRow}: tap target height >= ${TAP_MIN} (got ${box.height})`,
      ).toBeGreaterThanOrEqual(TAP_MIN - TOL);
      expect(
        box.width,
        `${dataRow}: tap target width >= ${TAP_MIN} (got ${box.width})`,
      ).toBeGreaterThanOrEqual(TAP_MIN - TOL);
    }
  });

  test("(b) the AdminRow does not collapse and fully contains the toggle", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto(baseUrl);

    // Measure a MIDDLE row (full py-3 both edges) — the first row carries
    // `first:pt-0` and the last `last:pb-0`, so those are structurally shorter by
    // design and are not the right equal-height comparison.
    const rowB = await rectOf(page, 'li[data-row="b"]');
    const toggleB = await rectOf(page, 'li[data-row="b"] [data-testid="developer-toggle"]');

    // Both laid out (non-zero) so a tautological 0>=0 cannot pass.
    expect(rowB.height, "row B must lay out (>0)").toBeGreaterThan(0);
    expect(toggleB.height, "toggle B must lay out (>0)").toBeGreaterThan(0);

    // Row is at least as tall as the toggle — no collapse below the 44px control.
    expect(
      rowB.height,
      `row B height (${rowB.height}) must be >= toggle height (${toggleB.height}) — no collapse`,
    ).toBeGreaterThanOrEqual(toggleB.height - TOL);

    // Toggle fully contained vertically within the row (not clipped/overflowing).
    expect(toggleB.top, "toggle B top within row B").toBeGreaterThanOrEqual(rowB.top - TOL);
    expect(toggleB.bottom, "toggle B bottom within row B").toBeLessThanOrEqual(rowB.bottom + TOL);

    // Two IDENTICAL middle rows must have equal height (the toggle addition is
    // deterministic — no per-row collapse variance). Expected derived from row B.
    const rowC = await rectOf(page, 'li[data-row="c"]');
    expect(
      Math.abs(rowB.height - rowC.height),
      `identical middle rows must have equal height: B=${rowB.height} C=${rowC.height}`,
    ).toBeLessThanOrEqual(TOL);
  });
});
