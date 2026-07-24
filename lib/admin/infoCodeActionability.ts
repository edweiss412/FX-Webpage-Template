// lib/admin/infoCodeActionability.ts
//
// Actionability decisions for every info-severity ParseWarning code the
// published Sheet warnings panel can list. TOTAL by contract: a new info
// emitter without a row here fails tests/admin/_metaInfoCodeActionability.test.ts
// (two-layer scanner, spec 2026-07-22-warning-panel-polish §3.4).
//
// The `infoRowInvitesCorrection` reader was retired with the published
// correction callout (warning-trim un-defer spec §4 — the popup wins). The
// registry itself stays: the meta-test's two-layer scanner pins info-code
// coverage independently of any reader.
export const INFO_CODE_ACTIONABILITY: Readonly<Record<string, "actionable" | "not-actionable">> = {
  // Catalog copy directs a sheet edit ("Remove the duplicate", catalog.ts:1216).
  DAY_RESTRICTION_DOUBLE_LOCATION: "actionable",
  // The parser already fixed it; nothing for the operator to do.
  TYPO_NORMALIZED: "not-actionable",
};
