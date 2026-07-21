/**
 * tests/dev/materializePlan.test.ts
 * (spec 2026-07-20-attention-scenario-gallery §5.3)
 *
 * The pure write planner. Every guard the spec marks Apply-only must NOT block
 * Clear: a guard that can prevent cleanup strands synthetic state permanently,
 * which is the failure the whole Apply/Clear split exists to avoid.
 */
import { describe, expect, test } from "vitest";
import { planApply, planClear } from "@/lib/dev/materialize/plan";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import {
  T3_CREW_COLLISION,
  T3_HOLD_AND_DRIFT,
  T3_SHEET_MISSING,
} from "@/lib/dev/attentionScenarios/tier3";
import { T2_SINGLE } from "@/lib/dev/attentionScenarios/tier2";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

function s(id: string): AttentionScenario {
  const found = scenarioById(id);
  if (!found) throw new Error(`missing scenario ${id}`);
  return found;
}

const APPLY = { slug: "demo-show", archived: false, target: "local" as const };

describe("planApply — guards", () => {
  test("a missing or blank slug refuses before anything else", () => {
    for (const slug of ["", "   "]) {
      expect(planApply(s(T3_SHEET_MISSING), { ...APPLY, slug })).toEqual({
        kind: "refused",
        reason: "slug_missing",
        detail: null,
      });
    }
  });

  test("an archived show refuses an Apply", () => {
    const r = planApply(s(T3_SHEET_MISSING), { ...APPLY, archived: true });
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") expect(r.reason).toBe("show_archived");
  });

  test("an unknown scenario refuses", () => {
    const r = planApply(undefined, APPLY);
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") expect(r.reason).toBe("scenario_unknown");
  });

  test("a tier-1 or tier-2 scenario refuses — only composites are materializable", () => {
    const r = planApply(s(T2_SINGLE), APPLY);
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") {
      expect(r.reason).toBe("scenario_not_tier3");
      expect(r.detail).toContain(T2_SINGLE);
    }
  });

  test("duplicate alert codes refuse before any write, naming the duplicate", () => {
    const dup: AttentionScenario = {
      ...s(T3_SHEET_MISSING),
      alerts: [
        {
          code: "SYNC_STALLED",
          context: {},
          raised_at: "2026-07-01T12:00:00.000Z",
          occurrence_count: 1,
        },
        {
          code: "SYNC_STALLED",
          context: {},
          raised_at: "2026-07-01T12:00:00.000Z",
          occurrence_count: 1,
        },
      ],
    };
    const r = planApply(dup, APPLY);
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") {
      expect(r.reason).toBe("scenario_duplicate_alert_code");
      expect(r.detail).toContain("SYNC_STALLED");
    }
  });

  test("duplicate hold keys refuse, naming the duplicate key", () => {
    const base = s(T3_HOLD_AND_DRIFT);
    const hold = base.holds[0]!;
    const r = planApply({ ...base, holds: [hold, { ...hold }] }, APPLY);
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") {
      expect(r.reason).toBe("scenario_duplicate_hold_key");
      expect(r.detail).toContain(hold.entity_key);
    }
  });
});

describe("planApply — the environment-aware nothing-to-materialize guard", () => {
  const warningsOnly: AttentionScenario = {
    id: "t3-warnings-only",
    tier: 3,
    label: "Warnings only",
    alerts: [],
    holds: [],
    warnings: [{ severity: "warn", code: "BLOCK_DISAPPEARED", message: "Synthetic." }],
  };

  test("a warnings-only scenario IS materializable on local", () => {
    const r = planApply(warningsOnly, APPLY);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.steps.some((x) => x.step === "writeWarnings")).toBe(true);
    }
  });

  test("the same scenario is REFUSED on validation, where warnings are never written", () => {
    // Without the environment-awareness this passes, deletes prior tagged state,
    // writes nothing, and reports only a skipped warning — a destructive no-op.
    const r = planApply(warningsOnly, { ...APPLY, target: "validation" });
    expect(r.kind).toBe("refused");
    if (r.kind === "refused") expect(r.reason).toBe("nothing_to_materialize");
  });

  test("a scenario with neither alerts, holds, nor warnings is refused on BOTH targets", () => {
    // Built by OMITTING the key, not by setting it to undefined:
    // exactOptionalPropertyTypes makes `warnings: undefined` a type error on an
    // optional property, and the two are genuinely different states here (§3.4).
    const { warnings: _dropped, ...empty } = warningsOnly;
    void _dropped;
    for (const target of ["local", "validation"] as const) {
      const r = planApply(empty, { ...APPLY, target });
      expect(r.kind, target).toBe("refused");
      if (r.kind === "refused") expect(r.reason).toBe("nothing_to_materialize");
    }
  });

  test("a scenario with alerts is materializable on validation despite the warnings skip", () => {
    expect(planApply(s(T3_SHEET_MISSING), { ...APPLY, target: "validation" }).kind).toBe("ok");
  });
});

