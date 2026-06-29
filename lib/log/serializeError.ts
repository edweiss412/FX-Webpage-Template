// lib/log/serializeError.ts
/**
 * Promoted + generalized from app/auth/callback/route.ts:77-81 — the only
 * error-serialization shape in the codebase. The single canonical "turn an
 * unknown thrown value into a loggable shape" helper.
 */
export function serializeError(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : String(error);
}
