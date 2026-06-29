import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs"; // for the R20 live-read source-scan guard (bottom of file)

const SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const d1 = "2026-06-24",
  d2 = "2026-06-25";
const e = [{ start: "9:00 AM", title: "Keynote" }];
// decodeRunOfShow wraps legacy AgendaEntry[] to ScheduleDay; decoded form used in assertions below.
const eSD = { entries: e, showStart: null, window: null };

// Minimal shows row — only the fields getShowForViewer dereferences. dates.showDays is the current-date domain.
function showRow(showDays: string[]) {
  return {
    id: SHOW_ID,
    title: "S",
    client_label: "c",
    template_version: "v4",
    published: true,
    coi_status: null,
    client_contact: null,
    venue: null,
    dates: { travelIn: null, set: null, showDays, travelOut: null },
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
}
// A crew row that satisfies BOTH the role_flags lookup (.maybeSingle) and the all-crew (.eq) read.
function crewRow(dateRestriction: unknown) {
  return {
    id: CREW_ID,
    name: "Hank",
    email: null,
    phone: null,
    role: "A2",
    role_flags: ["A2"], // non-lead
    date_restriction: dateRestriction,
    stage_restriction: { kind: "none" },
  };
}

type Resp = { data: unknown; error: unknown };
const mockState = vi.hoisted(() => ({
  responses: {} as Record<string, Resp>,
  showsInternalThrows: false,
  writeCalls: [] as string[], // captures any insert/update/delete/upsert method names (must stay empty)
}));

function makeChain(table: string) {
  const response = mockState.responses[table] ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  // .maybeSingle()/.single() resolve to a SINGLE row: if data is an array, unwrap [0] (mirrors PostgREST).
  // The non-terminal await (.eq() then awaited) resolves to the array as-is. This lets crew_members serve
  // BOTH the role-flags .maybeSingle() lookup (:217-222) and the all-crew .eq() read (:299-302) from one array.
  const single = (): Promise<Resp> => {
    if (table === "shows_internal" && mockState.showsInternalThrows)
      return Promise.reject(new Error("network boom"));
    const d = response.data;
    return Promise.resolve({ data: Array.isArray(d) ? (d[0] ?? null) : d, error: response.error });
  };
  chain.select = self;
  chain.eq = self;
  chain.order = self;
  chain.limit = self;
  chain.like = self;
  for (const w of ["insert", "update", "delete", "upsert"]) {
    chain[w] = () => {
      mockState.writeCalls.push(`${table}.${w}`);
      return chain;
    };
  }
  chain.maybeSingle = single;
  chain.single = single;
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    if (table === "shows_internal" && mockState.showsInternalThrows)
      return Promise.reject(new Error("network boom")).then(res, rej);
    return Promise.resolve(response).then(res, rej);
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (t: string) => makeChain(t),
    rpc: () => Promise.resolve({ data: "1000", error: null }),
  }),
}));

const { getShowForViewer } = await import("@/lib/data/getShowForViewer");

function setup(opts: {
  showDays: string[];
  showsInternal: Resp;
  crew?: Resp; // when present, drives a crew viewer's lookup + restriction
  throws?: boolean;
}) {
  mockState.responses = {
    shows: { data: showRow(opts.showDays), error: null },
    crew_members: opts.crew ?? { data: [], error: null },
    hotel_reservations: { data: [], error: null },
    rooms: { data: [], error: null },
    transportation: { data: null, error: null },
    contacts: { data: [], error: null },
    shows_internal: opts.showsInternal,
  };
  mockState.showsInternalThrows = opts.throws ?? false;
  mockState.writeCalls = [];
}

const ADMIN = { kind: "admin" as const };
const CREW = { kind: "crew" as const, crewMemberId: CREW_ID };

