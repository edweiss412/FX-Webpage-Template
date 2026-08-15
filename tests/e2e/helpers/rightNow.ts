/**
 * tests/e2e/helpers/rightNow.ts — shared driving infrastructure for the
 * §8.2 RightNow transition audit (M4 Task 4.12 Batch 2).
 *
 * The 66-pair pairwise audit + 7 compound transition tests in
 * `tests/e2e/right-now-transitions.spec.ts` all share the same
 * scaffolding: look up the seeded show, mutate the LEAD viewer's
 * `date_restriction`, pin Playwright's clock controller to a chosen
 * instant, navigate, then advance the clock to drive a kind transition
 * within a single page session.
 *
 * Why `page.clock` and not `addInitScript` + manual Date.now shim?
 *
 *   The card's 60-second `setInterval` only fires when wall-clock time
 *   advances on the page. Playwright's clock controller installs a
 *   fake clock AND drives `setInterval` deterministically via
 *   `clock.runFor(ticks)` — so we can pin the start state, navigate,
 *   then advance the clock past the next tick and observe the §8.2
 *   crossfade fire WITHIN A SINGLE PAGE SESSION. An addInitScript
 *   `Date.now` shim alone freezes time but does not cause the existing
 *   setInterval to fire — there's no "advance" capability.
 *
 *   The former `right-now.spec.ts` (Task 4.11 AC-4.3 suite) was written
 *   against the simpler addInitScript shim because it only needed to assert
 *   the initial render. THIS suite asserts pre→post transition behavior in a
 *   single session, so we use page.clock. That spec was deleted 2026-08-09 as
 *   superseded — wholly `describe.skip` against the retired `?crew=` viewer
 *   mock and a route that 404s; its behavior keeps unit coverage in
 *   `tests/time/rightNow.test.ts` and `tests/components/crew/rightNowHero.test.tsx`
 *   (spec docs/superpowers/specs/ci/2026-08-09-resurrect-mobile-safari-e2e-design.md
 *   §2.3). `right-now-transitions.spec.ts` is this helper's live caller:
 *   un-skipped 2026-08-10 (M-wave 2 W-E2E) and wired into crew-e2e.yml on
 *   desktop-chromium. The 2026-08-09 "fixture inert" verdict
 *   (`BL-RIGHTNOW-SECTION57-FIXTURE-INERT`) was overturned by probe: the
 *   inertness was `getShowForViewer`'s per-show `unstable_cache` tag, not the
 *   anchor source — a per-test show has a fresh tag, and the fixture drives
 *   the hero (flip test: fixture 6:59am vs assertion 7:13am fails).
 *
 * Seed contract:
 *   • drive_file_id `seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf`
 *   • dates: travelIn 2026-04-19, set 2026-04-20, showDays
 *     [2026-04-21, 2026-04-22], travelOut 2026-04-23.
 *   • LEAD viewer is the only crew member with role_flags including
 *     LEAD; we mutate their `date_restriction` JSONB to drive
 *     viewer-aware branches.
 *
 * Cleanup contract:
 *   `lookupSeededShow` returns the LEAD's original date_restriction so
 *   `afterAll` can restore it. The serialization (`workers: 1` in
 *   playwright.config.ts) prevents inter-suite races.
 */
import { expect, type Page } from "@playwright/test";
import { setDateRestrictionLocked } from "./lockedCrewRestriction";
import { admin } from "./supabaseAdmin";

export const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/**
 * Seed dates — copied here so the helper does not have to re-query the
 * `shows` row on every test. These match the seed in supabase/seed.ts;
 * if the seed changes, this constant must be updated and the audit
 * suite may need re-tuning.
 */
export const SEED_DATES = {
  travelIn: "2026-04-19",
  set: "2026-04-20",
  showDay1: "2026-04-21",
  showDay2: "2026-04-22",
  travelOut: "2026-04-23",
  /** A date BEFORE travelIn, used to drive `pre_travel`. */
  preTravel: "2026-04-17",
  /** A date AFTER travelOut, used to drive `post_show`. */
  postShow: "2026-04-25",
  /** A date FAR before travelIn, used to drive `viewer_off_day_pre`. */
  veryPre: "2026-04-15",
  /** A date FAR after travelOut, used to drive `viewer_after_last_day`. */
  veryPost: "2026-04-30",
} as const;

