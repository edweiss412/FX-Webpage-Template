/**
 * Financials data-projection gate (spec 2026-07-15-extend-role-scope-vocab §4.1/§13).
 *
 * The FINANCIALS `RoleFlag` grant must reach the financials DATA read, not only the
 * tile render predicate (Codex R1 F1 — render predicate alone is NOT enough). This
 * pins the SECOND gate in `getShowForViewer`: `financialsEntitled = isAdmin || LEAD ||
 * FINANCIALS` decides whether the fetched `shows_internal.financials` VALUE reaches
 * the projection.
 *
 * Contract amended 2026-08-07 (spec
 * `docs/superpowers/specs/2026-08-07-projection-financials-viewer-independent-design.md`
 * §2.1): the read itself is now UNCONDITIONAL — it issues on every cache fill for
 * every viewer so fetch failures land in `tileErrors` viewer-independently — and the
 * entitlement gate sits at the RETURN boundary inside `readFinancials`.
 *
 * Mocked service-role client (readOrder.test.ts pattern — NOT the DB-bound
 * getShowForViewer.test.ts harness): the client records every `shows_internal`
 * `.select(col)` so we can assert the financials read issued for every viewer while
 * the projected value stays entitlement-gated. The unconditional `run_of_show` read on
 * the same table is the control: it always issues, proving a live client. Every
 * non-entitled case seeds a REAL `FINANCIALS_ROW`, so `result.financials === undefined`
 * can only pass via the gate, never vacuously.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

// next/cache: pass-through so the data fan-out actually runs (no request context needed).
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

import { getShowForViewer, type Viewer } from "@/lib/data/getShowForViewer";

const SHOW_ID = "fin-entitle-show";
const CREW_ID = "fin-entitle-crew";

const FINANCIALS_ROW = {
  po: "PO-1",
  proposal: "$5,000",
  invoice: "INV-9",
  invoice_notes: "Net 30",
};

type QueryResult = { data: unknown; error: { message: string } | null };

function showRow() {
  return {
    id: SHOW_ID,
    title: "Financials Gate Show",
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
    drive_file_id: "drive-fin",
    source_anchors: {},
    opening_reel_drive_file_id: null,
    opening_reel_drive_modified_time: null,
    opening_reel_head_revision_id: null,
    opening_reel_mime_type: null,
  };
}

/**
 * A service-role client that records every `shows_internal.select(col)`. `run_of_show`
 * (unconditional) is the control; `financials` issuing is the thing under test.
 */
function makeFinancialsClient(
  viewerFlags: string[],
  financialsResult: QueryResult = { data: { financials: FINANCIALS_ROW }, error: null },
) {
  const internalSelects: string[] = [];

  function thenable(result: QueryResult) {
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
        return thenable({ data: showRow(), error: null });
      }
      if (table === "crew_members") {
        // Viewer lookup uses .maybeSingle() and returns the flagged row; the roster
        // read awaits the builder (.then) and returns an array.
        const t: Record<string, unknown> = {};
        const chain = () => t;
        t.select = chain;
        t.eq = chain;
        t.order = chain;
        t.limit = chain;
        t.maybeSingle = () =>
          Promise.resolve({
            data: { role_flags: viewerFlags, name: "Marcus Webb", flight_info: null },
            error: null,
          } as QueryResult);
        t.then = (onF: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null } as QueryResult).then(onF, onR);
        return t;
      }
      if (table === "shows_internal") {
        const t: Record<string, unknown> = {};
        t.select = (col: string) => {
          internalSelects.push(col);
          if (col === "financials") return thenable(financialsResult);
          return thenable({ data: { run_of_show: null }, error: null });
        };
        return t;
      }
      return thenable({ data: [], error: null });
    },
    rpc(name: string) {
      if (name === "viewer_version_token") {
        return Promise.resolve({ data: "1", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  return { client, internalSelects };
}

beforeEach(() => {
  supabaseState.client = null;
});

describe("getShowForViewer financials entitlement gate (§4.1)", () => {
  test("FINANCIALS-only viewer (non-LEAD, non-admin): financials read ISSUES and data is present", async () => {
    const { client, internalSelects } = makeFinancialsClient(["FINANCIALS"]);
    supabaseState.client = client;

    const viewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };
    const result = await getShowForViewer(SHOW_ID, viewer);

    // The gate is FINANCIALS-specific, NOT LEAD — this viewer has no LEAD flag.
    expect(internalSelects).toContain("financials");
    // Data reached the projection (derived from FINANCIALS_ROW, not hardcoded).
    expect(result.financials).toEqual(FINANCIALS_ROW);
  });

  test("viewer with NEITHER entitlement: financials read ISSUES, result still carries NO financials (return-boundary gate)", async () => {
    const { client, internalSelects } = makeFinancialsClient([]);
    supabaseState.client = client;

    const viewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };
    const result = await getShowForViewer(SHOW_ID, viewer);

    // Control: the unconditional run_of_show read still fired, so the client is live.
    expect(internalSelects).toContain("run_of_show");
    // NEW contract (spec 2026-08-07 §2.1): the financials read issues for EVERY viewer,
    expect(internalSelects).toContain("financials");
    // but the VALUE is discarded at the return boundary. The mock seeded a real
    // FINANCIALS_ROW, so this can only pass via the gate, never vacuously.
    expect(result.financials).toBeUndefined();
  });

  test("viewer with NEITHER entitlement: financials query error sets tileErrors.financials (viewer-independent observability)", async () => {
    const { client, internalSelects } = makeFinancialsClient([], {
      data: null,
      error: { message: "financials boom" },
    });
    supabaseState.client = client;

    const viewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };
    const result = await getShowForViewer(SHOW_ID, viewer);

    expect(internalSelects).toContain("financials");
    expect(result.tileErrors.financials).toBe("financials boom");
    expect(result.financials).toBeUndefined();
  });

  test("LEAD viewer: financials query error sets tileErrors.financials (unchanged pre-existing behavior)", async () => {
    const { client } = makeFinancialsClient(["LEAD"], {
      data: null,
      error: { message: "financials boom" },
    });
    supabaseState.client = client;

    const result = await getShowForViewer(SHOW_ID, { kind: "crew", crewMemberId: CREW_ID });

    expect(result.tileErrors.financials).toBe("financials boom");
    expect(result.financials).toBeUndefined();
  });

  test("LEAD viewer: financials read ISSUES (unchanged pre-existing entitlement)", async () => {
    const { client, internalSelects } = makeFinancialsClient(["LEAD"]);
    supabaseState.client = client;

    const viewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };
    const result = await getShowForViewer(SHOW_ID, viewer);

    expect(internalSelects).toContain("financials");
    expect(result.financials).toEqual(FINANCIALS_ROW);
  });
});
