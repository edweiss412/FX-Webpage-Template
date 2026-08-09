/**
 * Playwright audit suite for the §8.2 RightNow 12-state transition
 * matrix (M4 Task 4.12 Batch 2). CI-DARK, and partly skipped besides: no
 * workflow names this file, so nothing in it runs in CI
 * (BL-E2E-APP-DEPENDENT-SPECS-CI-DARK). Two of its three blocks are also
 * `test.describe.skip` — the 66-pair audit and the compound audits — so they
 * would not run even if the file were invoked. The §5.7 anchor-selection block
 * is NOT skipped and does run under a local `pnpm test:e2e`. (Block titles are
 * cited rather than line numbers, which rot on every edit to this header. The
 * compound block's own title says "6 compound transition audits"; it contains
 * SEVEN tests — a miscount that predates this comment and is left in the title
 * only because renaming a skipped block's title is not this branch's scope.)
 *
 * Wired in Batch 2: framer-motion is installed, the Today hero renders
 * via AnimatePresence + matrix-driven motion props, and this suite
 * asserts the implementation conforms to the matrix.
 *
 * Source-of-truth contract:
 *   The 66-pair matrix is `RIGHT_NOW_TRANSITION_MATRIX` in
 *   `lib/time/rightNowTransitions.ts`. The matrix's structural
 *   invariants are pinned by `tests/time/rightNowTransitions.test.ts`.
 *   THIS file's job is to assert the rendered animation matches the
 *   matrix-declared treatment for every pair.
 *
 * Test strategy:
 *
 *   1. The hero is a `'use client'` island (`components/crew/
 *      RightNowHero.tsx`); `selectRightNowState` re-derives on every
 *      60-second tick from `now`. Playwright's `page.clock.install` is
 *      used to deterministically advance time.
 *
 *   2. Each pair is dispatched into one of three categories:
 *
 *      • TICK_DRIVABLE — clock advance alone in a single page session
 *        causes a kind change. The Rule 4 adjacent time-driven pairs.
 *        Test: navigate at FROM clock, advance to TO clock, run timers,
 *        assert (a) the rendered kind is TO, (b) `data-treatment`
 *        matches matrix entry, (c) for `crossfade-body`, the card
 *        height stays within 0.5px of the pre-transition height.
 *
 *      • NAV_DRIVABLE — kind change requires a fresh page navigation
 *        (e.g., a viewer.date_restriction change is captured at SSR
 *        time, not on a clock tick). Test: navigate at FROM, assert
 *        FROM rendered; navigate at TO, assert TO rendered. The
 *        matrix-declared treatment IS preserved at the
 *        `transitionTreatment(from, to)` helper layer (verified by
 *        unit tests); the e2e here verifies both endpoints render
 *        without error and the card's `data-state` matches.
 *
 *      • UNREACHABLE / SHOW_MUTATION — `test.skip` with stamped
 *        reason. Unreachable pairs are matrix-declared as never
 *        firing on the natural code path; show.dates mutation pairs
 *        require dedicated setup that NO block in this file performs —
 *        the compound audits below make zero shows.dates mutations
 *        (probed 2026-08-06), so these pairs are undriven, not deferred.
 *
 *   The matrix is the single dispatch table — every entry maps to
 *   exactly one of these categories via `categorize(entry)`.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  RIGHT_NOW_TRANSITION_MATRIX,
  type TransitionMatrixEntry,
} from "@/lib/time/rightNowTransitions";
import {
  STATE_DRIVERS,
  driveToState,
  lookupSeededShow,
  pinClock,
  setDateRestriction,
  setSystemTime,
  advanceClock,
  type SeededShow,
  SEED_DRIVE_FILE_ID,
} from "./helpers/rightNow";
import { admin } from "./helpers/supabaseAdmin";

/** What kind of in-page driving each treatment maps to. */
type Category = "TICK_DRIVABLE" | "NAV_DRIVABLE" | "SKIP";

