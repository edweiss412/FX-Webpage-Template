/**
 * Playwright E2E suite for NotesTile (M4 Task 4.10; spec §8.1).
 *
 * The Waldorf seed already populates 4 notes sources:
 *   - venue.notes
 *   - 3× contacts[*].notes
 * We assert tile visibility + per-source rendering against this
 * baseline. Then we mutate the show to:
 *   - Inject hotel/room/transport notes (4-source matrix coverage).
 *   - Inject a >280-char note (truncation branch).
 *   - Inject 10 synthetic contact notes (cardinality cap branch).
 *   - Strip every notes source (whole-tile-missing branch).
 *
 * Restoration: original notes are snapshotted in beforeAll and
 * restored in afterAll. Per-test mutations restore in the next test's
 * beforeEach (which re-applies the snapshot).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

type Snapshot = {
  slug: string;
  showId: string;
  leadCrewId: string;
  /** Original venue JSONB on shows (verbatim). */
  originalVenue: unknown;
  /** Original hotel reservations (snapshot full rows). */
  originalHotels: Array<{ id: string; notes: string | null }>;
  /** Original room rows. */
  originalRooms: Array<{ id: string; notes: string | null }>;
  /** Original transportation row (notes only). */
  originalTransportNotes: string | null;
  /** Original contacts. */
  originalContacts: Array<{
    show_id: string;
    kind: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>;
};

async function snapshot(): Promise<Snapshot> {
  const showRes = await admin
    .from("shows")
    .select("id, slug, venue")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(`notes-tile.spec: seed show not found`);
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin.from("crew_members").select("id, role_flags").eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`notes-tile.spec: no crew rows`);
  }
  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) throw new Error(`notes-tile.spec: no LEAD`);

  const hotelRes = await admin.from("hotel_reservations").select("id, notes").eq("show_id", showId);
  if (hotelRes.error) throw new Error(hotelRes.error.message);

  const roomsRes = await admin.from("rooms").select("id, notes").eq("show_id", showId);
  if (roomsRes.error) throw new Error(roomsRes.error.message);

  const transRes = await admin
    .from("transportation")
    .select("notes")
    .eq("show_id", showId)
    .maybeSingle();
  if (transRes.error) throw new Error(transRes.error.message);

  const contactsRes = await admin
    .from("contacts")
    .select("show_id, kind, name, email, phone, notes")
    .eq("show_id", showId);
  if (contactsRes.error) throw new Error(contactsRes.error.message);

  return {
    slug: showRes.data.slug as string,
    showId,
    leadCrewId: lead.id as string,
    originalVenue: showRes.data.venue,
    originalHotels: (hotelRes.data ?? []).map((h) => ({
      id: h.id as string,
      notes: (h.notes as string | null) ?? null,
    })),
    originalRooms: (roomsRes.data ?? []).map((r) => ({
      id: r.id as string,
      notes: (r.notes as string | null) ?? null,
    })),
    originalTransportNotes: (transRes.data?.notes as string | null) ?? null,
    originalContacts: (contactsRes.data ?? []).map((c) => ({
      show_id: c.show_id as string,
      kind: c.kind as string,
      name: (c.name as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      notes: (c.notes as string | null) ?? null,
    })),
  };
}

