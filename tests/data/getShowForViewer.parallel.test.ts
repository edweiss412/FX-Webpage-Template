/**
 * Task 4 (A1) — getShowForViewer parallelization, unit-level concurrency proof.
 *
 * NON-tautological: the independent-wave reads return DEFERRED promises that
 * resolve only on a manual trigger. A SERIAL implementation records each
 * `.from(table)` call only AFTER the prior await resolves — so with the gates
 * un-released, only the FIRST wave-2 read would have started. We assert ALL
 * wave-2 reads are recorded BEFORE any of them resolve, which a serial impl
 * cannot satisfy.
 *
 * The crew-identity lookup + shows validation stay SEQUENTIAL FIRST (they carry
 * fail-closed throws + derive isLead). Only the reads AFTER show validation are
 * parallelized; this test resolves those two synchronously so the helper reaches
 * the parallel wave.
 *
 * Correctness arms (preserve discrimination):
 *  - a returned {data:null,error} on ONE tile read sets only that tileErrors[id]
 *    and leaves siblings populated;
 *  - a non-LEAD viewer issues ZERO financials (shows_internal financials) reads.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

type QueryResult = { data: unknown; error: { message: string } | null; count?: number | null };

// A per-table/RPC dispatcher whose configured "wave-2" reads return deferred
// promises. We record the moment each underlying read is *initiated* (the await
// touches the thenable) in `started`, and resolve them only via releaseAll().
function makeDeferredClient(opts: {
  // wave-2 table reads that should be DEFERRED (gated)
  deferredTables: string[];
  // wave-2 RPCs that should be DEFERRED (gated)
  deferredRpcs: string[];
  // seed result per table key ("shows_internal:run_of_show" / "shows_internal:financials"
  // disambiguated by the selected columns); per rpc name.
  seed: Record<string, QueryResult>;
}) {
  const started: string[] = [];
  const gates: Array<() => void> = [];

  // Build a deferred (or immediate) thenable that records `key` on first await.
  function makeThenable(key: string, result: QueryResult, deferred: boolean) {
    let recorded = false;
    const recordOnce = () => {
      if (!recorded) {
        recorded = true;
        started.push(key);
      }
    };
    const settle = (): Promise<QueryResult> => {
      recordOnce();
      if (!deferred) return Promise.resolve(result);
      return new Promise<QueryResult>((res) => {
        gates.push(() => res(result));
      });
    };
    const thenable: Record<string, unknown> = {};
    const chain = () => thenable;
    thenable.select = chain;
    thenable.eq = chain;
    thenable.order = chain;
    thenable.limit = chain;
    // maybeSingle()/single() return the settled promise.
    thenable.maybeSingle = () => settle();
    thenable.single = () => settle();
    // bare-await of a list query (e.g. crew_members roster, rooms, contacts):
    thenable.then = (onF: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
      settle().then(onF, onR);
    return thenable;
  }

  // The columns selected let us distinguish two shows_internal reads:
  // run_of_show (unconditional) vs financials (lead-gated).
  let lastSelectCols = "";
  const client = {
    from(table: string) {
      // wrap select to capture cols for shows_internal disambiguation
      const base = makeThenableForTable(table);
      return base;
    },
    rpc(name: string) {
      const deferred = opts.deferredRpcs.includes(name);
      const seedKey = `rpc:${name}`;
      return makeThenable(seedKey, opts.seed[seedKey] ?? { data: "", error: null }, deferred);
    },
  };

  function makeThenableForTable(table: string) {
    // Wrap a thenable so `.select(cols)` records cols before chaining, enabling
    // shows_internal:run_of_show vs shows_internal:financials disambiguation.
    const thenable: Record<string, unknown> = {};
    const resolveKey = (): string => {
      if (table === "shows_internal") {
        return lastSelectCols.includes("financials")
          ? "shows_internal:financials"
          : "shows_internal:run_of_show";
      }
      return table;
    };
    let inner: Record<string, unknown> | null = null;
    const ensureInner = () => {
      if (!inner) {
        const key = resolveKey();
        const deferred = opts.deferredTables.includes(key) || opts.deferredTables.includes(table);
        inner = makeThenable(
          key,
          opts.seed[key] ?? { data: null, error: null, count: 0 },
          deferred,
        ) as Record<string, unknown>;
      }
      return inner;
    };
    thenable.select = (cols?: string) => {
      if (typeof cols === "string") lastSelectCols = cols;
      const i = ensureInner();
      return i;
    };
    return thenable;
  }

  return { client, started, releaseAll: () => gates.splice(0).forEach((g) => g()) };
}

// Mock the service-role client factory the helper imports.
const supabaseState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => supabaseState.client,
}));

import { getShowForViewer } from "@/lib/data/getShowForViewer";

// A minimal valid show row so the post-validation projection succeeds.
function showRow() {
  return {
    id: "show-1",
    title: "Concurrency Show",
    client_label: "FXAV",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: { travelIn: null, set: null, showDays: [], travelOut: null },
    event_details: {},
    agenda_links: [],
    coi_status: "SENT",
    pull_sheet: null,
    diagrams: null,
    published: true,
    last_synced_at: null,
    last_sync_status: null,
    drive_file_id: "drive-1",
    source_anchors: {},
    opening_reel_drive_file_id: null,
    opening_reel_drive_modified_time: null,
    opening_reel_head_revision_id: null,
    opening_reel_mime_type: null,
  };
}

describe("getShowForViewer — parallel independent reads (A1)", () => {
  beforeEach(() => {
    supabaseState.client = null;
  });

  test("NON-tautological: all wave-2 reads are initiated before any resolves (concurrency)", async () => {
    // crew lookup + shows validation resolve IMMEDIATELY (not deferred); the
    // independent wave reads are all DEFERRED so a serial impl would only have
    // started ONE of them before we inspect.
    const deferredTables = [
      "hotel_reservations",
      "rooms",
      "transportation",
      "contacts",
      "shows_internal:run_of_show",
      "crew_members", // the roster read (second crew_members read)
    ];
    const deferredRpcs = ["viewer_version_token"];
    const harness = makeDeferredClient({
      deferredTables,
      deferredRpcs,
      seed: {
        // crew identity lookup (immediate): LEAD so financials joins the wave too
        "crew_members": { data: null, error: null }, // overwritten per-call below
        "shows": { data: showRow(), error: null },
        "hotel_reservations": { data: [], error: null },
        "rooms": { data: [], error: null },
        "transportation": { data: null, error: null },
        "contacts": { data: [], error: null },
        "shows_internal:run_of_show": { data: null, error: null },
        "shows_internal:financials": { data: null, error: null },
        "rpc:viewer_version_token": { data: "", error: null },
      },
    });

    // The admin viewer issues NO crew-identity lookup, so the SINGLE crew_members
    // read is the roster (deferred). isLead=true for admin → financials joins the
    // wave. No from() override needed for this arm.
    supabaseState.client = harness.client;

    const p = getShowForViewer("show-1", { kind: "admin" });
    // admin → no crew identity lookup; isLead=true. Let the microtask queue flush
    // so the parallel wave has a chance to initiate every read.
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Every independent read must have been INITIATED already, before release.
    // A serial impl would have started only the first (hotel_reservations).
    for (const key of [
      "hotel_reservations",
      "rooms",
      "transportation",
      "contacts",
      "shows_internal:run_of_show",
      "shows_internal:financials", // admin → isLead → financials read issues
      "crew_members", // roster
      "rpc:viewer_version_token",
    ]) {
      expect(harness.started).toContain(key);
    }

    harness.releaseAll();
    await p;
  });

  test("per-tile discrimination: one read's returned error sets only its tileErrors entry", async () => {
    const harness = makeDeferredClient({
      deferredTables: [],
      deferredRpcs: [],
      seed: {
        "shows": { data: showRow(), error: null },
        "hotel_reservations": { data: [], error: null },
        "rooms": { data: null, error: { message: "rooms boom" } }, // ONLY rooms fails
        "transportation": { data: null, error: null },
        "contacts": { data: [], error: null },
        "shows_internal:run_of_show": { data: null, error: null },
        "shows_internal:financials": { data: null, error: null },
        "crew_members": { data: [], error: null },
        "rpc:viewer_version_token": { data: "", error: null },
      },
    });
    supabaseState.client = harness.client;

    const r = await getShowForViewer("show-1", { kind: "admin" });
    expect(r.tileErrors.rooms).toBe("rooms boom");
    // siblings unaffected
    expect(r.tileErrors.hotel).toBeUndefined();
    expect(r.tileErrors.contacts).toBeUndefined();
    expect(r.tileErrors.transportation).toBeUndefined();
  });

  test("non-LEAD viewer issues ZERO financials reads", async () => {
    let financialsReads = 0;
    const harness = makeDeferredClient({
      deferredTables: [],
      deferredRpcs: [],
      seed: {
        "shows": { data: showRow(), error: null },
        "hotel_reservations": { data: [], error: null },
        "rooms": { data: [], error: null },
        "transportation": { data: null, error: null },
        "contacts": { data: [], error: null },
        "shows_internal:run_of_show": { data: null, error: null },
        "shows_internal:financials": { data: null, error: null },
        "crew_members": { data: [], error: null },
        "rpc:viewer_version_token": { data: "", error: null },
      },
    });

    // identity lookup → non-LEAD (A1 only); count financials reads via from() wrap.
    let crewCall = 0;
    const realFrom = harness.client.from.bind(harness.client);
    let lastCols = "";
    (harness.client as { from: (t: string) => unknown }).from = (t: string) => {
      if (t === "crew_members") {
        crewCall += 1;
        if (crewCall === 1) {
          const thenable: Record<string, unknown> = {};
          const chain = () => thenable;
          thenable.select = chain;
          thenable.eq = chain;
          thenable.maybeSingle = () =>
            Promise.resolve({
              data: { role_flags: ["A1"], name: "Crew Person", flight_info: null },
              error: null,
            });
          return thenable;
        }
      }
      if (t === "shows_internal") {
        // wrap to detect a financials select
        const wrapped: Record<string, unknown> = {};
        wrapped.select = (cols?: string) => {
          if (typeof cols === "string") lastCols = cols;
          if (typeof cols === "string" && cols.includes("financials")) financialsReads += 1;
          return (realFrom("shows_internal") as { select: (c?: string) => unknown }).select(cols);
        };
        return wrapped;
      }
      return realFrom(t);
    };
    void lastCols;
    supabaseState.client = harness.client;

    const r = await getShowForViewer("show-1", { kind: "crew", crewMemberId: "crew-1" });
    expect(r.financials).toBeUndefined();
    expect(financialsReads).toBe(0);
  });
});
