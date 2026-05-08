/**
 * Playwright E2E suite for RightNowCard (M4 Task 4.11; spec §8.2;
 * AC-4.3).
 *
 * AC-4.3 verbatim: "Right Now card renders the correct state for a
 * synthesized 'today is Show Day 1' fixture, including the viewer-aware
 * states (`viewer_off_day`, `viewer_after_last_day`, `viewer_unconfirmed`)."
 *
 * Strategy:
 *
 *   • Pin wall-clock `Date.now()` on the CLIENT via
 *     `page.addInitScript`. The card is a `'use client'` island that
 *     calls `new Date()` inside `useState` initializer — addInitScript
 *     runs BEFORE any page JS, so the pinned clock is what the island
 *     observes on first paint.
 *   • Mutate the LEAD viewer's `date_restriction` JSONB directly via
 *     the service-role client to flip viewer-aware branches.
 *   • Snapshot + restore in beforeAll/afterAll. Single-worker
 *     serialization (playwright.config.ts) prevents inter-suite races.
 *
 * The Waldorf seed has dates:
 *   travelIn: 2026-04-19
 *   set:      2026-04-20
 *   showDays: [2026-04-21, 2026-04-22]
 *   travelOut: 2026-04-23
 *
 * Show Day 1 is 2026-04-21. We pin clock to noon UTC on that date so
 * `Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })`
 * resolves to '2026-04-21' regardless of DST quirks.
 */
import { test, expect, type Page } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

type SeededShow = {
  slug: string;
  showId: string;
  leadCrewId: string;
  leadOriginalDateRestriction: unknown;
};

async function lookupSeededShow(): Promise<SeededShow> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `right-now.spec: seeded show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}`,
    );
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, name, role_flags, date_restriction")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`right-now.spec: no crew rows for slug=${showRes.data.slug}`);
  }
  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) {
    throw new Error(`right-now.spec: no LEAD crew member for slug=${showRes.data.slug}`);
  }

  return {
    slug: showRes.data.slug,
    showId,
    leadCrewId: lead.id as string,
    leadOriginalDateRestriction: lead.date_restriction,
  };
}

async function setDateRestriction(leadCrewId: string, restriction: unknown): Promise<void> {
  const { error } = await admin
    .from("crew_members")
    .update({ date_restriction: restriction })
    .eq("id", leadCrewId);
  if (error) throw new Error(`right-now.spec: update date_restriction failed: ${error.message}`);
}

/**
 * Pin wall-clock `Date.now()` AND `new Date()` on the client to a
 * fixed instant. The shim wraps the native Date constructor so
 * `new Date()` (no args) returns the pinned moment, while
 * `new Date('2026-04-21')` etc. still parse correctly. The card's
 * island calls `new Date()` inside useState initializer.
 */
async function pinClock(page: Page, isoUtc: string): Promise<void> {
  const fixed = new Date(isoUtc).getTime();
  await page.addInitScript((millis) => {
    const NativeDate = Date;
    // Wrap so `new Date()` with NO args returns the pinned instant;
    // every other usage delegates to native Date.
    function FixedDate(this: unknown, ...args: unknown[]): Date | string {
      if (!(this instanceof FixedDate)) {
        // Called as a function — return string per Date() spec, with
        // pinned time if no args.
        return args.length === 0
          ? new NativeDate(millis).toString()
          : new (NativeDate as unknown as new (...a: unknown[]) => Date)(...args).toString();
      }
      if (args.length === 0) {
        return new NativeDate(millis);
      }
      return new (NativeDate as unknown as new (...a: unknown[]) => Date)(...args);
    }
    // Inherit static methods (UTC, parse, now).
    FixedDate.now = () => millis;
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    FixedDate.prototype = NativeDate.prototype;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Date = FixedDate;
  }, fixed);
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — RightNowCard (Task 4.11, AC-4.3)", () => {
  let s: SeededShow;

  test.beforeAll(async () => {
    s = await lookupSeededShow();
  });

  test.afterAll(async () => {
    // Restore the LEAD's original date_restriction.
    await setDateRestriction(s.leadCrewId, s.leadOriginalDateRestriction);
  });

  test.beforeEach(async () => {
    // Default to no restriction so each test sets the branch it needs.
    await setDateRestriction(s.leadCrewId, { kind: "none", days: null });
  });

  test("AC-4.3 unrestricted Show Day 1 → 'Today: Show day 1 of 2'", async ({ page }) => {
    // Pin clock to 2026-04-21 noon UTC (= morning EDT). Show Day 1.
    await pinClock(page, "2026-04-21T12:00:00Z");
    await setDateRestriction(s.leadCrewId, { kind: "none", days: null });

    const r = await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    expect(r?.status()).toBe(200);

    const card = page.getByTestId("right-now-card");
    await expect(card).toBeVisible();
    const stateMarker = card.getByTestId("right-now-state");
    await expect(stateMarker).toHaveAttribute("data-state", "show_day_n");
    await expect(card.getByTestId("right-now-lead")).toContainText("Today: Show day 1 of 2");
  });

  test("AC-4.3 viewer_unconfirmed (asterisk) on Show Day 1 → unconfirmed copy, NOT show_day", async ({
    page,
  }) => {
    await pinClock(page, "2026-04-21T12:00:00Z");
    // Mark the LEAD as unknown_asterisk; precedence rule says this
    // beats the show-wide show_day_n state.
    await setDateRestriction(s.leadCrewId, {
      kind: "unknown_asterisk",
      days: null,
    });

    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);

    const card = page.getByTestId("right-now-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("right-now-state")).toHaveAttribute(
      "data-state",
      "viewer_unconfirmed",
    );
    await expect(card.getByTestId("right-now-lead")).toContainText(/aren['’]t confirmed yet/);
  });

  test("AC-4.3 viewer_off_day → 'Not scheduled today' + next assigned day", async ({ page }) => {
    // Pin to Show Day 1 (2026-04-21). LEAD is restricted to Show Day 2
    // only (2026-04-22). Today is NOT in days; today < max(days);
    // today is within span [travelIn 04-19, travelOut 04-23].
    await pinClock(page, "2026-04-21T12:00:00Z");
    await setDateRestriction(s.leadCrewId, {
      kind: "explicit",
      days: ["2026-04-22"],
    });

    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);

    const card = page.getByTestId("right-now-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("right-now-state")).toHaveAttribute(
      "data-state",
      "viewer_off_day",
    );
    await expect(card.getByTestId("right-now-lead")).toContainText("Not scheduled today");
    // The detail line must mention the next assigned day.
    await expect(card.getByTestId("right-now-detail")).toContainText(/next assigned day/i);
  });

  test("AC-4.3 viewer_after_last_day → 'Your assignment is complete' (precedence over viewer_off_day)", async ({
    page,
  }) => {
    // Pin to Show Day 2 (2026-04-22) AFTER the LEAD's only assigned
    // day (Show Day 1, 2026-04-21). The viewer_after_last_day branch
    // must fire BEFORE viewer_off_day (regression rule per §8.2).
    await pinClock(page, "2026-04-22T12:00:00Z");
    await setDateRestriction(s.leadCrewId, {
      kind: "explicit",
      days: ["2026-04-21"],
    });

    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);

    const card = page.getByTestId("right-now-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("right-now-state")).toHaveAttribute(
      "data-state",
      "viewer_after_last_day",
    );
    await expect(card.getByTestId("right-now-lead")).toContainText("Your assignment is complete");
  });
});
