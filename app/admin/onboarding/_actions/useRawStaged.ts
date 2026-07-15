/**
 * app/admin/onboarding/_actions/useRawStaged.ts
 * Wizard-staged (pre-create) "use the sheet's raw value" toggle server action
 * (spec 2026-07-10-structural-transform-use-raw §9a).
 *
 * Admin-gated. Pre-create there is NO `shows`/`shows_internal` row — the staged
 * parse + warnings live in `pending_syncs.parse_result`, and the decision is staged
 * in `pending_syncs.use_raw_decisions`, migrating to `shows_internal` at finalize
 * (§3). This action does NOT re-apply (no entity rows yet): toggle-ON upserts
 * `{preference:"raw", applied:false}`; toggle-OFF hard-deletes (no `clear-pending`).
 *
 * Sequence (invariant 2 — single lock holder):
 *   (1) pre-lock: the client passes the callout's `driveFileId` (the wizard UI knows
 *       exactly which staged sheet it rendered the control for). Two staged sheets in
 *       ONE session can share a warning's `(code, blockRef, contentHash)` — same
 *       ambiguous room text or same inverted date tokens — so the `warningRef` alone is
 *       NOT a safe row locator (it could resolve to the wrong sheet; Codex whole-diff
 *       review F3). SERVER-VERIFY the `(wizardSessionId, driveFileId)` pairing exists in
 *       `pending_syncs` before locking, so a client arg can never steer the advisory
 *       lock onto an unrelated show; that verified `driveFileId` is the lock key.
 *   (2) under `withShowLock(driveFileId)`: RE-READ THAT exact row's `parse_result` +
 *       current `use_raw_decisions` (locked re-read wins over the stale pre-lock
 *       snapshot — a concurrent re-ingestion cannot cause a stale validation),
 *       validate the `warningRef` against that sheet's live warnings, upsert/delete,
 *       commit.
 *
 * POST-COMMIT (outside the lock tx, invariant 10) it emits the forensic
 * `USE_RAW_DECISION_SET` / `USE_RAW_DECISION_CLEARED` outcome.
 */
"use server";

import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withShowLock, type LockableSyncTx } from "@/lib/sync/lockedShowTx";
import { normalizeUseRawDecisions, type UseRawCode } from "@/lib/sync/useRawOverlay";
import {
  computeUseRawToggle,
  findLiveResolvableWarning,
  type UseRawWarningRef,
} from "@/lib/sync/useRawDecisionState";

export type SetStagedUseRawDecisionResult =
  | { ok: true; state: "saved" }
  | { ok: false; code: "session_not_found" | "infra_error" | "concurrent" }
  | { ok: false; code: "warning_not_found" | "warning_not_resolvable" | "warning_stale" };

type LockOutcome =
  | { kind: "infra_error" }
  | { kind: "validation_error"; reason: "not_found" | "not_resolvable" | "stale" }
  | { kind: "toggled"; mutated: boolean };

type StagedResolution = { kind: "found" } | { kind: "not_found" } | { kind: "infra_error" };

const VALIDATION_CODE = {
  not_found: "warning_not_found",
  not_resolvable: "warning_not_resolvable",
  stale: "warning_stale",
} as const;

function warningsOf(parseResult: unknown): ParseWarning[] {
  if (parseResult && typeof parseResult === "object" && "warnings" in parseResult) {
    const w = (parseResult as ParseResult).warnings;
    return Array.isArray(w) ? w : [];
  }
  return [];
}

/**
 * Server-verify the client-supplied `(wizardSessionId, driveFileId)` pairing before
 * locking. The client passes `driveFileId` (the wizard callout knows which staged sheet
 * it rendered), but a client arg must never steer the advisory lock onto an unrelated
 * show — so confirm a `pending_syncs` row for THIS session + file exists first. Warning
 * ownership is validated authoritatively IN-LOCK (`findLiveResolvableWarning` on the
 * locked re-read of that exact row). Every await destructures `{ data, error }`; a
 * returned error OR a thrown fault → `infra_error` (invariant 9).
 * not-subject-to-meta: server-action mutation — the write path is the privileged in-lock
 * postgres tx below; this pre-lock read only verifies the lock-key pairing.
 */
