/**
 * app/admin/onboarding/_actions/stagedWarningIgnore.ts
 * Wizard-staged (pre-create) per-warning Ignore / Un-ignore server action
 * (spec 2026-08-28-wizard-warning-ignore-controls §2.6).
 *
 * Admin-gated. A FIRST-SEEN wizard row has NO `shows` record — finalize stamps
 * `created_show_id` — so the slug-keyed `data-quality/ignore` routes cannot serve it.
 * The decision is staged in `pending_syncs.ignored_warnings` and carried into
 * `public.ignored_warnings` at finalize (§2.7). Mirrors `useRawStaged.ts` clause for
 * clause; the differences are the store and the validation predicate.
 *
 * Sequence (invariant 2 — single lock holder, layer (a), the JS wrapper):
 *   (1) pre-lock: SERVER-VERIFY the `(wizardSessionId, driveFileId)` pairing exists in
 *       `pending_syncs`, so a client arg can never steer the advisory lock onto an
 *       unrelated show. That verified `driveFileId` is the lock key AND the write's
 *       row locator.
 *   (2) under `withShowLock(driveFileId)`: RE-READ that exact row's `parse_result` +
 *       current `ignored_warnings` (the locked re-read beats the stale pre-lock
 *       snapshot — a concurrent re-ingestion cannot cause a stale validation),
 *       validate the requested warning against the LOCKED parse, upsert/remove, commit.
 *       The in-lock body issues plain select/update only — NO RPC, because a
 *       self-locking SECURITY DEFINER function under this held lock deadlocks under
 *       burst. Pinned structurally by tests/auth/advisoryLockRpcDeadlock.test.ts.
 *
 * POST-COMMIT (outside the lock tx, invariant 10) it emits the forensic
 * `STAGED_WARNING_IGNORED` / `STAGED_WARNING_UNIGNORED` outcome, only on a real
 * mutation.
 */
"use server";

import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { assertSameOriginServerAction } from "@/lib/auth/sameOriginServerAction";
import { canonicalize } from "@/lib/email/canonicalize";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withShowLock, type LockableSyncTx } from "@/lib/sync/lockedShowTx";
import {
  normalizeStagedIgnoredWarnings,
  type StagedIgnoreEntry,
} from "@/lib/admin/wizardWarningModel";

export type SetStagedWarningIgnoreResult =
  | { ok: true; state: "ignored" | "unignored" }
  | { ok: false; code: "session_not_found" | "infra_error" | "concurrent" }
  | { ok: false; code: "warning_not_found" | "warning_not_ignorable" | "warning_stale" };

type ValidationReason = "not_found" | "not_ignorable" | "stale";

type LockOutcome =
  | { kind: "infra_error" }
  | { kind: "validation_error"; reason: ValidationReason }
  | { kind: "settled"; mutated: boolean };

type StagedResolution = { kind: "found" } | { kind: "not_found" } | { kind: "infra_error" };

const VALIDATION_CODE = {
  not_found: "warning_not_found",
  not_ignorable: "warning_not_ignorable",
  stale: "warning_stale",
} as const;

/** `warningsOf` coercion, verbatim from `useRawStaged.ts:64-70`. */
function warningsOf(parseResult: unknown): ParseWarning[] {
  if (parseResult && typeof parseResult === "object" && "warnings" in parseResult) {
    const w = (parseResult as ParseResult).warnings;
    return Array.isArray(w) ? w : [];
  }
  return [];
}

/**
 * Which refusal a request earns against the locked parse. Ordered so each arm names
 * the operator-visible cause rather than collapsing to one opaque code:
 *   - no warning carries that code at all → the row moved on entirely: not_found
 *   - warnings carry it but none is ignorable → the control should not have rendered:
 *     not_ignorable (a defense arm — the client self-gates on `hasIgnorableSnippet`)
 *   - ignorable ones exist but none matches this fingerprint → a rescan changed the
 *     snippet under the operator: stale
 */
function validateAgainstLockedParse(
  warnings: readonly ParseWarning[],
  code: string,
  fingerprint: string,
): { ok: true } | { ok: false; reason: ValidationReason } {
  const sameCode = warnings.filter((w) => w.code === code);
  if (sameCode.length === 0) return { ok: false, reason: "not_found" };
  const ignorable = sameCode.filter((w) => hasIgnorableSnippet(w));
  if (ignorable.length === 0) return { ok: false, reason: "not_ignorable" };
  if (!ignorable.some((w) => warningFingerprint(w) === fingerprint)) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true };
}

