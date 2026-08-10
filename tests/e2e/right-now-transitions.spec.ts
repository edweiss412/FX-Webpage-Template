/**
 * Playwright suite for the §5.7 RightNowHero day-anchor re-selection contract,
 * driven through the hero's REAL anchor source under a REAL crew viewer.
 *
 * ── DISCOVERY (M-wave 2 W-E2E Task E1, spec 2026-08-09-m-wave-2-design §2.4) ──
 * BL-RIGHTNOW-SECTION57-FIXTURE-INERT's probe showed a mid-run edit to the
 * SHARED seed's `shows_internal.run_of_show` never reached the rendered hero.
 * The anchor source itself was never the problem: `resolveKeyTimes` reads
 * `runOfShow[day].showStart` as the FIRST candidate for each per-day Show
 * anchor (lib/crew/resolveKeyTimes.ts:165-176), threaded from
 * `getShowForViewer`'s `runOfShow` projection through `TodaySection` →
 * `buildRightNowContext` → the hero. What made the fixture inert is the CACHE:
 * `getShowForViewer` is wrapped in `unstable_cache` keyed by one tag per show
 * with a 300s TTL backstop (lib/data/getShowForViewer.ts:924-935), and the tag
 * is busted by SYNC applies (`revalidateShowFromResult`), never by a direct
 * DB fixture write. The old suite mutated ONE shared show mid-run, so every
 * navigation after the first served the pre-mutation projection — and its
 * assertions "passed" only through the two value coincidences its valve
 * banner recorded (show-start anchor; noon-UTC clock rendering).
 *
 * The honest fixture, used here: each test seeds its OWN show (fresh
 * driveFileId → fresh slug → fresh cache tag) with `run_of_show` written in
 * the SAME locked transaction as the show row, BEFORE the first navigation —
 * the first render caches the seeded value, so the fixture provably drives
 * the hero. Discriminating values (anti-tautology): showStart times carry odd
 * minutes (7:13am / 8:47am) so they can equal neither the seed's show-level
 * anchors nor any top-of-hour rendering of the pinned noon-UTC clock in any
 * timezone; the seed writes NO rooms rows, so no room show_time exists to
 * coincide with anything.
 *
 * ── Viewer ────────────────────────────────────────────────────────────────
 * A real CREW viewer via the email-matched Google-session pattern
 * (stage-restricted-crew-schedule.spec.ts header): the seeded crew row's
 * email is NON_ADMIN_CREW_FIXTURE.email, so `validateGoogleSession` resolves
 * the signed-in fixture TO that row (unclaimed is fine). A picker cookie is
 * NOT used — `__Host-` cookie injection is dark on Linux WebKit (measured,
 * run 30754740917). The recovery case enters `viewer_off_day` through REAL
 * resolution: the restriction is seeded on the crew row itself.
 *
 * DESKTOP-CHROMIUM ONLY (same constraint as picker-flow and
 * stage-restricted-crew-schedule): the crew route's first contact runs the
 * picker-bootstrap envelope, whose `__Host-`-prefixed Secure cookie WebKit
 * refuses to STORE over plain http — measured here 2026-08-10: all three
 * cases pass on desktop-chromium and land on "Sign-in unavailable" on
 * mobile-safari after the bootstrap redirect loop drops the envelope. The
 * playwright.config mobile-safari testMatch therefore excludes this spec.
 *
 * ── Clock ─────────────────────────────────────────────────────────────────
 * `page.clock` (install before goto; setSystemTime + runFor for the in-page
 * 60s tick) — the §5.7 rollover is observed WITHIN one page session, where
 * the client re-derives `todayIso` and re-selects the day's anchor without
 * any server round-trip (so the cache is irrelevant to the rollover leg).
 *
 * STATE ENTRY IS ASSERTED, NEVER ASSUMED: every navigation and every tick is
 * followed by an assertion on the hero's rendered `data-state` via
 * assertRenderedState (helpers/rightNow.ts).
 */
