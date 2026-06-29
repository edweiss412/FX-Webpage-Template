// lib/log/logger.ts
import { getRequestContext } from "./requestContext";
import { sanitizeContext } from "./sanitize";
import { serializeError } from "./serializeError";
import type { LogFields, LogLevel, LogRecord, Sink } from "./types";
// persist.ts is imported LAZILY inside the default sink (below) so loading the
// logger never eagerly loads the Supabase client, and Task 4 has no load-time
// dependency on Task 5.

const RESERVED = new Set([
  "source",
  "code",
  "showId",
  "driveFileId",
  "requestId",
  "actorHash",
  "error",
  "persist",
]);

function shouldPersist(level: LogLevel, code: string | null, persist: boolean): boolean {
  if (level === "error" || level === "warn") return true;
  if (level === "info") return code != null || persist === true;
  return false; // debug
}

function buildRecord(level: LogLevel, message: string, fields: LogFields): LogRecord {
  const ctx = getRequestContext();
  const rawContext: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!RESERVED.has(k)) rawContext[k] = v;
  }
  if (fields.error !== undefined) rawContext.error = serializeError(fields.error);

  const { message: cleanMessage, context: cleanContext } = sanitizeContext(message, rawContext);

  return {
    level,
    message: cleanMessage,
    source: fields.source,
    code: fields.code ?? null,
    // Explicit-field precedence: an explicit `null` (caller says "no correlation")
    // overrides the ambient ALS value; only `undefined`/absent falls through to ALS.
    requestId: fields.requestId !== undefined ? fields.requestId : (ctx?.requestId ?? null),
    showId: fields.showId !== undefined ? fields.showId : (ctx?.showId ?? null),
    driveFileId: fields.driveFileId ?? null,
    actorHash: fields.actorHash ?? null,
    context: cleanContext,
  };
}

const defaultSink: Sink = async (record, persist) => {
  const compact: Record<string, unknown> = {
    level: record.level,
    code: record.code,
    requestId: record.requestId,
    showId: record.showId,
    driveFileId: record.driveFileId,
    actorHash: record.actorHash,
    ...record.context,
  };
  for (const k of Object.keys(compact)) {
    if (compact[k] == null) delete compact[k];
  }
  // The ONE intentional console chokepoint. Always synchronous, before persist.
  console[record.level](`[${record.source}] ${record.message}`, compact);
  if (persist) {
    const { persistAppEvent } = await import("./persist");
    await persistAppEvent(record);
  }
};

let activeSink: Sink = defaultSink;

export function setLogSink(sink: Sink): void {
  activeSink = sink;
}
export function resetLogSink(): void {
  activeSink = defaultSink;
}

async function emit(level: LogLevel, message: string, fields: LogFields): Promise<void> {
  const record = buildRecord(level, message, fields);
  const persist = shouldPersist(level, record.code, fields.persist === true);
  await activeSink(record, persist);
}

export const log = {
  error: (message: string, fields: LogFields) => emit("error", message, fields),
  warn: (message: string, fields: LogFields) => emit("warn", message, fields),
  info: (message: string, fields: LogFields) => emit("info", message, fields),
  debug: (message: string, fields: LogFields) => emit("debug", message, fields),
};
