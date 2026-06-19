import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

type Resp = { data: unknown; error: unknown };
// MUST be vi.hoisted: the vi.mock factory below is hoisted above all top-level
// statements, and it references makeChain → mockState. A plain const would be
// uninitialized when the hoisted factory first runs. Mirrors
// tests/data/getShowForViewerRunOfShow.test.ts:28.
const mockState = vi.hoisted(() => ({ responses: {} as Record<string, Resp> }));

function makeChain(table: string) {
  const response = mockState.responses[table] ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  // Record .eq() filters so .maybeSingle() HONORS the own-row lookup's
  // .eq("id", viewer.crewMemberId).eq("show_id", showId). An implementation that
  // drops either constraint (or reads the first crew row instead of the matched
  // one) then resolves to the WRONG crew row here — the adversarial test below
  // pins this. The roster read (.eq("show_id").then, no .maybeSingle) awaits the
  // full array unfiltered, so all crew still project.
  const filters: Record<string, unknown> = {};
  const self = () => chain;
  const single = (): Promise<Resp> => {
    let d = response.data;
    if (Array.isArray(d)) {
      d = d.filter(
        (r: Record<string, unknown>) =>
          (filters.id === undefined || r.id === filters.id) &&
          (filters.show_id === undefined || r.show_id === filters.show_id),
      );
    }
    return Promise.resolve({ data: Array.isArray(d) ? (d[0] ?? null) : d, error: response.error });
  };
  chain.select = self;
  chain.eq = (col: string, val: unknown) => { filters[col] = val; return chain; };
  chain.order = self; chain.limit = self; chain.like = self;
  for (const w of ["insert", "update", "delete", "upsert"]) chain[w] = self;
  chain.maybeSingle = single;
  chain.single = single;
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(response).then(res, rej);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (t: string) => makeChain(t),
    rpc: () => Promise.resolve({ data: "1000", error: null }),
  }),
}));

// Dynamic import AFTER vi.mock so the SUT binds to the mocked supabase client
// (a static import would run before the hoisted mock is wired). Mirrors
// tests/data/getShowForViewerRunOfShow.test.ts:66.
const { getShowForViewer } = await import("@/lib/data/getShowForViewer");

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const CREW = { kind: "crew" as const, crewMemberId: "crew-self" };

function crewRow(over: Record<string, unknown> = {}) {
  return {
    id: "crew-self", show_id: SHOW_ID, name: "Doug Larson", email: null, phone: null,
    role: "Lead", role_flags: [], date_restriction: null, stage_restriction: null,
    flight_info: "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ",
    ...over,
  };
}

function setup(over: Partial<Record<string, Resp>> = {}) {
  mockState.responses = {
    // Complete minimal show row — getShowForViewer dereferences dates.showDays
    // (deriveSchedulePhases) etc., so `dates: {}` would THROW before the flight
    // assertion. Mirrors tests/data/getShowForViewerRunOfShow.test.ts showRow().
    shows: {
      data: {
        id: SHOW_ID, title: "S", client_label: "c", template_version: "v4", published: true, coi_status: null,
        client_contact: null, venue: null, dates: { travelIn: null, set: null, showDays: [], travelOut: null },
        schedule_phases: null, event_details: {}, agenda_links: null, pull_sheet: null, diagrams: null,
        opening_reel_drive_file_id: null, opening_reel_drive_modified_time: null,
        opening_reel_head_revision_id: null, opening_reel_mime_type: null, last_synced_at: null, last_sync_status: null,
      },
      error: null,
    },
    shows_internal: { data: null, error: null },
    crew_members: { data: [crewRow()], error: null },
    hotel_reservations: { data: [], error: null },
    rooms: { data: [], error: null },
    transportation: { data: null, error: null },
    contacts: { data: [], error: null },
    ...over,
  };
}

beforeEach(() => setup());

