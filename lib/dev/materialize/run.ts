/**
 * lib/dev/materialize/run.ts
 * (spec 2026-07-20-attention-scenario-gallery §5.1, §5.2, §7.5)
 *
 * Executes a Task-11 write plan against a resolved Supabase client. Separated
 * from `app/admin/dev/actions.ts` so the whole boundary is testable with a
 * recording stub instead of a `"use server"` module and a live database.
 *
 * ── The tag, and why it is shaped this way ───────────────────────────────────
 * Every synthetic row carries a tag so cleanup can find them WITHOUT touching a
 * real operator's rows:
 *
 *   alerts — `context.__devScenario = <scenario id>`, filtered as
 *     `context->>__devScenario IS NOT NULL`.
 *   holds  — `created_by = '__devScenario'`, filtered by EQUALITY.
 *
 * The spec described the hold predicate as `LIKE '\_\_devScenario:%' ESCAPE
 * '\'`. That is not expressible through PostgREST, which offers no ESCAPE
 * clause — and unescaped, `_` is a single-character wildcard, so the pattern
 * would also match `XXdevScenario:...`. A constant tag compared with `=` is
 * exact, needs no escaping, and loses nothing: Clear removes every tagged row
 * regardless of scenario, so the id was never needed in the hold predicate. It
 * still travels in the alert context, where it is useful for diagnosis.
 * Authentic holds are written with `created_by = 'system'`
 * (lib/sync/holds/writeMi11Holds.ts:76), so the constant cannot collide.
 *
 * ── Failure semantics (invariant 9) ──────────────────────────────────────────
 * Every call destructures `{ data, error }`, and a THROWN rejection is funneled
 * to the same place as a returned error — the two are indistinguishable to an
 * operator and must not be distinguishable in the result. What matters instead
 * is whether anything had already committed:
 *
 *   nothing committed -> `infra_error`  (safe to retry wholesale)
 *   something committed -> `partial`, naming the failed step and the real counts
 *
 * A bare throw would collapse both into "something went wrong", leaving the
 * operator unable to tell whether a retry duplicates work.
 */
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import type { WritePlan, WriteStep } from "./plan";
import type { TargetEnv } from "./env";

/** The constant written to `sync_holds.created_by`, and the alert context key. */
export const DEV_SCENARIO_TAG = "__devScenario";

export type Skip = { code: string; reason: "unresolved_row_present" | "hold_key_present" };

export type MaterializeResult =
  | {
      kind: "ok";
      alerts: number;
      holds: number;
      warnings: "written" | "untouched" | "skipped_validation";
      skipped: Skip[];
    }
  | {
      kind: "partial";
      committed: { alerts: number; holds: number };
      failedStep: string;
      message: string;
    }
  | { kind: "refused"; reason: string }
  | { kind: "infra_error"; message: string };

export type ShowRef = { id: string; driveFileId: string };

type QueryResult = { data: unknown; error: unknown };
/**
 * The narrow slice of the Supabase client this module uses. Declared with METHOD
 * SHORTHAND rather than property-arrow syntax on purpose: shorthand parameters
 * are bivariant, so the real generic `SupabaseClient` is assignable. With arrow
 * properties TypeScript checks parameters contravariantly and rejects it over
 * `insert`/`update` generics that are irrelevant here.
 */
type Builder = PromiseLike<QueryResult> & {
  eq(col: string, v: unknown): Builder;
  is(col: string, v: unknown): Builder;
  not(col: string, op: string, v: unknown): Builder;
  in(col: string, v: unknown[]): Builder;
  select(cols: string): Builder;
  limit(n: number): Builder;
};
export type SupabaseLike = {
  from(table: string): {
    delete(): Builder;
    insert(rows: unknown): Builder;
    update(patch: unknown): Builder;
    select(cols: string): Builder;
  };
};

export type RunDeps = {
  client: SupabaseLike;
  /** Called DIRECTLY — never as an HTTP request to the app's own route. */
  resync?: (driveFileId: string) => Promise<unknown>;
};

/** A failure that carries which step produced it, so the caller can decide
 *  infra_error vs partial from one place rather than at every call site. */
