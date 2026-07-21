/**
 * tests/dev/materializeRun.test.ts
 * (spec 2026-07-20-attention-scenario-gallery §5.1, §5.2, §7.5)
 *
 * The write executor. Everything here is about the Supabase call boundary
 * (invariant 9): every call destructures `{ data, error }`, a returned error and
 * a thrown rejection reach the same discriminable typed result, and a failure
 * AFTER something committed is `partial` — never a bare throw that would leave
 * the caller unable to tell what landed.
 */
import { describe, expect, test, vi } from "vitest";
import { executeApply, executeClear, DEV_SCENARIO_TAG } from "@/lib/dev/materialize/run";
import { planApply, planClear } from "@/lib/dev/materialize/plan";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import { T3_CREW_COLLISION, T3_HOLD_AND_DRIFT } from "@/lib/dev/attentionScenarios/tier3";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

const SHOW = { id: "show-uuid", driveFileId: "drive-file-1" };

type Call = {
  table: string;
  verb: string;
  filters: Array<[string, ...unknown[]]>;
  payload?: unknown;
};

/**
 * A chainable Supabase stub that RECORDS what was issued. Per-table-and-verb
 * outcomes are scripted, so a test can fail exactly the third call without
 * caring how the executor spells the first two.
 */
function mockClient(
  script: Record<string, { data?: unknown; error?: unknown; throws?: boolean }> = {},
) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const make = (verb: string, payload?: unknown) => {
      const call: Call = {
        table,
        verb,
        filters: [],
        ...(payload === undefined ? {} : { payload }),
      };
      calls.push(call);
      const node: Record<string, unknown> = {};
      for (const m of ["eq", "is", "not", "in", "like", "select", "limit"]) {
        node[m] = (...args: unknown[]) => {
          call.filters.push([m, ...args]);
          return node;
        };
      }
      const outcome = script[`${table}.${verb}`] ?? {};
      node.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (outcome.throws)
          return Promise.reject(new Error(`boom ${table}.${verb}`)).then(resolve, reject);
        return Promise.resolve({ data: outcome.data ?? [], error: outcome.error ?? null }).then(
          resolve,
        );
      };
      return node;
    };
    return {
      delete: () => make("delete"),
      insert: (payload: unknown) => make("insert", payload),
      update: (payload: unknown) => make("update", payload),
      select: (cols: string) => make("select", cols),
    };
  };
  return { client: { from } as never, calls };
}

function s(id: string): AttentionScenario {
  const found = scenarioById(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function applyPlan(scenario: AttentionScenario, target: "local" | "validation" = "local") {
  const p = planApply(scenario, { slug: "demo", archived: false, target });
  if (p.kind !== "ok") throw new Error(`expected an ok plan, got ${p.kind}`);
  return p;
}

describe("executeApply — the issued statements", () => {
  test("deletes are scoped to the show AND the dev tag, so authentic rows survive", async () => {
    const { client, calls } = mockClient();
    await executeApply(s(T3_CREW_COLLISION), applyPlan(s(T3_CREW_COLLISION)), SHOW, "local", {
      client,
    });

    const alertDelete = calls.find((c) => c.table === "admin_alerts" && c.verb === "delete");
    expect(alertDelete?.filters).toContainEqual(["eq", "show_id", SHOW.id]);
    // The tag predicate is what keeps this from wiping a real operator's alerts.
    expect(alertDelete?.filters).toContainEqual(["not", "context->>__devScenario", "is", null]);

    const holdDelete = calls.find((c) => c.table === "sync_holds" && c.verb === "delete");
    expect(holdDelete?.filters).toContainEqual(["eq", "show_id", SHOW.id]);
    expect(holdDelete?.filters).toContainEqual(["eq", "created_by", DEV_SCENARIO_TAG]);
  });

  test("deletes are issued before any insert", async () => {
    const { client, calls } = mockClient();
    await executeApply(s(T3_HOLD_AND_DRIFT), applyPlan(s(T3_HOLD_AND_DRIFT)), SHOW, "local", {
      client,
    });
    const order = calls.map((c) => `${c.table}.${c.verb}`);
    const lastDelete = Math.max(
      order.lastIndexOf("admin_alerts.delete"),
      order.lastIndexOf("sync_holds.delete"),
    );
    const firstInsert = order.findIndex((o) => o.endsWith(".insert"));
    expect(firstInsert).toBeGreaterThan(lastDelete);
  });

  test("inserted alert rows carry the tag, the scenario's fields, and the show", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client, calls } = mockClient();
    await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    const insert = calls.find((c) => c.table === "admin_alerts" && c.verb === "insert");
    const rows = insert?.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(scenario.alerts.length);
    expect(rows[0]!.show_id).toBe(SHOW.id);
    expect(rows[0]!.code).toBe(scenario.alerts[0]!.code);
    expect(rows[0]!.occurrence_count).toBe(scenario.alerts[0]!.occurrence_count);
    expect((rows[0]!.context as Record<string, unknown>).__devScenario).toBe(scenario.id);
    // Unresolved by construction: a resolved synthetic alert renders nothing.
    expect(rows[0]!.resolved_at).toBeNull();
  });

  test("inserted holds carry the constant tag in created_by", async () => {
    const scenario = s(T3_HOLD_AND_DRIFT);
    const { client, calls } = mockClient();
    await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    const rows = calls.find((c) => c.table === "sync_holds" && c.verb === "insert")
      ?.payload as Array<Record<string, unknown>>;
    expect(rows[0]!.created_by).toBe(DEV_SCENARIO_TAG);
    expect(rows[0]!.show_id).toBe(SHOW.id);
    expect(rows[0]!.drive_file_id).toBe(SHOW.driveFileId);
    expect(rows[0]!.entity_key).toBe(scenario.holds[0]!.entity_key);
  });
});

