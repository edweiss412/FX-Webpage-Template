/**
 * app/admin/show/[slug]/_actions/useRaw.ts
 * Per-show "use the sheet's raw value" toggle server action (spec
 * 2026-07-10-structural-transform-use-raw §9b).
 *
 * Admin-gated. Writes a content-pinned use-raw DECISION (never a typed value) for
 * one of the three recoverable structural-transform warnings, then delegates the
 * apply to the existing per-show re-sync entry. Sequence (spec §9b, invariant 2 —
 * two SEQUENTIAL lock acquisitions, NEVER nested):
 *   (1) pre-lock: load the `shows` row by `showId` → `drive_file_id` (the lock key
 *       is ALWAYS server-derived; a client cannot steer the mutation onto another
 *       show's lock);
 *   (2) under `withShowLock(drive_file_id)`: RE-READ the live `parse_warnings` +
 *       current `use_raw_decisions` (no TOCTOU — the locked re-read wins over any
 *       stale pre-lock snapshot), validate the `warningRef`, compute the state-aware
 *       toggle (§3), write the decision, commit;
 *   (3) AFTER the lock releases, delegate to `runManualSyncForShow` (which acquires
 *       its OWN lock) to apply the decision — unless the write is already settled.
 *
 * POST-COMMIT (outside the lock tx, invariant 10) it emits the forensic
 * `USE_RAW_DECISION_SET` / `USE_RAW_DECISION_CLEARED` outcome.
 */
"use server";

import { revalidateShow } from "@/lib/data/showCacheTag";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import type { ParseWarning } from "@/lib/parser/types";
import { withShowLock, type LockableSyncTx } from "@/lib/sync/lockedShowTx";
import { runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";
import { normalizeUseRawDecisions, type UseRawCode } from "@/lib/sync/useRawOverlay";
import {
  computeUseRawToggle,
  findLiveResolvableWarning,
  type UseRawWarningRef,
} from "@/lib/sync/useRawDecisionState";
import { resolveShowById } from "./shared";

export type SetUseRawDecisionResult =
  | { ok: true; state: "settled" }
  | { ok: true; state: "apply_pending" }
  | { ok: false; code: "show_not_found" | "infra_error" | "concurrent" }
  | { ok: false; code: "warning_not_found" | "warning_not_resolvable" | "warning_stale" };

type LockOutcome =
  | { kind: "infra_error" }
  | { kind: "validation_error"; reason: "not_found" | "not_resolvable" | "stale" }
  | { kind: "toggled"; mutated: boolean; alreadySettled: boolean };

const VALIDATION_CODE = {
  not_found: "warning_not_found",
  not_resolvable: "warning_not_resolvable",
  stale: "warning_stale",
} as const;

export async function setUseRawDecisionAction(
  showId: string,
  warningRef: UseRawWarningRef,
  useRaw: boolean,
): Promise<SetUseRawDecisionResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  // (1) Pre-lock: derive the lock key from the server-loaded row (never a client arg).
  const resolved = await resolveShowById(showId);
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return { ok: false, code: "show_not_found" };
  const { id, driveFileId } = resolved.show;

  // (2) Under the per-show lock: RE-READ live state, validate, compute, write+commit.
  const locked = await withShowLock<LockableSyncTx, LockOutcome>(driveFileId, async (tx) => {
    try {
      const row = await tx.queryOne<{ parse_warnings: ParseWarning[] | null } | null>(
        `select parse_warnings from public.shows_internal where show_id = $1 limit 1`,
        [id],
      );
      const warnings = row?.parse_warnings ?? [];
      const lookup = findLiveResolvableWarning(warnings, warningRef);
      if (!lookup.ok) return { kind: "validation_error", reason: lookup.reason };

      const decisionsRow = await tx.queryOne<{ use_raw_decisions: unknown } | null>(
        `select use_raw_decisions from public.shows_internal where show_id = $1 limit 1`,
        [id],
      );
      const current = normalizeUseRawDecisions(decisionsRow?.use_raw_decisions ?? null);

      const toggle = computeUseRawToggle({
        currentDecisions: current,
        code: warningRef.code as UseRawCode,
        contentHash: lookup.contentHash,
        target: lookup.target,
        useRaw,
        decidedBy: email,
        now: new Date().toISOString(), // not-render-side: mutation timestamp (use-raw decision decidedAt)
        allowApplied: true,
      });

      if (toggle.mutated) {
        // Raw object/array → $2::jsonb (postgres.js serializes; never JSON.stringify — double-encode trap).
        await tx.queryOne(
          `update public.shows_internal set use_raw_decisions = $2::jsonb where show_id = $1`,
          [id, toggle.nextDecisions],
        );
      }
      return { kind: "toggled", mutated: toggle.mutated, alreadySettled: toggle.alreadySettled };
    } catch {
      // A Supabase/postgres fault mid-lock surfaces as a discriminable infra result
      // (invariant 9), never a silent success or a benign not-found.
      return { kind: "infra_error" };
    }
  });

  if (locked && typeof locked === "object" && "skipped" in locked) {
    // Blocking lock never skips; guard defensively.
    return { ok: false, code: "concurrent" };
  }
  if (locked.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (locked.kind === "validation_error") {
    return { ok: false, code: VALIDATION_CODE[locked.reason] };
  }

  // No mutation (already in the toggled state) → already settled, no re-sync, no emit.
  if (!locked.mutated) return { ok: true, state: "settled" };

  // POST-COMMIT forensic outcome (outside the lock tx). `await` is load-bearing.
  await logAdminOutcome({
    code: useRaw ? "USE_RAW_DECISION_SET" : "USE_RAW_DECISION_CLEARED",
    source: "admin.show.useRaw",
    actorEmail: email,
    showId: id,
  });

  // A settled write (clear-pending→raw applied:true, or apply-pending→delete) needs no
  // re-sync: the entity rows already match. Revalidate + return settled.
  if (locked.alreadySettled) {
    revalidateShow(id);
    return { ok: true, state: "settled" };
  }

  // (3) Non-settled write → delegate the apply to the re-sync entry (its OWN lock —
  // sequential, not nested). On success the decision flips to its durable applied
  // state; on a RETURNED failure the decision stays durable (apply-pending).
  let applied = false;
  try {
    const sync = await runManualSyncForShow(driveFileId);
    applied =
      sync !== null && typeof sync === "object" && "outcome" in sync && sync.outcome === "applied";
  } catch {
    // A THROWN infra fault from the re-sync entry (it returns typed outcomes for known
    // faults; an unexpected throw is rare) must NOT escape after the decision has already
    // committed and the audit outcome emitted. The decision is durable, so we surface the
    // SAME apply_pending state the UI self-heals to (spec §9b — the decision applies on the
    // next successful sync), never a raw client error (invariant-9 spirit: a thrown fault
    // becomes a typed result). runManualSyncForShow logs the underlying fault internally.
    applied = false;
  }
  revalidateShow(id);
  return { ok: true, state: applied ? "settled" : "apply_pending" };
}
