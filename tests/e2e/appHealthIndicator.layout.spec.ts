/**
 * tests/e2e/appHealthIndicator.layout.spec.ts (alert-audience-split Task 5 —
 * spec §8 dimensional invariants, folded fail-first layout gate).
 *
 * The admin nav is a fixed-height bar; every child in the action cluster must
 * center in it. jsdom computes NO layout and this project's Tailwind v4 does
 * NOT default `.flex` to `align-items: stretch` (AGENTS.md / DESIGN §7), so the
 * §8 invariants (the indicator is a 44×44 tap target, equal in height to and
 * co-centered with `NotifBell`) must be verified end-to-end in a real browser.
 *
 * HARNESS (standalone, no app boot) per the project's documented real-browser
 * layout harness (memory/reference_standalone_realbrowser_layout_harness):
 *   1. FIDELITY: read the REAL component sources and assert the transcribed
 *      class strings actually appear in them (this is also the fail-first hook —
 *      before AppHealthIndicator.tsx exists, readFileSync throws → spec fails);
 *   2. compile the REAL token CSS from app/globals.css via the Tailwind CLI so
 *      `min-h-tap-min`/`min-w-tap-min` resolve `--spacing-tap-min: 44px`;
 *   3. write a static harness.html mounting AppHealthIndicator BESIDE NotifBell
 *      inside a fixed-height nav action cluster, verbatim from the components;
 *   4. serve over HTTP and measure getBoundingClientRect() on each data-testid.
 *
 * §8 invariants asserted:
 *   (a) both [data-testid=app-health-indicator] and [data-testid=admin-notif-bell]
 *       are >= 44px tall;
 *   (b) their heights are EQUAL within 0.5px;
 *   (c) both are vertically centered within the nav bar within 0.5px (their
 *       vertical centers coincide with each other and with the bar center).
 *
 * Runs standalone via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_MIN = 44; // --spacing-tap-min: 44px (app/globals.css)
const BAR_HEIGHT = 56;

// Tap-target class shared by NotifBell and the Doug button / dev link variant of
// AppHealthIndicator — the dimensional parity is the whole point of §8.
const TAP_TARGET =
  "relative inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm text-text-subtle hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const INNER_CLUSTER = "inline-flex items-center gap-2"; // indicator button → dot + icon

// A size-5 icon placeholder (Bell / Activity both render size-5 svgs).
const ICON = `<svg class="size-5" viewBox="0 0 24 24" aria-hidden="true"></svg>`;

function notifBell(): string {
  return `<a href="/admin#alerts" data-testid="admin-notif-bell" aria-label="No unresolved alerts" class="${TAP_TARGET}">${ICON}</a>`;
}

function appHealthIndicator(): string {
  return `<button type="button" data-testid="app-health-indicator" aria-label="System health: needs attention" class="${TAP_TARGET}"><span class="${INNER_CLUSTER}"><span data-testid="app-health-dot-degraded" aria-hidden="true" class="relative inline-block size-2 rounded-full bg-status-degraded"></span>${ICON}</span></button>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">
  <nav data-testid="nav-bar" style="height:${BAR_HEIGHT}px; padding:0 16px;" class="flex items-center justify-end gap-2 bg-surface">
    ${appHealthIndicator()}
    ${notifBell()}
  </nav>
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  // FIDELITY + fail-first: the transcribed classes must exist in the REAL
  // components (readFileSync throws if the component is absent).
  const indicatorSrc = readFileSync(
    join(REPO_ROOT, "components/admin/nav/AppHealthIndicator.tsx"),
    "utf8",
  );
  const notifBellSrc = readFileSync(join(REPO_ROOT, "components/admin/nav/NotifBell.tsx"), "utf8");
  expect(notifBellSrc, "NotifBell tap-target class drifted").toContain(TAP_TARGET);
  expect(indicatorSrc, "indicator tap-target class must match NotifBell").toContain(TAP_TARGET);
  expect(indicatorSrc, "indicator inner cluster class (§8)").toContain(INNER_CLUSTER);

  workDir = mkdtempSync(join(tmpdir(), "app-health-dim-"));
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
    return { top: r.top, bottom: r.bottom, height: r.height };
  });
}

test.describe("AppHealthIndicator nav layout invariants (spec §8)", () => {
  test.setTimeout(120_000);

  test("(a,b,c) indicator matches NotifBell height and both center in the nav bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await page.goto(baseUrl);

    await expect(page.locator('[data-testid="app-health-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-notif-bell"]')).toBeVisible();

    const indicator = await rectOf(page, '[data-testid="app-health-indicator"]');
    const bell = await rectOf(page, '[data-testid="admin-notif-bell"]');
    const bar = await rectOf(page, '[data-testid="nav-bar"]');

    // (a) both >= 44px tall.
    expect(indicator.height, `indicator height >= ${TAP_MIN}`).toBeGreaterThanOrEqual(
      TAP_MIN - TOL,
    );
    expect(bell.height, `bell height >= ${TAP_MIN}`).toBeGreaterThanOrEqual(TAP_MIN - TOL);

    // (b) equal heights within 0.5px.
    expect(Math.abs(indicator.height - bell.height)).toBeLessThanOrEqual(TOL);

    // (c) vertically co-centered with each other AND with the bar center.
    const indicatorCenter = indicator.top + indicator.height / 2;
    const bellCenter = bell.top + bell.height / 2;
    const barCenter = bar.top + bar.height / 2;
    expect(Math.abs(indicatorCenter - bellCenter)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(indicatorCenter - barCenter)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(bellCenter - barCenter)).toBeLessThanOrEqual(TOL);
  });
});
