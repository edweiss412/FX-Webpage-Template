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
