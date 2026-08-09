/**
 * Playwright suite for the §5.7 RightNowHero day-anchor re-selection contract.
 *
 * HISTORY (2026-08-09, spec docs/superpowers/specs/ci/
 * 2026-08-09-resurrect-mobile-safari-e2e-design.md §3.5): this file also carried
 * the §8.2 66-pair pairwise transition audit and the compound transition audits.
 * Both were `test.describe.skip` against the retired `?crew=` viewer mock and ran
 * in no workflow, and both were deleted. The matrix's structural invariants stay
 * pinned by `tests/time/rightNowTransitions.test.ts` and the 12-state copy map by
 * `tests/components/crew/rightNowHero.test.tsx`; the RENDERED framer-motion
 * treatment has no executable audit, recorded as a documented limit in spec §6.1.
 *
 * The §5.7 block below is LIVE and is what this file now is.
 *
 * ROUTE + RESOLUTION. Every navigation goes through
 * `/show/[slug]/[shareToken]` with an admin session. The slug-only
 * `/show/[slug]` route these tests used to hit has no page.tsx and 404s
 * unconditionally, and an UNAUTHENTICATED share-token request renders
 * SignInOrSkipGate/PickerInterstitial rather than the CrewShell — so the
 * signInAs(ADMIN_FIXTURE) step is part of the test, not incidental setup (spec
 * §3.2/§3.5). The §5.7 contract is per-SHOW (anchors come from
 * shows_internal.run_of_show), so the admin viewer resolves the same anchors any
 * viewer would.
 *
 * Why `page.clock` and not an addInitScript Date shim: the hero's 60-second
 * setInterval only fires when wall-clock time advances on the page. Playwright's
 * clock controller pins the start instant AND drives setInterval deterministically
 * via clock.runFor, so a day rollover can be observed WITHIN one page session.
 *
 * STATE ENTRY IS ASSERTED, NEVER ASSUMED (spec §3.5). Anchor TEXT alone cannot
 * distinguish "the viewer entered the intended state" from "a coincident render
 * happens to contain that time", so every navigation and every clock tick is
 * followed by an assertion on the hero's rendered `data-state`
 * (RightNowHero.tsx:507-510) via assertRenderedState.
 */
