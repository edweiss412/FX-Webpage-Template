/**
 * The generic googleapis/gaxios error-status SHAPE READER.
 *
 * Extracted so callers that only need "what status did this error carry?" do
 * not have to import `lib/drive/fetch.ts`, which pulls in
 * `exportSheetToMarkdown` and therefore the `xlsx` package — real cold-start and
 * bundle cost for a path like the hourly watch cron that just wants to tell a
 * 404 from everything else (spec §3.1.4). Absence of an import CYCLE does not
 * make that free.
 *
 * This module has NO imports, by contract.
 *
 * What deliberately does NOT live here, because all three are retry POLICY for
 * `withDriveRetry` rather than status reading: the `DriveFetchError` special
 * case, the gaxios-7 timeout codes mapped to a transient 504, and the undici
 * `.cause`-chain walk mapped to 503. `lib/drive/fetch.ts` keeps those and
 * delegates the shape reading here.
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