describe("executeApply — collisions with authentic rows", () => {
  test("a colliding code is SKIPPED and named, and the non-colliding one still inserts", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const colliding = scenario.alerts[0]!.code;
    const two: AttentionScenario = {
      ...scenario,
      alerts: [
        scenario.alerts[0]!,
        {
          code: "SYNC_STALLED",
          context: {},
          raised_at: "2026-07-01T12:00:00.000Z",
          occurrence_count: 1,
        },
      ],
    };
    const { client, calls } = mockClient({
      "admin_alerts.select": { data: [{ code: colliding }] },
    });
    const r = await executeApply(two, applyPlan(two), SHOW, "local", { client });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.skipped).toEqual([{ code: colliding, reason: "unresolved_row_present" }]);
    expect(r.alerts).toBe(1);
    const rows = calls.find((c) => c.table === "admin_alerts" && c.verb === "insert")
      ?.payload as Array<Record<string, unknown>>;
    expect(rows.map((x) => x.code)).toEqual(["SYNC_STALLED"]);
  });

  test("when EVERY code collides, no insert is issued at all", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client, calls } = mockClient({
      "admin_alerts.select": { data: scenario.alerts.map((a) => ({ code: a.code })) },
    });
    const r = await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.alerts).toBe(0);
    expect(calls.some((c) => c.table === "admin_alerts" && c.verb === "insert")).toBe(false);
  });

  test("a colliding hold key is skipped with its own reason", async () => {
    const scenario = s(T3_HOLD_AND_DRIFT);
    const key = scenario.holds[0]!.entity_key;
    const { client } = mockClient({
      "sync_holds.select": { data: [{ domain: scenario.holds[0]!.domain, entity_key: key }] },
    });
    const r = await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.holds).toBe(0);
      expect(r.skipped).toContainEqual({ code: `crew_email:${key}`, reason: "hold_key_present" });
    }
  });
});