export type SeededShow = {
  slug: string;
  showId: string;
  /**
   * Share token for the crew route. The slug-only `/show/[slug]` route has no
   * page.tsx and 404s unconditionally, so every navigation resolves through
   * `/show/[slug]/[shareToken]`.
   */
  shareToken: string;
  leadCrewId: string;
  leadOriginalDateRestriction: unknown;
};

export async function lookupSeededShow(): Promise<SeededShow> {
  // Invariant 9 (Supabase call-boundary discipline): destructure { data, error }
  // rather than holding the whole response, and distinguish a returned error from
  // an empty result. These are test-local call sites, not lib helpers, so no
  // _metaInfraContract registry row applies — the fail-loud throw IS the
  // discipline here, and it names the site so a seed problem is not mistaken for
  // a product failure.
  const { data: show, error: showError } = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showError) {
    throw new Error(
      `rightNow.lookupSeededShow: shows lookup FAILED for drive_file_id=${SEED_DRIVE_FILE_ID}: ${showError.message}`,
    );
  }
  if (!show) {
    throw new Error(
      `rightNow.lookupSeededShow: seeded show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}`,
    );
  }
  const showId = show.id as string;

  const { data: crew, error: crewError } = await admin
    .from("crew_members")
    .select("id, name, role_flags, date_restriction")
    .eq("show_id", showId);
  if (crewError) {
    throw new Error(
      `rightNow.lookupSeededShow: crew_members lookup FAILED for slug=${show.slug}: ${crewError.message}`,
    );
  }
  if (!crew?.length) {
    throw new Error(`rightNow.lookupSeededShow: no crew rows for slug=${show.slug}`);
  }
  const lead = crew.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) {
    throw new Error(`rightNow.lookupSeededShow: no LEAD crew member for slug=${show.slug}`);
  }

  const { data: token, error: tokenError } = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showId)
    .limit(1)
    .maybeSingle();
  if (tokenError) {
    throw new Error(
      `rightNow.lookupSeededShow: show_share_tokens lookup FAILED for slug=${show.slug}: ${tokenError.message}`,
    );
  }
  if (!token?.share_token) {
    throw new Error(
      `rightNow.lookupSeededShow: no share_token for slug=${show.slug} (run \`pnpm db:seed\`)`,
    );
  }

  return {
    slug: show.slug,
    showId,
    shareToken: token.share_token as string,
    leadCrewId: lead.id as string,
    leadOriginalDateRestriction: lead.date_restriction,
  };
}

/**
 * Mutate the LEAD viewer's `date_restriction` through the SHARED locked
 * psql path (lockedCrewRestriction.ts): one transaction holding the
 * per-show advisory lock, UPDATE show-scoped to the locked show, no-row
 * RETURNING guard throws. M12.12-DEF-2 relocated this write off the
 * PostgREST admin client (which held NO lock); the Codex R2 class-sweep
 * extracted the locked path into the shared helper so the identical
 * mutation in the former schedule-tile.spec.ts used it too (that spec was
 * deleted 2026-08-09 as superseded; the shared helper stays). `leadCrewId`
 * always comes from lookupSeededShow(), i.e. a crew row of the
 * SEED_DRIVE_FILE_ID show.
 */
export async function setDateRestriction(leadCrewId: string, restriction: unknown): Promise<void> {
  await setDateRestrictionLocked(SEED_DRIVE_FILE_ID, leadCrewId, restriction);
}

/**
 * Install Playwright's clock controller pinned to noon UTC of the
 * given ISO date. Noon UTC resolves to morning EDT regardless of DST,
 * so the card's `formatIsoForTimezone` always lands on the intended
 * date in America/New_York.
 *
 * Must be called BEFORE `page.goto`. The card's `useState` initializer
 * calls `new Date()` at hydration time — we want that to read the
 * pinned instant.
 */
