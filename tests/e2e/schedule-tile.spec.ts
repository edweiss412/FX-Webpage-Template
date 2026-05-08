/**
 * Playwright E2E suite for the ScheduleTile (M4 Task 4.5; spec §8.1, AC-4.6).
 *
 * Three branches asserted, one per `crew_members.date_restriction.kind`:
 *
 *   1. unknown_asterisk  → tile renders the "days not confirmed" placeholder;
 *                          ZERO `[data-testid=schedule-day]` rows present.
 *                          (AC-4.6 — the asterisk row from a v4 sheet means
 *                          the operator hasn't told us which days the crew
 *                          member is staffed for.)
 *   2. explicit          → tile renders ONLY the days listed in
 *                          date_restriction.days[]; other show.dates entries
 *                          are absent.
 *   3. none              → tile renders ALL show.dates entries (travelIn,
 *                          set, every showDays[*], travelOut).
 *
 * The seeded Waldorf show provides:
 *   - LEAD viewer (John Carleo) with `date_restriction.kind = 'none'` (the
 *     v4 fixture seeds LEAD as unrestricted; verified by inspecting the
 *     parser output via the seed pipeline).
 *
 * For the explicit + unknown_asterisk branches we MUTATE the LEAD viewer's
 * date_restriction column directly via the service-role client immediately
 * before navigating, then revert in afterEach. This is the same in-test
 * mutation pattern used by tests/e2e/admin-dev.spec.ts and is the
 * minimum-surface way to exercise all three branches without seeding three
 * separate fixture shows.
 *
 * IMPORTANT: this file deliberately runs ONLY under the `mobile-safari`
 * project (testMatch in playwright.config.ts is updated to include this
 * spec). Desktop assertions are Task 4.13's job.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

type SeededShow = {
  slug: string;
  showId: string;
  leadCrewId: string;
  /** All show.dates entries (travelIn + set + showDays + travelOut) sorted ASC, deduped, non-null. */
  allDates: string[];
};

async function lookupSeededShow(): Promise<SeededShow> {
  const showRes = await admin
    .from("shows")
    .select("id, slug, dates")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `schedule-tile.spec: seeded show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${showRes.error?.message ?? "no row"}`,
    );
  }
  const showId = showRes.data.id as string;
  const dates = showRes.data.dates as {
    travelIn: string | null;
    set: string | null;
    showDays: string[];
    travelOut: string | null;
  } | null;

  const all = new Set<string>();
  if (dates?.travelIn) all.add(dates.travelIn);
  if (dates?.set) all.add(dates.set);
  for (const d of dates?.showDays ?? []) {
    if (d) all.add(d);
  }
  if (dates?.travelOut) all.add(dates.travelOut);
  const allDates = [...all].sort();

  if (allDates.length === 0) {
    throw new Error(`schedule-tile.spec: Waldorf fixture must have at least one show date — got 0`);
  }

  const crewRes = await admin
    .from("crew_members")
    .select("id, name, role_flags, date_restriction")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`schedule-tile.spec: no crew rows for slug=${showRes.data.slug}`);
  }
  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) {
    throw new Error(`schedule-tile.spec: no LEAD crew member for slug=${showRes.data.slug}`);
  }

  return {
    slug: showRes.data.slug,
    showId,
    leadCrewId: lead.id as string,
    allDates,
  };
}

/** Set the lead crew member's date_restriction JSONB. */
async function setDateRestriction(
  leadCrewId: string,
  restriction:
    | { kind: "explicit"; days: string[] }
    | { kind: "unknown_asterisk"; days: null }
    | { kind: "none" },
): Promise<void> {
  const { error } = await admin
    .from("crew_members")
    .update({ date_restriction: restriction })
    .eq("id", leadCrewId);
  if (error) {
    throw new Error(`schedule-tile.spec: failed to update date_restriction: ${error.message}`);
  }
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — ScheduleTile (Task 4.5, AC-4.6)", () => {
  let seeded: SeededShow;

  test.beforeAll(async () => {
    seeded = await lookupSeededShow();
  });

  test.afterEach(async () => {
    // Always restore to 'none' so the next test (and the rest of the
    // crew-page suite) sees the clean state.
    await setDateRestriction(seeded.leadCrewId, { kind: "none" });
  });

  test("unknown_asterisk crew sees days-unconfirmed placeholder, NO per-day schedule (AC-4.6)", async ({
    page,
  }) => {
    await setDateRestriction(seeded.leadCrewId, {
      kind: "unknown_asterisk",
      days: null,
    });

    const response = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(response?.status()).toBe(200);

    const tile = page.getByTestId("schedule-tile");
    await expect(tile).toBeVisible();

    // The unconfirmed-days placeholder MUST mention that days haven't
    // been confirmed (PRODUCT.md voice — direct, plain language). The
    // exact copy is the tile's choice; the contract is the testid +
    // the substring.
    await expect(tile.getByTestId("schedule-day-unconfirmed")).toBeVisible();
    await expect(tile.getByTestId("schedule-day-unconfirmed")).toContainText(
      /haven't been confirmed|aren't confirmed|hasn't been confirmed|pending/i,
    );

    // ZERO per-day rows — the tile MUST NOT leak which days the show is
    // on while the viewer's days are unknown.
    await expect(tile.getByTestId("schedule-day")).toHaveCount(0);
  });

  test("explicit-day crew sees ONLY their days", async ({ page }) => {
    // Pick the first show date as the lone restricted day. The fixture
    // has 4+ dates; restricting to one ensures the assertion can prove
    // the tile filters down (count === 1, not all).
    const onlyDay = seeded.allDates[0];
    if (!onlyDay) throw new Error("seeded.allDates empty — fixture invariant broken");
    await setDateRestriction(seeded.leadCrewId, {
      kind: "explicit",
      days: [onlyDay],
    });

    const response = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(response?.status()).toBe(200);

    const tile = page.getByTestId("schedule-tile");
    await expect(tile).toBeVisible();
    await expect(tile.getByTestId("schedule-day-unconfirmed")).toHaveCount(0);

    const dayRows = tile.getByTestId("schedule-day");
    await expect(dayRows).toHaveCount(1);
    // The rendered row carries data-day="<ISO>" so the test can pin the
    // identity of the rendered day — content-text alone (e.g., "Apr 15")
    // is locale-formatted and noisy.
    await expect(dayRows.first()).toHaveAttribute("data-day", onlyDay);
  });

  test("unrestricted crew (kind: 'none') sees ALL show days", async ({ page }) => {
    await setDateRestriction(seeded.leadCrewId, { kind: "none" });

    const response = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(response?.status()).toBe(200);

    const tile = page.getByTestId("schedule-tile");
    await expect(tile).toBeVisible();
    await expect(tile.getByTestId("schedule-day-unconfirmed")).toHaveCount(0);

    const dayRows = tile.getByTestId("schedule-day");
    await expect(dayRows).toHaveCount(seeded.allDates.length);

    // Each row's data-day attribute MUST appear in the seeded date list.
    const renderedDays = await dayRows.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-day")),
    );
    for (const d of renderedDays) {
      expect(seeded.allDates).toContain(d);
    }
  });
});
