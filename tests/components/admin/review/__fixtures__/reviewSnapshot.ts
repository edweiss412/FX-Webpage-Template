/**
 * tests/components/admin/review/__fixtures__/reviewSnapshot.ts
 *
 * An RPC-shaped `ShowReviewSnapshot` with EVERY rail section populated, for the
 * section-freshness detector suite (plan 2026-08-03-modal-freshness-cue T1).
 *
 * WHY THIS EXISTS RATHER THAN A WIDENED HARNESS. The published-modal harness has
 * its own snapshot builder, but it is module-private and carries one crew row,
 * empty `rooms` / `hotel_reservations` / `transportation` / `contacts`, and empty
 * `source_anchors`. The detector suite needs every section populated (D6), two
 * hotel rows (D2b), two crew rows with swappable ids (D12), and real anchors
 * (D13). Widening the harness's builder would change the inputs of every test
 * already using it, so the two fixtures stay separate: this one exercises the
 * PROJECTION across every section, the harness exercises the COMPONENT's state
 * machine through the real pipeline.
 *
 * Shape fidelity matters more than realism here: every field name is a DB column
 * name, because the RPC hands back `to_jsonb(row)` projections
 * (`lib/admin/readShowReviewSnapshot.ts:22-33`) and `buildPublishedSectionData`
 * narrows from exactly that.
 */
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

export const SHOW_ID = "11111111-1111-1111-1111-111111111111";
export const SLUG = "freshness-fixture-show";
export const DRIVE_FILE_ID = "DRIVE_FRESHNESS";

/**
 * A deep clone per call, so a case that mutates its snapshot cannot leak into the
 * next one. `structuredClone` rather than a JSON round trip: it preserves
 * `undefined`-free object identity semantics without silently dropping keys.
 */
export function reviewSnapshot(): ShowReviewSnapshot {
  return structuredClone(BASE);
}

/**
 * A warn routed to a section by `blockRef.kind`, which is what `KIND_TO_SECTION`
 * reads (`lib/admin/step3SectionStatus.ts:22-45`). This is how a test places a
 * warning INSIDE Crew without touching `crewMembers` at all, which is the whole
 * point of D9.
 */
export function routedWarn(kind: string, message = "routed fixture warning"): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message,
    blockRef: { kind, name: `${kind}-row` },
    rawSnippet: `${kind} | value`,
  };
}

/**
 * A room-split warn carrying a RESOLVABLE resolution, so a `UseRawDecision` can
 * match it on `(code, resolution.contentHash)` the way `findUseRawDecision` does
 * (`components/admin/wizard/step3ReviewSections.tsx:572-583`). D10 needs a warning
 * a decision can actually attach to; a plain `routedWarn` carries no `resolution`
 * and therefore never matches, so the test would pass vacuously.
 *
 * The full `parsed` / `replacement` payload is built rather than cast, because a
 * cast would let the fixture drift out of the real union and still compile.
 *
 * NOT named `useRawWarn`: eslint's react-hooks rule reads a `use` prefix as a hook
 * and rejects the call from a plain helper.
 */
export function roomSplitWarn(contentHash: string): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "room label split from name",
    blockRef: { kind: "rooms", name: "rooms-row" },
    resolution: {
      resolvable: true,
      contentHash,
      parsed: { kind: "rooms", name: "Grand Ballroom", dimensions: "60x40", floor: "1" },
      replacement: { kind: "rooms", name: "GENERAL SESSION Grand Ballroom", dimensions: null, floor: null },
    },
  };
}

/**
 * The persisted decision that matches `roomSplitWarn(contentHash)`. Its `code` must
 * equal the warning's and its `contentHash` the resolution's; matching is never
 * by `target`, which is display-only (`lib/sync/useRawOverlay.ts:35`).
 */
export function roomSplitDecision(
  contentHash: string,
  preference: "raw" | "transform",
): UseRawDecision {
  return {
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    contentHash,
    target: { kind: "rooms", name: "Grand Ballroom" },
    preference,
    applied: true,
    decidedAt: "2026-08-03T17:00:00Z",
    decidedBy: "fixture@example.com",
  };
}

