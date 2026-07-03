//
// Pure helpers for the watch-channel health feature (spec §2, §3.1).
// MUST stay import-free of lib/drive/watch.ts (watch.ts imports this module).

export type WatchErrorClass = "config" | "drive_api" | "db";

// Spec §2 named constants — the single definition; tests and consumers import these.
export const ESCALATION_THRESHOLD = 3;
export const STALE_PENDING_MAX_AGE_MS = 3_600_000;

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
