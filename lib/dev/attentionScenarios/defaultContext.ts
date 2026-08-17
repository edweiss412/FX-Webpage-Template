// lib/dev/attentionScenarios/defaultContext.ts
//
// Per-code DEFAULT context for gallery scenarios
// (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §5, §7).
//
// A gallery card interpolates its copy from the resolved AlertIdentity, which
// reads specific context keys per code. A scenario that omits them renders the
// placeholder form — "some sheets", "a crew member", "this show" — instead of
// real values. 27 alert rows across 9 codes did exactly that, which is how the
// crew-row fan-out stayed invisible in the gallery for a month after shipping.
//
// Rather than patch those rows one by one, the scenario builders merge this
// table underneath whatever a scenario declares. A NEW scenario for any of
// these codes therefore starts out renderable, and the recurrence class is
// closed rather than the instances being swatted.
//
// Values mirror what the real producer writes (see the per-code entries in
// tests/adminAlerts/producerContexts.ts). Crew ids MUST be members of the
// gallery roster (lib/dev/publishedModalFixture.ts:106-123) or placement math
// cannot resolve them to a rendered row.

/** Gallery roster ids — index-aligned with `publishedModalFixture` crew rows. */
const ROSTER_AVERY = "cccccccc-0000-4000-8000-000000000002";
const ROSTER_BLAKE = "cccccccc-0000-4000-8000-000000000003";

/** The shared address the duplicate-email alert is about. Two roster rows
 *  colliding on one address is precisely what the code reports.
 *
 *  Exported because a scenario declaring a `galleryIdentity` for
 *  AMBIGUOUS_EMAIL_BINDING must render THIS address — the validator requires the
 *  identity's email segment to equal `context.email`, and duplicating the
 *  literal at the call site is how those two silently drift apart. */
export const DEFAULT_SHARED_EMAIL = "avery@example.test";
const SHARED_EMAIL = DEFAULT_SHARED_EMAIL;

const DEFAULT_CONTEXT_BY_CODE: Record<string, Record<string, unknown>> = {
  // lib/auth/validateGoogleSession.ts:40 — plural ids + canonical email. The
  // singular `crew_member_id` is the SIBLING code's shape and can never derive
  // a crewMatch, which was the originating defect.
  AMBIGUOUS_EMAIL_BINDING: {
    email: SHARED_EMAIL,
    crew_member_ids: [ROSTER_AVERY, ROSTER_BLAKE],
  },
  // app/auth/callback/route.ts:134 — OAuth's canonical address is `user_email`,
  // not `email` (lib/adminAlerts/resolveAlertIdentities.ts:69-72).
  OAUTH_IDENTITY_CLAIMED: {
    crew_member_id: ROSTER_AVERY,
    user_email: SHARED_EMAIL,
  },
  // lib/auth/picker/cleanupStaleEntry.ts:117
  PICKER_SELECTION_RACE: {
    stale_crew_member_id: ROSTER_BLAKE,
  },
  // lib/sync/runOnboardingScan.ts:1027
  LIVE_ROW_CONFLICT: {
    file_name: "II - Gallery Preview Show",
  },
  // lib/sync/runManualSyncForShow.ts:233
  DRIVE_FETCH_FAILED: {
    sheet_name: "Gallery Preview Show",
  },
  // scripts/verify-branch-protection.ts
  BRANCH_PROTECTION_DRIFT: {
    repo: "edweiss412/FX-Webpage-Template",
  },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: {
    repo: "edweiss412/FX-Webpage-Template",
  },
  WIZARD_SESSION_SUPERSEDED_RACE: {
    attempted_action: "finalize",
    file_name: "II - Gallery Preview Show",
  },
  // app/api/admin/onboarding/scan/route.ts:306
  ONBOARDING_SHEET_UNREADABLE: {
    failed_sheet_names: ["II - Locked Sheet", "II - Missing Tab"],
  },
};

/**
 * The codes this table covers. Exported so a test can assert the DEFAULTS
 * THEMSELVES satisfy each code's renderer-read keys — the row-level rule cannot
 * fail for these codes, because the builder merges the default before any
 * assertion sees the row, so the table is where the teeth have to live.
 */
export const DEFAULTED_CODES: readonly string[] = Object.keys(DEFAULT_CONTEXT_BY_CODE);

/**
 * The default context for `code`, or `{}` when the code's card reads nothing
 * from context. Callers spread a scenario's own context OVER this, so an
 * explicit declaration always wins.
 */
export function defaultContextForCode(code: string): Record<string, unknown> {
  return DEFAULT_CONTEXT_BY_CODE[code] ?? {};
}

/**
 * Merge helper for the scenario builders: defaults underneath, the scenario's
 * own declaration on top.
 */
export function withDefaultContext(
  code: string,
  declared: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...defaultContextForCode(code), ...(declared ?? {}) };
}
