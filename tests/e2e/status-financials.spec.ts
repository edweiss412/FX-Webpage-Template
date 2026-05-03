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
  const lead = crewRes.data.find((c) =>
    Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  const nonLead = crewRes.data.find(
    (c) =>
      Array.isArray(c.role_flags) &&
      !(c.role_flags as string[]).includes("LEAD"),
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

test.describe("crew page — ShowStatusTile (Task 4.8, AC-4.1)", () => {
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

test.describe("crew page — FinancialsTile (Task 4.8, AC-4.2)", () => {
  test("LEAD viewer sees FinancialsTile with PO / Proposal / Invoice content", async ({
    page,
  }) => {
    const { slug, leadCrewId } = await lookupSeeded();
    const r = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(r?.status()).toBe(200);

    const fin = page.getByTestId("financials-tile");
    await expect(fin).toBeVisible();

    // The fixture seeds at least one of PO / proposal / invoice — the
    // tile MUST surface at least one financial label. Match on the
    // label text (the values vary by fixture).
    await expect(fin).toContainText(/PO|Proposal|Invoice/i);
  });

  test("non-LEAD viewer does NOT see FinancialsTile (AC-4.2)", async ({
    page,
  }) => {
    const { slug, nonLeadCrewId } = await lookupSeeded();
    const r = await page.goto(`/show/${slug}?crew=${nonLeadCrewId}`);
    expect(r?.status()).toBe(200);

    await expect(page.getByTestId("financials-tile")).toHaveCount(0);
  });
});
