/**
 * Read-order fence (audit idx19) — getShowForViewer must sample the LIVE
 * viewer_version_token BEFORE the cached data fan-out, so the rendered token is
 * never NEWER than the rendered data (invariant: token <= data).
 *
 * If a write commits during the render window, the OLD order (data-then-token)
 * yields stale-data + fresh-token: the realtime bridge's equality catch-up
 * (ShowRealtimeBridge — token === server → no router.refresh()) then suppresses
 * the refresh and the page stays stuck stale. Token-first makes the worst case
 * old-token + fresh-data (tokens differ → refresh fires → converges), and
 * exactly-consistent otherwise.
 *
 * This is a deterministic ordering test: a single simulated write bumps a shared
 * `version` counter between the two awaits (triggered by whichever read runs
 * first). We assert the returned token is <= the version the data was read at.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

// next/cache: pass-through (invoke the data fan-out; no request-context needed).
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => Promise<unknown>) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn(),
}));

const supabaseState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => supabaseState.client,
}));

import { getShowForViewer } from "@/lib/data/getShowForViewer";

const SHOW_ID = "read-order-show";

type QueryResult = { data: unknown; error: { message: string } | null };

function showRow() {
  return {
    id: SHOW_ID,
    title: "Read Order Show",
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
 * A service-role client whose two version-bearing reads — the viewer_version_token
 * RPC and the `shows` fan-out read — each capture the shared `version` at dispatch
 * and, exactly once (whichever runs first), bump it. That single bump models a
 * write committing BETWEEN the two awaits.
 */
function makeVersionRaceClient() {
  const state = { version: 0, bumped: false, tokenVersion: -1, dataVersion: -1 };
  const captureAndBumpOnce = (): number => {
    const v = state.version;
    if (!state.bumped) {
      state.bumped = true;
      state.version = v + 1;
    }
    return v;
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
      if (table === "shows") {
        state.dataVersion = captureAndBumpOnce();
        return listThenable({ data: showRow(), error: null });
      }
      if (table === "crew_members") {
        const t: Record<string, unknown> = {};
        t.select = () => t;
        t.eq = () => t;
        t.order = () => t;
        t.maybeSingle = () => Promise.resolve({ data: null, error: null });
        t.then = (onF: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null } as QueryResult).then(onF, onR);
        return t;
      }
      if (table === "shows_internal") {
        const t: Record<string, unknown> = {};
        t.select = () => t;
        t.eq = () => t;
        t.maybeSingle = () => Promise.resolve({ data: { run_of_show: null }, error: null });
        return t;
      }
      if (table === "transportation") {
        return listThenable({ data: null, error: null });
      }
      return listThenable({ data: [], error: null });
    },
    rpc(name: string) {
      if (name === "viewer_version_token") {
        state.tokenVersion = captureAndBumpOnce();
        return Promise.resolve({ data: String(state.tokenVersion), error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  return { client, state };
}

beforeEach(() => {
  supabaseState.client = null;
});

describe("getShowForViewer — read-order fence (audit idx19)", () => {
  test("rendered token is never newer than the rendered data under a concurrent write", async () => {
    const { client, state } = makeVersionRaceClient();
    supabaseState.client = client;

    const result = await getShowForViewer(SHOW_ID, { kind: "admin" });

    // Both reads observed a version; the single write bumped between them.
    expect(state.tokenVersion).toBeGreaterThanOrEqual(0);
    expect(state.dataVersion).toBeGreaterThanOrEqual(0);
    expect(state.tokenVersion).not.toBe(state.dataVersion); // the bump happened between them

    // INVARIANT: the token the page renders must be <= the version its data was
    // read at. Otherwise the bridge sees a fresh token beside stale data and
    // suppresses the catch-up refresh (stuck-stale). Data-then-token order
    // renders token=1 beside data@0 → violates this; token-then-data renders
    // token=0 beside data@1 → satisfies it.
    expect(Number(result.viewerVersionToken)).toBeLessThanOrEqual(state.dataVersion);
  });
});
