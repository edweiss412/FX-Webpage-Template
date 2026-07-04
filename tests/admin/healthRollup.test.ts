// tests/admin/healthRollup.test.ts
import { readFileSync } from "node:fs";
import { it, expect, vi, beforeEach } from "vitest";
import {
  HEALTH_CODES,
  DEGRADED_HEALTH_CODES,
  NOTICE_HEALTH_CODES,
  dougSummaryFor,
} from "@/lib/adminAlerts/audience";

const state = {
  throwOnConstruct: false,
  throwOnFrom: false,
  returnError: false,
  nullCount: false,
  rows: {} as Record<string, number>, // code -> unresolved row count
  fromCount: 0,
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("construct boom");
    return {
      from: () => {
        state.fromCount++;
        if (state.throwOnFrom) throw new Error("boom");
        let filterCodes: string[] | null = null;
        type Builder = {
          select: () => Builder;
          is: () => Builder;
          in: (col: string, arr: string[]) => Builder;
          eq: (col: string, val: string) => Builder;
          then: (
            f: (r: {
              data: null;
              count: number | null;
              error: { message: string } | null;
            }) => unknown,
          ) => unknown;
        };
        const b = {} as Builder;
        const pass = () => b;
        b.select = pass;
        b.is = pass;
        b.in = ((_col: string, arr: string[]) => {
          filterCodes = arr;
          return b;
        }) as Builder["in"];
        b.eq = ((_col: string, val: string) => {
          filterCodes = [val];
          return b;
        }) as Builder["eq"];
        b.then = (f) => {
          if (state.returnError || state.nullCount) {
            return f({
              data: null,
              count: null,
              error: state.returnError ? { message: "rls" } : null,
            });
          }
          const codes = filterCodes ?? Object.keys(state.rows);
          const count = codes.reduce((sum, c) => sum + (state.rows[c] ?? 0), 0);
          return f({ data: null, count, error: null });
        };
        return b;
      },
    };
  },
}));

beforeEach(() => {
  state.throwOnConstruct = false;
  state.throwOnFrom = false;
  state.returnError = false;
  state.nullCount = false;
  state.rows = {};
  state.fromCount = 0;
});

import { fetchHealthRollup, POPOVER_SUMMARY_CAP } from "@/lib/admin/healthRollup";

const DEG = DEGRADED_HEALTH_CODES;
const NOT = NOTICE_HEALTH_CODES;

it("zero unresolved health rows → { kind:'ok' } and short-circuits (only the total probe)", async () => {
  expect(await fetchHealthRollup()).toEqual({ kind: "ok" });
  expect(state.fromCount).toBe(1); // no degraded probe, no per-code probes
});

it("≥1 degraded row → kind:'degraded' with exact total count", async () => {
  state.rows = { [DEG[0]!]: 2, [NOT[0]!]: 1 };
  const r = await fetchHealthRollup();
  expect(r.kind).toBe("degraded");
  if (r.kind !== "degraded") throw new Error("narrow");
  expect(r.count).toBe(3);
});

it("only notice rows → kind:'notice'", async () => {
  state.rows = { [NOT[0]!]: 2 };
  const r = await fetchHealthRollup();
  expect(r.kind).toBe("notice");
});

it("construction throw → infra_error", async () => {
  state.throwOnConstruct = true;
  expect(await fetchHealthRollup()).toEqual({ kind: "infra_error" });
});

it("thrown from() → infra_error", async () => {
  state.throwOnFrom = true;
  expect(await fetchHealthRollup()).toEqual({ kind: "infra_error" });
});

it("returned { error } → infra_error", async () => {
  state.returnError = true;
  expect(await fetchHealthRollup()).toEqual({ kind: "infra_error" });
});

it("non-number (null) count without error → infra_error; data:null head shape is NOT infra_error", async () => {
  state.nullCount = true;
  expect(await fetchHealthRollup()).toEqual({ kind: "infra_error" });
  // control: a normal head probe returns data:null yet is NOT an infra_error
  state.nullCount = false;
  state.rows = { [NOT[0]!]: 1 };
  expect((await fetchHealthRollup()).kind).toBe("notice");
});

it("summaries: same-weight codes sort by count desc", async () => {
  state.rows = { [NOT[0]!]: 3, [NOT[1]!]: 1 };
  const r = await fetchHealthRollup();
  if (r.kind !== "notice") throw new Error("expected notice");
  expect(r.summaries[0]).toEqual({ text: dougSummaryFor(NOT[0]!), count: 3 });
  expect(r.summaries[1]).toEqual({ text: dougSummaryFor(NOT[1]!), count: 1 });
});

it("summaries: degraded-weighted lines sort first even with a lower count", async () => {
  state.rows = { [NOT[0]!]: 5, [DEG[0]!]: 1 };
  const r = await fetchHealthRollup();
  if (r.kind !== "degraded") throw new Error("expected degraded");
  expect(r.summaries[0]!.text).toBe(dougSummaryFor(DEG[0]!));
});

it("overflowCount is exact when >cap distinct summaries", async () => {
  const six = [...DEG.slice(0, 3), ...NOT.slice(0, 3)];
  state.rows = Object.fromEntries(six.map((c) => [c, 1]));
  const r = await fetchHealthRollup();
  if (r.kind === "ok" || r.kind === "infra_error") throw new Error("expected active");
  expect(r.summaries.length).toBe(POPOVER_SUMMARY_CAP);
  expect(r.overflowCount).toBe(six.length - POPOVER_SUMMARY_CAP);
});

it("truncation-proof: huge notice volume + one degraded → kind degraded, degraded summary present", async () => {
  state.rows = { [NOT[0]!]: 500, [DEG[0]!]: 1 };
  const r = await fetchHealthRollup();
  expect(r.kind).toBe("degraded");
  if (r.kind !== "degraded") throw new Error("narrow");
  const texts = r.summaries.map((s) => s.text);
  expect(texts).toContain(dougSummaryFor(DEG[0]!));
});

it("AC10: an uncataloged code is not counted by the health rollup → { kind:'ok' }", async () => {
  state.rows = { TOTALLY_UNKNOWN_CODE: 5 };
  expect(HEALTH_CODES).not.toContain("TOTALLY_UNKNOWN_CODE");
  expect(await fetchHealthRollup()).toEqual({ kind: "ok" });
  expect(state.fromCount).toBe(1); // short-circuit: unknown row invisible to the health head count
});

it("invariant 9: destructures { data, count, error } from each await (not bare count)", () => {
  const src = readFileSync("lib/admin/healthRollup.ts", "utf8");
  expect(src).toMatch(/data:\s*_\w+\s*,\s*count\s*,\s*error\s*\}\s*=\s*await/);
});