export async function pinClock(page: Page, isoDate: string): Promise<void> {
  await page.clock.install({ time: new Date(`${isoDate}T12:00:00Z`) });
}

/**
 * Advance the page's wall clock by N seconds AND fire any setInterval
 * handlers that crossed the boundary. The card's interval is 60s, so
 * default to 70s — guarantees a tick.
 *
 * `runFor` runs timers deterministically — every setInterval / setTimeout
 * scheduled to fire within the window fires synchronously from the
 * page's perspective.
 */
export async function advanceClock(page: Page, seconds: number = 70): Promise<void> {
  await page.clock.runFor(seconds * 1000);
}

/**
 * Set the system time to a specific ISO date (noon UTC) WITHOUT
 * advancing timers. Useful for compound transitions where we want the
 * next tick to pick up a new wall-clock time but we control when the
 * tick fires.
 */
export async function setSystemTime(page: Page, isoDate: string): Promise<void> {
  await page.clock.setSystemTime(new Date(`${isoDate}T12:00:00Z`));
}

/**
 * Map a §8.2 state kind to the (clock instant, viewer.date_restriction)
 * pair that drives the production state machine into that kind on the
 * Waldorf seed. Used by the parametrized 66-pair audit to set up FROM
 * states and verify TO states.
 *
 * Some kinds require show.dates mutation (e.g., `dateless` requires
 * stripping every parseable date). Those are listed as `requiresShowMutation: true`
 * and the parametrized audit skips pairs where either endpoint requires
 * dates mutation — they're harder to drive without polluting the shared
 * seed. No block drives them: the compound audits perform zero shows.dates
 * mutations (probed 2026-08-06), so these endpoints are simply undriven.
 */
export type StateDriver = {
  clockDate: string;
  restriction: unknown;
  /**
   * If true, this kind cannot be driven via clock + restriction
   * alone — needs `shows.dates` mutation. The parametrized audit
   * skips pairs where either endpoint has this set, and NO block drives
   * them: the compound audits perform zero `shows.dates` mutations
   * (probed 2026-08-06), so these endpoints are undriven.
   */
  requiresShowMutation?: boolean;
};

/**
 * Inputs that drive each §8.2 state on the Waldorf seed. NULLs in the
 * restriction field mean "no restriction set" (LEAD sees show-wide state).
 */
export const STATE_DRIVERS: Record<string, StateDriver> = {
  pre_travel: {
    clockDate: SEED_DATES.preTravel,
    restriction: { kind: "none", days: null },
  },
  travel_in_day: {
    clockDate: SEED_DATES.travelIn,
    restriction: { kind: "none", days: null },
  },
  set_day: {
    clockDate: SEED_DATES.set,
    restriction: { kind: "none", days: null },
  },
  show_day_n: {
    clockDate: SEED_DATES.showDay1,
    restriction: { kind: "none", days: null },
  },
  travel_out_day: {
    clockDate: SEED_DATES.travelOut,
    restriction: { kind: "none", days: null },
  },
  post_show: {
    clockDate: SEED_DATES.postShow,
    restriction: { kind: "none", days: null },
  },
  // viewer_unconfirmed: any in-span clock + asterisk restriction.
  viewer_unconfirmed: {
    clockDate: SEED_DATES.showDay1,
    restriction: { kind: "unknown_asterisk", days: null },
  },
  // viewer_off_day: in-span clock, viewer days exclude today.
  viewer_off_day: {
    clockDate: SEED_DATES.showDay1,
    restriction: { kind: "explicit", days: [SEED_DATES.showDay2] },
  },
  // viewer_off_day_pre: clock BEFORE travelIn, viewer's first day is
  // travelIn or later.
  viewer_off_day_pre: {
    clockDate: SEED_DATES.veryPre,
    restriction: { kind: "explicit", days: [SEED_DATES.showDay1] },
  },
  // viewer_after_last_day: clock past viewer's last day.
  viewer_after_last_day: {
    clockDate: SEED_DATES.veryPost,
    restriction: { kind: "explicit", days: [SEED_DATES.showDay1] },
  },
  // unknown / dateless require show.dates mutation — the parametrized
  // audit skips pairs touching these endpoints. NOTHING drives them:
  // probed 2026-08-06, the compound audit block performs ZERO shows.dates
  // mutations and never calls a driver for these kinds, so the long-standing
  // claim that the compound tests "cover the recovery paths" was false even
  // before those blocks were skipped. These endpoints are undriven, full stop.
  unknown: {
    clockDate: SEED_DATES.showDay1,
    restriction: { kind: "none", days: null },
    requiresShowMutation: true,
  },
  dateless: {
    clockDate: SEED_DATES.showDay1,
    restriction: { kind: "none", days: null },
    requiresShowMutation: true,
  },
};

