// Flow-4 auto-applied strip Task 3 (spec §6.1) — loadRecentAutoApplied loader.
//
// Reads the un-dispositioned auto-applied changes (source='auto_apply',
// status='applied', acknowledged_at IS NULL, change_kind ∈ the 5 strip kinds),
// groups them by show newest-first, caps the render at STRIP_RENDER_CAP, and
// separately fetches per-show roster-shift counts via the roster_shift_counts
// RPC keyed on the passed publishedShowIds.
//
// The fake client SIMULATES PostgREST WHERE filtering from the captured
// .eq/.is/.in calls, so an exclusion assertion is real: if the loader omits a
// filter, the row it should have excluded leaks into a group and the
// scoped-by-id assertion fails (anti-tautology). It ALSO models count:"exact":
// `count` carries the true filtered total while `data` is bounded by the
// captured limit — so overflowCount is proven to come from the total, not from
// the capped row count (which production bounds and could never exceed +1).
import { describe, expect, test } from "vitest";
import type { loadRecentAutoApplied as LoadFn } from "@/lib/admin/loadRecentAutoApplied";

type Row = Record<string, unknown>;
type RosterRow = { show_id: string; added: number; removed: number; renamed: number };

type FakeOpts = {
  rows?: Row[];
  rosterRows?: RosterRow[];
  throwOn?: "from" | "rpc";
  errorOn?: "from" | "rpc";
};

function makeClient(opts: FakeOpts) {
  const captured = {
    rpcFn: null as string | null,
    rpcArgs: null as { p_show_ids?: unknown } | null,
    eq: [] as [string, unknown][],
    is: [] as [string, unknown][],
    inCol: null as string | null,
    inArgs: null as unknown[] | null,
    order: [] as unknown[][],
    limit: null as number | null,
  };
  const client = {
    from(_table: string) {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = (c: string, v: unknown) => {
        captured.eq.push([c, v]);
        return builder;
      };
      builder.is = (c: string, v: unknown) => {
        captured.is.push([c, v]);
        return builder;
      };
      builder.in = (c: string, v: unknown[]) => {
        captured.inCol = c;
        captured.inArgs = v;
        return builder;
      };
      builder.order = (...a: unknown[]) => {
        captured.order.push(a);
        return builder;
      };
      builder.limit = (n: number) => {
        captured.limit = n;
        return builder;
      };
      (builder as { then?: unknown }).then = (
        onf?: ((v: unknown) => unknown) | null,
        onr?: ((e: unknown) => unknown) | null,
      ) => {
        try {
          if (opts.throwOn === "from") throw new Error("SIMULATED show_change_log throw");
          if (opts.errorOn === "from") {
            return Promise.resolve({
              data: null,
              error: { message: "SIMULATED show_change_log error" },
            }).then(onf ?? undefined, onr ?? undefined);
          }
          let rows = (opts.rows ?? []).slice();
          for (const [c, v] of captured.eq) rows = rows.filter((r) => r[c] === v);
          for (const [c, v] of captured.is) rows = rows.filter((r) => (r[c] ?? null) === v);
          if (captured.inCol) {
            const col = captured.inCol;
            const arr = captured.inArgs ?? [];
            rows = rows.filter((r) => arr.includes(r[col]));
          }
          // Model PostgREST count:"exact": `count` = true filtered total,
          // `data` = the limit-bounded slice (see header).
          const total = rows.length;
          const data = captured.limit != null ? rows.slice(0, captured.limit) : rows;
          return Promise.resolve({ data, count: total, error: null }).then(
            onf ?? undefined,
            onr ?? undefined,
          );
        } catch (e) {
          return Promise.reject(e).then(onf ?? undefined, onr ?? undefined);
        }
      };
      return builder;
    },
    rpc(fn: string, args: { p_show_ids?: unknown }) {
      captured.rpcFn = fn;
      captured.rpcArgs = args;
      if (opts.throwOn === "rpc") return Promise.reject(new Error("SIMULATED rpc throw"));
      if (opts.errorOn === "rpc") {
        return Promise.resolve({ data: null, error: { message: "SIMULATED rpc error" } });
      }
      return Promise.resolve({ data: opts.rosterRows ?? [], error: null });
    },
  };
  return { client, captured };
}

type InjectedClient = NonNullable<Parameters<typeof LoadFn>[0]["supabase"]>;
async function loader() {
  const mod = await import("@/lib/admin/loadRecentAutoApplied");
  return mod;
}

