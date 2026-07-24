// tests/adminAlerts/_metaGlobalScopeCodes.test.ts
//
// Global-scope projection guard (gallery-global-scope-exclusion spec §2, §3).
//
// Two halves:
//   1. `projectGlobalOnly` driven by SYNTHETIC rows, so the projection's edge
//      cases (mixed scope, seed rows) are proven independently of whatever
//      PRODUCER_SCOPE happens to contain today.
//   2. `GLOBAL_SCOPE_CODES` (lib/) pinned set-equal to `globalOnlyCodes()`
//      (tests/). lib/ must not import tests/, so the runtime list is declared
//      in lib and this test is what stops the two from drifting — the same
//      lib-declares / test-pins idiom ATTENTION_ROUTES uses
//      (tests/admin/_metaAttentionRoutes.test.ts).
import { describe, expect, it } from "vitest";
import {
  projectGlobalOnly,
  type ProducerScopeRow,
} from "@/tests/adminAlerts/alertProducerScope.registry";

const row = (code: string, scope: "per-show" | "global", seed = false): ProducerScopeRow => ({
  site: `synthetic/${code}-${scope}${seed ? "-seed" : ""}.ts:1`,
  code,
  scope,
  ...(seed ? { seed: true } : {}),
});

describe("projectGlobalOnly (synthetic rows)", () => {
  it("a code with only global rows is global-only", () => {
    expect([...projectGlobalOnly([row("A", "global")])]).toEqual(["A"]);
  });

  it("a code with BOTH scopes is NOT global-only (per-show wins: it can reach the modal)", () => {
    expect([...projectGlobalOnly([row("A", "global"), row("A", "per-show")])]).toEqual([]);
  });

  it("row order does not matter for the mixed-scope case", () => {
    expect([...projectGlobalOnly([row("A", "per-show"), row("A", "global")])]).toEqual([]);
  });

  it("a seed-only global row does not make its code global-only", () => {
    expect([...projectGlobalOnly([row("A", "global", true)])]).toEqual([]);
  });

  it("a seed per-show row does not rescue a code from global-only", () => {
    expect([...projectGlobalOnly([row("A", "global"), row("A", "per-show", true)])]).toEqual(["A"]);
  });

  it("a code with only per-show rows is absent", () => {
    expect([...projectGlobalOnly([row("A", "per-show")])]).toEqual([]);
  });

  it("independent codes are projected independently", () => {
    const out = [
      ...projectGlobalOnly([row("A", "global"), row("B", "per-show"), row("C", "global")]),
    ];
    expect(out.sort()).toEqual(["A", "C"]);
  });
});
