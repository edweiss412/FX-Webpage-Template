/**
 * tests/e2e/telemetry-layout.spec.ts — real-browser dimensional-invariant +
 * tap-target gate for the telemetry timeline (spec §8 + G7).
 *
 * WHY A REAL BROWSER (jsdom is insufficient): this project's Tailwind v4 does NOT
 * default `.flex` to `align-items: stretch` (AGENTS.md / DESIGN §7). The
 * equal-height cron-card grid (`auto-rows-fr`) and the EventRow no-overflow
 * geometry only surface in a real layout engine; this suite reads
 * getBoundingClientRect() against the live render.
 *
 * HARNESS: `/admin/dev/telemetry-dim` (app/admin/dev/telemetry-dim/page.tsx)
 * mounts the real telemetry components with deterministic props — 9 cron-health
 * cards, a CRON_RUN_SUMMARY row, a row carrying a requestId + showSlug, and
 * hasMore=true — so every measured control (incl. the request chip + Load-older)
 * is present without any DB seed. It is build-gated like source-link-dim.
 *
 * Runs in the `desktop-chromium` project (port-3000 webServer started with
 * ADMIN_DEV_PANEL_ENABLED=true + ENABLE_TEST_AUTH + TEST_AUTH_SECRET), mirroring
 * source-link-dimensional.spec.ts. The /admin/* layout gate 307s unauthenticated
 * visitors to sign-in, so the spec signs in as ADMIN_FIXTURE first.
 *
 * The test sets a MOBILE viewport (390×844) for the 44px tap-target checks (G7).
 * The only hardcoded number is the ±0.5px tolerance; expected heights are derived
 * from the measured rects.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

const HARNESS_PATH = "/admin/dev/telemetry-dim";

test.describe("telemetry layout + tap targets (§8/G7)", () => {
  // Cold first-hit render compiles a small module graph; budget for it.
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("cron cards equal height; rows do not overflow; tap targets >= 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // mobile viewport for tap-target checks
    const res = await page.goto(HARNESS_PATH, { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBe(true);
    const cards = page.locator("[data-testid=cron-health-card]");
    const boxes = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    // group by row (same top within 1px), assert equal height per row
    const rows = new Map<number, number[]>();
    for (const b of boxes) {
      const key = [...rows.keys()].find((k) => Math.abs(k - b.top) < 1) ?? b.top;
      rows.set(key, [...(rows.get(key) ?? []), b.height]);
    }
    for (const heights of rows.values()) {
      const max = Math.max(...heights),
        min = Math.min(...heights);
      expect(max - min).toBeLessThanOrEqual(0.5);
    }

    const row = page.locator("li:has([data-testid^=event-level-])").first();
    const geom = await row.evaluate((li) => {
      // The flex row holds EVERY sibling: badge + content column + timestamp + request chip + gaps.
      const flex = (li.querySelector("[data-testid^=event-level-]") as HTMLElement)
        .parentElement as HTMLElement;
      const fstyle = getComputedStyle(flex);
      const flexInnerRight = flex.getBoundingClientRect().right - parseFloat(fstyle.paddingRight);
      const children = Array.from(flex.children) as HTMLElement[];
      const childOverflows = children
        .map((c) => c.getBoundingClientRect().right - flexInnerRight)
        .filter((d) => d > 0.5).length;
      const content = children.find((c) => c.className.includes("flex-1")) as HTMLElement;
      return {
        rowScroll: flex.scrollWidth,
        rowClient: flex.clientWidth,
        childOverflows,
        contentScroll: content.scrollWidth,
        contentClient: content.clientWidth,
      };
    });
    // (2a) the whole flex row — every child + every gap — does not overflow horizontally
    expect(geom.rowScroll).toBeLessThanOrEqual(geom.rowClient + 0.5);
    // (2b) no direct flex child (badge / content / timestamp / request chip) extends past the row's padding box
    expect(geom.childOverflows).toBe(0);
    // (2c) the content column truncates rather than overflowing
    expect(geom.contentScroll).toBeLessThanOrEqual(geom.contentClient + 0.5);

    // (4) 44px mobile tap targets (spec G7). The fixture renders with hasMore=true AND
    // at least one event with a requestId, so EVERY listed control — incl. load-older +
    // the request chip — is present and measured. No skip-if-absent: all are REQUIRED.
    // Deterministic testids (no aria-pressed selector, which would also match the
    // auto-refresh toggle).
    const TAP_SELECTORS = [
      "[data-testid=autorefresh-toggle]",
      "[data-testid=autorefresh-manual]",
      "[data-testid^=event-row-toggle-]",
      "[data-testid=filter-level-error]", // a level filter toggle (NOT the autorefresh toggle)
      "[data-testid=filter-since]", // the time-window select
      "[data-testid=filter-source]", // a filter text input
      "[data-testid^=event-row-request-]", // a request chip (fixture includes an event with requestId)
      "[data-testid=event-timeline-load-older]", // REQUIRED — fixture seeds hasMore=true
    ];
    for (const sel of TAP_SELECTORS) {
      const loc = page.locator(sel).first();
      await expect(loc, `${sel} must be present`).toBeVisible();
      const h = await loc.evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${sel} tap target`).toBeGreaterThanOrEqual(44 - 0.5);
    }
  });

  test("console strip: equal-height stat cards, 340px sidebar, no overflow, bottom-aligned sparkline (§8)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); // ≥1200 → two-column console
    const res = await page.goto(HARNESS_PATH, { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBe(true);

    // (1) the 4 overview stat cards are equal height in their row.
    const statBoxes = await page
      .locator(
        "[data-testid=stat-system-health],[data-testid=stat-open-alerts],[data-testid=stat-cron],[data-testid=stat-events]",
      )
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(statBoxes.length).toBe(4);
    const rowCards = statBoxes.filter((b) => Math.abs(b.top - statBoxes[0]!.top) < 1);
    if (rowCards.length > 1) {
      const heights = rowCards.map((b) => b.height);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5);
    }

    // (2) sidebar is exactly 340px wide at ≥1200, and the body has no horizontal overflow.
    const sidebarW = await page
      .locator("[data-testid=telemetry-sidebar]")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.abs(sidebarW - 340)).toBeLessThanOrEqual(0.5);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0.5);

    // (3) sparkline bars each measure within [3,22]px and share a common baseline (bottom-aligned).
    const bars = await page
      .locator("[data-testid=event-sparkline] [data-bar]")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(bars.length).toBeGreaterThan(0);
    const bottoms = bars.map((b) => b.bottom);
    for (const b of bars) {
      expect(b.height).toBeGreaterThanOrEqual(3 - 0.5);
      expect(b.height).toBeLessThanOrEqual(22 + 0.5);
    }
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(0.5);

    // (4) the auto-refresh switch thumb stays within its track in BOTH on and off states.
    const toggle = page.locator("[data-testid=autorefresh-toggle]");
    for (let i = 0; i < 2; i++) {
      const within = await toggle.evaluate((btn) => {
        const track = btn.querySelector("span") as HTMLElement;
        const thumb = track.querySelector("span") as HTMLElement;
        const t = track.getBoundingClientRect();
        const h = thumb.getBoundingClientRect();
        return h.left >= t.left - 0.5 && h.right <= t.right + 0.5 && h.top >= t.top - 0.5 && h.bottom <= t.bottom + 0.5;
      });
      expect(within, `switch thumb within track (state ${i})`).toBe(true);
      await toggle.click(); // flip on↔off
    }
  });

  test("console body stacks single-column below xl (sidebar under the log)", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 }); // < xl (1280) → single column
    const res = await page.goto(HARNESS_PATH, { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBe(true);
    const logTop = await page
      .locator("[data-testid=telemetry-console-grid] [data-testid=event-log]")
      .evaluate((el) => el.getBoundingClientRect().top);
    const sidebarTop = await page
      .locator("[data-testid=telemetry-sidebar]")
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(sidebarTop).toBeGreaterThan(logTop);
  });
});
