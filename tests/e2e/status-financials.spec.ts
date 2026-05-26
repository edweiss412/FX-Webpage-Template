/**
 * Playwright E2E suite for ShowStatusTile + FinancialsTile (M4 Task 4.8;
 * spec §4.4, §8.1; closes AC-4.1 + AC-4.2).
 *
 * Two acceptance criteria, two tiles:
 *
 *   AC-4.1 — Show Status tile is visible to every crew viewer with COI.
 *            ShowStatusTile carries data-testid="show-status-tile" and
 *            data-testid="coi-status" inside it. The seeded Waldorf
 *            fixture has coi_status = "SENT" (verified at line 25 of
 *            fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md).
 *
 *   AC-4.2 — Financials tile is ONLY for LEAD viewers (and admins).
 *            Non-LEAD viewers see no FinancialsTile.
 *
 * The test runs against the Waldorf seed; we use the LEAD crew + a
 * non-LEAD crew (any non-LEAD row from the fixture).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

async function lookupSeeded(): Promise<{
  slug: string;
  showId: string;
  leadCrewId: string;
  nonLeadCrewId: string;
}> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(`status-financials.spec: seeded show not found`);
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, name, role_flags")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`status-financials.spec: no crew rows`);
  }
  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  const nonLead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && !(c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead || !nonLead) {
    throw new Error(
      `status-financials.spec: need both LEAD and non-LEAD crew. lead=${lead?.id ?? "none"}, nonLead=${nonLead?.id ?? "none"}`,
    );
  }
  return {
    slug: showRes.data.slug,
    showId,
    leadCrewId: lead.id as string,
    nonLeadCrewId: nonLead.id as string,
  };
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — ShowStatusTile (Task 4.8, AC-4.1)", () => {
  test("visible to every crew viewer with COI status", async ({ page }) => {
    const { slug, nonLeadCrewId } = await lookupSeeded();

    // A non-LEAD viewer (the AC-4.1 contract: every crew viewer sees
    // the COI status, not just LEADs).
    const r = await page.goto(`/show/${slug}?crew=${nonLeadCrewId}`);
    expect(r?.status()).toBe(200);

    const tile = page.getByTestId("show-status-tile");
    await expect(tile).toBeVisible();

    // The Waldorf fixture has coi_status = "SENT" at the source level
    // (fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md:25).
    // The tile MUST surface this value under data-testid="coi-status".
    const coi = tile.getByTestId("coi-status");
    await expect(coi).toBeVisible();
    await expect(coi).toContainText(/SENT|IN PROCESS/i);
  });
});

// FinancialsTile (Task 4.8, AC-4.2) E2E suite removed 2026-05-25 as fully redundant
// with `tests/visibility/scopeTiles.test.ts` (financialsVisible predicate matrix).
// See `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md`
// entry `M4-E2E-SUITES-MIGRATION` for the broader cleanup context.
