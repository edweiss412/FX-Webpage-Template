// lib/log/persistHealth.ts
//
// In-process self-health counters for the app_events durable channel — the
// finding-#9 operator signal. persistAppEvent's ONLY reaction to a failed/thrown
// insert is console.error, which is invisible on Vercel; if writes fail wholesale
// (RLS regression, key rotation, schema drift, quota) the whole durable log channel
// goes dark with zero signal. These counters are surfaced through /api/health so a
// climbing `failed` with `ok` flat is a probe operators can watch.
//
// Pure counter state — invariant-9-safe: never throws, never touches the network,
// never allocates unboundedly. Module-level singleton (per serverless instance);
// getPersistHealth() returns a fresh snapshot so callers cannot mutate the state.
export interface PersistHealth {
  ok: number;
  failed: number;
  lastError: string | null;
  lastFailedAt: string | null;
}

let ok = 0;
let failed = 0;
let lastError: string | null = null;
let lastFailedAt: string | null = null;

export function recordPersistSuccess(): void {
  ok += 1;
}

// Accepts the raw returned-error object OR a thrown value; serializes defensively
// to a short string (never throws — an unserializable value degrades to a sentinel).
export function recordPersistFailure(error: unknown): void {
  failed += 1;
  lastError = serializeForHealth(error);
  lastFailedAt = new Date().toISOString();
}

function serializeForHealth(error: unknown): string {
  try {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    if (typeof error === "string") return error;
    const json = JSON.stringify(error);
    return json ?? String(error);
  } catch {
    return "[unserializable error]";
  }
}

export function getPersistHealth(): PersistHealth {
  return { ok, failed, lastError, lastFailedAt };
}

export function resetPersistHealth(): void {
  ok = 0;
  failed = 0;
  lastError = null;
  lastFailedAt = null;
}