describe("planApply — step composition", () => {
  test("deletes always precede inserts, so a re-Apply is idempotent", () => {
    const r = planApply(s(T3_CREW_COLLISION), APPLY);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const names = r.steps.map((x) => x.step);
    expect(names.indexOf("deleteTaggedAlerts")).toBeLessThan(names.indexOf("insertAlerts"));
    expect(names.indexOf("deleteTaggedHolds")).toBeLessThan(names.indexOf("insertAlerts"));
    expect(names[0]).toBe("deleteTaggedAlerts");
  });

  test("the insert steps carry the scenario's actual codes and keys", () => {
    const scenario = s(T3_HOLD_AND_DRIFT);
    const r = planApply(scenario, APPLY);
    if (r.kind !== "ok") throw new Error("expected ok");
    const insertAlerts = r.steps.find((x) => x.step === "insertAlerts");
    expect(insertAlerts).toEqual({
      step: "insertAlerts",
      codes: scenario.alerts.map((a) => a.code),
    });
    const insertHolds = r.steps.find((x) => x.step === "insertHolds");
    expect(insertHolds).toEqual({
      step: "insertHolds",
      keys: scenario.holds.map((h) => ({ domain: h.domain, entityKey: h.entity_key })),
    });
  });

  test("an empty domain emits no insert step for it, rather than an empty insert", () => {
    const r = planApply(s(T3_SHEET_MISSING), APPLY); // alerts only, no holds
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.steps.some((x) => x.step === "insertAlerts")).toBe(true);
    expect(r.steps.some((x) => x.step === "insertHolds")).toBe(false);
  });

  test("the warnings tri-state decides whether writeWarnings appears at all", () => {
    // Absent -> no step (the column is left alone).
    const absent = planApply(s(T3_SHEET_MISSING), APPLY);
    if (absent.kind !== "ok") throw new Error("expected ok");
    expect(absent.steps.some((x) => x.step === "writeWarnings")).toBe(false);

    // Empty array -> a step with count 0, which deliberately writes zero.
    const empty = planApply(s(T3_HOLD_AND_DRIFT), APPLY);
    if (empty.kind !== "ok") throw new Error("expected ok");
    expect(empty.steps).toContainEqual({ step: "writeWarnings", count: 0 });

    // Non-empty -> a step with the count.
    const many = planApply(s(T3_CREW_COLLISION), APPLY);
    if (many.kind !== "ok") throw new Error("expected ok");
    expect(many.steps).toContainEqual({ step: "writeWarnings", count: 3 });
  });

  test("validation never emits writeWarnings, whatever the scenario declares", () => {
    for (const id of [T3_CREW_COLLISION, T3_HOLD_AND_DRIFT]) {
      const r = planApply(s(id), { ...APPLY, target: "validation" });
      if (r.kind !== "ok") throw new Error(`expected ok for ${id}`);
      expect(
        r.steps.some((x) => x.step === "writeWarnings"),
        id,
      ).toBe(false);
    }
  });

  test("Apply never emits a resync step — that belongs to Clear", () => {
    const r = planApply(s(T3_CREW_COLLISION), APPLY);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.steps.some((x) => x.step === "resync")).toBe(false);
  });
});

describe("planClear", () => {
  test("clears on an archived show — cleanup is never blocked", () => {
    // planClear takes no `archived` at all; this asserts the TYPE-level decision
    // held, by exercising the only inputs it accepts.
    expect(planClear({ slug: "demo-show", target: "local" }).kind).toBe("ok");
  });

  test("issues both deletes, and re-sync only on local", () => {
    const local = planClear({ slug: "demo-show", target: "local" });
    if (local.kind !== "ok") throw new Error("expected ok");
    expect(local.steps).toEqual([
      { step: "deleteTaggedAlerts" },
      { step: "deleteTaggedHolds" },
      { step: "resync" },
    ]);

    const validation = planClear({ slug: "demo-show", target: "validation" });
    if (validation.kind !== "ok") throw new Error("expected ok");
    // Validation skips re-sync as a POLICY decision, distinct from a re-sync
    // that failed — the action layer reports those as different outcomes.
    expect(validation.steps).toEqual([
      { step: "deleteTaggedAlerts" },
      { step: "deleteTaggedHolds" },
    ]);
  });

  test("a missing slug is the only thing that refuses a Clear", () => {
    expect(planClear({ slug: "  ", target: "local" })).toEqual({
      kind: "refused",
      reason: "slug_missing",
      detail: null,
    });
  });

  test("Clear never emits an insert or a warnings write", () => {
    for (const target of ["local", "validation"] as const) {
      const r = planClear({ slug: "demo-show", target });
      if (r.kind !== "ok") throw new Error("expected ok");
      for (const forbidden of ["insertAlerts", "insertHolds", "writeWarnings"]) {
        expect(
          r.steps.some((x) => x.step === forbidden),
          `${target}/${forbidden}`,
        ).toBe(false);
      }
    }
  });
});
