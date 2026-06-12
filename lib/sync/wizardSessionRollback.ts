export type WizardSessionRollbackContext = {
  attemptedAction: "defer_until_modified" | "permanent_ignore" | "discard";
  supersededSessionId: string;
  pendingIngestionId?: string;
  driveFileId: string;
};

/**
 * Thrown INSIDE a per-show-locked transaction when a wizard-session currency
 * predicate matches 0 rows. Throwing (not returning a Response) is load-bearing:
 * withPostgresSyncPipelineLock COMMITS on normal return (runScheduledCronSync.ts
 * `sql.begin`), so a returned 409 would commit every statement that already
 * executed (spec §7 R9-1). Callers catch this AFTER the transaction aborts and
 * map it to the existing WIZARD_SESSION_SUPERSEDED 409 (catalog.ts:133).
 */
export class WizardSessionSupersededRollbackError extends Error {
  readonly code = "WIZARD_SESSION_SUPERSEDED";

  constructor(readonly context: WizardSessionRollbackContext) {
    super("wizard session superseded at statement time; transaction rolled back");
    this.name = "WizardSessionSupersededRollbackError";
  }
}
