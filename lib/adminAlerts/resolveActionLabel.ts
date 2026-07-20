/**
 * Which verb a resolve button uses for a given alert code.
 *
 * One admin_alerts row can render in the show modal, the bell, and the
 * developer telemetry panel. Before this module those three read "Mark
 * resolved", "Dismiss", and "Mark resolved" for the SAME action. The label is a
 * property of the alert's intent, not of the surface, so all three read here.
 *
 *   "confirm" — the admin is approving a deliberate change that already
 *               applied (a capability role landing on a crew member). Nothing
 *               is broken; the button acknowledges it.
 *   "resolve" — the admin is clearing a fault.
 *
 * `resolveActionIntent` NEVER throws. Throwing on a live admin surface was
 * rejected in review: ADMIN_ALERTS_CODES enumerates current production write
 * sites, not the rows already sitting in admin_alerts, so a historic row, a
 * deploy-version skew, or a code retired from the producer registry can still
 * reach a button. "Mark resolved" is the correct conservative label for an
 * unrecognized alert — it describes clearing a row, which is what the button
 * does regardless of intent.
 *
 * Completeness is enforced separately, against a set derived independently of
 * this map (tests/adminAlerts/_metaResolveIntentLifecycle.test.ts), so the
 * runtime fallback cannot make that gate vacuous.
 *
 * Spec docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md §5.
 */
export type ResolveIntent = "confirm" | "resolve";

export type ResolveIntentRow = {
  intent: ResolveIntent;
  /**
   * Set when the producer is retired. The row STAYS so already-persisted
   * admin_alerts rows keep their label. Never delete a row: the lifecycle gate
   * compares against origin/main and will fail.
   */
  retired?: true;
};

/**
 * Every resolve-eligible code: ADMIN_ALERTS_CODES minus the auto-resolving
 * ones (those suppress the manual button entirely). Adding an alert producer
 * requires registering its code in ADMIN_ALERTS_CODES, which then fails the
 * completeness gate until its intent is declared here.
 */
export const RESOLVE_INTENTS: Readonly<Record<string, ResolveIntentRow>> = {
  // The one approval: a capability role (LEAD / FINANCIALS) applied
  // automatically and is worth a deliberate acknowledgement.
  ROLE_FLAGS_NOTICE: { intent: "confirm" },

  // Everything else is a fault or an informational notice being cleared.
  AMBIGUOUS_EMAIL_BINDING: { intent: "resolve" },
  OAUTH_IDENTITY_CLAIMED: { intent: "resolve" },
  PICKER_BOOTSTRAP_RPC_FAILED: { intent: "resolve" },
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: { intent: "resolve" },
  CALLBACK_CLAIM_THREW: { intent: "resolve" },
  PICKER_SELECTION_RACE: { intent: "resolve" },
  PICKER_EPOCH_RESET: { intent: "resolve" },
  LIVE_ROW_CONFLICT: { intent: "resolve" },
  SHOW_FIRST_PUBLISHED: { intent: "resolve" },
  REPORT_ORPHANED_LOST_LEASE: { intent: "resolve" },
  REPORT_LOOKUP_INCONCLUSIVE: { intent: "resolve" },
  REPORT_DUPLICATE_LIVE_MATCHES: { intent: "resolve" },
  REPORT_OPEN_ORPHAN_LABEL: { intent: "resolve" },
  REPORT_LEASE_THRASHING: { intent: "resolve" },
  STALE_ORPHAN_REPORT: { intent: "resolve" },
  TILE_SERVER_RENDER_FAILED: { intent: "resolve" },
  WIZARD_SESSION_SUPERSEDED_RACE: { intent: "resolve" },
  ONBOARDING_SHEET_UNREADABLE: { intent: "resolve" },
};

const LABELS: Record<ResolveIntent, { idle: string; pending: string }> = {
  confirm: { idle: "Confirm", pending: "Confirming…" },
  resolve: { idle: "Mark resolved", pending: "Resolving…" },
};

export function resolveActionIntent(code: string): ResolveIntent {
  return RESOLVE_INTENTS[code]?.intent ?? "resolve";
}

export function resolveActionLabels(code: string): { idle: string; pending: string } {
  return LABELS[resolveActionIntent(code)];
}
