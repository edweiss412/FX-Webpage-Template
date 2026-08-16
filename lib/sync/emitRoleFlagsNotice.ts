import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { emitLeadRoleApplied } from "@/lib/log/emitLeadRoleApplied";
import { emitIdentityLinkRenameUnlanded } from "@/lib/log/emitIdentityLinkRenameUnlanded";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";
import type { UnlandedRename } from "@/lib/sync/applyParseResult";

/**
 * The ONE post-commit role-flags emit (spec 2026-08-03-apply-undo-audit-fidelity §2.3, Unit C).
 *
 * This is `emitDeferredRoleFlagsNotice` (formerly private to lib/sync/runScheduledCronSync.ts),
 * exported and relocated so every apply path shares ONE implementation of the load-bearing emit
 * ORDER below instead of the near-verbatim copies that had already accumulated. It takes the
 * notice DIRECTLY rather than a `ProcessOneFileResult` envelope — the callers' per-row result
 * shapes differ (`ProcessOneFileResult`, `ApplyStagedCoreResult`, `ShadowApplyResult`), so the
 * applied-and-notice-present guard stays with each caller.
 *
 * FAILURE POLICY IS THE CALLER'S. `upsertAdminAlert` THROWS on RPC failure and this helper does
 * NOT catch it: `applyStaged` / `runScheduledCronSync` keep their propagating behavior, while the
 * finalize routes flush through `flushDeferredApplyEmits` below, which is fail-open.
 */
export type RoleFlagsNoticeUpsert = (notice: RoleFlagsNotice) => Promise<unknown>;

export const ROLE_FLAGS_EMIT_SOURCE = "sync.roleFlags";
export const UNLANDED_RENAME_EMIT_SOURCE = "sync.identityLink";

export async function emitRoleFlagsNotice(
  roleFlagsNotice: RoleFlagsNotice,
  opts: { source?: string; upsertAdminAlert?: RoleFlagsNoticeUpsert } = {},
): Promise<void> {
  const upsertAdminAlert = opts.upsertAdminAlert ?? defaultUpsertAdminAlert;
  // §3.4 (F1): emit the durable, non-coalescing LEAD audit event FIRST — BEFORE the alert upsert.
  // `upsertAdminAlert` THROWS on RPC failure; ordering the authoritative audit ahead of it means a
  // transient feed-write failure (post-commit, after the LEAD mutation already landed) can never
  // skip the durable record. The audit is failure-visible internally ({ok,error}); it never throws.
  // Rides the SAME site as the feed nudge so no apply path is missed (cross-caller topology —
  // tests/sync/_metaLeadRoleAppliedTopology.test.ts now pins THIS file as the single site).
  await emitLeadRoleApplied(roleFlagsNotice, { source: opts.source ?? ROLE_FLAGS_EMIT_SOURCE });
  await upsertAdminAlert(roleFlagsNotice);
}

/**
 * The finalize routes' post-commit emit carrier (spec §2.3).
 *
 * Ordinary finalize and BOTH finalize-cas handlers run their per-row applies inside an OUTER
 * transaction that holds `tryFinalizeLock` + a `FOR UPDATE` session row for its whole body, so
 * neither the per-row site nor the in-transaction success path is a valid emit point (invariant 10
 * on one horn, a dropped notice for an independently-committed row on the other). Each row's
 * private payload is therefore accumulated here — ONLY after its own `withRowTx` resolved, i.e.
 * only after that row's `sql.begin` committed — and flushed in the `finally` of the outer
 * transaction, which is simultaneously outside every lock AND unskippable.
 */
export type DeferredApplyEmits = {
  roleFlagsNotices: RoleFlagsNotice[];
  unlandedRenames: Array<{
    pairs: UnlandedRename[];
    showId: string;
    driveFileId: string;
  }>;
  /**
   * Corrupt-row rebuild exhaustion (`ONBOARDING_SHADOW_REBUILD_EXHAUSTED`).
   *
   * Deferred for the same reason as its two siblings, and it is the one that was
   * left behind: finalize-cas emitted it inline in the per-row loop, which runs
   * while the outer `withTx` still holds `tryFinalizeLock` and the `app_settings
   * FOR UPDATE` row — an emit from inside the locked transaction, which
   * invariant 10 forbids (BL-SHADOW-REBUILD-EXHAUSTED-EMIT-PLACEMENT).
   *
   * The defect was PLACEMENT, not loss: the inline emit did fire. That is why
   * the regression test asserts ORDER rather than occurrence — an
   * occurrence-only assertion is green against the bug it is meant to catch.
   */
  rebuildExhausted: Array<{
    actorEmail: string;
    driveFileId: string;
    wizardSessionId: string;
    showId: string | null;
    result: string;
    corruptionReason: string | null;
    attemptCount: number;
  }>;
};

