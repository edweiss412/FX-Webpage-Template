// Override admin-alert auto-resolve lifecycle (spec 2026-07-07 §6 step 3 / §10 R30).
//
// Two admin-alert codes mirror the durable admin_overrides pause reasons:
//   OVERRIDE_TARGET_MISSING ↔ deactivation_code 'target_missing'
//   OVERRIDE_NAME_CONFLICT  ↔ deactivation_code 'name_conflict'
//
// The durable per-override inactive-row needs-attention stream (Task 10) is the
// AUTHORITATIVE signal; the admin_alerts bell here is a COARSE per-(show,code)
// nudge (upsert_admin_alert dedups on (show_id, code) where resolved_at is null,
// 20260618000000_upsert_admin_alert_failedkeys_merge.sql). Both are auto-resolve
// only (never manually resolved): `resolveOverrideAlertsForShow` is the SINGLE
// per-(show,code) re-derivation point invoked post-commit by (1) the sync path
// (wired + tested here) and (2) the admin-op action (Task 14).
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel";
import { log } from "@/lib/log";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

type DeactivationCode = "target_missing" | "name_conflict";
export type OverrideAlertCode = "OVERRIDE_TARGET_MISSING" | "OVERRIDE_NAME_CONFLICT";

// deactivation_code → its mirror admin-alert code, and the inverse. Both orderings
// are single-sourced here so the emit + re-derivation stay in lockstep.
const ALERT_CODE_FOR_DEACTIVATION: Record<DeactivationCode, OverrideAlertCode> = {
  target_missing: "OVERRIDE_TARGET_MISSING",
  name_conflict: "OVERRIDE_NAME_CONFLICT",
};
const DEACTIVATION_FOR_ALERT_CODE: Record<OverrideAlertCode, DeactivationCode> = {
  OVERRIDE_TARGET_MISSING: "target_missing",
  OVERRIDE_NAME_CONFLICT: "name_conflict",
};
// Stable BOTH-codes order for the post-op re-derivation sweep.
const ALL_OVERRIDE_ALERT_CODES: readonly OverrideAlertCode[] = [
  "OVERRIDE_TARGET_MISSING",
  "OVERRIDE_NAME_CONFLICT",
];

export type ResolveOverrideAlertsDeps = {
  client?: Client;
  resolveAdminAlert?: typeof resolveAdminAlert;
};

/**
 * The single per-(show, code) re-derivation point (§10 R30). If the show has
 * ZERO remaining `active=false` admin_overrides rows whose deactivation_code
 * mirrors `code`, resolve the alert; otherwise leave it open. Supabase
 * call-boundary discipline: destructures `{ data, error }` and throws on a
 * returned error (the caller's best-effort wrapper swallows it).
 */
export async function resolveOverrideAlertsForShow(
  deps: ResolveOverrideAlertsDeps,
  showId: string,
  code: OverrideAlertCode,
): Promise<void> {
  const supabase = deps.client ?? createSupabaseServiceRoleClient();
  const deactivationCode = DEACTIVATION_FOR_ALERT_CODE[code];
  const { data, error } = await supabase
    .from("admin_overrides")
    .select("id")
    .eq("show_id", showId)
    .eq("active", false)
    .eq("deactivation_code", deactivationCode)
    .limit(1);
  if (error) {
    throw new Error(`resolveOverrideAlertsForShow read failed: ${error.message ?? String(error)}`);
  }
  if ((data ?? []).length > 0) return; // ≥1 paused row of this code remains → leave the alert open
  await (deps.resolveAdminAlert ?? resolveAdminAlert)({ showId, code }, deps.client);
}

export type EmitOverrideDeactivationAlertsDeps = ResolveOverrideAlertsDeps & {
  upsertAdminAlert?: typeof defaultUpsertAdminAlert;
  resolveOverrideAlertsForShow?: typeof resolveOverrideAlertsForShow;
};

/**
 * Best-effort post-commit coarse bell for the override deactivations a sync just
 * committed. POST-COMMIT, OUTSIDE the advisory lock (invariants 2 + 10). COARSE
 * per-(show, code): all paused rows of one code collapse to ONE unresolved alert.
 * The durable inactive-row stream (Task 10) is authoritative — a throw here MUST
 * NOT fail the sync, so every failure is swallowed (the durable rows are already
 * committed and are never touched by this read-only-plus-alert path). After the
 * emits, both codes are re-derived through the single resolve point so a code
 * whose last paused row is gone gets its alert resolved. No secrets in context.
 */
export async function emitOverrideDeactivationAlerts(
  showId: string,
  sideEffects: readonly OverrideSideEffect[],
  deps: EmitOverrideDeactivationAlertsDeps = {},
): Promise<void> {
  const deactivations = new Set<DeactivationCode>();
  for (const eff of sideEffects) {
    if ("deactivate" in eff) deactivations.add(eff.deactivate);
  }
  // Sheet_value-only syncs (no deactivation) are inert on the alert lifecycle:
  // the sync never reactivates (commitOverrideSideEffects.ts, SYNC-3/R23), so
  // with no fresh deactivation there is nothing to nudge and nothing to resolve.
  if (deactivations.size === 0) return;

  const upsert = deps.upsertAdminAlert ?? defaultUpsertAdminAlert;
  const resolve = deps.resolveOverrideAlertsForShow ?? resolveOverrideAlertsForShow;
  try {
    // ONE coarse bell per distinct deactivation code present this sync.
    for (const dc of deactivations) {
      const code = ALERT_CODE_FOR_DEACTIVATION[dc];
      if (code === "OVERRIDE_TARGET_MISSING") {
        await upsert({ showId, code: "OVERRIDE_TARGET_MISSING", context: { show_id: showId } });
      } else {
        await upsert({ showId, code: "OVERRIDE_NAME_CONFLICT", context: { show_id: showId } });
      }
    }
    // Re-derive BOTH codes through the single re-derivation point (§10 R30).
    for (const code of ALL_OVERRIDE_ALERT_CODES) {
      await resolve(deps, showId, code);
    }
  } catch (err) {
    // Best-effort: never fail the sync — the durable Task-10 inactive-row stream
    // remains the authoritative needs-attention signal.
    log.warn(
      "override deactivation alert emit/resolve failed (best-effort; durable row stream authoritative)",
      {
        source: "adminAlerts.overrideDeactivation",
        show_id: showId,
        error_name: err instanceof Error ? err.name : "unknown",
      },
    );
  }
}
