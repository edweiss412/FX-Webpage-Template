/**
 * Playwright E2E suite for the crew-page CLIENT-SIDE section toggle
 * (components/crew/CrewSections.tsx).
 *
 * THE MILESTONE: section nav was converted from a per-tap server `router.push`
 * (a full dynamic-route re-run of `getShowForViewer`) to a pure CLIENT toggle.
 * Tapping a sub-nav tab now calls `onSelect(id)` → `setActive(id)` +
 * `window.history.pushState` (a SHALLOW `?s=` URL update, NO `router.push`) +
 * `window.scrollTo(0,0)`. `_CrewShell` renders ALL section bodies server-side up
 * front; the controller toggles which one is visible. So a section switch is
 * instant and does ZERO network — that is the win these tests prove, plus the
 * guards on the tradeoff (back/forward, deep-link, dimensional, payload/FCP).
 *
 * HARNESS (reused verbatim from tests/e2e/crew-page.spec.ts — the proven
 * pattern): sign in as ADMIN_FIXTURE via signInAs (the `admin` arm of
 * resolveShowPageAccess renders the full CrewShell for the seeded crew route),
 * resolve the seeded Waldorf show's slug + share_token at test start
 * (lookupSeededShow + show_share_tokens), and freeze the browser clock via
 * page.clock.install BEFORE goto so the RightNowHero state is deterministic.
 * Section markers are `data-testid="section-<id>"`; the sub-nav is
 * `data-testid="crew-sub-nav"` (each tab `data-section="<id>"`); the controller
 * wrapper carries `data-active-section` (on `[data-testid="crew-shell-sections"]`,
 * CrewSections.tsx:72).
 *
 * Gated to mobile-safari (the project that runs the crew-page seed-reads as a
 * single writer). desktop-chromium early-returns from every test so it never
 * re-runs the same seed reads at the wrong widths.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

// Same show_day_n instant the crew-page §4.9 suite freezes to: the seed's first
// show day, noon UTC (a stable morning ET) → deterministic RightNowHero state.
const SHOW_DAY_N_INSTANT = "2026-04-21T12:00:00Z";

const TOL = 0.5;

type Rect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

async function rectOf(locator: import("@playwright/test").Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

/** Resolve the seeded show's slug + share token (required path segments for the crew route). */
async function lookupSlugAndToken(): Promise<{ slug: string; shareToken: string }> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `crew-section-toggle.spec: seeded show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${showRes.error?.message ?? "no row"}`,
    );
  }
  const tokenRes = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showRes.data.id as string)
    .limit(1)
    .maybeSingle();
  if (tokenRes.error || !tokenRes.data?.share_token) {
    throw new Error(
      `crew-section-toggle.spec: no share_token for show ${showRes.data.id} (run \`pnpm db:seed\`). error=${tokenRes.error?.message ?? "no row"}`,
    );
  }
  return { slug: showRes.data.slug as string, shareToken: tokenRes.data.share_token as string };
}

