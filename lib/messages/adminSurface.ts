// lib/messages/adminSurface.ts
//
// Single source of truth for admin-alert surface routing, derived from the
// catalog's `adminSurface` / `severity` fields at module load. Consumers:
//   - AlertBanner + fetchUnresolvedAlertCount exclude BANNER_EXCLUDED_CODES
//   - loadNeedsAttention + needsAttentionCount INCLUDE INBOX_ROUTED_CODES
//   - the resolve routes + resolveAdminAlert(s) helper + PerShowAlertSection
//     use isInboxRouted() for the no-Dismiss UX guard
// Keeping this computed (not hand-listed) means adding `adminSurface:"inbox"`
// to a catalog entry automatically wires every consumer.
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

const entries = Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[];

/** Codes whose catalog entry is `severity: "info"` — operator notices, not banner-raising. */
export const INFO_SEVERITY_CODES: string[] = entries
  .filter((entry) => entry.severity === "info")
  .map((entry) => entry.code);

/** Codes routed to the Needs attention inbox instead of the AlertBanner. */
export const INBOX_ROUTED_CODES: string[] = entries
  .filter((entry) => entry.adminSurface === "inbox")
  .map((entry) => entry.code);

/** Codes the AlertBanner + bell count must NOT surface (union, de-duped). */
export const BANNER_EXCLUDED_CODES: string[] = [
  ...new Set([...INFO_SEVERITY_CODES, ...INBOX_ROUTED_CODES]),
];

const INBOX_ROUTED_SET = new Set(INBOX_ROUTED_CODES);

/** True when `code` is routed to the inbox (auto-clear only; no manual Dismiss). */
export function isInboxRouted(code: string): boolean {
  return INBOX_ROUTED_SET.has(code);
}
