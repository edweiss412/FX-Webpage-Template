import { log } from "@/lib/log";
import { hashForLog } from "@/lib/email/hashForLog";

// A DURABLE admin-action outcome. The `code` is what makes it persist to
// app_events (lib/log shouldPersist: info persists only WITH a code). It is a
// free-form forensic namespace — NOT §12.4 (stripLogEmissionCalls strips
// logAdminOutcome spans, so these literals never register as producers).
export interface AdminOutcome {
  code: string; // SHOUTY_SNAKE_CASE string literal (see the meta-test registry)
  source: string; // e.g. "api.admin.onboarding.staged.apply"
  actorEmail?: string; // ALREADY canonical (requireAdminIdentity returns canonicalize()'d)
  driveFileId?: string;
  wizardSessionId?: string;
  showId?: string;
  result?: string; // sub-outcome, e.g. "reapplied" | "all_batches_complete"
  extra?: Record<string, unknown>; // spreads into app_events.context
}

// The message IS the code (a stable, low-cardinality event name); detail lives in
// result/extra. `await`ed for durability — callers emit it AFTER the mutating tx
// commits (post-wrapper), never inside the advisory-lock tx.
export async function logAdminOutcome(o: AdminOutcome): Promise<void> {
  await log.info(o.code, {
    // `extra` is spread FIRST so it can NEVER override the reserved telemetry
    // fields below — the persisted code always equals the outcome code, and actor
    // attribution derives only from hashForLog(actorEmail).
    ...(o.extra ?? {}),
    code: o.code,
    source: o.source,
    ...(o.actorEmail ? { actorHash: hashForLog(o.actorEmail) } : {}),
    ...(o.driveFileId ? { driveFileId: o.driveFileId } : {}),
    ...(o.showId ? { showId: o.showId } : {}),
    ...(o.wizardSessionId ? { wizardSessionId: o.wizardSessionId } : {}),
    ...(o.result ? { result: o.result } : {}),
  });
}