const BASE: ShowReviewSnapshot = {
  show: {
    id: SHOW_ID,
    slug: SLUG,
    title: "Freshness Fixture Show",
    client_label: "Acme Events",
    published: true,
    archived: false,
    dates: {
      travelIn: "2026-08-01",
      set: "2026-08-02",
      showDays: ["2026-08-03", "2026-08-04"],
      travelOut: "2026-08-05",
    },
    venue: { name: "Grand Hall", address: "1 Main St", city: "Austin", state: "TX" },
    // Keys from the closed EVENT_DETAIL_GROUPS vocabulary; anything else renders nowhere.
    event_details: { dress_code: "business casual", power: "house" },
    client_contact: { name: "Pat Client", email: "pat@example.com", phone: "512-555-0100" },
    diagrams: null,
    // Populated so `includesAgenda` is true and the agenda rail id renders
    // (`components/admin/review/sectionInclusion.ts:27-29`). Without this the
    // fixture would silently drop one of the twelve sections D6 counts.
    agenda_links: [{ label: "Run of show", fileId: "AGENDA_FILE_1", extracted: { pages: 1 } }],
    pull_sheet: [{ caseLabel: "Audio", items: [{ qty: 1, item: "console" }, { qty: 2, item: "wedge" }] }],
    pull_sheet_override: null,
    // Real anchors: D13 moves ONE region and asserts only the sections mapped to
    // it change. Note `schedule` and `agenda` BOTH map to the `schedule` region
    // (`lib/admin/step3SectionStatus.ts:58-59`), which is exactly the trap D13
    // must derive from SECTION_REGION_MAP rather than hardcode.
    //
    // SHAPE: `{ title, gid, a1 }` objects, NOT A1-notation strings. The strings
    // this fixture carried until the round-2 projection sweep are not what
    // production stores (`lib/data/getShowForViewer.ts:315` types the map as
    // `Record<string, SourceAnchor>`), and `buildSheetDeepLink` collapses any
    // value whose `title` is outside SOURCE_LINK_ALLOWLIST onto a single
    // `#gid=0`. So D13 was moving one unusable anchor to another unusable
    // anchor and asserting a cue that the real rendered link could not produce.
    // Titles here are allowlisted and gids are numeric, so the href really moves.
    source_anchors: {
      venue: { title: "INFO", gid: 0, a1: "A1:D9" },
      details: { title: "INFO", gid: 0, a1: "A11:D20" },
      crew: { title: "INFO", gid: 0, a1: "A40:H80" },
      contacts: { title: "INFO", gid: 0, a1: "A22:D30" },
      schedule: { title: "AGENDA", gid: 11, a1: "A1:F60" },
      hotels: { title: "TRAVEL", gid: 22, a1: "A1:H20" },
      transportation: { title: "TRAVEL", gid: 22, a1: "A30:F50" },
      rooms: { title: "GEAR", gid: 33, a1: "A1:P40" },
      gear_packlist: { title: "PULL SHEET", gid: 44, a1: "A1:D80" },
      financials: { title: "INFO", gid: 0, a1: "A32:D40" },
    },
    drive_file_id: DRIVE_FILE_ID,
    coi_status: "received",
    last_synced_at: "2026-08-03T17:00:00Z",
    last_checked_at: "2026-08-03T17:00:00Z",
    last_sync_status: "ok",
    picker_epoch: 1,
  },
  internal: {
    show_id: SHOW_ID,
    run_of_show: {
      "2026-08-03": { entries: [{ start: "08:00", title: "Doors", kind: "session" }] },
    },
    parse_warnings: [],
    use_raw_decisions: [],
    raw_unrecognized: null,
    financials: { proposal: "P-1", po: "PO-1", invoice: null, invoice_notes: null },
  },
  // Two rows so D12 can swap a persisted id while every displayed field stays
  // equal. Ordered by id here the way the RPC orders them.
  crew_members: [
    {
      id: "cccccccc-0000-4000-8000-000000000001",
      name: "Alice Anders",
      email: "alice@example.com",
      phone: "512-555-0111",
      role: "A1",
      role_flags: [],
      date_restriction: null,
      stage_restriction: null,
      flight_info: null,
    },
    {
      id: "cccccccc-0000-4000-8000-000000000002",
      name: "Bob Brooks",
      email: "bob@example.com",
      phone: "512-555-0112",
      role: "V2",
      role_flags: [],
      date_restriction: null,
      stage_restriction: null,
      flight_info: null,
    },
  ],
  rooms: [
    {
      id: "rrrrrrrr-0000-4000-8000-000000000001",
      kind: "ballroom",
      name: "Grand Ballroom",
      dimensions: "60x40",
      floor: "1",
      setup: "theater",
      set_time: null,
      show_time: null,
      strike_time: null,
      audio: "L-Acoustics",
      video: null,
      lighting: null,
      scenic: null,
      power: null,
      digital_signage: null,
      other: null,
      notes: null,
    },
  ],
  // TWO rows, deliberately. `buildPublishedSectionData` maps hotels WITHOUT a
  // sort (`components/admin/review/publishedAdapter.ts:75`), unlike crew, rooms
  // and contacts, so ordering here is guaranteed by the RPC's `order by
  // h.ordinal, h.id` and not by the adapter. D2b pins that asymmetry; with one
  // row it would be unfalsifiable.
  hotel_reservations: [
    {
      id: "hhhhhhhh-0000-4000-8000-000000000001",
      ordinal: 1,
      hotel_name: "Hyatt",
      hotel_address: "2 Congress Ave",
      names: ["Alice Anders"],
      confirmation_no: "ABC123",
      check_in: "2026-08-01",
      check_out: "2026-08-05",
      notes: null,
    },
    {
      id: "hhhhhhhh-0000-4000-8000-000000000002",
      ordinal: 2,
      hotel_name: "Marriott",
      hotel_address: "3 Congress Ave",
      names: ["Bob Brooks"],
      confirmation_no: "DEF456",
      check_in: "2026-08-01",
      check_out: "2026-08-05",
      notes: null,
    },
  ],
  transportation: [
    {
      id: "tttttttt-0000-4000-8000-000000000001",
      driver_name: "Dana Driver",
      driver_phone: "512-555-0133",
      driver_email: null,
      loadout_name: null,
      loadout_phone: null,
      loadout_email: null,
      vehicle: "26ft box truck",
      license_plate: "TX-1234",
      color: "white",
      parking: "dock 3",
      schedule: [],
      notes: null,
    },
  ],
  contacts: [
    {
      id: "kkkkkkkk-0000-4000-8000-000000000001",
      kind: "venue",
      name: "Vic Venue",
      email: "vic@venue.example.com",
      phone: "512-555-0144",
      notes: null,
    },
  ],
};
