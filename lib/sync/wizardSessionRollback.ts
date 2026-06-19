export type WizardSessionRollbackContext = {
  attemptedAction: "defer_until_modified" | "permanent_ignore" | "discard" | "retry";
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

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("wizard session reader requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

/**
 * F5 Task 5.3/5.5: best-effort read of the CURRENT wizard session for the
 * WIZARD_SESSION_SUPERSEDED_RACE alert payload. Runs AFTER the protected
 * transaction aborted, on its own short connection; any failure yields null
 * (the alert is best-effort context — never blocks the typed 409).
 */
export async function readCurrentWizardSessionIdBestEffort(): Promise<string | null> {
  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      connect_timeout: 3,
      prepare: false,
    });
    try {
      const rows = (await sql.unsafe(
        `select pending_wizard_session_id from public.app_settings where id = 'default' limit 1`,
        [],
      )) as Array<{ pending_wizard_session_id: string | null }>;
      return rows[0]?.pending_wizard_session_id ?? null;
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch {
    return null;
  }
}
