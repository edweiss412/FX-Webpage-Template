/**
 * tests/data/getShowForViewer-rooms-projection.test.ts (Task 4)
 *
 * Narrow projection-shape test: verifies that `getShowForViewer` projects
 * each room's DB `id` into the returned `ShowForViewer.rooms` array as a
 * `ProjectedRoomRow`.
 *
 * _Catches:_ the rooms projection dropping the DB id, breaking resolveKeyTimes'
 * id-tiebreaker (§9 test 20 case d) and making screenshot baselines flaky.
 *
 * Uses a mock Supabase client (vi.mock on @/lib/supabase/server) so this test
 * runs without a live database connection and is safe in CI without Supabase
 * credentials. All queries the function makes must return { data, error: null }
 * to satisfy invariant 9 (Supabase call-boundary discipline) and let the
 * function run to completion.
 */

import { beforeEach, expect, it, vi } from "vitest";

// ── Compile-time assertion ───────────────────────────────────────────────────
// Conditional types are erased at runtime (no object is evaluated), so this
// does NOT throw at load time. It DOES cause `tsc` / `pnpm typecheck` to error
// with "Type 'true' is not assignable to type 'never'" until ShowForViewer.rooms
// is typed as ProjectedRoomRow[].
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";

type _RoomsCarryId = ShowForViewer["rooms"] extends ProjectedRoomRow[] ? true : never;
const _assertRoomsCarryId: _RoomsCarryId = true; // `never` (→ tsc error) until rooms is widened

// ── Mock setup ───────────────────────────────────────────────────────────────

const SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ROOM_ID = "11111111-1111-1111-1111-111111111111";

// Minimal shows row — only the fields getShowForViewer dereferences.
const MOCK_SHOW_ROW = {
  id: SHOW_ID,
  title: "Mock Show",
  client_label: "Mock Client",
  template_version: "v4",
  published: true,
  coi_status: null,
  client_contact: null,
  venue: null,
  dates: { travelIn: null, set: null, showDays: [], travelOut: null },
  schedule_phases: null,
  event_details: {},
  agenda_links: null,
  pull_sheet: null,
  diagrams: null,
  opening_reel_drive_file_id: null,
  opening_reel_drive_modified_time: null,
  opening_reel_head_revision_id: null,
  opening_reel_mime_type: null,
  last_synced_at: null,
  last_sync_status: null,
};

// Minimal room row — id plus all non-nullable projected fields.
const MOCK_ROOM_ROW = {
  id: ROOM_ID,
  kind: "gs" as const,
  name: "GS",
  set_time: "9:00 AM",
  show_time: null,
  strike_time: null,
  dimensions: null,
  floor: null,
  setup: null,
  audio: null,
  video: null,
  lighting: null,
  scenic: null,
  power: null,
  digital_signage: null,
  other: null,
  notes: null,
};

/**
 * Build a minimal chainable Supabase client stub.
 *
 * getShowForViewer calls the following query chains:
 *  1. from("shows").select("*").eq(...).maybeSingle()
 *  2. from("crew_members").select(...).eq(...)            (all crew — no viewer lookup for admin)
 *  3. from("hotel_reservations").select(...).eq(...).order(...)
 *  4. from("rooms").select("*").eq(...)
 *  5. from("transportation").select("*").eq(...).maybeSingle()
 *  6. from("contacts").select("*").eq(...)
 *  7. from("shows_internal").select(...).eq(...).maybeSingle()  (admin = isLead)
 *  8. rpc("viewer_version_token", ...)
 *
 * Each chain resolves to { data, error: null } per invariant 9. The builder
 * pattern terminates when a call returns a Promise (the `.then`-able sentinel).
 */
function buildMockClient() {
  // Per-table response overrides. Default: empty array.
  const tableResponses: Record<string, { data: unknown; error: null }> = {
    shows: { data: MOCK_SHOW_ROW, error: null },
    crew_members: { data: [], error: null },
    hotel_reservations: { data: [], error: null },
    rooms: { data: [MOCK_ROOM_ROW], error: null },
    transportation: { data: null, error: null },
    contacts: { data: [], error: null },
    shows_internal: { data: null, error: null },
  };

  function makeChain(table: string): Record<string, unknown> {
    const response = tableResponses[table] ?? { data: [], error: null };

    // The chain returns `this` for every intermediate method so callers can
    // chain arbitrarily many `.eq()`, `.order()`, `.select()` etc.  The
    // terminal methods (`.maybeSingle()`, `.single()`, and awaiting the chain
    // directly) return the resolved response.

    const chain: Record<string, unknown> = {};

    const terminal = () => Promise.resolve(response);
    const self = () => chain;

    chain.select = self;
    chain.eq = self;
    chain.order = self;
    chain.limit = self;
    chain.like = self;
    chain.maybeSingle = terminal;
    chain.single = terminal;
    // Make the chain itself thenable so `await supabase.from(t).select(...).eq(...)` works.
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject);

    return chain;
  }

  return {
    from: (table: string) => makeChain(table),
    rpc: (_fn: string, _args: unknown) => Promise.resolve({ data: "1000", error: null }),
  };
}

// Hoist mock state so vi.mock factory can reference it.
const mockState = vi.hoisted(() => ({
  client: null as ReturnType<typeof buildMockClient> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => mockState.client,
}));

// Import AFTER mock registration (ESM hoisting).
const { getShowForViewer } = await import("@/lib/data/getShowForViewer");

beforeEach(() => {
  mockState.client = buildMockClient();
});

// ── Runtime assertion ────────────────────────────────────────────────────────

it("projects each room's DB id into ProjectedRoomRow", async () => {
  const out = await getShowForViewer(SHOW_ID, { kind: "admin" });

  // id comes from the mock row — expected value is derived from the fixture,
  // not hardcoded independently, so a change to ROOM_ID is caught immediately.
  expect(out.rooms[0]?.id).toBe(ROOM_ID);
  expect(out.rooms[0]?.set_time).toBe("9:00 AM");
});

// Suppress "unused variable" lint for the compile-time sentinel.
void _assertRoomsCarryId;