describe("getShowForViewer.runOfShow projection (D-4)", () => {
  beforeEach(() => {
    mockState.responses = {};
    mockState.showsInternalThrows = false;
    mockState.writeCalls = [];
  });

  it("reads UNCONDITIONALLY (not lead-gated) — a non-lead crew viewer still gets runOfShow", async () => {
    setup({
      showDays: [d1],
      showsInternal: { data: { run_of_show: { [d1]: e } }, error: null },
      crew: { data: [crewRow({ kind: "none" })], error: null },
    });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.runOfShow).toEqual({ [d1]: eSD });
  });

  it("no shows_internal row ({data:null,error:null}) → runOfShow null, NO tileErrors (legitimate empty — ?? null coercion)", async () => {
    setup({ showDays: [d1], showsInternal: { data: null, error: null } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors).not.toHaveProperty("run_of_show"); // catches a FALSE alert on every no-row show
  });

  it("explicit DateRestriction → only assigned-day keys", async () => {
    setup({
      showDays: [d1, d2],
      showsInternal: { data: { run_of_show: { [d1]: e, [d2]: e } }, error: null },
      crew: { data: [crewRow({ kind: "explicit", days: [d2] })], error: null },
    });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.runOfShow).toEqual({ [d2]: eSD });
  });

  it("unknown_asterisk → no keys", async () => {
    setup({
      showDays: [d1, d2],
      showsInternal: { data: { run_of_show: { [d1]: e } }, error: null },
      crew: { data: [crewRow({ kind: "unknown_asterisk" })], error: null },
    });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.runOfShow).toBeNull();
  });

  it("none viewer (admin) → all CURRENT show days", async () => {
    setup({
      showDays: [d1, d2],
      showsInternal: { data: { run_of_show: { [d1]: e, [d2]: e } }, error: null },
    });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toEqual({ [d1]: eSD, [d2]: eSD });
  });

  it("current-date intersection: a stored key NOT in dates.showDays is dropped at READ while STORAGE is untouched (R10/R12)", async () => {
    const storedRow = { run_of_show: { [d1]: e, [d2]: e } };
    setup({ showDays: [d1], showsInternal: { data: storedRow, error: null } }); // d2 removed from showDays
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toEqual({ [d1]: eSD }); // d2 hidden at read
    expect(storedRow.run_of_show).toHaveProperty(d2); // storage object UNCHANGED (non-destructive)
    expect(mockState.writeCalls).toEqual([]); // no insert/update/delete/upsert — read-only
  });

  it("returned error → runOfShow null + tileErrors.run_of_show set, no raw infra text leaked as runOfShow", async () => {
    setup({ showDays: [d1], showsInternal: { data: null, error: { message: "db boom" } } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("thrown exception (network) → runOfShow null + tileErrors.run_of_show set (fail-soft, no throw)", async () => {
    setup({ showDays: [d1], showsInternal: { data: null, error: null }, throws: true });
    const out = await getShowForViewer(SHOW_ID, ADMIN); // must not reject
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("corrupt stored shape ([null]) → runOfShow null + tileErrors.run_of_show set (decode fail-soft, no throw)", async () => {
    setup({
      showDays: [d1],
      showsInternal: { data: { run_of_show: { [d1]: [null] } }, error: null },
    });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toBeNull();
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("corrupt: non-ISO key dropped, non-array day dropped, valid sibling still projects, tileErrors set", async () => {
    setup({
      showDays: [d1],
      showsInternal: {
        data: { run_of_show: { garbage: [e[0]], [d1]: e, "2026-06-26": 5 } },
        error: null,
      },
    });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    expect(out.runOfShow).toEqual({ [d1]: eSD }); // only the well-formed, in-domain day survives
    expect(out.tileErrors.run_of_show).toBeTruthy();
  });

  it("D-3 boundary: result.show (ShowRow) carries NO run_of_show / runOfShow key", async () => {
    setup({ showDays: [d1], showsInternal: { data: { run_of_show: { [d1]: e } }, error: null } });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    const showKeys = Object.keys(out.show);
    expect(showKeys).not.toContain("run_of_show");
    expect(showKeys).not.toContain("runOfShow");
  });
});

describe("getShowForViewer.runOfShow ScheduleDay projection (per-day-schedule)", () => {
  beforeEach(() => {
    mockState.responses = {};
    mockState.showsInternalThrows = false;
    mockState.writeCalls = [];
  });

  const sd = (start: string | null, win: { start: string; end: string } | null = null) => ({
    entries: start ? [{ start, title: "Keynote" }] : [],
    showStart: start,
    window: win,
  });

  it("ADMIN/none → both ScheduleDay days survive with showStart + window intact", async () => {
    setup({
      showDays: [d1, d2],
      showsInternal: {
        data: {
          run_of_show: { [d1]: sd("7:15 AM"), [d2]: sd(null, { start: "8:00am", end: "5:00pm" }) },
        },
        error: null,
      },
    });
    const r = await getShowForViewer(SHOW_ID, ADMIN);
    expect(Object.keys(r.runOfShow ?? {})).toEqual([d1, d2]);
    expect(r.runOfShow![d1]!.showStart).toBe("7:15 AM");
    expect(r.runOfShow![d2]!.window).toEqual({ start: "8:00am", end: "5:00pm" });
  });

  it("explicit Day-1-only crew viewer → Day-2 ScheduleDay (incl. its window/showStart) is GATED OUT", async () => {
    setup({
      showDays: [d1, d2],
      crew: { data: [crewRow({ kind: "explicit", days: [d1] })], error: null },
      showsInternal: {
        data: { run_of_show: { [d1]: sd("7:15 AM"), [d2]: sd("8:00 AM") } },
        error: null,
      },
    });
    const r = await getShowForViewer(SHOW_ID, CREW);
    expect(Object.keys(r.runOfShow ?? {})).toEqual([d1]); // Day 2 dropped at read
    expect(r.runOfShow![d1]!.showStart).toBe("7:15 AM");
  });

  it("unknown_asterisk crew viewer → runOfShow null (no ScheduleDay leaks)", async () => {
    setup({
      showDays: [d1, d2],
      crew: { data: [crewRow({ kind: "unknown_asterisk", days: null })], error: null },
      showsInternal: {
        data: { run_of_show: { [d1]: sd("7:15 AM"), [d2]: sd("8:00 AM") } },
        error: null,
      },
    });
    const r = await getShowForViewer(SHOW_ID, CREW);
    expect(r.runOfShow).toBeNull();
  });
});

describe("getShowForViewer.runOfShow aggregate-day widening (D12)", () => {
  beforeEach(() => {
    mockState.responses = {};
    mockState.showsInternalThrows = false;
    mockState.writeCalls = [];
  });

  const setDay = "2026-06-23"; // SET day — in the aggregate domain, NOT a show day
  const offAggregate = "2026-07-15"; // not in the aggregate domain at all

  // Show row whose dates carry a SET day alongside show days d1/d2, so
  // aggregateDays(dates) = { setDay, d1, d2 } ⊋ showDays.
  function showRowWithSet() {
    return {
      ...showRow([d1, d2]),
      dates: { travelIn: null, set: setDay, showDays: [d1, d2], travelOut: null },
    };
  }

  function setupWithSet(opts: { showsInternal: Resp; crew?: Resp }) {
    mockState.responses = {
      shows: { data: showRowWithSet(), error: null },
      crew_members: opts.crew ?? { data: [], error: null },
      hotel_reservations: { data: [], error: null },
      rooms: { data: [], error: null },
      transportation: { data: null, error: null },
      contacts: { data: [], error: null },
      shows_internal: opts.showsInternal,
    };
    mockState.showsInternalThrows = false;
    mockState.writeCalls = [];
  }

  it("none/admin viewer: SET-day + show-day keys survive; an off-aggregate key is dropped", async () => {
    setupWithSet({
      showsInternal: {
        data: { run_of_show: { [setDay]: e, [d1]: e, [offAggregate]: e } },
        error: null,
      },
    });
    const out = await getShowForViewer(SHOW_ID, ADMIN);
    // SET day now reaches crew (aggregate widening); off-aggregate still dropped.
    expect(out.runOfShow).toEqual({ [setDay]: eSD, [d1]: eSD });
  });

  it("explicit viewer: SET key present iff restriction.days includes the set date", async () => {
    setupWithSet({
      showsInternal: {
        data: { run_of_show: { [setDay]: e, [d1]: e } },
        error: null,
      },
      crew: { data: [crewRow({ kind: "explicit", days: [setDay] })], error: null },
    });
    const out = await getShowForViewer(SHOW_ID, CREW);
    // restriction lists only the SET day → only the SET day survives (explicit ∩ aggregate).
    expect(out.runOfShow).toEqual({ [setDay]: eSD });
  });

  it("unknown_asterisk viewer → null even when a SET-day key is stored (∅ preserved)", async () => {
    setupWithSet({
      showsInternal: {
        data: { run_of_show: { [setDay]: e, [d1]: e } },
        error: null,
      },
      crew: { data: [crewRow({ kind: "unknown_asterisk" })], error: null },
    });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.runOfShow).toBeNull();
  });
});

// R20 LIVE-READ source-scan guard: the mock above keys off the TABLE NAME, but a structural assert pins that the
// live read actually targets shows_internal.run_of_show (not only the mock). Uses readFileSync (imported at top) —
// getShowForViewer is a function, not a class method, so classMethodSource doesn't apply.
describe("R20 producer guard — getShowForViewer reads shows_internal.run_of_show via the service-role client", () => {
  it('the source contains the live .select("run_of_show") read on shows_internal', () => {
    const src = readFileSync("lib/data/getShowForViewer.ts", "utf8");
    // NOTE: `.from("shows_internal")` ALREADY exists (the financials read), so asserting it is green-by-construction.
    // The load-bearing, RED-before-impl substring is the NEW run_of_show select — absent until this task wires it.
    expect(src).toMatch(/\.select\(["']run_of_show["']\)/);
    // RED if the read is dropped/renamed → the projection never surfaces run_of_show or tileErrors["run_of_show"]
    //   in production, even though the mock-driven behavioral tests above would still pass.
  });
});
