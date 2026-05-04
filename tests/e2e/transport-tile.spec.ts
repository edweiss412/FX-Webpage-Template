/**
 * Playwright E2E suite for TransportTile (M4 Task 4.7; spec §8.1).
 *
 * Visibility branches per the canonical predicate
 * (lib/visibility/scopeTiles.ts:transportTileVisible):
 *
 *   1. driver_name === viewerName            → tile renders
 *   2. viewerName ∈ schedule[*].assigned_names → tile renders (even when
 *                                              driver_name does NOT match)
 *   3. Both branches true                    → tile renders ONCE
 *   4. Neither branch true                   → tile absent
 *
 * Plus: end-to-end `assigned_names: string[]` contract assertion. The
 * Waldorf seed corpus does NOT necessarily include a transportation row
 * with assigned_names tagged (the LEAD-only fixture varies); we seed our
 * own transportation row directly via the service-role client to drive
 * each branch deterministically. The pre-existing transportation row (if
 * any) is snapshotted in beforeAll and restored in afterAll.
 *
 * Three crew identities used:
 *   - leadCrewId       — LEAD; rename via DB so name === driver_name for
 *                        branch 1.
 *   - secondCrewId     — non-LEAD; rename so name appears in
 *                        schedule[0].assigned_names for branch 2.
 *   - thirdCrewId      — non-LEAD; name appears NOWHERE in transportation;
 *                        for the negative-control branch (tile absent).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

// Sentinel names used in our seeded transportation row. These are
// deliberately not real names from the Waldorf fixture; the test
// renames a small set of crew rows to these sentinels so the visibility
// branches are isolated from any pre-existing fixture data.
const DRIVER_SENTINEL = "TestDriver-Cara-XYZ";
const PASSENGER_SENTINEL = "TestPassenger-Alice-XYZ";
const UNRELATED_SENTINEL = "TestUnrelated-Bob-XYZ";

type SeededRefs = {
  slug: string;
  showId: string;
  // Three crew member ids whose names we'll temporarily rename to the
  // sentinels above. We snapshot the originals to restore on teardown.
  driverCrew: { id: string; originalName: string; originalRoleFlags: string[] };
  passengerCrew: { id: string; originalName: string; originalRoleFlags: string[] };
  unrelatedCrew: { id: string; originalName: string; originalRoleFlags: string[] };
  /**
   * Snapshot of the show's pre-existing transportation row (if any) so
   * afterAll can restore. null if the show had no row.
   */
  originalTransport:
    | {
        driver_name: string | null;
        driver_phone: string | null;
        driver_email: string | null;
        vehicle: string | null;
        license_plate: string | null;
        color: string | null;
        parking: string | null;
        schedule: unknown;
        notes: string | null;
      }
    | null;
};

async function snapshotAndPrepare(): Promise<SeededRefs> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(`transport-tile.spec: seeded show not found`);
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, name, role_flags")
    .eq("show_id", showId)
    .order("name", { ascending: true });
  if (crewRes.error || !crewRes.data || crewRes.data.length < 3) {
    throw new Error(
      `transport-tile.spec: need at least 3 crew rows, got ${crewRes.data?.length ?? 0}`,
    );
  }
  const [c1, c2, c3] = crewRes.data;
  if (!c1 || !c2 || !c3) {
    throw new Error("transport-tile.spec: destructure invariant broken");
  }
  // Note: this suite renames + temporarily strips LEAD from these three
  // crew rows; restoreState() in afterAll restores both name AND
  // role_flags. Single-worker serialization (playwright.config.ts
  // workers: 1) ensures other suites don't see the half-restored state.

  // Snapshot existing transportation row (if any).
  const transRes = await admin
    .from("transportation")
    .select("*")
    .eq("show_id", showId)
    .maybeSingle();
  if (transRes.error) {
    throw new Error(
      `transport-tile.spec: transportation snapshot failed: ${transRes.error.message}`,
    );
  }
  const originalTransport = transRes.data
    ? {
        driver_name: (transRes.data.driver_name as string | null) ?? null,
        driver_phone: (transRes.data.driver_phone as string | null) ?? null,
        driver_email: (transRes.data.driver_email as string | null) ?? null,
        vehicle: (transRes.data.vehicle as string | null) ?? null,
        license_plate: (transRes.data.license_plate as string | null) ?? null,
        color: (transRes.data.color as string | null) ?? null,
        parking: (transRes.data.parking as string | null) ?? null,
        schedule: transRes.data.schedule,
        notes: (transRes.data.notes as string | null) ?? null,
      }
    : null;

  return {
    slug: showRes.data.slug,
    showId,
    driverCrew: {
      id: c1.id as string,
      originalName: c1.name as string,
      originalRoleFlags: (c1.role_flags as string[]) ?? [],
    },
    passengerCrew: {
      id: c2.id as string,
      originalName: c2.name as string,
      originalRoleFlags: (c2.role_flags as string[]) ?? [],
    },
    unrelatedCrew: {
      id: c3.id as string,
      originalName: c3.name as string,
      originalRoleFlags: (c3.role_flags as string[]) ?? [],
    },
    originalTransport,
  };
}

