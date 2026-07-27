//
// Pure helpers for the watch-channel health feature (spec §2, §3.1).
// MUST stay import-free of lib/drive/watch.ts (watch.ts imports this module).

export const WATCH_ERROR_CLASSES = ["config", "drive_api", "db"] as const;
export type WatchErrorClass = (typeof WATCH_ERROR_CLASSES)[number];

// Spec §2 named constants — the single definition; tests and consumers import these.
export const ESCALATION_THRESHOLD = 3;
export const STALE_PENDING_MAX_AGE_MS = 3_600_000;

/**
 * How many reaped/skipped ids a single forensic emit carries. The true totals
 * always travel in the sibling `*Count` fields, so the cap costs no signal —
 * and the ids are sorted BEFORE capping, because `UPDATE … RETURNING` has no
 * ordering contract and an execution-plan change would otherwise vary the set.
 */
export const REAP_ID_LOG_CAP = 20;

/**
 * Per-Drive-call bound, applied to `files.watch` and `channels.stop` as
 * `{ timeout: DRIVE_CALL_TIMEOUT_MS, retry: false }` — the idiom this repo
 * already proved on the onboarding hot path (lib/drive/fetch.ts:359).
 *
 * `retry: false` is not decoration: gaxios has its own internal retry layer, so
 * without it this budget is multiplied by that layer's attempts and bounds
 * nothing. The watch path has no `withDriveRetry` wrapper and gains none — one
 * attempt per cron tick, with the next tick as the retry, which is the existing
 * fail-open posture.
 *
 * 15s is the value the master spec claimed for years while nothing implemented
 * it; implementing it at the promised number keeps the corrected spec wording
 * and the code in agreement. It sits inside the existing family:
 * DRIVE_FILES_GET_TIMEOUT_MS is 8_000, DRIVE_EXPORT_TIMEOUT_MS is 45_000.
 */
export const DRIVE_CALL_TIMEOUT_MS = 15_000;

/**
 * Cap on candidates examined in one GC pass, and the elapsed budget that stops
 * the loop early.
 *
 * Both exist because a `superseded` row whose `channels.stop` keeps failing is
 * left for retry indefinitely — deliberately, since abandoning it would leak a
 * live Drive channel. Without a cap, ~20 such rows at DRIVE_CALL_TIMEOUT_MS
 * each consume the GC cron's 300s request window, and since candidates are
 * ordered oldest-first they are served first on every subsequent pass too, so
 * everything behind them is never collected.
 *
 * The budget is well under the cron's 300s so the pass ends on its own terms
 * rather than being cut off mid-row.
 */
export const GC_CANDIDATES_PER_PASS = 200;
export const GC_RUN_BUDGET_MS = 120_000;

// Lease-slack constants (spec 2026-07-25-watch-lease-slack-design §2).
//
// Requested channel lifetime. Google's documented maximum for the `files`
// resource is 86400s; omitting `expiration` yields their 1h default, which is
// what left every lease with ~1s of renewal slack.
export const WATCH_TTL_MS = 86_400_000;
// A channel is renewal-due once this fraction of its GRANTED life has elapsed…
export const RENEWAL_LIFE_FRACTION = 0.75;
// …but never with less than this much life remaining. The floor exists because
// the predicate is sampled on a fixed cron tick: a purely proportional trigger
// is unsafe on short grants (spec §2.1).
export const RENEWAL_MIN_LEAD_MS = 7_200_000;

// Reconnect ladder (spec 2026-07-26-watch-reconcile-backoff-v2 §2.1/§3.3): the
// Nth consecutive failed reconnect attempt waits BACKOFF_LADDER_MS[min(N, len) - 1]
// before the next one; the final rung repeats indefinitely.
export const BACKOFF_LADDER_MS = [900_000, 1_800_000, 3_600_000, 7_200_000] as const;
// Literal tuple index (not computed) so noUncheckedIndexedAccess yields `number`,
// not `number | undefined`. The constants test asserts equality with .at(-1) so a
// ladder-length change cannot silently desync this.
export const BACKOFF_MAX_MS: number = BACKOFF_LADDER_MS[3];

// Escalate once an unresolved WATCH_CHANNEL_ORPHANED has persisted this long.
// Duration replaces the retired count-based trigger (deleted in the escalation task).
export const ESCALATION_AFTER_MS = 10_800_000;

