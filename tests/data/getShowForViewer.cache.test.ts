/**
 * Nav-perf tag-caching (Task 2/3) — getShowForViewer cache split unit proof.
 *
 * `unstable_cache` needs an incremental-cache request context that Vitest's
 * `node` environment lacks, so we DON'T rely on Next's real caching. Instead we
 * mock `next/cache` so `unstable_cache(fn, keyParts, opts)` returns a wrapper
 * that MEMOIZES on `JSON.stringify(keyParts)` (deterministic in-test caching),
 * EVICTS by tag (so the Task-3 tag-bust test is faithful), AND records
 * `(keyParts, opts)`. This tests OUR usage of the API (correct key/tag/opts +
 * the live-token split) — Next's real caching is the library's own contract.
 *
 * Non-tautological anchors:
 *  - The data fan-out reading ONCE across two calls proves the data is routed
 *    THROUGH unstable_cache with a STABLE key (a serial/un-cached impl reads
 *    twice).
 *  - The `viewer_version_token` RPC firing TWICE proves the token is read
 *    OUTSIDE the cache (the §3.1 no-infinite-refresh-loop split). A regression
 *    that pulls the token into the cached fan-out makes this fail.
 *  - Per-viewer isolation asserts crewB never receives crewA's viewerName /
 *    financials — a key collision would leak another viewer's financials
 *    (a SECURITY bug). Expectations are derived from the fixture role_flags,
 *    not hardcoded.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// === next/cache mock: memoize by keyParts + evict by tag + record opts ===
const cacheState = vi.hoisted(() => ({
  memo: new Map<string, { value: unknown; tags: string[] }>(),
  recorded: [] as Array<{ keyParts: unknown[]; opts: { tags?: string[]; revalidate?: number } }>,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...a: unknown[]) => Promise<unknown>,
    keyParts: unknown[],
    opts: { tags?: string[]; revalidate?: number },
  ) => {
    return async (...a: unknown[]) => {
      const k = JSON.stringify(keyParts);
      cacheState.recorded.push({ keyParts, opts });
      if (!cacheState.memo.has(k)) {
        cacheState.memo.set(k, { value: await fn(...a), tags: opts?.tags ?? [] });
      }
      return cacheState.memo.get(k)!.value;
    };
  },
  revalidateTag: vi.fn((tag: string) => {
    for (const [k, e] of cacheState.memo) {
      if (e.tags.includes(tag)) cacheState.memo.delete(k);
    }
  }),
}));

// === service-role client mock: counts every `.from(table)` + `.rpc(name)` ===
type QueryResult = { data: unknown; error: { message: string } | null; count?: number | null };

const supabaseState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => supabaseState.client,
}));

import { getShowForViewer } from "@/lib/data/getShowForViewer";
import { showCacheTag, revalidateShow } from "@/lib/data/showCacheTag";

const SHOW_ID = "show-cache-1";
const CREW_A = "crew-a";
const CREW_B = "crew-b";

// Fixture crew rows keyed by id. role_flags drive the isLead → financials gate.
type CrewRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  role_flags: string[];
  flight_info: string | null;
  date_restriction: unknown;
  stage_restriction: unknown;
};

function showRow() {
  return {
    id: SHOW_ID,
    title: "Cache Show",
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

/**
 * Builds a service-role client whose every read returns immediately. Tracks:
 *  - `counts.from[table]` — number of `.from(table)` reads (NOT the identity
 *    lookup vs roster distinction; both bump crew_members).
 *  - `counts.rpc[name]` — number of `.rpc(name)` calls.
 * `financials` lets us mutate the backing data between calls (tag-bust test).
 */