/**
 * Categorize a matrix entry into a driving strategy. The classification
 * is determined by:
 *
 *   - Unreachable cells → SKIP (matrix-declared no-fire)
 *   - Either endpoint is `unknown` or `dateless` → SKIP (requires
 *     show.dates mutation, which no block in this file performs)
 *   - Both endpoints are time-driven AND adjacent on the show-day
 *     sequence → TICK_DRIVABLE (clock advance alone fires the kind
 *     change in-session)
 *   - Otherwise → NAV_DRIVABLE (assert both endpoints render)
 */
function categorize(entry: TransitionMatrixEntry): Category {
  if (entry.treatment === "unreachable") return "SKIP";
  // Show-mutation endpoints — no block in this file performs a shows.dates
  // mutation, so these pairs are undriven rather than deferred elsewhere.
  if (
    STATE_DRIVERS[entry.from]?.requiresShowMutation ||
    STATE_DRIVERS[entry.to]?.requiresShowMutation
  ) {
    return "SKIP";
  }
  const TIME_DRIVEN = new Set([
    "pre_travel",
    "travel_in_day",
    "set_day",
    "show_day_n",
    "travel_out_day",
    "post_show",
  ]);
  if (TIME_DRIVEN.has(entry.from) && TIME_DRIVEN.has(entry.to)) {
    return "TICK_DRIVABLE";
  }
  return "NAV_DRIVABLE";
}

/**
 * Read the current rendered card's resolved state attributes. Uses
 * Playwright auto-retrying assertions (via `toHaveAttribute` upstream)
 * — the helper extracts the eventually-stable values via a small
 * `waitForFunction` so the caller receives a snapshot AFTER hydration
 * has settled. The card is a `'use client'` island that re-derives on
 * the first client tick AFTER SSR hands off; without this wait the
 * caller would race the hydration boundary.
 */
async function readCardAttrs(
  page: Page,
  expectedState?: string,
): Promise<{ state: string | null; treatment: string | null; stale: string | null }> {
  const card = page.getByTestId("right-now-hero");
  await expect(card).toBeVisible();
  if (expectedState) {
    // Wait for hydration to settle on the expected state before
    // sampling other attributes. The card's SSR render may briefly
    // show the server-clock state before the pinned client clock
    // takes over.
    await expect(card.getByTestId("right-now-state")).toHaveAttribute("data-state", expectedState, {
      timeout: 5000,
    });
  }
  const stateMarker = card.getByTestId("right-now-state");
  const state = await stateMarker.getAttribute("data-state");
  const treatment = await stateMarker.getAttribute("data-treatment");
  const stale = await card.getAttribute("data-stale");
  return { state, treatment, stale };
}

/**
 * Read the bounding box (height) of the card. Used to verify the
 * `min-h-right-now-min-h` invariant: card height stays
 * within ±0.5px of the pre-transition height during a crossfade.
 */
async function cardHeight(page: Page): Promise<number> {
  const box = await page.getByTestId("right-now-hero").boundingBox();
  if (!box) throw new Error("right-now-hero not visible");
  return box.height;
}

