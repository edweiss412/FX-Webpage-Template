// lib/messages/adminSurface.ts
//
// Single source of truth for admin-alert surface routing, derived from the
// catalog's `adminSurface` / `severity` fields at module load. Consumers:
//   - loadNeedsAttention + needsAttentionCount INCLUDE INBOX_ROUTED_CODES
//   - the bell feed/count exclusion (lib/admin/bellAudience.ts) EXCLUDES
//     INBOX_ROUTED_CODES (∪ HEALTH_CODES for non-developers) from the NotifBell
//     panel + badge — the inbox and app-health indicator own those codes
//   - the resolve routes + resolveAdminAlert(s) helper + PerShowAlertSection
//     use isInboxRouted() for the no-Dismiss UX guard
//   - BANNER_EXCLUDED_CODES / DOUG_SURFACE_EXCLUDED_CODES were the retired
//     AlertBanner's exclusion sets (bell notification center §8). They are kept
//     for tests/scripts/validation-report-fixtures-rendering.test.tsx, which
//     mirrors the historical banner query; no live surface reads them.
// Keeping this computed (not hand-listed) means adding `adminSurface:"inbox"`
// to a catalog entry automatically wires every consumer.
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

const entries = Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[];

/** Codes whose catalog entry is `severity: "info"` — operator notices, not banner-raising. */
export const INFO_SEVERITY_CODES: string[] = entries
  .filter((entry) => entry.severity === "info")
  .map((entry) => entry.code);

/** Codes routed to the Needs attention inbox (not the general alert surfaces). */
export const INBOX_ROUTED_CODES: string[] = entries
  .filter((entry) => entry.adminSurface === "inbox")
  .map((entry) => entry.code);

/**
 * Legacy: the codes the retired AlertBanner must NOT surface (info-severity ∪
 * inbox-routed, union de-duped). Retained only for the validation-report-fixtures
 * rendering test; the live bell exclusion lives in lib/admin/bellAudience.ts.
 */
export const BANNER_EXCLUDED_CODES: string[] = [
  ...new Set([...INFO_SEVERITY_CODES, ...INBOX_ROUTED_CODES]),
];

/**
 * Codes excluded from Doug's amber surfaces (global banner + bell count):
 * the existing banner exclusion (info-severity ∪ inbox-routed) PLUS the
 * `audience: "health"` set (spec 2026-07-04-alert-audience-split §5 —
 * "exclude HEALTH_CODES ∪ existing info exclusion"). Health codes now flow
 * to the app-health indicator instead. De-duped.
 *
 * Exclusion-not-allowlist: an uncataloged code is in NONE of the arms and
 * therefore stays fail-visible on the banner + counted in the bell.
 */
export const DOUG_SURFACE_EXCLUDED_CODES: string[] = [
  ...new Set([...BANNER_EXCLUDED_CODES, ...HEALTH_CODES]),
];

const INBOX_ROUTED_SET = new Set(INBOX_ROUTED_CODES);

/** True when `code` is routed to the inbox (auto-clear only; no manual Dismiss). */
export function isInboxRouted(code: string): boolean {
  return INBOX_ROUTED_SET.has(code);
}
