/**
 * tests/e2e/observability-layout.spec.ts — real-browser dimensional-invariant +
 * tap-target gate for the observability timeline (spec §8 + G7).
 *
 * WHY A REAL BROWSER (jsdom is insufficient): this project's Tailwind v4 does NOT
 * default `.flex` to `align-items: stretch` (AGENTS.md / DESIGN §7). The
 * equal-height cron-card grid (`auto-rows-fr`) and the EventRow no-overflow
 * geometry only surface in a real layout engine; this suite reads
 * getBoundingClientRect() against the live render.
 *
 * HARNESS: `/admin/dev/observability-dim` (app/admin/dev/observability-dim/page.tsx)
 * mounts the real observability components with deterministic props — 9 cron-health
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

const HARNESS_PATH = "/admin/dev/observability-dim";

test.describe("observability layout + tap targets (§8/G7)", () => {
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
});