class StepFailure extends Error {
  constructor(
    readonly step: string,
    message: string,
  ) {
    super(message);
  }
}

function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** Awaits a builder, funneling BOTH the returned-error and thrown paths into
 *  one StepFailure. Every Supabase call in this module goes through here. */
async function run(step: string, builder: PromiseLike<QueryResult>): Promise<unknown> {
  let result: QueryResult;
  try {
    result = await builder;
  } catch (err) {
    throw new StepFailure(step, messageOf(err));
  }
  const { data, error } = result;
  if (error) throw new StepFailure(step, messageOf(error));
  return data;
}

function rowsOf(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

async function deleteTaggedAlerts(deps: RunDeps, show: ShowRef): Promise<void> {
  await run(
    "deleteTaggedAlerts",
    deps.client
      .from("admin_alerts")
      .delete()
      .eq("show_id", show.id)
      .not(`context->>${DEV_SCENARIO_TAG}`, "is", null),
  );
}

async function deleteTaggedHolds(deps: RunDeps, show: ShowRef): Promise<void> {
  await run(
    "deleteTaggedHolds",
    deps.client
      .from("sync_holds")
      .delete()
      .eq("show_id", show.id)
      .eq("created_by", DEV_SCENARIO_TAG),
  );
}

/** Inserts the non-colliding alerts, returning the count written and the skips. */
async function insertAlerts(
  deps: RunDeps,
  show: ShowRef,
  scenario: AttentionScenario,
  codes: string[],
): Promise<{ written: number; skipped: Skip[] }> {
  // Read the UNRESOLVED rows only: a resolved row with the same code does not
  // occupy the partial unique index, so it is not a collision.
  const existing = rowsOf(
    await run(
      "insertAlerts",
      deps.client
        .from("admin_alerts")
        .select("code")
        .eq("show_id", show.id)
        .is("resolved_at", null)
        .in("code", codes),
    ),
  );
  const taken = new Set(existing.map((r) => String(r.code)));
  const skipped: Skip[] = codes
    .filter((c) => taken.has(c))
    .map((code) => ({ code, reason: "unresolved_row_present" as const }));

  const rows = scenario.alerts
    .filter((a) => !taken.has(a.code))
    .map((a) => ({
      show_id: show.id,
      code: a.code,
      // The tag rides in the context so cleanup can find the row and a human
      // reading the row can tell where it came from.
      context: { ...a.context, [DEV_SCENARIO_TAG]: scenario.id },
      raised_at: a.raised_at,
      last_seen_at: a.raised_at,
      occurrence_count: a.occurrence_count,
      resolved_at: null,
      resolved_by: null,
    }));
  if (rows.length === 0) return { written: 0, skipped };
  await run("insertAlerts", deps.client.from("admin_alerts").insert(rows));
  return { written: rows.length, skipped };
}

async function insertHolds(
  deps: RunDeps,
  show: ShowRef,
  scenario: AttentionScenario,
): Promise<{ written: number; skipped: Skip[] }> {
  const keys = scenario.holds.map((h) => h.entity_key);
  const existing = rowsOf(
    await run(
      "insertHolds",
      deps.client
        .from("sync_holds")
        .select("domain,entity_key")
        .eq("show_id", show.id)
        .in("entity_key", keys),
    ),
  );
  const taken = new Set(existing.map((r) => `${String(r.domain)}:${String(r.entity_key)}`));
  const skipped: Skip[] = [];
  const rows: Array<Record<string, unknown>> = [];
  for (const h of scenario.holds) {
    const key = `${h.domain}:${h.entity_key}`;
    if (taken.has(key)) {
      skipped.push({ code: key, reason: "hold_key_present" });
      continue;
    }
    rows.push({
      show_id: show.id,
      drive_file_id: show.driveFileId,
      domain: h.domain,
      entity_key: h.entity_key,
      held_value: h.held_value,
      proposed_value: h.proposed_value,
      base_modified_time: h.base_modified_time,
      kind: h.kind,
      created_by: DEV_SCENARIO_TAG,
      ...(h.reservation_collisions === undefined
        ? {}
        : { reservation_collisions: h.reservation_collisions }),
    });
  }
  if (rows.length === 0) return { written: 0, skipped };
  await run("insertHolds", deps.client.from("sync_holds").insert(rows));
  return { written: rows.length, skipped };
}

async function writeWarnings(
  deps: RunDeps,
  show: ShowRef,
  scenario: AttentionScenario,
): Promise<void> {
  await run(
    "writeWarnings",
    deps.client
      .from("shows_internal")
      .update({ parse_warnings: scenario.warnings ?? [] })
      .eq("show_id", show.id),
  );
}

function failureResult(
  err: unknown,
  committed: { alerts: number; holds: number; anything: boolean },
): MaterializeResult {
  const step = err instanceof StepFailure ? err.step : "unknown";
  const message = err instanceof Error ? err.message : String(err);
  // The discriminator is whether anything committed, NOT which error shape
  // arrived: a retry after infra_error is safe, a retry after partial is not
  // necessarily, and only this distinction tells the operator which they have.
  if (!committed.anything) return { kind: "infra_error", message };
  return {
    kind: "partial",
    committed: { alerts: committed.alerts, holds: committed.holds },
    failedStep: step,
    message,
  };
}

export async function executeApply(
  scenario: AttentionScenario,
  plan: WritePlan,
  show: ShowRef,
  target: TargetEnv,
  deps: RunDeps,
): Promise<MaterializeResult> {
  if (plan.kind !== "ok") return { kind: "refused", reason: plan.reason };

  const committed = { alerts: 0, holds: 0, anything: false };
  const skipped: Skip[] = [];
  let warnings: "written" | "untouched" | "skipped_validation" =
    target === "validation" && scenario.warnings !== undefined ? "skipped_validation" : "untouched";

  try {
    for (const step of plan.steps) {
      await applyStep(step);
    }
  } catch (err) {
    return failureResult(err, committed);
  }
  return { kind: "ok", alerts: committed.alerts, holds: committed.holds, warnings, skipped };

  async function applyStep(step: WriteStep): Promise<void> {
    switch (step.step) {
      case "deleteTaggedAlerts":
        await deleteTaggedAlerts(deps, show);
        // A delete counts as a commit: it changed the database, so a later
        // failure is genuinely partial rather than a clean no-op.
        committed.anything = true;
        return;
      case "deleteTaggedHolds":
        await deleteTaggedHolds(deps, show);
        committed.anything = true;
        return;
      case "insertAlerts": {
        const r = await insertAlerts(deps, show, scenario, step.codes);
        committed.alerts = r.written;
        skipped.push(...r.skipped);
        return;
      }
      case "insertHolds": {
        const r = await insertHolds(deps, show, scenario);
        committed.holds = r.written;
        skipped.push(...r.skipped);
        return;
      }
      case "writeWarnings":
        await writeWarnings(deps, show, scenario);
        warnings = "written";
        return;
      case "resync":
        // planApply never emits this; the exhaustive switch keeps it that way.
        return;
    }
  }
}

export async function executeClear(
  plan: WritePlan,
  show: ShowRef,
  target: TargetEnv,
  deps: RunDeps,
): Promise<MaterializeResult> {
  if (plan.kind !== "ok") return { kind: "refused", reason: plan.reason };

  const committed = { alerts: 0, holds: 0, anything: false };
  try {
    for (const step of plan.steps) {
      if (step.step === "deleteTaggedAlerts") {
        await deleteTaggedAlerts(deps, show);
        committed.anything = true;
      } else if (step.step === "deleteTaggedHolds") {
        await deleteTaggedHolds(deps, show);
        committed.anything = true;
      } else if (step.step === "resync") {
        try {
          await deps.resync?.(show.driveFileId);
        } catch (err) {
          throw new StepFailure("resync", messageOf(err));
        }
      }
    }
  } catch (err) {
    return failureResult(err, committed);
  }
  return {
    kind: "ok",
    alerts: 0,
    holds: 0,
    // On local the deletes are followed by a re-sync that regenerates authentic
    // warnings; on validation the skip is a policy decision, deliberately NOT
    // the same outcome as a re-sync that was attempted and failed.
    warnings: target === "validation" ? "skipped_validation" : "written",
    skipped: [],
  };
}