describe("executeApply — warnings", () => {
  test("local writes the declared warnings to shows_internal", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client, calls } = mockClient();
    const r = await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    expect(r.kind === "ok" && r.warnings).toBe("written");
    const update = calls.find((c) => c.table === "shows_internal" && c.verb === "update");
    expect((update?.payload as Record<string, unknown>).parse_warnings).toEqual(scenario.warnings);
    expect(update?.filters).toContainEqual(["eq", "show_id", SHOW.id]);
  });

  test("validation never touches shows_internal and reports the skip distinctly", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client, calls } = mockClient();
    const r = await executeApply(scenario, applyPlan(scenario, "validation"), SHOW, "validation", {
      client,
    });
    expect(r.kind === "ok" && r.warnings).toBe("skipped_validation");
    expect(calls.some((c) => c.table === "shows_internal")).toBe(false);
  });

  test("a scenario that declares no warnings reports untouched", async () => {
    const scenario = s(T3_HOLD_AND_DRIFT);
    const { warnings: _dropped, ...noWarnings } = scenario;
    void _dropped;
    const { client, calls } = mockClient();
    const r = await executeApply(noWarnings, applyPlan(noWarnings), SHOW, "local", { client });
    expect(r.kind === "ok" && r.warnings).toBe("untouched");
    expect(calls.some((c) => c.table === "shows_internal")).toBe(false);
  });
});

describe("executeApply — the Supabase call boundary (invariant 9)", () => {
  test("a returned error on the FIRST write is infra_error, because nothing committed", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client } = mockClient({ "admin_alerts.delete": { error: { message: "nope" } } });
    const r = await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    expect(r.kind).toBe("infra_error");
    if (r.kind === "infra_error") expect(r.message).toContain("nope");
  });

  test("a THROWN rejection on the first write reaches the same typed result, not an escape", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client } = mockClient({ "admin_alerts.delete": { throws: true } });
    const r = await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    expect(r.kind).toBe("infra_error");
  });

  test("a failure AFTER a commit is partial, and names the step that failed", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client } = mockClient({ "shows_internal.update": { error: { message: "late" } } });
    const r = await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    expect(r.kind).toBe("partial");
    if (r.kind === "partial") {
      expect(r.failedStep).toBe("writeWarnings");
      // The counts must reflect what ACTUALLY landed, or the operator cannot
      // tell whether a retry is safe.
      expect(r.committed.alerts).toBe(scenario.alerts.length);
    }
  });

  test("a thrown rejection after a commit is ALSO partial, not infra_error", async () => {
    const scenario = s(T3_CREW_COLLISION);
    const { client } = mockClient({ "shows_internal.update": { throws: true } });
    const r = await executeApply(scenario, applyPlan(scenario), SHOW, "local", { client });
    expect(r.kind).toBe("partial");
  });
});

describe("executeClear", () => {
  test("issues both tag-scoped deletes and calls re-sync directly on local", async () => {
    const { client, calls } = mockClient();
    const resync = vi.fn(async () => {});
    const r = await executeClear(planClear({ slug: "demo", target: "local" }), SHOW, "local", {
      client,
      resync,
    });
    expect(r.kind).toBe("ok");
    expect(calls.filter((c) => c.verb === "delete").map((c) => c.table)).toEqual([
      "admin_alerts",
      "sync_holds",
    ]);
    // Directly, never an HTTP request to the app's own route.
    expect(resync).toHaveBeenCalledWith(SHOW.driveFileId);
  });

  test("validation skips re-sync as POLICY, distinct from a re-sync that failed", async () => {
    const { client } = mockClient();
    const resync = vi.fn(async () => {});
    const r = await executeClear(
      planClear({ slug: "demo", target: "validation" }),
      SHOW,
      "validation",
      { client, resync },
    );
    expect(r.kind === "ok" && r.warnings).toBe("skipped_validation");
    expect(resync).not.toHaveBeenCalled();
  });

  test("a failing re-sync after successful deletes is partial, not a lost cleanup", async () => {
    const { client } = mockClient();
    const resync = vi.fn(async () => {
      throw new Error("sync unreachable");
    });
    const r = await executeClear(planClear({ slug: "demo", target: "local" }), SHOW, "local", {
      client,
      resync,
    });
    expect(r.kind).toBe("partial");
    if (r.kind === "partial") expect(r.failedStep).toBe("resync");
  });

  test("clearing when nothing is tagged still succeeds", async () => {
    const { client } = mockClient();
    const r = await executeClear(planClear({ slug: "demo", target: "local" }), SHOW, "local", {
      client,
      resync: async () => {},
    });
    expect(r.kind).toBe("ok");
  });
});