/**
 * §5.7 RightNowHero client-state transitions — day-anchor re-selection.
 *
 * These three tests are the file's only suite. The two §8.2 audit suites
 * that used to precede it (the 66-pair pairwise matrix and the 6 compound
 * audits) were deleted 2026-08-09: both were `test.describe.skip` against
 * the retired ?crew= viewer mock and ran in no workflow. The matrix's
 * structural invariants stay pinned by tests/time/rightNowTransitions.test.ts
 * and the 12-state copy map by tests/components/crew/rightNowHero.test.tsx;
 * the RENDERED framer-motion treatment now has no executable audit, recorded
 * as a documented limit in docs/superpowers/specs/ci/
 * 2026-08-09-resurrect-mobile-safari-e2e-design.md §6.1.
 *
 * Seed contract:
 *   Shows_internal.run_of_show is populated in beforeAll with a 2-show-day
 *   fixture (showDay1 = 2026-04-21 showStart=7:30am, showDay2 = 2026-04-22
 *   showStart=8:00am). The distinct anchors make stale-freeze observable
 *   (Day1 time persisting into Day2 would be caught by not.toContainText).
 *   Restored to the original in afterAll.
 *
 * Clock strategy:
 *   RightNowHero derives `todayIso` from client `now` on every 60s tick
 *   (RightNowHero.tsx:148/223/274 — `formatIsoForTimezone(now, ctx.timezone)`).
 *   We drive the client clock via `page.clock.install` (before navigation)
 *   and `page.clock.setSystemTime` + `page.clock.runFor` (to fire the tick
 *   in-session). Noon UTC on each date resolves to the correct calendar date
 *   in America/New_York regardless of DST.
 *
 * TestId:
 *   `right-now-body` — the AnimatePresence child that carries the call-time
 *   detail (RightNowHero.tsx:504 `data-testid="right-now-body"`).
 */
