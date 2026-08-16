import { log } from "@/lib/log";
import { persistAppEventStrict } from "@/lib/log/persist";
import type { UnlandedRename } from "@/lib/sync/applyParseResult";

/**
 * Durable, failure-visible forensic trail for an identity-link rename that was REQUESTED and did
 * NOT land (spec 2026-08-03-apply-undo-audit-fidelity §2.2, requirement R4).
 *
 * Once the capability notice and the auto-apply change-log feed both derive from what the apply
 * actually landed (P2-F2), an unlanded pair correctly leaves NO trace in either surface — the feed
 * describes the removal/addition that really happened, and the notice reports the real capability
 * outcome. That is the right operator-facing answer, and it means this event is the ONLY signal
 * that a rename was asked for and refused. Silent omission here is silent everything, so the write
 * goes through the failure-visible writer `persistAppEventStrict` (returns `{ ok }`, does NOT
 * swallow) rather than a best-effort log line.
 *
 * One event per pair, so a batch never collapses several distinct reasons into one row. Emitted
 * POST-COMMIT, OUTSIDE the advisory-lock tx (invariant 10).
 *
 * The forensic app_events code IDENTITY_LINK_RENAME_UNLANDED is NOT a §12.4 user-facing code — no
 * catalog row, no `pnpm gen:spec-codes`. The persistAppEventStrict(...) span is recognized by
 * stripLogEmissionCalls so the code never registers in the §12.4 / internal-code-enum producer
 * scans. Redaction-safe: crew names and a reason token only — no email, phone or token
 * (persistAppEventStrict also runs sanitizeContext).
 *
 * Failure policy (matching `emitLeadRoleApplied`, its precedent): a post-commit event is not
 * transactionally atomic with the committed apply, so the guarantee is durable + failure-visible.
 * On `{ ok: false }` the failure is surfaced loudly via `log.error` under a distinct code — never
 * silently swallowed (invariant 9), and never rethrown into the caller's post-commit tail. Residual
 * double-fault (strict insert AND the escalation both fail) is documented, as it is there.
 */
export async function emitIdentityLinkRenameUnlanded(
  unlanded: UnlandedRename[],
  ctx: { source: string; showId: string; driveFileId: string },
): Promise<void> {
  for (const entry of unlanded) {
    // The strict writer returns a discriminated union `{ ok: true } | { ok: false; error }`; narrow
    // via `result.ok` (a bare `{ ok, error }` destructure would not typecheck — `error` is only on
    // the failure branch). Returned-error vs thrown are distinguished: a thrown fault propagates,
    // a returned `{ ok: false }` is surfaced loudly below (invariant 9 — never swallowed).
    const result = await persistAppEventStrict({
      level: "info",
      source: ctx.source,
      message: "identity-link rename did not land",
      code: "IDENTITY_LINK_RENAME_UNLANDED",
      showId: ctx.showId,
      driveFileId: ctx.driveFileId,
      context: {
        // Key casing is verbatim from the approved spec §2.2 payload contract.
        removedName: entry.pair.removedName,
        addedName: entry.pair.addedName,
        reason: entry.reason,
        sourceSurvived: entry.sourceSurvived,
      },
    });
    if (!result.ok) {
      // Surface loudly — the ONLY record of this unlanded pair failed to persist. Never swallow.
      await log.error("durable unlanded-rename audit write failed", {
        source: ctx.source,
        code: "IDENTITY_LINK_RENAME_UNLANDED_PERSIST_FAILED",
        showId: ctx.showId,
        removedName: entry.pair.removedName,
        addedName: entry.pair.addedName,
        reason: entry.reason,
        error: result.error,
      });
    }
  }
}