import { test, expect } from "@playwright/test";
import { pinClock, setSystemTime, advanceClock, assertRenderedState } from "./helpers/rightNow";
import { NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { deleteSeededShow, seedShowWithCrew, type SeededShow } from "./helpers/seedShowWithCrew";

const TRAVEL_IN = "2026-04-19";
const SET_DAY = "2026-04-20";
const DAY1_ISO = "2026-04-21";
const DAY2_ISO = "2026-04-22";
const TRAVEL_OUT = "2026-04-23";

// Odd minutes ON PURPOSE (see header): cannot collide with a top-of-hour
// rendering of the pinned clock in ANY offset, nor with any seed-level anchor.
const DAY1_TIME = "7:13am";
const DAY2_TIME = "8:47am";

/**
 * Match the fixture's anchor time as the hero RENDERS it ("7:13am" → "7:13 AM";
 * normalizeMeridiem inserts the space and uppercases). Derived FROM the fixture
 * constant so a fixture change cannot leave the expectation silently stale.
 */
const anchorText = (fixtureTime: string) =>
  new RegExp(fixtureTime.replace(/\s*(am|pm)$/i, "\\s*$1"), "i");

/** 2-show-day run_of_show: distinct showStart per day so a stale freeze is loud. */
const ANCHOR_RUN_OF_SHOW = {
  [DAY1_ISO]: {
    entries: [
      { start: DAY1_TIME, title: "Registration & Breakfast" },
      { start: "8:15am", title: "Welcome & Polling" },
    ],
    showStart: DAY1_TIME,
    showEnd: null,
    window: null,
  },
  [DAY2_ISO]: {
    entries: [{ start: DAY2_TIME, title: "Doors & Soundcheck" }],
    showStart: DAY2_TIME,
    showEnd: null,
    window: { start: DAY2_TIME, end: "5:30pm" },
  },
};

const SHOW_DATES = {
  travelIn: TRAVEL_IN,
  set: SET_DAY,
  showDays: [DAY1_ISO, DAY2_ISO],
  travelOut: TRAVEL_OUT,
};

async function seedAnchorShow(overrides: { dateRestriction?: unknown } = {}): Promise<SeededShow> {
  return await seedShowWithCrew({
    title: "RightNow Anchor Show",
    dates: SHOW_DATES,
    crew: [
      {
        name: "RightNow Crew",
        role: "A1",
        // Email-matched viewer resolution (see header): the signed-in
        // NON_ADMIN_CREW fixture resolves to THIS row.
        email: NON_ADMIN_CREW_FIXTURE.email,
        ...(overrides.dateRestriction !== undefined
          ? { dateRestriction: overrides.dateRestriction as never }
          : {}),
      },
    ],
    internal: { runOfShow: ANCHOR_RUN_OF_SHOW },
  });
}

test.describe("RightNow per-day Show anchor selection (§5.7)", () => {
  let seeded: SeededShow | null = null;

  test.beforeEach(async ({ page }) => {
    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page).catch(() => {});
    if (seeded) {
      await deleteSeededShow(seeded.driveFileId);
      seeded = null;
    }
  });

  async function gotoSeeded(page: import("@playwright/test").Page): Promise<void> {
    const r = await page.goto(`/show/${seeded!.slug}/${seeded!.shareToken}?s=today`, {
      waitUntil: "domcontentloaded",
    });
    if (r?.status() !== 200) {
      throw new Error(`right-now-transitions: navigate returned ${r?.status()}`);
    }
  }

  test("Day 1: the hero renders Day 1's OWN run_of_show anchor", async ({ page }) => {
    seeded = await seedAnchorShow();
    await pinClock(page, DAY1_ISO);
    await gotoSeeded(page);
    await assertRenderedState(page, "show_day_n");
    const body = page.getByTestId("right-now-body");
    await expect(body).toContainText(anchorText(DAY1_TIME));
    // The discriminating negative: Day 2's anchor must NOT render on Day 1.
    await expect(body).not.toContainText(anchorText(DAY2_TIME));
  });

  test("midnight rollover Day1→Day2: the tick re-selects the NEW day's anchor (no stale freeze)", async ({
    page,
  }) => {
    seeded = await seedAnchorShow();
    await pinClock(page, DAY1_ISO);
    await gotoSeeded(page);
    await assertRenderedState(page, "show_day_n");
    await expect(page.getByTestId("right-now-body")).toContainText(anchorText(DAY1_TIME));

    // Roll the CLIENT clock to Day 2 and fire the 60s tick in-session: the hero
    // re-derives todayIso and re-selects — Day 1's time persisting would fail
    // the not.toContainText below.
    await setSystemTime(page, DAY2_ISO);
    await advanceClock(page);
    await assertRenderedState(page, "show_day_n");
    const body = page.getByTestId("right-now-body");
    await expect(body).toContainText(anchorText(DAY2_TIME));
    await expect(body).not.toContainText(anchorText(DAY1_TIME));
  });

  test("recovery: a date-restricted crew viewer enters viewer_off_day via REAL resolution", async ({
    page,
  }) => {
    // The restriction lives on the seeded crew row (not injected state): the
    // viewer works ONLY Day 2, the clock says Day 1 → the state machine must
    // resolve viewer_off_day, and no prior day's call time may render.
    seeded = await seedAnchorShow({
      dateRestriction: { kind: "explicit", days: [DAY2_ISO] },
    });
    await pinClock(page, DAY1_ISO);
    await gotoSeeded(page);
    await assertRenderedState(page, "viewer_off_day");
    await expect(page.getByTestId("right-now-body")).not.toContainText(anchorText(DAY1_TIME));

    // Recovery leg (review r1 F3 — the §5.7 recovery contract is "last-good
    // does not pin a prior day's call time", not merely off-day entry): roll
    // the client clock to the viewer's OWN day and fire the tick in-session.
    // The state machine must RECOVER into show_day_n with Day 2's OWN anchor —
    // and Day 1's anchor (the day the viewer never worked) must not appear.
    await setSystemTime(page, DAY2_ISO);
    await advanceClock(page);
    await assertRenderedState(page, "show_day_n");
    const body = page.getByTestId("right-now-body");
    await expect(body).toContainText(anchorText(DAY2_TIME));
    await expect(body).not.toContainText(anchorText(DAY1_TIME));
  });
});
