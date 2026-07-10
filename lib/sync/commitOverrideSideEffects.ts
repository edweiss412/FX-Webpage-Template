import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel";

// Stage B (spec §3.2 / §3.3 / §4.1 / §6) — the SOLE writer of `admin_overrides` on the SYNC path.
// It commits the side-effects PLANNED (never written) by the pure Stage-A show/hotel transform and the
// post-hold §3.6 crew reconciliation, INSIDE the same JS-held show-lock tx (no nested lock, invariant 2)
// and ONLY on the applied path — the caller invokes it after `applyParseResult`, past the stale
// short-circuit, so a stale/no-op sync leaves every `admin_overrides` row untouched.
//
// The `OverrideSideEffect` union has EXACTLY two variants (the sync NEVER reactivates — SYNC-3/R23
// fail-closed; a vanished-then-reappeared target is recovered by Doug via the RPC, not auto-revived):
//   - { overrideId, sheetValue }        → refresh the display-only `sheet_value` chip.  NO version bump.
//   - { overrideId, deactivate: code }  → pause the override (active=false + reason). BUMPS version.
// The version-bump asymmetry is load-bearing (R30, spec line 182): a benign per-sync `sheet_value`
// refresh must NOT bump `version`, or a routine cron between an admin's UI-load and save would
// false-409 the edit (the CAS-A token guards override STATE, not chip refreshes); a deactivation is a
// genuine state change and MUST bump so an open edit against the now-stale row 409s.

/**
 * The minimal tx-scoped write port Stage B needs. Both run inside the caller's locked tx; a raw DB
 * fault throws and rolls the whole tx back (atomic with the crew/show/hotel writes) — the durable
 * inactive-row needs-attention signal (§6) can therefore never diverge from the live rows.
 */
export type OverrideSideEffectPort = {
  /** R30 benign refresh — `sheet_value=$1, updated_at=now()` WHERE id; DOES NOT touch `version`. */
  refreshOverrideSheetValue(overrideId: string, sheetValue: unknown): Promise<void>;
  /** Deactivate a still-active override — `active=false, deactivation_code=$1, version=version+1`. */
  deactivateOverride(overrideId: string, code: "target_missing" | "name_conflict"): Promise<void>;
};

/**
 * Commit every planned override side-effect through the port, dispatching by variant. Order is
 * irrelevant (each targets a distinct override row by id), but a stable pass keeps the tx log
 * deterministic. Any port throw propagates (aborts the locked tx) — never swallowed.
 */
export async function commitOverrideSideEffects(
  port: OverrideSideEffectPort,
  sideEffects: OverrideSideEffect[],
): Promise<void> {
  for (const effect of sideEffects) {
    if ("deactivate" in effect) {
      await port.deactivateOverride(effect.overrideId, effect.deactivate);
    } else {
      await port.refreshOverrideSheetValue(effect.overrideId, effect.sheetValue);
    }
  }
}
