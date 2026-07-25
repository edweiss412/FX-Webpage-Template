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
  globalOnlyCodes,
  projectGlobalOnly,
  type ProducerScopeRow,
} from "@/tests/adminAlerts/alertProducerScope.registry";
import { GLOBAL_SCOPE_CODES } from "@/lib/adminAlerts/alertScope";

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

describe("GLOBAL_SCOPE_CODES", () => {
  it("is set-equal to the registry projection", () => {
    const projected = [...globalOnlyCodes()].sort();
    expect(
      [...GLOBAL_SCOPE_CODES].sort(),
      `regenerate GLOBAL_SCOPE_CODES to: ${JSON.stringify(projected)}`,
    ).toEqual(projected);
  });

  it("contains the four doug-audience codes this exclusion exists for", () => {
    // Belt-and-braces against a projection bug that would make the set-equality
    // assertion pass vacuously on two empty sets.
    for (const code of [
      "LIVE_ROW_CONFLICT",
      "ONBOARDING_SHEET_UNREADABLE",
      "SYNC_STALLED",
      "WATCH_CHANNEL_ORPHANED",
    ]) {
      expect(GLOBAL_SCOPE_CODES.has(code), code).toBe(true);
    }
  });

  it("does NOT contain a per-show-reachable code", () => {
    expect(GLOBAL_SCOPE_CODES.has("DRIVE_FETCH_FAILED")).toBe(false);
    expect(GLOBAL_SCOPE_CODES.has("SHEET_UNAVAILABLE")).toBe(false);
  });
});