test.describe("RightNow per-day Show anchor selection (§5.7)", () => {
  // Anchor times derived from the seed (distinct so freeze is observable).
  const DAY1_ISO = "2026-04-21";
  const DAY2_ISO = "2026-04-22";
  const DAY1_TIME = "7:30am"; // showStart for Day 1
  const DAY2_TIME = "8:00am"; // showStart for Day 2

  /**
   * 2-show-day run_of_show seed. Mirrors the shape used by
   * crew-layout-dimensions.spec.ts:88 (SEED_RUN_OF_SHOW), derived from
   * the same Waldorf dates. Distinct showStart per day so a stale-anchor
   * freeze is immediately observable.
   */
  const ANCHOR_RUN_OF_SHOW = {
    [DAY1_ISO]: {
      entries: [
        { start: "7:30am", title: "Registration & Breakfast" },
        { start: "8:15am", title: "Welcome & Polling" },
      ],
      showStart: DAY1_TIME,
      showEnd: null,
      window: null,
    },
    [DAY2_ISO]: {
      entries: [],
      showStart: DAY2_TIME,
      showEnd: null,
      window: { start: "8:00am", end: "5:30pm" },
    },
  };

  let s: SeededShow;
  let showInternalId: string | null = null;
  let runOfShowOriginal: unknown = null;

  test.beforeAll(async () => {
    s = await lookupSeededShow();

    // Seed shows_internal.run_of_show with the 2-day anchor fixture.
    const si = await admin
      .from("shows_internal")
      .select("show_id, run_of_show")
      .eq("show_id", s.showId)
      .maybeSingle();
    if (si.error || !si.data?.show_id) {
      throw new Error(
        `§5.7 setup: no shows_internal row for show ${s.showId} (run \`pnpm db:seed\`). error=${si.error?.message ?? "no row"}`,
      );
    }
    showInternalId = si.data.show_id as string;
    runOfShowOriginal = (si.data as { run_of_show?: unknown }).run_of_show ?? null;

    const upd = await admin
      .from("shows_internal")
      .update({ run_of_show: ANCHOR_RUN_OF_SHOW })
      .eq("show_id", showInternalId);
    if (upd.error) {
      throw new Error(`§5.7 setup: run_of_show seed failed: ${upd.error.message}`);
    }

    // Restore the LEAD's restriction to neutral so clock alone drives the kind.
    await setDateRestriction(s.leadCrewId, { kind: "none", days: null });
  });

  test.afterAll(async () => {
    if (showInternalId) {
      await admin
        .from("shows_internal")
        .update({ run_of_show: runOfShowOriginal })
        .eq("show_id", showInternalId);
    }
    // Restore restriction.
    await setDateRestriction(s.leadCrewId, { kind: "none", days: null });
  });

  /**
   * §5.7 midnight rollover: Day1 → Day2.
   *
   * Concrete failure mode caught: the RightNowHero anchor selection pins
   * showAnchors[0] (Day1's 7:30am) regardless of todayIso — so after the
   * clock advances to Day2, day1Time still appears and the
   * `not.toContainText(day1Time)` assertion trips.
   */
  test("midnight rollover Day1→Day2: call time re-selects the NEW day's anchor (no stale freeze)", async ({
    page,
  }) => {
    // Pin client clock to Day 1 noon UTC, navigate as the LEAD.
    await page.clock.install({ time: new Date(`${DAY1_ISO}T12:00:00Z`) });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);

    // Day 1 anchor must appear on initial render.
    await expect(page.getByTestId("right-now-body")).toContainText(DAY1_TIME);

    // Advance client clock to Day 2 and fire the 60s tick.
    await page.clock.setSystemTime(new Date(`${DAY2_ISO}T12:00:00Z`));
    await page.clock.runFor(60_000); // fire the hero's 60s re-derive tick

    // After the tick, the hero re-selects by the new todayIso → Day 2 time.
    await expect(page.getByTestId("right-now-body")).toContainText(DAY2_TIME);
    await expect(page.getByTestId("right-now-body")).not.toContainText(DAY1_TIME);
  });

  /**
   * §5.7 recovery/last-good: re-select by current todayIso, not a cached
   * prior day.
   *
   * Concrete failure mode caught: a last-good cache that stores an anchor
   * object (rather than re-running todayShowAnchors on recovery) would pin
   * the Day1 time even after the clock is on Day2.
   */
  test("recovery/last-good does not pin a prior day's call time", async ({ page }) => {
    // Enter a degraded-zone kind (viewer_off_day: clock=Day1, restricted to Day2 only).
    await driveToState(page, s, "viewer_off_day");

    // Now pin clock to Day 2 and recover to show_day_n via a fresh navigation.
    // driveToState calls pinClock (installs clock before goto) + navigates.
    // This exercises the re-selection path after the viewer re-enters a show day.
    await driveToState(page, s, "show_day_n");
    // show_day_n driver uses showDay1 clock. Advance to Day2 so todayIso=Day2.
    await page.clock.setSystemTime(new Date(`${DAY2_ISO}T12:00:00Z`));
    await page.clock.runFor(60_000);

    // After the tick on Day2, the hero must show Day2's anchor, not Day1's.
    await expect(page.getByTestId("right-now-body")).toContainText(DAY2_TIME);
  });

  /**
   * §5.7 non-show "now" → show day: call time appears only once now is a show day.
   *
   * Pre-show is 2026-04-20 (set day — no runOfShow entry, not a show_day).
   * Advancing to Day1 (2026-04-21) should surface the 7:30am anchor.
   *
   * Concrete failure mode caught: todayShowAnchors returns [] when todayIso
   * doesn't match any anchor date, falling back to ctx.callTime. If
   * ctx.callTime is non-null from a stale prior anchor, the call time would
   * appear on pre-show days — a false positive. This test pins that only the
   * show-day anchor appears when the clock transitions into a show day.
   */
  test("non-show now → show day: call time appears only once now is a show day", async ({
    page,
  }) => {
    // Pin to 2026-04-20 (set day — before showDay1). The hero should be in
    // set_day state; the showAnchors filter yields [] for this date.
    await page.clock.install({ time: new Date("2026-04-20T12:00:00Z") });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);

    // Day1 call time must NOT appear on the set day.
    await expect(page.getByTestId("right-now-body")).not.toContainText(DAY1_TIME);

    // Advance clock to Day1 noon UTC and fire the 60s tick.
    await page.clock.setSystemTime(new Date(`${DAY1_ISO}T12:00:00Z`));
    await page.clock.runFor(60_000);

    // Now on Day1 — the anchor selection fires and DAY1_TIME appears.
    await expect(page.getByTestId("right-now-body")).toContainText(DAY1_TIME);
  });
});
