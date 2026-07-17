/**
 * The §12.4 code a per-sheet Re-scan writes to `pending_syncs.last_finalize_failure_code`
 * when the refresh surfaces a crew change (email/name/roster) or a new data-quality gap,
 * demoting the staged row out of the publish batch until the operator re-reviews it.
 *
 * Shared so both the demotion-code union in
 * `app/api/admin/onboarding/finalize/route.ts` (`demotePending`) and the writer
 * (`lib/onboarding/rescanWizardSheet.ts`) reference one literal; the Step-3 `/approve`
 * route refuses rows carrying it (recovery flows through the reapply page).
 */
export const RESCAN_REVIEW_REQUIRED = "RESCAN_REVIEW_REQUIRED" as const;

/**
 * Telemetry-diagnostic reason tokens for the two corrupt-prior demote clauses in
 * `applyRescanDecisionUnderLock` — surfaced in the `SHEET_RESCANNED` event's
 * `reviewCodes` (spec 2026-07-17-rescan-decision-telemetry §4.2) so a demote whose
 * cause is an unreadable/unattributable prior (not a crew change or gap regression) is
 * machine-readable from `pnpm observe`, not just a DB probe.
 *
 * They are NOT §12.4 catalog codes and NOT user-facing (never rendered; only a value
 * inside a telemetry array). Defined HERE — not in the demote writer module —
 * deliberately: `scripts/extract-internal-code-enums.ts` only scans a `lib/onboarding`
 * source for code-shaped `const NAME = "LITERAL"` declarations when that source also
 * contains a DB-error-code trigger token; this file carries none of those triggers
 * (do NOT add one — not even in prose — or these leak into the internal-code manifest
 * and break tests/cross-cutting/no-raw-codes.test.ts). The sibling
 * `RESCAN_REVIEW_REQUIRED` is likewise absent from that manifest for the same reason.
 */
export const PRIOR_PARSE_UNREADABLE = "PRIOR_PARSE_UNREADABLE" as const;
export const PRIOR_APPROVER_UNATTRIBUTABLE = "PRIOR_APPROVER_UNATTRIBUTABLE" as const;
