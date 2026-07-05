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