import { test, expect } from "@playwright/test";
import {
  driveToState,
  assertRenderedState,
  lookupSeededShow,
  setDateRestriction,
  setSystemTime,
  type SeededShow,
} from "./helpers/rightNow";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

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
  const DAY1_TIME = "7:30am"; // showStart for Day 1, as the FIXTURE spells it
  const DAY2_TIME = "8:00am"; // showStart for Day 2, as the FIXTURE spells it

  /**
   * Match the fixture's anchor time as the hero RENDERS it.
   *
   * The fixture writes `run_of_show.showStart` as "7:30am"; the hero renders
   * "4/21 @ 7:30 AM" — different case and spacing. Measured, not assumed: these
   * assertions previously compared against the raw fixture string and had never
   * run against a live route, so the mismatch had never surfaced.
   *
   * Derived FROM the fixture constant rather than hardcoding the rendered
   * string, so a fixture change cannot leave the expectation silently stale
   * (anti-tautology: never retype the expected value at the assertion).
   */
  const anchorText = (fixtureTime: string) =>
    new RegExp(fixtureTime.replace(/\s*(am|pm)$/i, "\\s*$1"), "i");

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

    // Invariant 9 (Supabase call-boundary discipline): destructure
    // { data, error } and distinguish a RETURNED error from an empty result.
    // Test-local call sites, so no _metaInfraContract registry row applies —
    // the fail-loud throw naming the site IS the discipline here.
    const { data: internal, error: internalError } = await admin
      .from("shows_internal")
      .select("show_id, run_of_show")
      .eq("show_id", s.showId)
      .maybeSingle();
    if (internalError) {
      throw new Error(
        `§5.7 setup: shows_internal lookup FAILED for show ${s.showId}: ${internalError.message}`,
      );
    }
    if (!internal?.show_id) {
      throw new Error(
        `§5.7 setup: no shows_internal row for show ${s.showId} (run \`pnpm db:seed\`)`,
      );
    }
    showInternalId = internal.show_id as string;
    runOfShowOriginal = (internal as { run_of_show?: unknown }).run_of_show ?? null;

    const { error: seedError } = await admin
      .from("shows_internal")
      .update({ run_of_show: ANCHOR_RUN_OF_SHOW })
      .eq("show_id", showInternalId);
    if (seedError) {
      throw new Error(`§5.7 setup: run_of_show seed FAILED: ${seedError.message}`);
    }

    // Restore the LEAD's restriction to neutral so clock alone drives the kind.
    await setDateRestriction(s.leadCrewId, { kind: "none", days: null });
  });

  test.afterAll(async () => {
    if (showInternalId) {
      // The RESTORE is the loud one by construction (plan review R4 F2). A
      // returned error does not throw, so an unchecked restore leaks the mutated
      // run_of_show into every later suite sharing this seed while THIS suite —
      // and the five-green dispatch bar — stay green. Silence here is the
      // failure mode, so the error is inspected and thrown.
      const { error: restoreError } = await admin
        .from("shows_internal")
        .update({ run_of_show: runOfShowOriginal })
        .eq("show_id", showInternalId);
      if (restoreError) {
        throw new Error(
          `§5.7 teardown: run_of_show RESTORE FAILED for show ${showInternalId} — ` +
            `the seed is left mutated; re-run \`pnpm db:seed\`: ${restoreError.message}`,
        );
      }
    }
    // Restore restriction.
    await setDateRestriction(s.leadCrewId, { kind: "none", days: null });
  });

  test.beforeEach(async ({ page }) => {
    // Resolution recipe (spec §3.2/§3.5): the crew route renders the CrewShell
    // for an admin session; unauthenticated it renders the picker gate instead.
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
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
    // Pin client clock to Day 1 noon UTC, then resolve the crew route.
    await page.clock.install({ time: new Date(`${DAY1_ISO}T12:00:00Z`) });
    const res = await page.goto(`/show/${s.slug}/${s.shareToken}?s=today`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), "crew route must render").toBe(200);

    // State entry asserted, not assumed: Day 1 is a show day, so the hero must
    // resolve show_day_n. Without this the anchor-text assertion below could be
    // satisfied by any render that happens to contain "7:30am".
    await assertRenderedState(page, "show_day_n");
    await expect(page.getByTestId("right-now-body")).toContainText(anchorText(DAY1_TIME));

    // Advance client clock to Day 2 and fire the 60s tick.
    await page.clock.setSystemTime(new Date(`${DAY2_ISO}T12:00:00Z`));
    await page.clock.runFor(60_000); // fire the hero's 60s re-derive tick

    // Still a show day AFTER the tick — the rollover must not drop the state on
    // the way to re-selecting the anchor.
    await assertRenderedState(page, "show_day_n");
    // After the tick, the hero re-selects by the new todayIso → Day 2 time.
    await expect(page.getByTestId("right-now-body")).toContainText(anchorText(DAY2_TIME));
    await expect(page.getByTestId("right-now-body")).not.toContainText(anchorText(DAY1_TIME));
  });

  /**
   * §5.7 recovery/last-good: re-select by current todayIso, not a cached
   * prior day.
   *
   * Concrete failure mode caught: a last-good cache that stores an anchor
   * object (rather than re-running todayShowAnchors on recovery) would pin
   * the Day1 time even after the clock is on Day2.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * DEFERRED — spec §3.5 CASE valve, exception (a). Ledger row:
   * BL-RIGHTNOW-RECOVERY-CASE-NEEDS-RESTRICTED-VIEWER.
   *
   * This case enters `viewer_off_day` by mutating the VIEWER's date_restriction
   * — a viewer-scoped state an ADMIN viewer never enters, because admin
   * resolution ignores crew_members.date_restriction by design. The other two
   * cases are clock-driven and per-SHOW, so the admin recipe carries them; this
   * one is not.
   *
   * PROBED, not assumed (2026-08-09). With the rendered-state assertion this
   * arc added to driveToState, requesting the state under the admin recipe
   * fails loudly instead of passing on coincident anchor text:
   *
   *   Error: RightNow hero must render state kind "viewer_off_day"
   *   Expected: "viewer_off_day"
   *   Received: "show_day_n"          (transiently "post_show" during hydration)
   *
   * That is the whole point of the extension: the pre-existing helper checked
   * only HTTP 200, so this case would have "entered" a state it was never in.
   *
   * Honest migration needs a restricted crew viewer through real resolution —
   * a per-test crew row plus an email-matched session, the cost the retired
   * `?crew=` mock used to hide and the same cost named by the dead suites' TODO.
   * That is a new harness, not a URL swap, and it is out of this arc's timebox.
   * Skipped STATICALLY so it is visible to the wiring guard's EXPECTED_SKIPS
   * inventory rather than silently absent from the executed count.
   * ─────────────────────────────────────────────────────────────────────────
   */
  test.skip("recovery/last-good does not pin a prior day's call time", async ({ page }) => {
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
    await expect(page.getByTestId("right-now-body")).toContainText(anchorText(DAY2_TIME));
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
    const res = await page.goto(`/show/${s.slug}/${s.shareToken}?s=today`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status(), "crew route must render").toBe(200);

    // The set day is a DIFFERENT kind, and asserting it is what makes the
    // negative below meaningful: "7:30am is absent" is trivially true on any
    // page that failed to render the hero at all.
    await assertRenderedState(page, "set_day");
    // Day1 call time must NOT appear on the set day.
    await expect(page.getByTestId("right-now-body")).not.toContainText(anchorText(DAY1_TIME));

    // Advance clock to Day1 noon UTC and fire the 60s tick.
    await page.clock.setSystemTime(new Date(`${DAY1_ISO}T12:00:00Z`));
    await page.clock.runFor(60_000);

    // The tick must have moved the STATE, not just the text.
    await assertRenderedState(page, "show_day_n");

    // Now on Day1 — the anchor selection fires and DAY1_TIME appears.
    await expect(page.getByTestId("right-now-body")).toContainText(anchorText(DAY1_TIME));
  });
});
