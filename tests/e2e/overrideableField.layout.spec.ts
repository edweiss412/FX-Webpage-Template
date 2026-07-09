/**
 * tests/e2e/overrideableField.layout.spec.ts (Task 16, Part A — spec §8.6)
 *
 * REAL-BROWSER dimensional invariant for <OverrideableField> in its ACTIVE
 * override state. jsdom computes NO layout and this project's Tailwind v4 does
 * NOT default `.flex` to `align-items: stretch` (DESIGN.md §7), so the §8.6
 * value-cell / chip-wrap invariant must be measured in a real browser.
 *
 * §8.6 invariant: the value cell (`minmax(0,1fr)` grid track, `min-w-0`) must
 * contain a long override value + the "Overridden" chip + Edit/Revert without
 * overflowing the row — the value WRAPS (min-w-0 + wrap-break-word) and the
 * shrink-0 chip flows BELOW it on narrow widths (flex-wrap), never forcing
 * horizontal scroll.
 *
 * HARNESS (standalone, no app boot — template: step3-review-modal.layout.spec.ts):
 *   1. renders the REAL component to static markup via
 *      tests/e2e/_overrideableFieldHarness.tsx (renderToStaticMarkup, run under
 *      `tsx` in beforeAll because Playwright's JSX transform breaks
 *      react-dom/server);
 *   2. compiles the real token CSS from app/globals.css with the Tailwind CLI
 *      (`@source` prepended so every utility the markup uses generates);
 *   3. serves over node:http and measures getBoundingClientRect().
 *
 * Concrete failure modes: dropping `min-w-0` on the value cell or value span
 * lets the 120-char unbreakable token push the row wider than the grid track
 * (host.scrollWidth > clientWidth) — caught by the no-scroll assertions;
 * dropping `flex-wrap`/`shrink-0` keeps the chip on the value's line and again
 * overflows — caught by the chip-below-value assertion at 375px.
 *
 * All §8.7 transitions are INSTANT (no animation), so reduced-motion emulation
 * is harmless but applied for parity with the modal template.
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer/Supabase):
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/overrideableField.layout.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// CommonJS package — Playwright's CJS loader provides __dirname (mirrors the
// step3-review-modal.layout.spec.ts template; do NOT use import.meta.url here).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;

// Testids emitted by OverrideableField (OverrideableField.tsx:136,105) for the
// show/venue field; the harness host wrapper adds `ovf-host`.
const HOST = '[data-testid="ovf-host"]';
const VALUE = '[data-testid="override-value-show-venue"]';
const CHIP = '[data-testid="override-chip-show-venue"]';

let server: Server;
let baseUrl: string;
let workDir: string;

function pageHtml(cssHref: string, markup: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">${markup}</body></html>`;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "overrideable-field-layout-"));

  // Render the REAL component tree to static markup OUTSIDE Playwright's loader
  // (its JSX transform breaks react-dom/server): `tsx` runs the harness's
  // main-guard, which writes { html }.
  const pagesJson = join(workDir, "page.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_overrideableFieldHarness.tsx"), pagesJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const page = JSON.parse(readFileSync(pagesJson, "utf8")) as { html: string };

  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", page.html));

  // Compile the real token CSS (prepend @source so Tailwind v4 generates every
  // utility the rendered markup uses).
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

async function openHarness(page: Page, viewport: { width: number; height: number }) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(baseUrl + "harness.html");
}

async function rect(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

// §8.6 is verified at BOTH viewports the spec names (375 narrow / 1280 wide).
for (const width of [375, 1280] as const) {
  test(`§8.6 value cell contains the long override value without overflow @ ${width}px`, async ({
    page,
  }) => {
    await openHarness(page, { width, height: 800 });

    // Sanity: the active override renders the value + the "Overridden" chip.
    await expect(page.locator(VALUE)).toBeVisible();
    await expect(page.locator(CHIP)).toBeVisible();

    const host = await rect(page, HOST);
    const value = await rect(page, VALUE);

    // (1) The value span never renders wider than its host value cell — the
    // 120-char unbreakable token wraps inside the min-w-0 track instead of
    // pushing the span past the cell edge.
    expect(
      value.width,
      `value span width ${value.width} ≤ host cell width ${host.width} @ ${width}px`,
    ).toBeLessThanOrEqual(host.width + TOL);

    // (2) The host row does NOT scroll horizontally: a missing min-w-0 /
    // wrap-break-word would make scrollWidth exceed clientWidth.
    const scroll = await page.locator(HOST).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      scroll.scrollWidth,
      `host scrollWidth ${scroll.scrollWidth} ≤ clientWidth ${scroll.clientWidth} @ ${width}px`,
    ).toBeLessThanOrEqual(scroll.clientWidth + TOL);
  });
}

test("§8.6 chip wraps BELOW the value at 375px (flex-wrap + shrink-0)", async ({ page }) => {
  await openHarness(page, { width: 375, height: 800 });

  const value = await rect(page, VALUE);
  const chip = await rect(page, CHIP);

  // Both render with real size (a display:none 0×0 chip would pass the top
  // comparison vacuously).
  expect(value.width, "value span has real size").toBeGreaterThan(0);
  expect(chip.height, "chip has real size").toBeGreaterThan(0);

  // Derived from rendered rects (anti-tautology, no hardcoded px): with the
  // 120-char value filling the narrow track, the shrink-0 chip cannot fit on
  // the value's line, so flex-wrap flows it onto a NEW line entirely BELOW the
  // multi-line value block — its top is at/after the value span's BOTTOM. This
  // is deliberately stronger than `chip.top > value.top`: at a WIDE viewport
  // the value fits one line and the chip sits beside it (baseline-offset by a
  // couple px), which would satisfy a top>top check but NOT this one — so the
  // assertion uniquely proves a real wrap, not a stray baseline nudge.
  expect(
    chip.top,
    `chip top ${chip.top} ≥ value bottom ${value.bottom} (chip wrapped below the value block)`,
  ).toBeGreaterThanOrEqual(value.bottom - TOL);
});
