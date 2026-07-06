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
  return `<a href="/admin#alerts" data-testid="admin-notif-bell" aria-label="Notifications" class="${TAP_TARGET}">${ICON}</a>`;
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

// ── Full-topbar overflow harness (Codex R1) ────────────────────────────
// The real risk of adding a FOURTH 44px action control is horizontal overflow
// of the WHOLE mobile topbar, not the indicator in isolation. This harness
// mirrors AdminNav's real topbar verbatim — brand (icon + FXAV wordmark +
// collapsible "Admin" pill) + flex-1 spacer + the four-control action cluster
// (health, bell, theme, user) — inside the layout's 16px page padding, so we can
// assert the bar never exceeds the viewport at the narrowest supported width.
const PAGE_PAD_MOBILE = 16; // --spacing-page-pad-mobile: 16px (app/globals.css)
// Brand progressive-collapse classes — MUST match AdminNav.tsx (Codex R1). The
// FXAV wordmark returns at >=360px, the decorative "Admin" pill at >=440px.
const BRAND_WORDMARK_CLASS =
  "hidden text-lg font-semibold tracking-tight text-text-strong min-[360px]:inline";
const ADMIN_PILL_CLASS =
  "hidden rounded-pill border border-border bg-surface-raised px-2 text-xs font-semibold text-text-subtle min-[440px]:inline-block";
// ThemeToggle + UserMenu render as 44px icon/avatar buttons on mobile (email
// lives only in the UserMenu popover) — transcribed from their real class lists.
const THEME_TOGGLE = `<button type="button" data-testid="theme-toggle" class="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface text-text-subtle">${ICON}</button>`;
const USER_MENU = `<div class="relative"><button type="button" data-testid="user-menu" class="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-pill border border-border bg-surface text-sm font-semibold text-text-subtle"><span aria-hidden="true">EW</span></button></div>`;

function fullTopbarHtml(cssHref: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">
  <div style="padding:0 ${PAGE_PAD_MOBILE}px;">
    <nav data-testid="admin-nav-topbar" class="mb-4 flex items-center gap-3 border-b border-border pb-3">
      <a href="/admin" data-testid="admin-nav-brand" class="flex items-center gap-2 rounded-sm">
        <span class="size-7 shrink-0 inline-block" style="width:28px;height:28px;"></span>
        <span class="${BRAND_WORDMARK_CLASS}">FXAV</span>
        <span class="${ADMIN_PILL_CLASS}">Admin</span>
      </a>
      <div class="flex-1"></div>
      <div class="flex items-center gap-2">
        ${appHealthIndicator()}
        ${notifBell()}
        ${THEME_TOGGLE}
        ${USER_MENU}
      </div>
    </nav>
  </div>
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
  const adminNavSrc = readFileSync(join(REPO_ROOT, "components/admin/nav/AdminNav.tsx"), "utf8");
  expect(notifBellSrc, "NotifBell tap-target class drifted").toContain(TAP_TARGET);
  expect(indicatorSrc, "indicator tap-target class must match NotifBell").toContain(TAP_TARGET);
  expect(indicatorSrc, "indicator inner cluster class (§8)").toContain(INNER_CLUSTER);
  // FIDELITY (Codex R1): the brand's progressive narrow-viewport collapse is what
  // keeps the four-control topbar within the viewport — the harness must render
  // the SAME class lists AdminNav ships, so drift fails the overflow test's premise.
  expect(adminNavSrc, "brand wordmark narrow-collapse class drifted from AdminNav").toContain(
    BRAND_WORDMARK_CLASS,
  );
  expect(adminNavSrc, "Admin pill narrow-collapse class drifted from AdminNav").toContain(
    ADMIN_PILL_CLASS,
  );

  workDir = mkdtempSync(join(tmpdir(), "app-health-dim-"));
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));
  writeFileSync(join(workDir, "fulltopbar.html"), fullTopbarHtml("out.css"));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(workDir, "harness.html")}";\n@source "${join(workDir, "fulltopbar.html")}";\n${globals}`,
  );

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

test.describe("Admin topbar mobile overflow with the health indicator (Codex R1)", () => {
  test.setTimeout(120_000);

  async function navScroll(page: Page) {
    return page.locator('[data-testid="admin-nav-topbar"]').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
  }

  // The four action controls are ALWAYS present (each at the 44px a11y floor);
  // the topbar must never horizontally scroll them, at any supported width.
  async function assertNoOverflow(page: Page) {
    await expect(page.locator('[data-testid="app-health-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-notif-bell"]')).toBeVisible();
    await expect(page.locator('[data-testid="theme-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    const { scrollWidth, clientWidth } = await navScroll(page);
    expect(
      scrollWidth,
      `topbar scrollWidth(${scrollWidth}) <= clientWidth(${clientWidth})`,
    ).toBeLessThanOrEqual(clientWidth + TOL);
  }

  const wordmark = () => `[data-testid="admin-nav-brand"] >> text=FXAV`;
  const pill = () => `[data-testid="admin-nav-brand"] >> text=Admin`;

  test("(320px) icon-only brand; four controls fit with no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`${baseUrl}fulltopbar.html`);
    // Below 360px BOTH the wordmark and the pill collapse; only the icon anchors.
    await expect(page.locator(wordmark())).toBeHidden();
    await expect(page.locator(pill())).toBeHidden();
    await assertNoOverflow(page);
  });

  test("(390px) wordmark returns, pill stays collapsed, still fits", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto(`${baseUrl}fulltopbar.html`);
    await expect(page.locator(wordmark())).toBeVisible();
    await expect(page.locator(pill())).toBeHidden();
    await assertNoOverflow(page);
  });

  test("(480px) wordmark and pill both present, still fits", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 640 });
    await page.goto(`${baseUrl}fulltopbar.html`);
    await expect(page.locator(wordmark())).toBeVisible();
    await expect(page.locator(pill())).toBeVisible();
    await assertNoOverflow(page);
  });
});
