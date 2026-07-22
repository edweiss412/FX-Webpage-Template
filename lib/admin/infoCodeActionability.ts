// lib/admin/infoCodeActionability.ts
//
// Actionability decisions for every info-severity ParseWarning code the
// published Parse-warnings panel can list. TOTAL by contract: a new info
// emitter without a row here fails tests/admin/_metaInfoCodeActionability.test.ts
// (two-layer scanner, spec 2026-07-22-warning-panel-polish §3.4).
import type { ParseWarning } from "@/lib/parser/types";

export const INFO_CODE_ACTIONABILITY: Readonly<Record<string, "actionable" | "not-actionable">> = {
  // Catalog copy directs a sheet edit ("Remove the duplicate", catalog.ts:1216).
  DAY_RESTRICTION_DOUBLE_LOCATION: "actionable",
  // The parser already fixed it; nothing for the operator to do.
  TYPO_NORMALIZED: "not-actionable",
};

export function infoRowInvitesCorrection(w: Pick<ParseWarning, "code">): boolean {
  return INFO_CODE_ACTIONABILITY[w.code] === "actionable";
}