async function applyTestState(seeded: SeededRefs): Promise<void> {
  // Rename crew to sentinels (we keep their role_flags intact aside from
  // stripping LEAD so financials gating is not implicated).
  const stripLead = (flags: string[]) => flags.filter((f) => f !== "LEAD");
  const updates = [
    { id: seeded.driverCrew.id, name: DRIVER_SENTINEL, role_flags: stripLead(seeded.driverCrew.originalRoleFlags) },
    { id: seeded.passengerCrew.id, name: PASSENGER_SENTINEL, role_flags: stripLead(seeded.passengerCrew.originalRoleFlags) },
    { id: seeded.unrelatedCrew.id, name: UNRELATED_SENTINEL, role_flags: stripLead(seeded.unrelatedCrew.originalRoleFlags) },
  ];
  for (const u of updates) {
    const { error } = await admin
      .from("crew_members")
      .update({ name: u.name, role_flags: u.role_flags })
      .eq("id", u.id);
    if (error) throw new Error(`crew rename failed: ${error.message}`);
  }

  // Upsert transportation row: driver === DRIVER_SENTINEL; one schedule
  // leg names PASSENGER_SENTINEL only (not the driver name, not the
  // unrelated). This deterministically isolates branch 1 (driver match)
  // and branch 2 (assigned_names match) on different crew identities.
  const transportRow = {
    show_id: seeded.showId,
    driver_name: DRIVER_SENTINEL,
    driver_phone: null,
    driver_email: null,
    vehicle: "Sprinter (test)",
    license_plate: "TEST-XYZ",
    color: "Black",
    parking: "Lot B",
    schedule: [
      {
        stage: "Travel In",
        date: "2026-06-01",
        time: "09:00",
        assigned_names: [PASSENGER_SENTINEL],
      },
    ],
    notes: null,
  };
  // Delete any existing row first so upsert doesn't have to deal with
  // unique-constraint conflicts.
  await admin.from("transportation").delete().eq("show_id", seeded.showId);
  const { error } = await admin.from("transportation").insert(transportRow);
  if (error) throw new Error(`transportation insert failed: ${error.message}`);
}

async function restoreState(seeded: SeededRefs): Promise<void> {
  // Restore crew names + role_flags.
  for (const c of [seeded.driverCrew, seeded.passengerCrew, seeded.unrelatedCrew]) {
    await admin
      .from("crew_members")
      .update({ name: c.originalName, role_flags: c.originalRoleFlags })
      .eq("id", c.id);
  }
  // Restore transportation row.
  await admin.from("transportation").delete().eq("show_id", seeded.showId);
  if (seeded.originalTransport) {
    await admin
      .from("transportation")
      .insert({ show_id: seeded.showId, ...seeded.originalTransport });
  }
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — TransportTile (Task 4.7, §8.1)", () => {
  let seeded: SeededRefs;

  test.beforeAll(async () => {
    seeded = await snapshotAndPrepare();
    await applyTestState(seeded);
  });

  test.afterAll(async () => {
    await restoreState(seeded);
  });

  test("branch 1: viewer is driver (driver_name === viewerName) → TransportTile renders", async ({
    page,
  }) => {
    const r = await page.goto(
      `/show/${seeded.slug}?crew=${seeded.driverCrew.id}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("transport-tile")).toBeVisible();
    // Driver-specific data should appear (vehicle name).
    await expect(page.getByTestId("transport-tile")).toContainText(
      /Sprinter \(test\)/,
    );
  });

  test("branch 2: viewer is assigned passenger (driver_name does NOT match) → TransportTile renders", async ({
    page,
  }) => {
    const r = await page.goto(
      `/show/${seeded.slug}?crew=${seeded.passengerCrew.id}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("transport-tile")).toBeVisible();
    // Assigned-name should appear in the rendered schedule row.
    await expect(page.getByTestId("transport-tile")).toContainText(
      PASSENGER_SENTINEL,
    );
  });

  test("neither branch: viewer is unrelated → TransportTile absent (whole-tile-missing)", async ({
    page,
  }) => {
    const r = await page.goto(
      `/show/${seeded.slug}?crew=${seeded.unrelatedCrew.id}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("transport-tile")).toHaveCount(0);
  });

  test("end-to-end assigned_names contract: getShowForViewer projects schedule[0].assigned_names verbatim", async ({
    page,
  }) => {
    // Render as the passenger so the tile is mounted; then assert that
    // the passenger sentinel appears verbatim in the rendered DOM. This
    // proves the contract end-to-end:
    //   parser → seed → DB → getShowForViewer projection → tile DOM.
    // The same string that's in transportation.schedule[0].assigned_names
    // must appear inside the tile.
    await page.goto(`/show/${seeded.slug}?crew=${seeded.passengerCrew.id}`);
    const tile = page.getByTestId("transport-tile");
    await expect(tile).toBeVisible();

    // Per-row assertion: at least one transport-schedule-row contains
    // the passenger sentinel.
    const rows = tile.getByTestId("transport-schedule-row");
    await expect(rows).not.toHaveCount(0);
    const matchingRow = rows.filter({ hasText: PASSENGER_SENTINEL });
    await expect(matchingRow).toHaveCount(1);
  });
});
