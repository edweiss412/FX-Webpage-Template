/**
 * Playwright E2E suite for the AVL scope tiles (M4 Task 4.6; spec §8.1).
 *
 * Asserts the canonical SCOPE_TILE_VISIBILITY_RULE end-to-end at the rendered
 * crew-page level. Predicates themselves are unit-tested at
 * tests/visibility/scopeTiles.test.ts; here we close the loop on
 * "predicate true → tile mounts in the DOM with content; predicate false
 * → tile is not in the DOM at all (whole-tile-missing reflow)".
 *
 * Six rendered cases, mirroring the unit-test matrix:
 *
 *   ['A1']        → audio visible; video + lighting hidden
 *   ['V1']        → video visible; audio + lighting hidden
 *   ['L1']        → lighting visible; audio + video hidden
 *   ['LEAD']      → audio + video visible; lighting hidden
 *   ['LEAD','A1'] → audio + video visible; lighting hidden
 *   ['LEAD','L1'] → audio + video + lighting visible (Lighting from L1)
 *
 * The seeded Waldorf show provides a LEAD crew member; we mutate their
 * `role_flags` between tests to drive each case, then revert in afterEach.
 * We also seed at least one room with non-null `audio` / `video` /
 * `lighting` strings so the empty-state branch doesn't swallow the
 * predicate-true assertion (the tile MUST render content, not the empty-
 * state placeholder).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

type SeededShow = {
  slug: string;
  showId: string;
  leadCrewId: string;
  /** Snapshot of the LEAD's original role_flags so afterAll can restore. */
  leadOriginalRoleFlags: string[];
  /** First room id, mutated to ensure every scope domain has content. */
  firstRoomId: string;
  /** Snapshot of the room's audio/video/lighting before mutation. */
  firstRoomOriginal: {
    audio: string | null;
    video: string | null;
    lighting: string | null;
  };
};

async function lookupSeeded(): Promise<SeededShow> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `scope-tiles.spec: seeded show not found (run \`pnpm db:seed\`).`,
    );
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, role_flags")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`scope-tiles.spec: no crew rows`);
  }
  const lead = crewRes.data.find(
    (c) =>
      Array.isArray(c.role_flags) &&
      (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) throw new Error(`scope-tiles.spec: no LEAD crew`);

  const roomsRes = await admin
    .from("rooms")
    .select("id, audio, video, lighting")
    .eq("show_id", showId)
    .limit(1);
  if (roomsRes.error || !roomsRes.data?.length) {
    throw new Error(
      `scope-tiles.spec: no rooms for show — Waldorf fixture must seed at least one`,
    );
  }
  const room = roomsRes.data[0];
  if (!room) throw new Error("scope-tiles.spec: room missing after limit");

  return {
    slug: showRes.data.slug,
    showId,
    leadCrewId: lead.id as string,
    leadOriginalRoleFlags: (lead.role_flags as string[]) ?? [],
    firstRoomId: room.id as string,
    firstRoomOriginal: {
      audio: (room.audio as string | null) ?? null,
      video: (room.video as string | null) ?? null,
      lighting: (room.lighting as string | null) ?? null,
    },
  };
}

async function setRoleFlags(crewId: string, flags: string[]): Promise<void> {
  const { error } = await admin
    .from("crew_members")
    .update({ role_flags: flags })
    .eq("id", crewId);
  if (error) {
    throw new Error(`scope-tiles.spec: setRoleFlags failed: ${error.message}`);
  }
}

async function ensureRoomContent(roomId: string): Promise<void> {
  // Stamp non-null audio/video/lighting strings so each predicate-true
  // case has content to render (and the empty-state branch doesn't fire).
  // The strings include their domain name so a content-substring check
  // proves the right tile is rendering.
  const { error } = await admin
    .from("rooms")
    .update({
      audio: "Audio: QSC K12.2 mains, 4x SM58, AB168 snake",
      video: "Video: 1x 4K projector, comfort monitors",
      lighting: "Lighting: stage wash, 4x LED uplight",
    })
    .eq("id", roomId);
  if (error) {
    throw new Error(
      `scope-tiles.spec: ensureRoomContent failed: ${error.message}`,
    );
  }
}

