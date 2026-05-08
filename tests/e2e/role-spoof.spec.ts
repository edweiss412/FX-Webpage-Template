/**
 * Playwright E2E suite for the role-spoof regression (M4 Task 4.8 — closes
 * the deferred Task 4.2 carve-out; spec §7.4 identity-only mock contract).
 *
 * The plan preamble (line 179) says: "?role= is ignored even if present —
 * a regression test asserts ?role=lead cannot unlock financials when the
 * bound crew row's role_flags don't include LEAD." The static-analysis
 * form of this contract lives at tests/data/show-page-role-spoof.test.ts;
 * THIS file is the runtime form that proves the same contract end-to-end
 * by hitting the live page with each spoof attempt and asserting the
 * privileged surface is NOT unlocked.
 *
 * Four cases:
 *
 *   1. ?role=lead does NOT unlock FinancialsTile when crew row is
 *      non-LEAD (negative — the spoof attempt must be ignored).
 *   2. ?role=admin does NOT unlock admin path when ?as= is not 'admin'
 *      (negative — only ?as=admin admits admin).
 *   3. Real LEAD viewer (?crew=<lead-id>, no role param) DOES see
 *      FinancialsTile (positive control).
 *   4. Real admin viewer (?as=admin) DOES see FinancialsTile (positive
 *      control).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

async function lookupSeeded(): Promise<{
  slug: string;
  leadCrewId: string;
  nonLeadCrewId: string;
}> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(`role-spoof.spec: seeded show not found`);
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin.from("crew_members").select("id, role_flags").eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`role-spoof.spec: no crew rows`);
  }
  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  const nonLead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && !(c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead || !nonLead) {
    throw new Error(
      `role-spoof.spec: need both LEAD and non-LEAD crew rows; got lead=${lead?.id ?? "none"}, nonLead=${nonLead?.id ?? "none"}`,
    );
  }
  return {
    slug: showRes.data.slug,
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
test.describe.skip("crew page — role-spoof regression (Task 4.8, §7.4)", () => {
  test("?role=lead does NOT unlock FinancialsTile when crew row is non-LEAD", async ({ page }) => {
    const { slug, nonLeadCrewId } = await lookupSeeded();
    // Spoof attempt: a non-LEAD crew member appends ?role=lead. The page
    // MUST IGNORE the role param entirely (it reads only ?crew and ?as)
    // and re-derive role_flags from the crew row, which does not contain
    // LEAD. FinancialsTile must NOT mount.
    await page.goto(`/show/${slug}?crew=${nonLeadCrewId}&role=lead`);
    await expect(page.getByTestId("financials-tile")).toHaveCount(0);
  });

  test("?role=admin does NOT unlock admin path when ?as= is not 'admin'", async ({ page }) => {
    const { slug, nonLeadCrewId } = await lookupSeeded();
    // Spoof attempt: a non-LEAD crew member appends ?role=admin. Same
    // contract as above — the role param is ignored, only ?as=admin
    // would admit admin (and we don't pass it). FinancialsTile must NOT
    // mount.
    await page.goto(`/show/${slug}?crew=${nonLeadCrewId}&role=admin`);
    await expect(page.getByTestId("financials-tile")).toHaveCount(0);
  });

  test("real LEAD viewer DOES see FinancialsTile (positive control)", async ({ page }) => {
    const { slug, leadCrewId } = await lookupSeeded();
    await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
  });

  test("real admin viewer DOES see FinancialsTile (positive control)", async ({ page }) => {
    const { slug } = await lookupSeeded();
    await page.goto(`/show/${slug}?as=admin`);
    await expect(page.getByTestId("financials-tile")).toBeVisible();
  });
});