describe("getShowForViewer — viewerFlightInfo projection", () => {
  it("projects the viewer's own flight_info", async () => {
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toBe(
      "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ",
    );
  });

  it("blank-normalizes a whitespace-only cell to null", async () => {
    setup({ crew_members: { data: [crewRow({ flight_info: "   " })], error: null } });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toBeNull();
  });

  it("null flight_info → null", async () => {
    setup({ crew_members: { data: [crewRow({ flight_info: null })], error: null } });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toBeNull();
  });

  it("sources the viewer's OWN flight via .eq(id), NOT the first roster row; roster carries no flight key", async () => {
    // ADVERSARIAL: the NON-viewer row is FIRST, the viewer's row SECOND. The
    // query-aware mock honors .eq("id", "crew-self") → the viewer gets A. An impl
    // that drops .eq("id") and reads crew[0] gets B and FAILS here.
    setup({
      crew_members: {
        data: [
          crewRow({ id: "crew-other", name: "Carl Fenton", flight_info: "OTHER-FLIGHT-B | RET-B" }),
          crewRow({ id: "crew-self", name: "Doug Larson", flight_info: "OWN-FLIGHT-A | RET-A" }),
        ],
        error: null,
      },
    });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toContain("OWN-FLIGHT-A");
    expect(out.viewerFlightInfo).not.toContain("OTHER-FLIGHT-B");
    expect(out.crewMembers.length).toBe(2);
    for (const m of out.crewMembers) {
      expect(m).not.toHaveProperty("flight_info");
      expect(m).not.toHaveProperty("flightInfo");
    }
  });

  it("plain admin → viewerFlightInfo null (needsCrewLookup is false; no own row)", async () => {
    const out = await getShowForViewer(SHOW_ID, { kind: "admin" });
    expect(out.viewerFlightInfo).toBeNull();
  });

  it("admin_preview → the PREVIEWED crew member's own flight (the lookup runs with the previewed id)", async () => {
    setup({
      crew_members: {
        data: [
          crewRow({ id: "crew-other", flight_info: "OTHER | RET-B" }),
          crewRow({ id: "crew-self", flight_info: "PREVIEWED | RET-A" }),
        ],
        error: null,
      },
    });
    const out = await getShowForViewer(SHOW_ID, { kind: "admin_preview", crewMemberId: "crew-self" });
    expect(out.viewerFlightInfo).toContain("PREVIEWED");
    expect(out.viewerFlightInfo).not.toContain("OTHER");
  });
});

// Static source-scan guard. The runtime mock above returns the full crew row
// regardless of the .select() string, so it CANNOT catch "implementer added the
// viewerFlightInfo assignment but forgot to add flight_info to the SELECT" — in
// production that column would be absent and the Travel card would stay empty.
// This scan catches it, and pins flight OFF the roster select (presentation
// contract). This is the spec's "P-1 source-scan".
describe("getShowForViewer source-scan — flight_info read on the own-row lookup, not the roster", () => {
  const src = readFileSync("lib/data/getShowForViewer.ts", "utf8");

  it("the own-row lookup SELECT includes flight_info", () => {
    expect(src).toContain('.select("role_flags, name, flight_info")');
  });

  it("the roster SELECT does NOT include flight_info, and flight_info is in exactly one select", () => {
    expect(src).toContain(
      '.select("id, name, email, phone, role, role_flags, date_restriction, stage_restriction")',
    );
    const selectFlightHits = (src.match(/\.select\("[^"]*flight_info[^"]*"\)/g) ?? []).length;
    expect(selectFlightHits).toBe(1);
  });

  it("the own-row lookup retains its id + show_id dual constraint", () => {
    // The flight-carrying lookup must stay own-row-scoped. Pins the constraint
    // statically (the query-aware mock honors it at runtime); catches a refactor
    // that drops .eq("id") or .eq("show_id") on the lookup.
    expect(src).toContain('.eq("id", viewer.crewMemberId)');
    expect(src).toContain('.eq("show_id", showId)');
  });
});