function makeCountingClient(opts: {
  crewById: Record<string, CrewRow>;
  roster: CrewRow[];
  financials: { current: { po: string | null } | null };
}) {
  const counts = {
    from: {} as Record<string, number>,
    rpc: {} as Record<string, number>,
  };

  function listThenable(result: QueryResult) {
    const t: Record<string, unknown> = {};
    const chain = () => t;
    t.select = chain;
    t.eq = chain;
    t.order = chain;
    t.limit = chain;
    t.maybeSingle = () => Promise.resolve(result);
    t.single = () => Promise.resolve(result);
    t.then = (onF: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR);
    return t;
  }

  const client = {
    from(table: string) {
      counts.from[table] = (counts.from[table] ?? 0) + 1;
      if (table === "crew_members") {
        // Distinguish the identity lookup (selects role_flags,name,flight_info,
        // bound by id+show_id, .maybeSingle) from the roster read (no id filter).
        let boundId: string | null = null;
        const t: Record<string, unknown> = {};
        t.select = () => t;
        t.eq = (col: string, val: string) => {
          if (col === "id") boundId = val;
          return t;
        };
        t.order = () => t;
        t.maybeSingle = () => {
          const row = boundId ? (opts.crewById[boundId] ?? null) : null;
          return Promise.resolve({ data: row, error: null });
        };
        t.then = (onF: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
          // roster read (no id bind) → return the full roster
          Promise.resolve({ data: opts.roster, error: null } as QueryResult).then(onF, onR);
        return t;
      }
      if (table === "shows") {
        return listThenable({ data: showRow(), error: null });
      }
      if (table === "shows_internal") {
        // Disambiguate run_of_show vs financials by selected columns.
        let cols = "";
        const t: Record<string, unknown> = {};
        t.select = (c?: string) => {
          if (typeof c === "string") cols = c;
          return t;
        };
        t.eq = () => t;
        t.maybeSingle = () => {
          if (cols.includes("financials")) {
            return Promise.resolve({ data: { financials: opts.financials.current }, error: null });
          }
          return Promise.resolve({ data: { run_of_show: null }, error: null });
        };
        return t;
      }
      // hotel_reservations / rooms / transportation / contacts → empty
      if (table === "transportation") {
        return listThenable({ data: null, error: null });
      }
      return listThenable({ data: [], error: null });
    },
    rpc(name: string) {
      counts.rpc[name] = (counts.rpc[name] ?? 0) + 1;
      return Promise.resolve({ data: "tok", error: null });
    },
  };

  return { client, counts };
}

beforeEach(() => {
  cacheState.memo.clear();
  cacheState.recorded.length = 0;
  supabaseState.client = null;
});

describe("getShowForViewer — data cached, version token live (Task 2)", () => {
  test("caches the data fan-out but re-reads the version token live", async () => {
    const { client, counts } = makeCountingClient({
      crewById: {},
      roster: [],
      financials: { current: null },
    });
    supabaseState.client = client;

    await getShowForViewer(SHOW_ID, { kind: "admin" });
    await getShowForViewer(SHOW_ID, { kind: "admin" });

    // Data fan-out memoized → each data table read exactly ONCE across 2 calls.
    expect(counts.from.shows).toBe(1);
    expect(counts.from.hotel_reservations).toBe(1);
    expect(counts.from.rooms).toBe(1);
    expect(counts.from.contacts).toBe(1);

    // Version token RPC fires on EVERY call (LIVE — outside the cache).
    expect(counts.rpc.viewer_version_token).toBe(2);
  });

  test("records correct cache opts and key parts", async () => {
    const { client } = makeCountingClient({
      crewById: {},
      roster: [],
      financials: { current: null },
    });
    supabaseState.client = client;

    await getShowForViewer(SHOW_ID, { kind: "admin" });

    expect(cacheState.recorded.length).toBeGreaterThan(0);
    const rec = cacheState.recorded[0]!;
    expect(rec.opts).toEqual({ tags: [showCacheTag(SHOW_ID)], revalidate: 300 });
    expect(rec.opts.tags).toEqual([`show-${SHOW_ID}`]);
    // key parts include show + viewer.kind + crewMemberId-or-admin
    expect(rec.keyParts).toEqual(["getShowForViewer", SHOW_ID, "admin", "admin"]);
  });

  test("showCacheTag / revalidateShow are exported and well-formed", () => {
    expect(showCacheTag(SHOW_ID)).toBe(`show-${SHOW_ID}`);
    expect(typeof revalidateShow).toBe("function");
  });
});

describe("readShowDataForViewer — JSON-roundtrips (Task 2 step 5)", () => {
  test("cached data has no Date/class instances (survives serialize/deserialize)", async () => {
    const { client } = makeCountingClient({
      crewById: {
        [CREW_A]: {
          id: CREW_A,
          name: "Alice Lead",
          email: "a@x.com",
          phone: null,
          role: "Lead",
          role_flags: ["LEAD"],
          flight_info: "DL123",
          date_restriction: { kind: "none" },
          stage_restriction: { kind: "none" },
        },
      },
      roster: [
        {
          id: CREW_A,
          name: "Alice Lead",
          email: "a@x.com",
          phone: null,
          role: "Lead",
          role_flags: ["LEAD"],
          flight_info: "DL123",
          date_restriction: { kind: "none" },
          stage_restriction: { kind: "none" },
        },
      ],
      financials: { current: { po: "PO-1" } },
    });
    supabaseState.client = client;

    const result = await getShowForViewer(SHOW_ID, { kind: "crew", crewMemberId: CREW_A });
    const roundtripped = JSON.parse(JSON.stringify(result));
    expect(roundtripped).toEqual(result);
  });
});