/**
 * Drive the page into the given §8.2 state by setting the LEAD
 * viewer's restriction, pinning the clock, and navigating. Returns the
 * page-level Playwright assertion that the resolved kind matches.
 *
 * Called by both the parametrized audit (initial-state assertion) and
 * the (skipped) compound audits (setup phase). Neither executes.
 */
export async function driveToState(page: Page, show: SeededShow, kind: string): Promise<void> {
  const driver = STATE_DRIVERS[kind];
  if (!driver) throw new Error(`No driver for kind: ${kind}`);
  await setDateRestriction(show.leadCrewId, driver.restriction);
  await pinClock(page, driver.clockDate);
  const r = await page.goto(`/show/${show.slug}/${show.shareToken}?s=today`, {
    waitUntil: "domcontentloaded",
  });
  if (r?.status() !== 200) {
    throw new Error(`right-now-transitions: navigate to ${show.slug} returned ${r?.status()}`);
  }
  // HTTP 200 alone is NOT state entry. The helper previously stopped here, so a
  // viewer whose resolution IGNORES the requested restriction still "arrived" and
  // the caller's anchor-text assertions could pass on a coincident render. Assert
  // the RENDERED discriminant the hero publishes (RightNowHero.tsx:507-510) so a
  // lost state fails loudly, naming both kinds.
  await assertRenderedState(page, kind);
}

/**
 * Assert the hero's rendered state kind matches `kind`.
 *
 * `data-state` is the RESOLVED state the production state machine computed for
 * this viewer — not an echo of anything the test requested — so it discriminates
 * "the viewer really entered this state" from "the page rendered something".
 */
export async function assertRenderedState(page: Page, kind: string): Promise<void> {
  const marker = page.getByTestId("right-now-hero").getByTestId("right-now-state");
  await expect(marker, `RightNow hero must render state kind "${kind}"`).toHaveAttribute(
    "data-state",
    kind,
    { timeout: 15_000 },
  );
}

/**
 * Drive a transition from the FROM kind (already rendered) to the TO
 * kind WITHOUT navigating away — mutate inputs and advance the clock
 * so the in-page setInterval picks up the new state.
 *
 * Strategy:
 *   1. Update the LEAD's `date_restriction` to the TO state's driver.
 *   2. Set the page's system time to the TO state's clock date.
 *   3. Run the clock for 70s so the 60s tick fires AND triggers the
 *      card's setNow() → re-derive state.
 *
 * Important: between FROM and TO renders, the TO state's
 * `date_restriction` is in the DB, but the page's React state still
 * holds the old value (pages re-fetch on navigation, not on tick).
 * This means our viewer-aware drivers cannot be exercised across the
 * tick alone — the React tree only re-derives state from `now`, not
 * from a fresh DB read. So the helper HANDLES TIME-DRIVEN transitions;
 * VIEWER-AWARE transitions (where the kind change is driven by a
 * date_restriction mutation, not a clock tick) require a navigation
 * to pick up the new restriction. The audit suite records which
 * transitions can be driven via tick-only and which require
 * navigation, but it is skipped, so neither group is exercised.
 */
export async function transitionTo(page: Page, toKind: string): Promise<void> {
  const driver = STATE_DRIVERS[toKind];
  if (!driver) throw new Error(`No driver for kind: ${toKind}`);
  await setSystemTime(page, driver.clockDate);
  await advanceClock(page);
}
