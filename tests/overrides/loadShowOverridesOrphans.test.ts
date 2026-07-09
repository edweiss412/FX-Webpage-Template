import { describe, expect, it } from "vitest";
import { loadShowOverrides } from "@/lib/overrides/loadShowOverrides";
import { HOTEL_DISAMBIGUATOR_SEP } from "@/lib/overrides/hotelDisambiguator";

// Adversarial R3 (Codex round 3, HIGH — G2): a deactivated (target_missing) override
// whose parsed target vanished from the sheet (crew member dropped, hotel removed) has
// NO live row to attach to, so it never appeared in loadShowOverrides' crew/hotels views.
// The "Override paused" needs-attention card deep-links to the show page for its
// Re-point/Discard controls — which did not exist for such an override (dead end,
// violating spec §6 step 4). loadShowOverrides now returns them in `orphans`.
//
// Failure mode caught: an orphaned override silently absent from every loader view.

type Row = Record<string, unknown>;

function fakeSupabase(byTable: Record<string, Row[]>) {
  function builder(table: string) {
    const result = { data: byTable[table] ?? [], error: null as null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      returns: () => chain,
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
    return chain;
  }
  return { from: (table: string) => builder(table) } as unknown as Parameters<
    typeof loadShowOverrides
  >[0];
}

function pausedOverride(over: Partial<Row>): Row {
  return {
    domain: "crew",
    field: "name",
    match_key: "Jon",
    override_value: "John",
    sheet_value: "Jon",
    active: false,
    deactivation_code: "target_missing",
    version: 2,
    ...over,
  };
}

describe("loadShowOverrides — orphaned deactivated overrides (R3 G2)", () => {
  it("a crew override whose member was dropped surfaces in `orphans`, not in `crew`", async () => {
    // Override targets parsed "Jon"; the live crew list no longer contains that identity.
    const supabase = fakeSupabase({
      admin_overrides: [pausedOverride({ domain: "crew", field: "name", match_key: "Jon" })],
      hotel_reservations: [],
    });
    const view = await loadShowOverrides(supabase, {
      showId: "show-1",
      crew: [{ id: "c-amy", name: "Amy", role: "A1", sheet_name: "Amy" }],
      showDates: null,
      showVenue: null,
    });

    // Not attached to the (only, unrelated) live crew member.
    expect(view.crew.every((c) => c.name.override === null && c.role.override === null)).toBe(true);
    // Surfaced as an orphan with its parsed key + paused state.
    expect(view.orphans).toHaveLength(1);
    expect(view.orphans[0]).toMatchObject({
      domain: "crew",
      field: "name",
      matchKey: "Jon",
    });
    expect(view.orphans[0]!.override.active).toBe(false);
    expect(view.orphans[0]!.override.deactivationCode).toBe("target_missing");
  });

  it("a paused override whose member is STILL live binds inline — NOT an orphan (no double-surface)", async () => {
    // name_conflict: the override-derived member lost, reverted to its parsed name "Jon",
    // so a live crew row with matchKey "Jon" still exists → bound inline, never an orphan.
    const supabase = fakeSupabase({
      admin_overrides: [pausedOverride({ match_key: "Jon", deactivation_code: "name_conflict" })],
      hotel_reservations: [],
    });
    const view = await loadShowOverrides(supabase, {
      showId: "show-1",
      crew: [{ id: "c-jon", name: "Jon", role: "A1", sheet_name: "Jon" }],
      showDates: null,
      showVenue: null,
    });
    // Bound to the live row inline …
    const jon = view.crew.find((c) => c.matchKey === "Jon")!;
    expect(jon.name.override?.active).toBe(false);
    // … and therefore NOT duplicated into orphans.
    expect(view.orphans).toHaveLength(0);
  });

  it("an ACTIVE override is never an orphan (anti-tautology)", async () => {
    const supabase = fakeSupabase({
      admin_overrides: [
        pausedOverride({ match_key: "Ghost", active: true, deactivation_code: null }),
      ],
      hotel_reservations: [],
    });
    const view = await loadShowOverrides(supabase, {
      showId: "show-1",
      crew: [],
      showDates: null,
      showVenue: null,
    });
    // Active but target-less would be a data anomaly; it must still never be an orphan
    // (orphans are the deactivated needs-attention stream only).
    expect(view.orphans).toHaveLength(0);
  });

  it("a hotel override for a removed reservation surfaces in `orphans`", async () => {
    const key = `Grand Marriott${HOTEL_DISAMBIGUATOR_SEP}2026-07-01`;
    const supabase = fakeSupabase({
      admin_overrides: [
        pausedOverride({
          domain: "hotel",
          field: "hotel_name",
          match_key: key,
          override_value: "Marriott Downtown",
          sheet_value: "Grand Marriott",
        }),
      ],
      hotel_reservations: [], // the reservation was removed from the sheet
    });
    const view = await loadShowOverrides(supabase, {
      showId: "show-1",
      crew: [],
      showDates: null,
      showVenue: null,
    });
    expect(view.hotels).toHaveLength(0);
    expect(view.orphans).toHaveLength(1);
    expect(view.orphans[0]).toMatchObject({ domain: "hotel", field: "hotel_name", matchKey: key });
  });
});
