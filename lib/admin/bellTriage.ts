// lib/admin/bellTriage.ts
//
// Pure, client-safe bell triage logic (spec 2026-07-17-bell-triage-severity-grouping).
// Extracted from BellPanel.tsx so tests import the threshold/tone/grouping WITHOUT
// dragging BellPanel's "use server" action chain (spec §1.7). No React, no
// server-only imports — only catalog-derived helpers.
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import { DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import type { BellEntry } from "@/lib/admin/bellFeed";

/** Active-list count at/above which the panel re-sections by severity (spec §1.1). */
export const GROUP_THRESHOLD = 9;

export type RowTone = "critical" | "notice" | "info";

/**
 * Severity tone for a row (spec §1.6). Health rows are critical ONLY when
 * degraded-weight; notice-weight health codes (9 of them) are amber, matching
 * the health rollup — fixes BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT.
 */
export function rowTone(entry: BellEntry): RowTone {
  if (entry.isHealth) return DEGRADED_HEALTH_CODES.includes(entry.code) ? "critical" : "notice";
  const severity = isMessageCode(entry.code) ? messageFor(entry.code).severity : undefined;
  return severity === "info" ? "info" : "notice";
}

/** Fixed render order: highest severity first (spec §1.2). */
export const TIER_ORDER: readonly RowTone[] = ["critical", "notice", "info"];

/**
 * Stable partition of active entries by tone, in TIER_ORDER, empty tiers
 * omitted. `filter` preserves the server's activityAt-DESC order within each
 * tier — never a re-sort (spec §1.2).
 */
export function groupActiveBySeverity(
  active: BellEntry[],
): { tone: RowTone; rows: BellEntry[] }[] {
  return TIER_ORDER.map((tone) => ({
    tone,
    rows: active.filter((e) => rowTone(e) === tone),
  })).filter((g) => g.rows.length > 0);
}