// The only two values a completed subscribe attempt can persist (spec §3.2) -
// deliberately narrower than ReconcileOutcome.
export const ATTEMPT_OUTCOMES = ["failed", "succeeded"] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];
// How often the renewal predicate is sampled (`fxav_cron_refresh_watch`).
export const SAMPLING_PERIOD_MS = 3_600_000;
// PARTLY enforceable, as of the watch-renewal-lifecycle work. What IS enforced:
// the renewal loop stops STARTING new rows once this much time has elapsed
// (REFRESH_RUN_BUDGET_MS aliases it), and each Drive request carries
// DRIVE_CALL_TIMEOUT_MS. What is still NOT enforced: the in-flight iteration
// when the budget expires (a pre-iteration check cannot bound the iteration it
// admits), the GoogleAuth credential fetch that precedes each request on its
// own transport, the platform's willingness to keep the invocation alive, and
// pg_net's timeout_milliseconds, which may be ignored outright
// (supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22).
//
// So the honest bound on a run is REFRESH_RUN_BUDGET_MS plus one worst-case
// iteration — not REFRESH_RUN_BUDGET_MS. isGrantTooShort below therefore stays
// a heuristic and is NOT upgraded to a guarantee.
export const T_EXEC_BUDGET_MS = 300_000;
/**
 * Bound on one renewal RUN before it stops starting new rows. Aliased to
 * T_EXEC_BUDGET_MS rather than restated, so the loop's budget and the value
 * `isGrantTooShort` reasons from cannot drift apart.
 */
export const REFRESH_RUN_BUDGET_MS = T_EXEC_BUDGET_MS;

/**
 * Remaining-life threshold at which a channel becomes renewal-due:
 * `max(minLeadMs, grantedMs * lifeFraction)`.
 *
 * `lifeFraction` is the **remaining-life** fraction (the complement of
 * `RENEWAL_LIFE_FRACTION`), matching what the caller passes to the port and what
 * the SQL multiplies — the previous doc described it as the fraction already
 * burned, which is the opposite (whole-diff R5 finding 3).
 *
 * Shared by the DB-free `WatchTx` fake and the timing tests. The production SQL
 * necessarily RESTATES this arithmetic (it cannot call TypeScript); the two are
 * held together by the real-DB production-path test, not by this function
 * (R5 finding 4 — an earlier doc claimed SQL shared it, which is not possible).
 */
export function renewalLeadMs(
  grantedMs: number,
  // NO defaults (R7 finding 2): defaulting to the module constants let a caller
  // that forgot to pass its arguments silently get the right answer, which is
  // exactly the drift this helper exists to expose.
  minLeadMs: number,
  lifeFraction: number,
): number {
  if (!Number.isFinite(grantedMs)) return minLeadMs;
  return Math.max(minLeadMs, grantedMs * lifeFraction);
}

/**
 * Heuristic: is this lease's remaining life at activation pathologically short
 * for the renewal cadence?
 *
 * **This is a detector, not a guarantee** (whole-diff R3 finding 1). Three
 * successive rounds found the guarantee framing indefensible, each time for the
 * same reason: any timing claim here is parameterised by `T_EXEC_BUDGET_MS`,
 * which nothing enforces — renewals are sequential, `files.watch` has no
 * per-call timeout, and a stalled earlier row can starve a later one no matter
 * what threshold is chosen. The bound was widened twice (`P + T`, then
 * `2 * (P + T)`) chasing a property the constants cannot deliver.
 *
 * So the claim is now only what it is: `P + 2T` is the point below which a
 * lease is short enough that renewal is *implausible* rather than merely tight
 * — one sampling period to be noticed, plus budget to reach the row and
 * complete a `files.watch` round-trip. Crossing it means the cadence assumption
 * is broken and someone should look; staying above it promises nothing.
 *
 * The real safety margin comes from the LEASE, not from this check: we request
 * 24h and renew at 6h remaining, so the heuristic should never fire.
 *
 * Measured at activation rather than request time — the pending insert and the
 * Drive round-trip both consume lease life.
 */
export function isGrantTooShort(remainingMsAtActivation: number): boolean {
  return !(remainingMsAtActivation > SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS);
}

const CONFIG_PATTERNS = [
  /DRIVE_WEBHOOK_BASE_URL is required/i,
  /invalid_grant/i,
  /could not load the default credentials/i,
  /GOOGLE_SERVICE_ACCOUNT_JSON/i,
];

// Structural check instead of instanceof to avoid a watch.ts import cycle;
// DriveWatchInfraError carries kind = "drive_watch_infra_error" (watch.ts:10-22).
function isDriveWatchInfraError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { kind?: unknown }).kind === "drive_watch_infra_error"
  );
}

export function classifyWatchError(err: unknown): WatchErrorClass {
  if (isDriveWatchInfraError(err)) return "db";
  const message = String((err as { message?: unknown })?.message ?? err);
  if (CONFIG_PATTERNS.some((re) => re.test(message))) return "config";
  return "drive_api";
}

// Spec §3.1.3 redaction contract: (a) literal webhook secret, (b) Bearer runs +
// token/key/secret/authorization pair values, (c) truncate LAST.
export function redactWatchError(
  message: string,
  secrets: { webhookSecret?: string } = {},
): string {
  let out = message;
  if (secrets.webhookSecret) out = out.split(secrets.webhookSecret).join("[redacted]");
  out = out.replace(/Bearer\s+\S+/g, "Bearer [redacted]");
  out = out.replace(/\b(token|key|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return out.slice(0, 300);
}