// ── fixtures ───────────────────────────────────────────────────────────────
function clRow(o: Partial<Row> & { id: string; show_id: string; occurred_at: string }): Row {
  return {
    change_kind: "crew_added",
    summary: `summary-${o.id}`,
    individually_undoable: true,
    source: "auto_apply",
    status: "applied",
    acknowledged_at: null,
    shows: { slug: `${o.show_id}-slug`, title: `${o.show_id} Title` },
    ...o,
  };
}
function iso(min: number): string {
  return `2026-07-01T10:${String(min).padStart(2, "0")}:00.000Z`;
}

describe("loadRecentAutoApplied", () => {
  test("groups by show newest-first; correct filter/undoable/acceptable/undoable-id/summary handling", async () => {
    const A = "show-A";
    const B = "show-B";
    // Displayed rows, fed in overall occurred_at-desc order (loader preserves DB order).
    const a1 = clRow({ id: "a1", show_id: A, occurred_at: iso(50), change_kind: "crew_added" }); // undoable
    const b2 = clRow({ id: "b2", show_id: B, occurred_at: iso(48), change_kind: "crew_removed" }); // undoable
    const b1 = clRow({
      id: "b1",
      show_id: B,
      occurred_at: iso(45),
      change_kind: "crew_renamed",
      individually_undoable: false, // NOT undoable despite crew_* kind
    });
    const a2 = clRow({ id: "a2", show_id: A, occurred_at: iso(40), change_kind: "field_changed" }); // not undoable
    const a3 = clRow({
      id: "a3",
      show_id: A,
      occurred_at: iso(35),
      change_kind: "crew_email_changed", // not undoable
    });
    // Exclusion rows — each MUST be filtered out; scoped by id below.
    const exAck = clRow({
      id: "ex-ack",
      show_id: A,
      occurred_at: iso(55),
      acknowledged_at: iso(56),
    });
    const exUndone = clRow({ id: "ex-undone", show_id: A, occurred_at: iso(54), status: "undone" });
    const exSuperseded = clRow({
      id: "ex-superseded",
      show_id: A,
      occurred_at: iso(53),
      status: "superseded",
    });
    const exMi11 = clRow({
      id: "ex-mi11",
      show_id: A,
      occurred_at: iso(52),
      source: "mi11_approve",
    });
    const exUndo = clRow({ id: "ex-undo", show_id: A, occurred_at: iso(51), source: "undo" });
    const exKind = clRow({
      id: "ex-kind",
      show_id: A,
      occurred_at: iso(49),
      change_kind: "section_shrunk",
    });

    const { client, captured } = makeClient({
      rows: [exAck, exUndone, exSuperseded, exMi11, exUndo, a1, b2, exKind, b1, a2, a3],
    });
    const { loadRecentAutoApplied } = await loader();
    const result = await loadRecentAutoApplied({
      publishedShowIds: [A, B],
      supabase: client as unknown as InjectedClient,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");

    // Order-by-desc intent is issued to the DB.
    expect(captured.order).toContainEqual(["occurred_at", { ascending: false }]);

    // Two groups, in first-appearance (newest-first) order: A (50) then B (48).
    expect(result.groups.map((g) => g.showId)).toEqual([A, B]);

    const groupA = result.groups.find((g) => g.showId === A)!;
    const groupB = result.groups.find((g) => g.showId === B)!;

    expect(groupA.slug).toBe("show-A-slug");
    expect(groupA.showName).toBe("show-A Title");

    // Group A rows preserve desc order; summary passed through verbatim.
    expect(groupA.rows.map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
    expect(groupA.rows.map((r) => r.summary)).toEqual(["summary-a1", "summary-a2", "summary-a3"]);
    expect(groupB.rows.map((r) => r.id)).toEqual(["b2", "b1"]);

    // undoable flags.
    expect(groupA.rows.find((r) => r.id === "a1")!.undoable).toBe(true); // crew_added + indiv true
    expect(groupA.rows.find((r) => r.id === "a2")!.undoable).toBe(false); // field_changed
    expect(groupA.rows.find((r) => r.id === "a3")!.undoable).toBe(false); // crew_email_changed
    expect(groupB.rows.find((r) => r.id === "b2")!.undoable).toBe(true); // crew_removed + indiv true
    expect(groupB.rows.find((r) => r.id === "b1")!.undoable).toBe(false); // crew_* but indiv false

    // acceptableIds = all displayed ids; undoableIds = displayed undoable subset.
    expect(groupA.acceptableIds).toEqual(["a1", "a2", "a3"]);
    expect(groupA.undoableIds).toEqual(["a1"]);
    expect(groupB.acceptableIds).toEqual(["b2", "b1"]);
    expect(groupB.undoableIds).toEqual(["b2"]);

    // Each exclusion is scoped to its specific id — none appears anywhere.
    const allIds = result.groups.flatMap((g) => g.rows.map((r) => r.id));
    for (const excluded of [
      "ex-ack",
      "ex-undone",
      "ex-superseded",
      "ex-mi11",
      "ex-undo",
      "ex-kind",
    ]) {
      expect(allIds).not.toContain(excluded);
    }

    // renderedCount == displayed count; no overflow here.
    expect(result.renderedCount).toBe(5);
    expect(result.overflowCount).toBe(0);
  });

  test("cap: STRIP_RENDER_CAP+3 matching rows → renderedCount == cap, overflowCount == 3, bound pinned", async () => {
    const { STRIP_RENDER_CAP } = await loader();
    const n = STRIP_RENDER_CAP + 3;
    const rows = Array.from({ length: n }, (_, i) =>
      clRow({ id: `r${i}`, show_id: "show-cap", occurred_at: iso(59 - (i % 59)) }),
    );
    const { client, captured } = makeClient({ rows });
    const { loadRecentAutoApplied } = await loader();
    const result = await loadRecentAutoApplied({
      publishedShowIds: ["show-cap"],
      supabase: client as unknown as InjectedClient,
    });
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.renderedCount).toBe(STRIP_RENDER_CAP);
    // overflowCount is the TRUE backlog (cap+3) minus the render cap = 3, sourced
    // from count:"exact" — NOT from the capped row count (which maxes at the cap).
    expect(result.overflowCount).toBe(3);
    expect(result.groups[0]!.rows.length).toBe(STRIP_RENDER_CAP);
    // The row read is bounded at exactly the render cap.
    expect(captured.limit).toBe(STRIP_RENDER_CAP);
  });

  test("rosterShiftByShow: driven by rpc keyed on publishedShowIds; total=added+removed+renamed; absent shows omitted", async () => {
    const A = "show-A";
    const B = "show-B";
    const C = "show-C"; // published, has roster rows, ZERO displayed strip rows
    const a1 = clRow({ id: "a1", show_id: A, occurred_at: iso(50), change_kind: "crew_added" });
    const rosterRows: RosterRow[] = [
      { show_id: A, added: 2, removed: 1, renamed: 0 },
      { show_id: C, added: 0, removed: 0, renamed: 3 },
      // B intentionally absent from the rpc result.
    ];
    const { client, captured } = makeClient({ rows: [a1], rosterRows });
    const { loadRecentAutoApplied } = await loader();
    const result = await loadRecentAutoApplied({
      publishedShowIds: [A, B, C],
      supabase: client as unknown as InjectedClient,
    });
    if (result.kind !== "ok") throw new Error("unreachable");

    // rpc called with the exact publishedShowIds (no unpublished id ever leaks in).
    expect(captured.rpcFn).toBe("roster_shift_counts");
    expect(captured.rpcArgs?.p_show_ids).toEqual([A, B, C]);

    expect(result.rosterShiftByShow[A]).toEqual({ added: 2, removed: 1, renamed: 0, total: 3 });
    // C appears even though it has no displayed strip rows.
    expect(result.groups.some((g) => g.showId === C)).toBe(false);
    expect(result.rosterShiftByShow[C]).toEqual({ added: 0, removed: 0, renamed: 3, total: 3 });
    // B absent from rpc → omitted (badge sees undefined).
    expect(result.rosterShiftByShow[B]).toBeUndefined();
  });

  test.each([
    ["from", "throwOn"],
    ["from", "errorOn"],
    ["rpc", "throwOn"],
    ["rpc", "errorOn"],
  ] as const)("client fault (%s via %s) → { kind: 'infra_error' }", async (surface, mode) => {
    const { client } = makeClient({
      rows: [clRow({ id: "x", show_id: "s", occurred_at: iso(10) })],
      rosterRows: [],
      [mode]: surface,
    } as FakeOpts);
    const { loadRecentAutoApplied } = await loader();
    const result = await loadRecentAutoApplied({
      publishedShowIds: ["s"],
      supabase: client as unknown as InjectedClient,
    });
    expect(result.kind).toBe("infra_error");
  });
});
