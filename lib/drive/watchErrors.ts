//
// Pure helpers for the watch-channel health feature (spec §2, §3.1).
// MUST stay import-free of lib/drive/watch.ts (watch.ts imports this module).

export type WatchErrorClass = "config" | "drive_api" | "db";

// Spec §2 named constants — the single definition; tests and consumers import these.
export const ESCALATION_THRESHOLD = 3;
export const STALE_PENDING_MAX_AGE_MS = 3_600_000;

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
// How often the renewal predicate is sampled (`fxav_cron_refresh_watch`).
export const SAMPLING_PERIOD_MS = 3_600_000;
// Upper bound on the delay between a refresh run's candidate query and any one
// row's renewal attempt. NOT an enforced timeout: `files.watch` has no timeout
// (lib/drive/client.ts) and renewals run sequentially, so the only defensible
// ceiling is the scheduler's own request budget — pg_net is passed
// timeout_milliseconds = 300000, matching Vercel Functions' 300s default
// (supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22). Using a
// smaller value would let a 62-65 minute grant be classified "guaranteed" while
// actually expiring before a later row is reached in a slow run.
export const T_EXEC_BUDGET_MS = 300_000;

/**
 * Remaining-life threshold at which a channel granted `grantedMs` becomes
 * renewal-due: `max(RENEWAL_MIN_LEAD_MS, grantedMs * (1 - RENEWAL_LIFE_FRACTION))`.
 *
 * Exported so the SQL predicate, the timing tests, and the short-grant check all
 * reason about one definition rather than three copies of the arithmetic.
 */
export function renewalLeadMs(grantedMs: number): number {
  if (!Number.isFinite(grantedMs)) return RENEWAL_MIN_LEAD_MS;
  return Math.max(RENEWAL_MIN_LEAD_MS, grantedMs * (1 - RENEWAL_LIFE_FRACTION));
}

/**
 * True when a lease's REMAINING LIFE AT SUCCESSFUL ACTIVATION is too short for
 * this sampling cadence to renew reliably at any phase (spec §2.1).
 *
 * The measurement edge is load-bearing and is activation, not request time: the
 * pending row is inserted, Drive is called, and only then is the channel
 * activated, so a nominal 62-minute grant that took two minutes to obtain has
 * only 60 usable minutes. Measuring at request time would suppress the anomaly
 * for exactly the leases that need it.
 *
 * The bound is `<=`, not `<`: a lease of exactly one sampling period, activated
 * just after a tick, expires AT the next examination rather than strictly
 * before it.
 */
export function isGrantTooShort(remainingMsAtActivation: number): boolean {
  return !(remainingMsAtActivation > SAMPLING_PERIOD_MS + T_EXEC_BUDGET_MS);
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
