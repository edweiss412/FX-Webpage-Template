/**
 * lib/dev/materialize/plan.ts
 * (spec 2026-07-20-attention-scenario-gallery §5.3)
 *
 * Decides WHAT a materialize run will write, with no I/O, so every guard and
 * every ordering rule is testable without a database.
 *
 * The asymmetry between the two verbs is deliberate and load-bearing: Apply
 * carries the full guard table, Clear carries only the guards that can refuse it
 * at all. A guard that blocks cleanup can strand synthetic rows permanently —
 * archive a show after materializing it, and a symmetric guard table would leave
 * the synthetic alerts there with no way to remove them. Clear therefore takes
 * no `archived` flag and no scenario: its inputs make the wrong call
 * unrepresentable rather than merely unwritten.
 */
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import type { TargetEnv } from "./env";

export type WriteStep =
  | { step: "deleteTaggedAlerts" }
  | { step: "deleteTaggedHolds" }
  | { step: "insertAlerts"; codes: string[] }
  | { step: "insertHolds"; keys: Array<{ domain: string; entityKey: string }> }
  | { step: "writeWarnings"; count: number }
  | { step: "resync" };

export type PlanRefusal =
  | "slug_missing"
  | "show_archived"
  | "scenario_unknown"
  | "scenario_not_tier3"
  | "scenario_duplicate_alert_code"
  | "scenario_duplicate_hold_key"
  | "nothing_to_materialize";

export type WritePlan =
  | { kind: "ok"; steps: WriteStep[] }
  | { kind: "refused"; reason: PlanRefusal; detail: string | null };

export type ApplyOpts = { slug: string; archived: boolean; target: TargetEnv };
export type ClearOpts = { slug: string; target: TargetEnv };

function refuse(reason: PlanRefusal, detail: string | null = null): WritePlan {
  return { kind: "refused", reason, detail };
}

function firstDuplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return v;
    seen.add(v);
  }
  return null;
}

export function planApply(scenario: AttentionScenario | undefined, opts: ApplyOpts): WritePlan {
  if (opts.slug.trim().length === 0) return refuse("slug_missing");
  if (opts.archived) return refuse("show_archived", opts.slug);
  if (scenario === undefined) return refuse("scenario_unknown");
  if (scenario.tier !== 3) {
    return refuse("scenario_not_tier3", `${scenario.id} is tier ${scenario.tier}`);
  }

  // Runtime backstop for what the catalog validator already rejects: the DB
  // enforces both uniqueness constraints, so a duplicate would fail mid-insert
  // and leave a partial write behind. Refusing before the first write keeps the
  // failure atomic.
  const dupCode = firstDuplicate(scenario.alerts.map((a) => a.code));
  if (dupCode !== null) return refuse("scenario_duplicate_alert_code", dupCode);
  const dupHold = firstDuplicate(scenario.holds.map((h) => `${h.domain}:${h.entity_key}`));
  if (dupHold !== null) return refuse("scenario_duplicate_hold_key", dupHold);

  // Warnings are never written on validation (§5.1 step 4), so whether this
  // scenario materializes anything DEPENDS ON THE TARGET. A warnings-only
  // scenario that passed here on validation would delete prior tagged state,
  // write nothing, and report success with a skip — destructive and silent.
  const writesWarnings = opts.target === "local" && scenario.warnings !== undefined;
  if (scenario.alerts.length === 0 && scenario.holds.length === 0 && !writesWarnings) {
    return refuse("nothing_to_materialize", scenario.id);
  }

  // Deletes first, unconditionally: re-applying a scenario must converge on the
  // same state rather than accumulating rows from the previous run.
  const steps: WriteStep[] = [{ step: "deleteTaggedAlerts" }, { step: "deleteTaggedHolds" }];
  if (scenario.alerts.length > 0) {
    steps.push({ step: "insertAlerts", codes: scenario.alerts.map((a) => a.code) });
  }
  if (scenario.holds.length > 0) {
    steps.push({
      step: "insertHolds",
      keys: scenario.holds.map((h) => ({ domain: h.domain, entityKey: h.entity_key })),
    });
  }
  if (writesWarnings) {
    // `scenario.warnings` is defined here by the writesWarnings guard; an empty
    // array is a real instruction (write zero), not an omission.
    steps.push({ step: "writeWarnings", count: scenario.warnings?.length ?? 0 });
  }
  return { kind: "ok", steps };
}

export function planClear(opts: ClearOpts): WritePlan {
  if (opts.slug.trim().length === 0) return refuse("slug_missing");
  const steps: WriteStep[] = [{ step: "deleteTaggedAlerts" }, { step: "deleteTaggedHolds" }];
  // Local regenerates authentic warnings by re-syncing. Validation deliberately
  // does not: Apply never wrote warnings there, so there is nothing to repair,
  // and the action layer reports that skip as a POLICY outcome distinct from a
  // re-sync that was attempted and failed.
  if (opts.target === "local") steps.push({ step: "resync" });
  return { kind: "ok", steps };
}
