// lib/adminAlerts/audience.ts
//
// Audience-derived admin-alert code sets (spec 2026-07-04-alert-audience-split
// §3). All derived from MESSAGE_CATALOG at module load — mirrors the
// INFO_SEVERITY_CODES pattern in lib/messages/adminSurface.ts, so adding
// `audience`/`healthWeight` to a catalog entry automatically wires every
// consumer. Exclusion-not-allowlist: unknown/uncataloged codes are neither
// info nor health, so they stay fail-visible on Doug's surfaces.
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

const entries = Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[];

/** Every `audience: "health"` code — the health rollup reads only this set. */
export const HEALTH_CODES: string[] = entries
  .filter((entry) => entry.audience === "health")
  .map((entry) => entry.code);

/** Health codes weighted `degraded` (push the indicator red). */
export const DEGRADED_HEALTH_CODES: string[] = entries
  .filter((entry) => entry.audience === "health" && entry.healthWeight === "degraded")
  .map((entry) => entry.code);

/** Health codes weighted `notice` (amber-or-lower). */
export const NOTICE_HEALTH_CODES: string[] = entries
  .filter((entry) => entry.audience === "health" && entry.healthWeight === "notice")
  .map((entry) => entry.code);

/**
 * Codes excluded from Doug's amber surfaces (banner + bell count): the
 * pre-existing `severity: "info"` operator notices UNION the health set,
 * de-duped. NOT a doug-allowlist — an uncataloged code is in neither arm and
 * stays fail-visible (spec §3 R2 finding 2).
 */
export const DOUG_EXCLUDED_CODES: string[] = [
  ...new Set([
    ...entries.filter((entry) => entry.severity === "info").map((entry) => entry.code),
    ...HEALTH_CODES,
  ]),
];

/**
 * Plain-language, reassuring health-popover summary for a code, or `null` when
 * the code is not a health code (or is uncataloged).
 */
export function dougSummaryFor(code: string): string | null {
  const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
    | MessageCatalogEntry
    | undefined;
  return entry?.dougSummary ?? null;
}

/** Every `resolution: "auto"` code — self-resolving; the manual button is suppressed. */
export const AUTO_RESOLVING_CODES: string[] = entries
  .filter((entry) => entry.resolution === "auto")
  .map((entry) => entry.code);

const AUTO_RESOLVING_SET = new Set(AUTO_RESOLVING_CODES);

/**
 * True iff a code self-resolves. Unknown/uncataloged → false (fail-visible: the
 * manual button still renders, so an unrecognized actionable alert is never hidden).
 */
export function isAutoResolving(code: string): boolean {
  return AUTO_RESOLVING_SET.has(code);
}

// Per-code auto-clear note; codes absent here fall back to the generic line. Human
// copy only (invariant 5) — never a raw code, never interpolates untrusted context.
const AUTO_RESOLVE_NOTES: Record<string, string> = {
  EMAIL_NOT_CONFIGURED:
    "Clears automatically once email notifications are configured on the deployment.",
  EMAIL_DELIVERY_FAILED: "Clears automatically once email deliveries recover.",
  GITHUB_BOT_LOGIN_MISSING: "Clears automatically once GITHUB_BOT_LOGIN is set on the deployment.",
  SYNC_STALLED: "Clears automatically once the sync heartbeat recovers.",
  WATCH_CHANNEL_ORPHANED:
    "Clears automatically once the Drive watch channel re-subscribes (use Retry to trigger it now).",
  BRANCH_PROTECTION_DRIFT:
    "Clears automatically the next time the branch-protection monitor verifies the settings match the contract.",
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED:
    "Clears automatically the next time the branch-protection monitor authenticates successfully.",
  RESYNC_QUALITY_REGRESSED:
    "Clears automatically once the sheet's data quality recovers — fix the sheet to resolve it.",
};

/**
 * Human-readable "why there's no button" note for an auto-resolving code. Returns a
 * per-code hint when one is defined, else a well-worded generic line. Pure (no DB, no
 * interpolation of untrusted context) — invariant 5 holds, no placeholder-leak path.
 */
export function autoResolveNote(code: string): string {
  return (
    AUTO_RESOLVE_NOTES[code] ??
    "Clears automatically when the system detects recovery. No action is needed here."
  );
}