async function restoreRoomContent(
  roomId: string,
  original: SeededShow["firstRoomOriginal"],
): Promise<void> {
  const { error } = await admin.from("rooms").update(original).eq("id", roomId);
  if (error) {
    throw new Error(
      `scope-tiles.spec: restoreRoomContent failed: ${error.message}`,
    );
  }
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — AVL scope tiles (Task 4.6, §8.1)", () => {
  let seeded: SeededShow;

  test.beforeAll(async () => {
    seeded = await lookupSeeded();
    await ensureRoomContent(seeded.firstRoomId);
  });

  test.afterAll(async () => {
    await setRoleFlags(seeded.leadCrewId, seeded.leadOriginalRoleFlags);
    await restoreRoomContent(seeded.firstRoomId, seeded.firstRoomOriginal);
  });

  test("['A1'] viewer → Audio visible; Video + Lighting hidden", async ({
    page,
  }) => {
    await setRoleFlags(seeded.leadCrewId, ["A1"]);
    const r = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(r?.status()).toBe(200);

    await expect(page.getByTestId("audio-scope-tile")).toBeVisible();
    await expect(page.getByTestId("audio-scope-tile")).toContainText(/Audio:/);
    await expect(page.getByTestId("video-scope-tile")).toHaveCount(0);
    await expect(page.getByTestId("lighting-scope-tile")).toHaveCount(0);
  });

  test("['V1'] viewer → Video visible; Audio + Lighting hidden", async ({
    page,
  }) => {
    await setRoleFlags(seeded.leadCrewId, ["V1"]);
    const r = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(r?.status()).toBe(200);

    await expect(page.getByTestId("video-scope-tile")).toBeVisible();
    await expect(page.getByTestId("video-scope-tile")).toContainText(/Video:/);
    await expect(page.getByTestId("audio-scope-tile")).toHaveCount(0);
    await expect(page.getByTestId("lighting-scope-tile")).toHaveCount(0);
  });

  test("['L1'] viewer → Lighting visible; Audio + Video hidden", async ({
    page,
  }) => {
    await setRoleFlags(seeded.leadCrewId, ["L1"]);
    const r = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(r?.status()).toBe(200);

    await expect(page.getByTestId("lighting-scope-tile")).toBeVisible();
    await expect(page.getByTestId("lighting-scope-tile")).toContainText(
      /Lighting:/,
    );
    await expect(page.getByTestId("audio-scope-tile")).toHaveCount(0);
    await expect(page.getByTestId("video-scope-tile")).toHaveCount(0);
  });

  test("['LEAD'] viewer → Audio + Video visible; Lighting hidden", async ({
    page,
  }) => {
    await setRoleFlags(seeded.leadCrewId, ["LEAD"]);
    const r = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(r?.status()).toBe(200);

    await expect(page.getByTestId("audio-scope-tile")).toBeVisible();
    await expect(page.getByTestId("video-scope-tile")).toBeVisible();
    await expect(page.getByTestId("lighting-scope-tile")).toHaveCount(0);
  });

  test("['LEAD','A1'] compound viewer → Audio + Video visible; Lighting hidden", async ({
    page,
  }) => {
    await setRoleFlags(seeded.leadCrewId, ["LEAD", "A1"]);
    const r = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(r?.status()).toBe(200);

    await expect(page.getByTestId("audio-scope-tile")).toBeVisible();
    await expect(page.getByTestId("video-scope-tile")).toBeVisible();
    await expect(page.getByTestId("lighting-scope-tile")).toHaveCount(0);
  });

  test("['LEAD','L1'] compound viewer → Audio + Video + Lighting visible (Lighting from L1)", async ({
    page,
  }) => {
    await setRoleFlags(seeded.leadCrewId, ["LEAD", "L1"]);
    const r = await page.goto(`/show/${seeded.slug}?crew=${seeded.leadCrewId}`);
    expect(r?.status()).toBe(200);

    await expect(page.getByTestId("audio-scope-tile")).toBeVisible();
    await expect(page.getByTestId("video-scope-tile")).toBeVisible();
    await expect(page.getByTestId("lighting-scope-tile")).toBeVisible();
  });
});