async function applySnapshot(s: Snapshot): Promise<void> {
  // Restore venue JSONB.
  await admin.from("shows").update({ venue: s.originalVenue }).eq("id", s.showId);

  // Restore hotel notes.
  for (const h of s.originalHotels) {
    await admin.from("hotel_reservations").update({ notes: h.notes }).eq("id", h.id);
  }

  // Restore room notes.
  for (const r of s.originalRooms) {
    await admin.from("rooms").update({ notes: r.notes }).eq("id", r.id);
  }

  // Restore transport notes (only if a row exists).
  await admin
    .from("transportation")
    .update({ notes: s.originalTransportNotes })
    .eq("show_id", s.showId);

  // Restore contacts: delete-and-reinsert so we don't leak synthetic
  // rows from the cardinality-cap test.
  await admin.from("contacts").delete().eq("show_id", s.showId);
  if (s.originalContacts.length > 0) {
    await admin.from("contacts").insert(s.originalContacts);
  }
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — NotesTile (Task 4.10, §8.1)", () => {
  let s: Snapshot;

  test.beforeAll(async () => {
    s = await snapshot();
  });

  test.afterAll(async () => {
    await applySnapshot(s);
  });

  test.beforeEach(async () => {
    // Reset to baseline before each test so mutations don't leak.
    await applySnapshot(s);
  });

  test("renders tile with notes from seeded fixture (venue + 3 contacts → 4 sources)", async ({
    page,
  }) => {
    const r = await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    expect(r?.status()).toBe(200);
    const tile = page.getByTestId("notes-tile");
    await expect(tile).toBeVisible();
    // The seeded Waldorf fixture has venue.notes + 3 contact.notes.
    // The tile aggregates all four; assert at least 4 items rendered
    // (other null-notes sources don't add rows, so this is a floor).
    const items = tile.getByTestId("notes-item");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(4);
    // Source labels — at least one venue + one contact.
    const venueItems = tile.locator('[data-source="venue"]');
    const contactItems = tile.locator('[data-source="contact"]');
    await expect(venueItems).toHaveCount(1);
    expect(await contactItems.count()).toBeGreaterThanOrEqual(3);
  });

  test("aggregates ALL 5 source classes when each is populated (venue + hotel + room + transport + contact)", async ({
    page,
  }) => {
    // Inject notes on every source class. We mutate the venue JSONB to
    // keep the existing hotel notes (otherwise the tile would lose it
    // when we touch venue alone).
    const venueWithNotes = {
      ...((s.originalVenue as Record<string, unknown>) ?? {}),
      notes: "Venue notes — load via dock entrance only.",
    };
    await admin.from("shows").update({ venue: venueWithNotes }).eq("id", s.showId);

    if (s.originalHotels[0]) {
      await admin
        .from("hotel_reservations")
        .update({ notes: "Hotel — checkin opens 3pm; ask for AV team rate." })
        .eq("id", s.originalHotels[0].id);
    }
    if (s.originalRooms[0]) {
      await admin
        .from("rooms")
        .update({ notes: "Room — back-of-house door is on the freight side." })
        .eq("id", s.originalRooms[0].id);
    }
    await admin
      .from("transportation")
      .update({
        notes: "Transport — driver waits at the dock until last man out.",
      })
      .eq("show_id", s.showId);

    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const tile = page.getByTestId("notes-tile");
    await expect(tile).toBeVisible();
    await expect(tile.locator('[data-source="venue"]')).toHaveCount(1);
    await expect(tile.locator('[data-source="hotel"]')).toHaveCount(1);
    await expect(tile.locator('[data-source="room"]')).toHaveCount(1);
    await expect(tile.locator('[data-source="transport"]')).toHaveCount(1);
    // Contacts also have seed notes — at least the 3 originals.
    expect(await tile.locator('[data-source="contact"]').count()).toBeGreaterThanOrEqual(3);
  });

  test("returns null (whole-tile-missing) when ALL notes are stripped (§8.3)", async ({ page }) => {
    // Strip venue notes.
    const venue = { ...((s.originalVenue as Record<string, unknown>) ?? {}) };
    venue.notes = null;
    await admin.from("shows").update({ venue }).eq("id", s.showId);

    // Strip hotel notes.
    for (const h of s.originalHotels) {
      await admin.from("hotel_reservations").update({ notes: null }).eq("id", h.id);
    }
    // Strip rooms notes.
    for (const r of s.originalRooms) {
      await admin.from("rooms").update({ notes: null }).eq("id", r.id);
    }
    // Strip transport notes.
    await admin.from("transportation").update({ notes: null }).eq("show_id", s.showId);
    // Strip contact notes.
    await admin.from("contacts").update({ notes: null }).eq("show_id", s.showId);

    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    await expect(page.getByTestId("notes-tile")).toHaveCount(0);
  });

  test("truncates notes longer than 280 chars; tap to expand reveals full text", async ({
    page,
  }) => {
    // 360-char note — well over the 280 cap. Use a deterministic
    // string we can pin in the assertion.
    const longText = "A".repeat(150) + " — middle marker — " + "B".repeat(180);
    expect(longText.length).toBeGreaterThan(280);

    const venueWithLongNote = {
      ...((s.originalVenue as Record<string, unknown>) ?? {}),
      notes: longText,
    };
    await admin.from("shows").update({ venue: venueWithLongNote }).eq("id", s.showId);

    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const venueItem = page.getByTestId("notes-tile").locator('[data-source="venue"]');
    await expect(venueItem).toHaveCount(1);
    // The truncated indicator should be present.
    await expect(venueItem.getByTestId("notes-item-truncated")).toHaveCount(1);
    // The summary should NOT contain the full string before expand.
    // Click the summary to open the <details>; then assert the full
    // text appears in the body.
    const summary = venueItem.locator("summary");
    await summary.click();
    // Full text is in the expanded body — assert it appears verbatim
    // somewhere in the item.
    await expect(venueItem).toContainText(longText);
  });

  test("cardinality cap: 10 contact notes → exactly 8 notes-item + show-more stub '+2'", async ({
    page,
  }) => {
    // Strip every other notes source so the cap test isolates contact
    // notes alone — avoids off-by-N drift from any seeded venue/etc.
    const venue = { ...((s.originalVenue as Record<string, unknown>) ?? {}) };
    venue.notes = null;
    await admin.from("shows").update({ venue }).eq("id", s.showId);
    for (const h of s.originalHotels) {
      await admin.from("hotel_reservations").update({ notes: null }).eq("id", h.id);
    }
    for (const r of s.originalRooms) {
      await admin.from("rooms").update({ notes: null }).eq("id", r.id);
    }
    await admin.from("transportation").update({ notes: null }).eq("show_id", s.showId);

    // Replace contacts with 10 synthetic rows, each with notes.
    await admin.from("contacts").delete().eq("show_id", s.showId);
    const synthetic = Array.from({ length: 10 }, (_, i) => ({
      show_id: s.showId,
      kind: "venue" as const,
      name: `Contact ${i + 1}`,
      email: null,
      phone: null,
      notes: `Note number ${i + 1}`,
    }));
    const { error } = await admin.from("contacts").insert(synthetic);
    if (error) throw new Error(`insert synthetic contacts failed: ${error.message}`);

    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const tile = page.getByTestId("notes-tile");
    await expect(tile).toBeVisible();
    await expect(tile.getByTestId("notes-item")).toHaveCount(8);
    const showMore = tile.getByTestId("notes-overflow-stub");
    await expect(showMore).toHaveCount(1);
    await expect(showMore).toContainText(/\+2 more notes/);
  });

  test("source label includes the source's name when available (e.g., 'Contact — <name>')", async ({
    page,
  }) => {
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const tile = page.getByTestId("notes-tile");
    await expect(tile).toBeVisible();
    // The Waldorf fixture has a contact named "Isabella Vizzini" with a
    // notes value. The label should read "Contact: Isabella Vizzini"
    // (DESIGN.md §9 bans em dashes in user-visible copy, so we use a
    // colon as the source-name separator).
    const labels = await tile.getByTestId("notes-item").locator("summary").allInnerTexts();
    // Labels are rendered with `uppercase` CSS so allInnerTexts may
    // return uppercase ("CONTACT: …"). Use case-insensitive match.
    const hasNamed = labels.some((l) => /Contact:\s+\S/i.test(l));
    expect(hasNamed).toBe(true);
  });
});