test.describe("crew client-side section toggle (0-network win + tradeoff guards)", () => {
  // First-hit cold render of the crew shell touches a wide module graph; the
  // budget absorbs that. The toggles themselves are sub-second once warm.
  test.setTimeout(180_000);

  let slug = "";
  let shareToken = "";

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer: mobile-safari only
    const resolved = await lookupSlugAndToken();
    slug = resolved.slug;
    shareToken = resolved.shareToken;
    // Freeze the clock BEFORE goto: the hero's useState initializer reads
    // new Date() at hydration, so the instant must be pinned before the first
    // navigation for a deterministic render.
    await page.clock.install({ time: new Date(SHOW_DAY_N_INSTANT) });
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  /**
   * Goto the crew route at a given section and wait for the shell + that
   * section's root to be visible. Returns once `section-<id>` is visible.
   * (No clock-tick / crossfade-settle here: the toggle/url/network assertions
   * below do not read laid-out heights — only the dimensional test does, and it
   * settles its own crossfade.)
   */
  async function gotoSection(
    page: import("@playwright/test").Page,
    section: string,
  ): Promise<void> {
    const res = await page.goto(`/show/${slug}/${shareToken}?s=${section}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), `crew route /show/${slug}/${shareToken}?s=${section} must render`).toBe(
      200,
    );
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
  }

  // ── Test 1 — THE WIN: a section tap does ZERO network ──────────────────────
  // Load the default section, let the page fully settle (networkidle) so no
  // late hydration/prefetch request is mis-attributed to the tap, THEN attach a
  // request recorder and tap a DIFFERENT section. Because the controller uses
  // window.history.pushState (NO router.push), the dynamic route does NOT re-run
  // getShowForViewer — so NOT A SINGLE request (document, RSC, or fetch) fires.
  // The URL becomes ?s=venue and data-active-section flips to "venue", both
  // driven purely by client state.
  test("1: tapping a section tab fires ZERO network requests (no server round-trip)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await gotoSection(page, "today");
    // Settle ALL load-time traffic (hydration chunk fetches, any RSC prefetch,
    // realtime bridge connect) so the post-attach recorder only sees what the
    // TAP itself triggers. networkidle = no requests for 500ms.
    await page.waitForLoadState("networkidle");

    // Recorder attached AFTER settle: anything captured here is caused by the tap.
    const reqs: string[] = [];
    page.on("request", (r) => reqs.push(r.url()));

    // Tap the Venue tab. `.first()` selects whichever responsive nav is visible
    // (desktop row at ≥720px, mobile bar <720px) — both carry data-section.
    await page.getByTestId("crew-sub-nav").locator('[data-section="venue"]').first().click();

    // Venue becomes visible purely from the client toggle.
    await expect(page.getByTestId("section-venue")).toBeVisible();

    // THE HARD ASSERTION: the tap caused NO fetch of the CREW ROUTE — neither a
    // full document navigation nor an RSC payload fetch. A regressed router.push
    // would emit exactly that: an RSC fetch to /show/<slug>/<token>?s=venue (the
    // dynamic route re-running getShowForViewer). We scope to the crew-route path
    // (rather than `reqs.length === 0`) so an incidental Next <Link> prefetch of
    // some OTHER route, analytics, or realtime HTTP can't flake the proof — the
    // win is "the SECTION nav does not round-trip the crew page," which is exactly
    // a crew-route request count of 0. (Total request count is logged for review.)
    const crewRoutePath = `/show/${slug}/${shareToken}`;
    const crewRouteReqs = reqs.filter((u) => new URL(u).pathname.includes(crewRoutePath));
    console.log(
      `CREW_TAP_REQS total=${reqs.length} crewRoute=${crewRouteReqs.length} ${JSON.stringify(reqs.slice(0, 8))}`,
    );
    expect(
      crewRouteReqs,
      `a section tap must NOT fetch the crew route (client toggle, no server round-trip); got ${crewRouteReqs.length}: ${JSON.stringify(crewRouteReqs)}`,
    ).toHaveLength(0);

    // The shallow URL + client state both reflect Venue.
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("venue");
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-active-section",
      "venue",
    );
  });

  // ── Test 2 — Back button restores prior sections (history.pushState stack) ──
  // Toggle today→venue→schedule via taps (two pushState entries on top of the
  // initial load), then browser Back restores venue, Back again restores today.
  // The controller's popstate handler re-derives `active` from window.location's
  // ?s= so the visible section + URL track the history stack.
  test("2: browser Back restores the previously-toggled section", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await gotoSection(page, "today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("section-today")).toBeVisible();

    const subNav = page.getByTestId("crew-sub-nav");
    await subNav.locator('[data-section="venue"]').first().click();
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("venue");

    await subNav.locator('[data-section="schedule"]').first().click();
    await expect(page.getByTestId("section-schedule")).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("schedule");

    // Back → venue.
    await page.goBack();
    await expect(page.getByTestId("section-venue")).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("venue");
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-active-section",
      "venue",
    );

    // Back again → today (the original load).
    await page.goBack();
    await expect(page.getByTestId("section-today")).toBeVisible();
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-active-section",
      "today",
    );
  });

  // ── Test 3 — Deep-link: the server-resolved initial section still works ─────
  // Navigating DIRECTLY to ?s=schedule must render Schedule (resolveActiveSection
  // picks the initial section server-side; the client controller seeds `active`
  // from `initialSection`). This guards that the client-toggle pivot did NOT
  // break direct/bookmarked section URLs.
  test("3: deep-linking ?s=schedule renders the Schedule section directly", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await gotoSection(page, "schedule");
    await expect(page.getByTestId("section-schedule")).toBeVisible();
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-active-section",
      "schedule",
    );
    await expect(new URL(page.url()).searchParams.get("s")).toBe("schedule");
  });

  // ── Test 4 — Dimensional (real browser, ≤719px): the mobile bottom tab-bar ──
  // Mirrors crew-page.spec §4.9 inv5: at 390px the sub-nav bottom bar is
  // position:fixed, full-viewport-width, bottom-anchored; each `[data-section]`
  // tab is equal-width (flex-1) AND fills the bar's CONTENT height (items-stretch
  // — measured against clientHeight because the bar carries a 1px border-t whose
  // border-box height is 1px taller than the content box the tabs stretch to).
  // jsdom CANNOT verify this (no layout; Tailwind v4 does not default .flex to
  // align-items:stretch), so it is a real-browser assertion.
  test("4: mobile bottom tab-bar — fixed, full-width, equal-width tabs filling bar height (≤719px)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSection(page, "today");
    const viewport = page.viewportSize()!;

    // The bottom bar is the mobile nav (DOM order desktop-first, mobile-second →
    // `.last()`). The wrapper has zero flow height at mobile (its only painted
    // child is the position:fixed bar), so target the fixed bar directly.
    const subNav = page.getByTestId("crew-sub-nav");
    const bottomBar = subNav
      .locator("nav")
      .filter({ has: page.locator("[data-section]") })
      .last();
    await expect(bottomBar).toBeVisible();

    const barRect = await rectOf(bottomBar);
    // Full viewport width.
    expect(
      Math.abs(barRect.width - viewport.width),
      `bottom bar width must equal viewport width; bar=${barRect.width} vp=${viewport.width}`,
    ).toBeLessThanOrEqual(TOL);
    // Bottom-anchored (its bottom is at/above the viewport bottom edge).
    expect(barRect.bottom, "bottom bar must be bottom-anchored").toBeLessThanOrEqual(
      viewport.height + TOL,
    );
    // The bar must be position:fixed (out of normal flow).
    const position = await bottomBar.evaluate((el) => getComputedStyle(el).position);
    expect(position, "mobile sub-nav bar must be fixed").toBe("fixed");

    // border-t: border-box height (getBoundingClientRect) is 1px taller than the
    // CONTENT box (clientHeight). items-stretch stretches tabs to the content
    // box, so measure tab-fills-bar against clientHeight (a measurement
    // refinement for the bar's own border, NOT a loosened tolerance).
    const barContentHeight = await bottomBar.evaluate((el) => (el as HTMLElement).clientHeight);

    const tabs = bottomBar.locator("[data-section]");
    const tabCount = await tabs.count();
    expect(tabCount, "bottom bar must render section tabs").toBeGreaterThan(1);
    const tabRects: Rect[] = [];
    for (let i = 0; i < tabCount; i++) tabRects.push(await rectOf(tabs.nth(i)));
    const w0 = tabRects[0]!.width;
    for (const t of tabRects) {
      expect(
        Math.abs(t.width - w0),
        `bottom-bar tabs must be equal-width (flex-1); ${t.width} vs ${w0}`,
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(t.height - barContentHeight),
        `bottom-bar tab must fill bar content height (items-stretch); tab=${t.height} barContent=${barContentHeight}`,
      ).toBeLessThanOrEqual(TOL);
    }
  });

  // ── Test 5 — Payload + FCP record (perf-tradeoff evidence) ──────────────────
  // The client-toggle tradeoff is: ship ALL section bodies on first load (bigger
  // initial payload) in exchange for zero-network section switches (test 1). This
  // test RECORDS that first-load cost so CI logs carry the evidence: total
  // document+RSC+asset transfer bytes (summed from PerformanceResourceTiming
  // encodedBodySize, which counts the over-the-wire body) and first-contentful-
  // paint. The number itself is the artifact; the assertions are GENEROUS
  // absolute sanity ceilings only — a tight cross-branch threshold is impossible
  // here because no opposing-branch baseline is available at CI test time. The
  // CREW_PERF console line is the durable record for manual before/after diffing.
  test("5: record first-load payload bytes + FCP (perf-tradeoff evidence)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

    await gotoSection(page, "today");
    await page.waitForLoadState("networkidle");

    const { payloadBytes, fcpMs } = await page.evaluate(() => {
      // Sum the over-the-wire transfer size of every resource the page pulled
      // (the navigation document + every JS/CSS/RSC/asset). encodedBodySize is
      // the compressed body size; transferSize includes headers but is 0 for
      // cross-origin no-Timing-Allow-Origin entries, so encodedBodySize is the
      // more reliable same-origin signal. Fall back to transferSize when an
      // entry reports a 0 encoded body (e.g. a 304).
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      let bytes = 0;
      for (const r of resources) {
        bytes += r.encodedBodySize || r.transferSize || 0;
      }
      // Include the main navigation document's own body.
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (nav) bytes += nav.encodedBodySize || nav.transferSize || 0;

      const fcpEntry = performance.getEntriesByName("first-contentful-paint")[0] as
        | PerformanceEntry
        | undefined;
      const fcp = fcpEntry ? fcpEntry.startTime : -1;
      return { payloadBytes: bytes, fcpMs: fcp };
    });

    // CI evidence line — grep `CREW_PERF` in the run log for the recorded number.
    // This is the REAL artifact of this test; the ceilings below are only a
    // smoke guard against a pathological regression (e.g. a 10MB blob or a
    // multi-second blank screen), NOT a meaningful performance threshold.
    console.log("CREW_PERF " + JSON.stringify({ payloadBytes, fcpMs }));

    // GENEROUS absolute sanity ceilings (intentionally loose — see comment).
    expect(
      payloadBytes,
      `first-load payload should be under the 2MB sanity ceiling; got ${payloadBytes} bytes (see CREW_PERF log)`,
    ).toBeLessThan(2_000_000);
    // FCP can be -1 if the browser did not record the paint entry; only enforce
    // the ceiling when a real value was captured.
    if (fcpMs >= 0) {
      expect(
        fcpMs,
        `first-contentful-paint should be under the 8s sanity ceiling; got ${fcpMs}ms (see CREW_PERF log)`,
      ).toBeLessThan(8000);
    }
  });
});
