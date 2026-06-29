// lib/log/persist.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { serializeError } from "./serializeError";
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
      console.error("[log/persist] app_events write failed", { error: serializeError(error) });
    }
  } catch (e) {
    console.error("[log/persist] app_events write threw", { error: serializeError(e) });
  }
}