async function verifyStagedSheet(
  wizardSessionId: string,
  driveFileId: string,
): Promise<StagedResolution> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select("drive_file_id")
      .eq("wizard_session_id", wizardSessionId)
      .eq("drive_file_id", driveFileId)
      .limit(1);
    if (error) return { kind: "infra_error" };
    const rows = (data ?? []) as Array<{ drive_file_id: string }>;
    return rows.length > 0 ? { kind: "found" } : { kind: "not_found" };
  } catch {
    return { kind: "infra_error" };
  }
}

export async function setStagedUseRawDecisionAction(
  wizardSessionId: string,
  driveFileId: string,
  warningRef: UseRawWarningRef,
  useRaw: boolean,
): Promise<SetStagedUseRawDecisionResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  // (1) Pre-lock: server-verify the client-supplied (session, driveFileId) pairing so a
  // client arg can never steer the lock onto an unrelated show. The exact row locator is
  // the driveFileId, NOT the warningRef (two staged sheets can share a warning hash — F3).
  const resolved = await verifyStagedSheet(wizardSessionId, driveFileId);
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return { ok: false, code: "session_not_found" };

  // (2) Under the per-show lock: RE-READ live staged state, validate, upsert/delete.
  const locked = await withShowLock<LockableSyncTx, LockOutcome>(driveFileId, async (tx) => {
    try {
      const row = await tx.queryOne<{
        parse_result: unknown;
        use_raw_decisions: unknown;
      } | null>(
        `select parse_result, use_raw_decisions
           from public.pending_syncs
          where wizard_session_id = $1 and drive_file_id = $2
          limit 1`,
        [wizardSessionId, driveFileId],
      );
      if (!row) return { kind: "validation_error", reason: "not_found" };

      const lookup = findLiveResolvableWarning(warningsOf(row.parse_result), warningRef);
      if (!lookup.ok) return { kind: "validation_error", reason: lookup.reason };

      const current = normalizeUseRawDecisions(row.use_raw_decisions ?? null);
      const toggle = computeUseRawToggle({
        currentDecisions: current,
        code: warningRef.code as UseRawCode,
        contentHash: lookup.contentHash,
        target: lookup.target,
        useRaw,
        decidedBy: email,
        now: new Date().toISOString(), // not-render-side: mutation timestamp (use-raw decision decidedAt)
        // Pre-create: no entity rows exist to already-match, so a decision is never
        // applied:true and clear-pending is unreachable (§9a).
        allowApplied: false,
      });

      if (toggle.mutated) {
        // Raw array → $3::jsonb (postgres.js serializes; never JSON.stringify — double-encode trap).
        await tx.queryOne(
          `update public.pending_syncs set use_raw_decisions = $3::jsonb
            where wizard_session_id = $1 and drive_file_id = $2`,
          [wizardSessionId, driveFileId, toggle.nextDecisions],
        );
      }
      return { kind: "toggled", mutated: toggle.mutated };
    } catch {
      return { kind: "infra_error" };
    }
  });

  if (locked && typeof locked === "object" && "skipped" in locked) {
    return { ok: false, code: "concurrent" };
  }
  if (locked.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (locked.kind === "validation_error") {
    return { ok: false, code: VALIDATION_CODE[locked.reason] };
  }

  // No mutation (already in the toggled state) → success, no emit.
  if (!locked.mutated) return { ok: true, state: "saved" };

  // POST-COMMIT forensic outcome (outside the lock tx). `await` is load-bearing.
  await logAdminOutcome({
    code: useRaw ? "USE_RAW_DECISION_SET" : "USE_RAW_DECISION_CLEARED",
    source: "admin.onboarding.useRawStaged",
    actorEmail: email,
    wizardSessionId,
    driveFileId,
  });

  return { ok: true, state: "saved" };
}
