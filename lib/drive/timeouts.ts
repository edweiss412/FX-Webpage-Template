/**
 * Lean timeout constants importable from request routes without pulling
 * lib/drive/fetch.ts's xlsx dependency; see lib/drive/errorStatus.ts's header
 * for the cost rationale. This module has NO imports and NO re-exports, by
 * contract (pinned by tests/drive/timeouts.test.ts).
 */

/**
 * Per-attempt wall-clock budget for a Drive `files.get` metadata read.
 *
 * `getDriveClient()` builds the gaxios client with NO timeout (gaxios default is
 * unbounded), so a silent socket stall on the before-`get`/after-`get` issued
 * around every sheet hangs `prepareOne` exactly like the export bug did — on the
 * SAME onboarding hot path (DXT-1 part C). Healthy gets are 165-255ms, so 8s is
 * ~30x headroom while still bounding a stall.
 *
 * A gaxios-7 per-call timeout rejects with a `GaxiosError` carrying its
 * signature on `cause.name === "AbortError"` (probed 2026-07-31 against the
 * installed gaxios@7.1.4; no `code` is set on this path). `driveErrorStatus`
 * classifies that shape via `isDriveTimeoutShape` — plus the low-level
 * socket-timeout codes, defensively — to a transient 504 so the
 * already-wrapping `withDriveRetry` retries with a fresh budget, then throws a
 * typed error after the bounded retries (same bounded contract as the export
 * guard, not an indefinite hang). The gaxios call passes `retry: false` so
 * `withDriveRetry` is the SINGLE retry layer and the per-attempt budget is
 * exactly this many ms.
 *
 * Aggregate budget: the dominant per-sheet term is the EXPORT guard (45s *
 * (1+maxRetries) = 180s). The metadata budgets are deliberately small on top of
 * it — a single sheet's pathological all-stall-and-exhaust critical path is
 * roughly list(10s*4) + before-get(8s*4) + export(180s) + after-get(8s*4) ≈
 * 284s, which stays under the route's 300s `maxDuration`; even at the cap,
 * maxDuration termination is a BOUNDED failure (the original bug was an
 * *indefinite* hang). Realistic prepare is a few seconds — this is the
 * astronomically improbable worst case, not the expected one.
 */
export const DRIVE_FILES_GET_TIMEOUT_MS = 8_000;