export function createDeferredApplyEmits(): DeferredApplyEmits {
  return { roleFlagsNotices: [], unlandedRenames: [], rebuildExhausted: [] };
}

/**
 * Flush the accumulated post-commit emits. FAIL-OPEN by construction: `upsertAdminAlert` throws,
 * and a throw here must neither replace the route's real outcome nor mask an in-flight outer
 * error (the flush runs in a `finally`). Each item is wrapped independently so one failing notice
 * cannot silence the rest, and the failure is escalated via `log.error` rather than propagated
 * (invariant 9 — surfaced, never swallowed).
 *
 * The ORDERING INSIDE `emitRoleFlagsNotice` is unchanged (durable audit before the alert upsert),
 * so a thrown `upsertAdminAlert` is caught one level up here, AFTER the durable record was already
 * written.
 */
export async function flushDeferredApplyEmits(
  pending: DeferredApplyEmits,
  ctx: { source: string },
): Promise<void> {
  for (const notice of pending.roleFlagsNotices) {
    try {
      await emitRoleFlagsNotice(notice, { source: ROLE_FLAGS_EMIT_SOURCE });
    } catch (error) {
      // Assigned to a local (NOT chained) so prettier keeps `log.error(` on ONE line — a chained
      // `.catch()` makes prettier split `log` / `.error` across lines, which stripLogEmissionCalls
      // cannot match, leaking the app_events-only ROLE_FLAGS_NOTICE_EMIT_FAILED forensic code into
      // the §12.4 / internal-code-enum producer scans (same constraint as runScheduledCronSync.ts
      // PARSE_SHEET_THREW).
      const escalation = log.error("deferred role-flags notice emit failed", {
        source: ctx.source,
        code: "ROLE_FLAGS_NOTICE_EMIT_FAILED",
        showId: notice.showId,
        error: error,
      });
      await escalation.catch(() => {
        /* best-effort: the escalation itself must never throw out of a finally */
      });
    }
  }
  for (const entry of pending.unlandedRenames) {
    try {
      await emitIdentityLinkRenameUnlanded(entry.pairs, {
        source: UNLANDED_RENAME_EMIT_SOURCE,
        showId: entry.showId,
        driveFileId: entry.driveFileId,
      });
    } catch (error) {
      // Unchained for the same stripLogEmissionCalls reason as the role-flags escalation above.
      const escalation = log.error("deferred unlanded-rename emit failed", {
        source: ctx.source,
        code: "IDENTITY_LINK_RENAME_UNLANDED_EMIT_FAILED",
        showId: entry.showId,
        driveFileId: entry.driveFileId,
        error: error,
      });
      await escalation.catch(() => {
        /* best-effort: the escalation itself must never throw out of a finally */
      });
    }
  }
  for (const entry of pending.rebuildExhausted) {
    // `logAdminOutcome` is fail-open internally, so this try/catch is belt to its
    // braces — but it runs in a `finally` beside two emitters that DO throw, and
    // an unguarded call here could mask an in-flight outer error.
    try {
      await logAdminOutcome({
        code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED",
        source: ctx.source,
        actorEmail: entry.actorEmail,
        driveFileId: entry.driveFileId,
        wizardSessionId: entry.wizardSessionId,
        ...(entry.showId === null ? {} : { showId: entry.showId }),
        result: entry.result,
        extra: {
          corruptionReason: entry.corruptionReason,
          attemptCount: entry.attemptCount,
        },
      });
    } catch (error) {
      // Unchained for the same stripLogEmissionCalls reason as the two above.
      const escalation = log.error("deferred rebuild-exhausted emit failed", {
        source: ctx.source,
        code: "SHADOW_REBUILD_EXHAUSTED_EMIT_FAILED",
        driveFileId: entry.driveFileId,
        error: error,
      });
      await escalation.catch(() => {
        /* best-effort: the escalation itself must never throw out of a finally */
      });
    }
  }
}