/**
 * Server-verify the client-supplied `(wizardSessionId, driveFileId)` pairing before
 * locking. Every await destructures `{ data, error }`; a returned error OR a thrown
 * fault resolves to `infra_error` (invariant 9).
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

export async function setStagedWarningIgnore(args: {
  wizardSessionId: string;
  driveFileId: string;
  action: "ignore" | "unignore";
  code: string;
  rawSnippet: string;
}): Promise<SetStagedWarningIgnoreResult> {
  // The origin gate is the FIRST statement, before even destructuring the args: a
  // cross-site POST that omits `Origin` must reach nothing at all, and the structural
  // guard (tests/auth/_metaServerActionOriginGate.test.ts) pins that position rather
  // than merely the call's presence.
  await assertSameOriginServerAction(
    "setStagedWarningIgnore",
    "admin.onboarding.stagedWarningIgnore",
  );
  const { wizardSessionId, driveFileId, action, code, rawSnippet } = args;
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  // Invariant 3: the ONLY form that reaches storage. The staged entry is carried
  // verbatim into `public.ignored_warnings` at finalize, whose CHECK requires the
  // canonical form — so a non-canonicalizable identity must refuse HERE, where the
  // operator sees it, rather than fail the carry insert hours later.
  const ignoredBy = canonicalize(email);
  if (ignoredBy === null) return { ok: false, code: "infra_error" };

  // The client's own snippet must be ignorable before anything else happens: a blank
  // one has no fingerprint, so there is nothing to look up.
  const fingerprint = warningFingerprint({ code, rawSnippet });
  if (fingerprint === null) return { ok: false, code: "warning_not_ignorable" };

  // (1) Pre-lock: verify the pairing so a client arg cannot steer the lock.
  const resolved = await verifyStagedSheet(wizardSessionId, driveFileId);
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return { ok: false, code: "session_not_found" };

  // (2) Under the per-show lock: re-read live staged state, validate, write.
  const locked = await withShowLock<LockableSyncTx, LockOutcome>(driveFileId, async (tx) => {
    try {
      const row = await tx.queryOne<{
        parse_result: unknown;
        ignored_warnings: unknown;
      } | null>(
        `select parse_result, ignored_warnings
           from public.pending_syncs
          where wizard_session_id = $1 and drive_file_id = $2
          limit 1`,
        [wizardSessionId, driveFileId],
      );
      if (!row) return { kind: "validation_error", reason: "not_found" };

      const check = validateAgainstLockedParse(warningsOf(row.parse_result), code, fingerprint);
      if (!check.ok) return { kind: "validation_error", reason: check.reason };

      // Read through the single coercion boundary: a malformed stored value is
      // rebuilt clean rather than propagated back into the column.
      const current = normalizeStagedIgnoredWarnings(row.ignored_warnings);
      const present = current.some((e) => e.fingerprint === fingerprint);
      let next: StagedIgnoreEntry[];
      if (action === "ignore") {
        if (present) return { kind: "settled", mutated: false };
        next = [...current, { fingerprint, code, ignored_by: ignoredBy }];
      } else {
        if (!present) return { kind: "settled", mutated: false };
        next = current.filter((e) => e.fingerprint !== fingerprint);
      }

      // Raw array → $3::jsonb (postgres.js serializes; never JSON.stringify — the
      // double-encode trap).
      await tx.queryOne(
        `update public.pending_syncs set ignored_warnings = $3::jsonb
          where wizard_session_id = $1 and drive_file_id = $2`,
        [wizardSessionId, driveFileId, next],
      );
      return { kind: "settled", mutated: true };
    } catch {
      return { kind: "infra_error" };
    }
  }).catch(
    // A fault from the lock wrapper itself (acquisition / connection setup — the
    // callback catches only its OWN in-lock faults) becomes the same typed infra
    // result, never an escaping reject (invariant 9).
    (): LockOutcome => ({ kind: "infra_error" }),
  );

  if (locked && typeof locked === "object" && "skipped" in locked) {
    return { ok: false, code: "concurrent" };
  }
  if (locked.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (locked.kind === "validation_error") {
    return { ok: false, code: VALIDATION_CODE[locked.reason] };
  }

  const state = action === "ignore" ? "ignored" : "unignored";
  // Already in the requested state → success, no emit (the useRawStaged mutated-flag
  // discipline: forensics record decisions, not clicks).
  if (!locked.mutated) return { ok: true, state };

  // POST-COMMIT forensic outcome, outside the lock tx. `await` is load-bearing.
  await logAdminOutcome({
    code: action === "ignore" ? "STAGED_WARNING_IGNORED" : "STAGED_WARNING_UNIGNORED",
    source: "admin.onboarding.stagedWarningIgnore",
    actorEmail: ignoredBy,
    wizardSessionId,
    driveFileId,
  });

  return { ok: true, state };
}
