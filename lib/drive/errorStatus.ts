/**
 * The generic googleapis/gaxios error-status SHAPE READER.
 *
 * Extracted so callers that only need "what status did this error carry?" do
 * not have to import `lib/drive/fetch.ts`, which pulls in
 * `exportSheetToMarkdown` and therefore the `xlsx` package — real cold-start and
 * bundle cost for a path like the 15-minute watch cron that just wants to tell a
 * 404 from everything else (spec §3.1.4). Absence of an import CYCLE does not
 * make that free.
 *
 * This module has NO imports, by contract.
 *
 * SHAPE reading lives here — both the status reader below and the
 * timeout/abort-signature reader `isDriveTimeoutShape`. What deliberately does
 * NOT live here, because it is retry POLICY for `withDriveRetry` rather than
 * shape reading: the `DriveFetchError` special case, the decision that a
 * timeout shape maps to a transient 504, and the undici `.cause`-chain walk
 * mapped to 503. `lib/drive/fetch.ts` keeps those and delegates the shape
 * reading here.
 */
export function driveErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    response?: { status?: unknown };
    status?: unknown;
    code?: unknown;
  };
  if (typeof candidate.response?.status === "number") return candidate.response.status;
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.code === "number") return candidate.code;
  return null;
}

const TIMEOUT_SIGNATURES = new Set(["TimeoutError", "AbortError", "ETIMEDOUT", "ECONNABORTED"]);

/**
 * True iff the error or its bounded `.cause` chain (depth <= 4, cycle-guarded)
 * carries a timeout/abort signature on `name` or `code`. Probed 2026-07-31
 * against gaxios@7.1.4 + node-fetch: a per-call timeout is a GaxiosError with
 * NO `code`, `name === "Error"`, and `cause.name === "AbortError"` (the
 * drive-timeout-cluster spec 1.3 transcript). Top-level "TimeoutError" /
 * "ETIMEDOUT" / "ECONNABORTED" are retained for native-fetch
 * (`AbortSignal.timeout`) and socket-level shapes.
 */
export function isDriveTimeoutShape(error: unknown): boolean {
  let node: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth <= 4 && node && typeof node === "object" && !seen.has(node); depth++) {
    seen.add(node);
    const { name, code } = node as { name?: unknown; code?: unknown };
    if (typeof name === "string" && TIMEOUT_SIGNATURES.has(name)) return true;
    if (typeof code === "string" && TIMEOUT_SIGNATURES.has(code)) return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}
