// lib/log/persist.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { serializeError } from "./serializeError";
import { sanitizeContext } from "./sanitize";
import { recordPersistFailure, recordPersistSuccess } from "./persistHealth";
import type { LogRecord } from "./types";

// not-subject-to-meta: best-effort log sink — swallows + degrades to console,
// surfaces no typed infra_error result (a typed result would defeat "never throw
// over the caller's error", invariant 9). Pinned by tests/log/_metaAppEventsWriter.test.ts.
export async function persistAppEvent(record: LogRecord): Promise<void> {
  // record.message + record.context are already JSON-safe + email-redacted (sanitizeContext).
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("app_events").insert({
      level: record.level,
      source: record.source,
      message: record.message,
      code: record.code,
      request_id: record.requestId,
      show_id: record.showId,
      drive_file_id: record.driveFileId,
      actor_hash: record.actorHash,
      context: record.context,
    });
    if (error) {
      // ADDITIVE observability (finding #9): record the fault for /api/health. Does
      // NOT change the swallow-and-continue behavior below — the write still degrades
      // to console, never throwing over the caller (invariant 9).
      recordPersistFailure(error);
      console.error("[log/persist] app_events write failed", { error: serializeError(error) });
    } else {
      recordPersistSuccess();
    }
  } catch (e) {
    recordPersistFailure(e);
    console.error("[log/persist] app_events write threw", { error: serializeError(e) });
  }
}

// Failure-visible sibling of persistAppEvent for callers that need a durable,
// checkable write (watch-escalation fired-once guard, spec §3.2.5). Same sole-writer
// file per tests/log/_metaAppEventsWriter.test.ts. Registered in
// tests/sync/_metaInfraContract.test.ts (invariant 9) — unlike the best-effort
// sibling above, this one surfaces the error. Input is narrower than LogRecord:
// guard callers have no request/show/actor context.
export type StrictAppEvent = {
  level: LogRecord["level"];
  source: string;
  message: string;
  context: Record<string, unknown>;
  code?: string | null;
  requestId?: string | null;
  showId?: string | null;
  driveFileId?: string | null;
  actorHash?: string | null;
};

export async function persistAppEventStrict(
  record: StrictAppEvent,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    // Same sanitization chokepoint as the logger path (spec §3.2.5): buildRecord
    // runs sanitizeContext before persistAppEvent; this writer bypasses buildRecord,
    // so it must sanitize itself.
    const { message, context } = sanitizeContext(record.message, record.context);
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("app_events").insert({
      level: record.level,
      source: record.source,
      message,
      code: record.code ?? null,
      request_id: record.requestId ?? null,
      show_id: record.showId ?? null,
      drive_file_id: record.driveFileId ?? null,
      actor_hash: record.actorHash ?? null,
      context,
    });
    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}
