import type { WarningClass } from "./warningPartition";

export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  /**
   * Admin-surface routing (catalog-internal, like `severity`; NOT §12.4 prose).
   * Default (absent) = "banner". "inbox" routes the code out of the dismissible
   * AlertBanner and into the Needs attention inbox as an auto-clearing to-do.
   * See docs/superpowers/specs/alerts/2026-07-03-route-sync-problems-to-needs-attention.md.
   */
  adminSurface?: "banner" | "inbox";
  /**
   * Alert audience (spec 2026-07-04-alert-audience-split §3). Set on every code
   * used as an admin_alerts code. "doug" codes stay on Doug's amber surfaces;
   * "health" codes are excluded from those surfaces and roll up into the
   * app-health indicator instead. Absent for non-admin-alert catalog entries.
   */
  audience?: "doug" | "health";
  /** Health severity weight — set ONLY on audience:"health" codes. */
  healthWeight?: "degraded" | "notice";
  /**
   * Plain-language, reassuring, NON-actionable Doug-facing summary for the
   * health popover — set ONLY on audience:"health" codes; distinct from the
   * developer-facing dougFacing/followUp.
   */
  dougSummary?: string | null;
  /**
   * Resolution class (alert-resolve-truthing §3). "auto" = the system resolves this
   * code itself at recovery (a manual button would be a misleading no-op → suppressed);
   * "manual" = one-shot acknowledgment, manual resolve is the disposition. Absent on
   * non-admin_alerts codes (crew/report/inbox copy that never becomes an alert row).
   */
  resolution?: "auto" | "manual";
  dougFacing: string | null;
  /**
   * Show-scoped variant of `dougFacing`, used ONLY when the alert renders
   * inside the show it belongs to — where the modal header already names the
   * show, so the template's "In <sheet-name>, " opening is redundant.
   *
   * Selected by `safeDougFacingTemplate` (lib/admin/attentionItems.ts), which
   * is reachable only from the show modal. The bell builds its copy from
   * `dougFacing` via `rowCopy` (components/admin/BellPanel.tsx) and never sees
   * this field, so global rendering cannot change.
   *
   * Absent = the global string is used in both places (redundant, never
   * wrong). Spec docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md §3.1.
   */
  dougFacingShowScoped?: string;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
  /**
   * One sentence naming the mutate controls on the published per-show card
   * (Report / Ignore). Catalog-internal, NOT §12.4 prose - x1 parity compares
   * dougFacing, crewFacing, followUp and helpfulContext, and never reads this.
   * Rendered ONLY where `DataQualityWarningControls` is mounted; every other surface
   * that shows `helpfulContext` (the wizard step-3 row, note cards, help popovers)
   * omits it because it has no such controls, which is the whole point: the wizard row
   * used to end with a sentence naming two buttons that are not on it.
   * Spec 2026-08-27-wizard-warning-row-links-copy §4.
   */
  controlsNote?: string | null;
  title: string | null;
  longExplanation: string | null;
  helpHref: string | null;
  /**
   * Card-popover "what makes this appear" copy (catalog-internal, not §12.4
   * prose - spec 2026-07-20-warning-card-copy-restore §3.2). Authored for every
   * WARNING_CARD_COPY_CODES member (tests/messages/_metaWarningCardCopy.test.ts).
   */
  triggerContext?: string | null;
  /**
   * Which half of the warning universe this code belongs to (catalog-internal,
   * not §12.4 prose — same posture as `triggerContext` above).
   *
   * DECLARED HERE, CROSS-CHECKED AGAINST THE SOURCE. The gallery used to derive
   * this by filtering the source scanner's provenance, so a code the scanner
   * could not see (an `any`, a higher-order factory) was simply absent and
   * nothing said it should not have been. The catalog now declares it and
   * `lib/messages/warningPartition.ts` fails when the declaration and the code
   * disagree in either direction. Closed binary union, TOTAL over rows: an
   * absent value is a third state this design does not have.
   *
   * REQUIRED, not optional. Every row carries it, so TypeScript can prove the
   * union is total and a new row that omits it is a COMPILE error rather than a
   * silently-general one — the same fails-by-default posture the copy-hygiene
   * guard's `Record<keyof MessageCatalogEntry, FieldPolicy>` uses one file over.
   * The runtime totality row in the cross-check test stays as the belt to this
   * braces: it also covers a catalog widened through a cast.
   */
  warningClass: WarningClass;
};

export const MESSAGE_CATALOG = {
  GOOGLE_NO_CREW_MATCH: {
    code: "GOOGLE_NO_CREW_MATCH",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Your email isn't on the crew list for this show. Text Doug to get added.",
    followUp: "Crew → text Doug",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  AMBIGUOUS_EMAIL_BINDING: {
    code: "AMBIGUOUS_EMAIL_BINDING",
    warningClass: "general",
    resolution: "manual",
    audience: "doug",
    dougFacing:
      "In <show-name>, <email> is shared by <crew-row-count>, so Google login can't safely tell who's who. Fix the duplicate in the sheet, or contact the developer if it keeps happening.",
    crewFacing: "Something is misconfigured for this show. Doug has been notified.",
    followUp: "Doug → fix sheet duplicate; if persistent, Eric",
    helpfulContext:
      "Usually a recent typo or paste dropped the same address into two email cells. Once you correct it, the next sync clears this on its own; you can also mark it resolved right away.",
    title: "Two crew rows share an email",
    longExplanation:
      "This appears when two crew rows in a show's sheet share the same email address, so the app can't safely tell which row a Google sign-in should map to. The duplicate-email check in the parser should normally catch this during a sync; seeing this alert usually means a recent edit introduced the duplicate, often a typo or a paste mistake in one of the two email cells. Look at the most recent edits to the crew block, correct the duplicate, and the next sync clears it. You can also mark the alert resolved from the show's page once it's fixed.",
    helpHref: "/help/errors#AMBIGUOUS_EMAIL_BINDING",
  },
  SESSION_IDLE_TIMEOUT: {
    code: "SESSION_IDLE_TIMEOUT",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Your session has expired. Open the original link Doug shared again.",
    followUp: "Crew → reopen link",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SESSION_ABSOLUTE_TIMEOUT: {
    code: "SESSION_ABSOLUTE_TIMEOUT",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Your session has expired. Open the original link Doug shared again.",
    followUp: "Crew → reopen link",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  DRIVE_FETCH_FAILED: {
    code: "DRIVE_FETCH_FAILED",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "We couldn't fetch <sheet-name> from Google Drive (likely a transient network issue, or it's been moved or unshared); we'll keep retrying. If this stays for more than an hour, click 'Retry' or check the sheet's share settings.",
    crewFacing: "We couldn't get the latest from Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug → check share / Retry",
    helpfulContext:
      "Crew keep seeing the last synced version while this retries on its own. If it lasts over an hour, confirm the folder is still shared with FXAV and that the sheet hasn't been moved out of it.",
    title: "Drive fetch failed",
    longExplanation:
      "This appears when Google Drive temporarily blocks or refuses a request to read this sheet, usually from a transient network or permissions hiccup. We keep retrying automatically. If this persists for more than an hour, confirm the folder is still shared with the service account email and that the sheet hasn't been moved out of the watched folder.",
    helpHref: "/help/errors#DRIVE_FETCH_FAILED",
  },
  // M12.2 Phase A (§7/V8) — fixed generic Doug-facing fallback for a pending-
  // ingestion whose specific last_error_code can't be resolved to catalog copy
  // (unknown code, code-as-message, or an unresolved <…> placeholder). Rendered
  // by NeedsAttentionInbox so the admin never sees a raw code / raw producer
  // message (invariant 5). severity:"info" → non-predicate (no title/
  // longExplanation/helpHref required), mirroring ROLE_FLAGS_NOTICE.
  SHEET_PROCESS_FAILED: {
    code: "SHEET_PROCESS_FAILED",
    warningClass: "general",
    severity: "info",
    dougFacing:
      "We couldn't process the latest version of this sheet. Open the show to see the staged change and what needs fixing, or contact the developer if it keeps happening.",
    crewFacing: null,
    followUp: "Doug → open show; persistent → Eric",
    helpfulContext:
      "Something in this sheet stopped us from processing its latest version automatically, and the specific reason wasn't one we could turn into a clear message. Open the show's parse panel to see the staged change, fix the issue in the sheet, and the next sync will try again. If it keeps happening, contact the developer.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHEET_UNAVAILABLE: {
    code: "SHEET_UNAVAILABLE",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    adminSurface: "inbox",
    dougFacing:
      "<sheet-name> isn't in your folder anymore: you may have moved or unshared it, or it was deleted. Re-share it to bring the show back.",
    crewFacing: "We couldn't get the latest from Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug → re-share sheet",
    helpfulContext:
      "Until the sheet is back in the watched folder, crew keep the last good version on file. Move or re-share it into the folder and the next sync brings the show back automatically.",
    title: "Sheet no longer in folder",
    longExplanation:
      "This appears when a sheet we expected to find in the watched folder is no longer there. It may have been moved to a different folder, had its share removed, or been deleted outright. Crew keep seeing the last good version on file until you re-share or move the sheet back into the folder, which we'll pick up on the next sync.",
    helpHref: "/help/errors#SHEET_UNAVAILABLE",
  },
  PARSE_ERROR_LAST_GOOD: {
    code: "PARSE_ERROR_LAST_GOOD",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    adminSurface: "inbox",
    dougFacing:
      "<sheet-name>'s latest edit didn't parse, so the previous approved version is still showing to crew. See the per-show parse panel for the error detail.",
    crewFacing:
      "We couldn't read the latest edit to Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug → fix sheet (see parse panel); Crew → mention to Doug",
    helpfulContext:
      "The parse panel shows the exact line that failed to read. Fix it in the sheet and the next sync replaces the older version crew currently see; nothing else to do.",
    title: "Latest edit didn't parse",
    longExplanation:
      "This appears when a recent edit to the sheet introduces something the parser can't read. We keep the previously approved version live so crew aren't blocked. Open the per-show parse panel to see exactly what went wrong; fixing the sheet lets the next sync replace the stale data.",
    helpHref: "/help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD",
  },
  RESYNC_SHRINK_HELD: {
    code: "RESYNC_SHRINK_HELD",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    adminSurface: "inbox",
    dougFacing:
      "<sheet-name>'s latest version dropped crew or a whole section, so the update was held and the last good version is still live. If the change is intentional, re-sync the show to apply it; otherwise fix the sheet.",
    crewFacing: null,
    followUp: "Doug → re-sync to accept, or fix sheet",
    helpfulContext:
      "The update was held so a bad edit can't silently wipe crew or a section. If the drop was intentional, re-sync to apply it; if not, fix the sheet and a clean sync clears this.",
    title: "Re-sync held: sheet lost data",
    longExplanation:
      "This appears when a sync would remove crew members or an entire section (rooms, hotels, contacts, or transportation) compared to the previous version. Rather than silently lose data, we hold the update and keep the last good version live for crew. If the reduction is intentional, re-sync and confirm to apply it; otherwise fix the sheet and a clean sync clears this automatically.",
    helpHref: "/help/errors#RESYNC_SHRINK_HELD",
  },
  RESYNC_QUALITY_REGRESSED: {
    code: "RESYNC_QUALITY_REGRESSED",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    // NO adminSurface → banner (spec §6.1): feed-visible in the Bell center, not inbox-routed.
    dougFacing:
      "<sheet-name>'s latest edit lost some data quality: one or more fields or sections that used to read no longer do. The update is already live; open the parse panel to see what degraded and fix the sheet.",
    crewFacing: null,
    followUp: "Doug → check parse panel, fix sheet",
    helpfulContext:
      "Fewer fields or sections came through than last time, so parts of the page thinned out even though the sync went through. The parse panel flags what dropped; fix the sheet and a clean sync restores it.",
    title: "Latest edit lost data quality",
    longExplanation:
      "This appears when a sync applies successfully but reads fewer fields or sections than the previous version: a data-quality regression, not a hard failure. Crew see the applied data; nothing is held back. Open the per-show parse panel to see which classes degraded, fix the sheet, and a recovered sync clears this automatically.",
    helpHref: "/help/errors#RESYNC_QUALITY_REGRESSED",
  },
  USE_RAW_DECISION_STALE: {
    code: "USE_RAW_DECISION_STALE",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    // NO adminSurface → changes-feed/banner (spec §10), not inbox-routed.
    dougFacing:
      "You'd chosen to use the sheet's raw text for _<target>_; that cell changed, so we're reading it fresh again.",
    crewFacing: null,
    followUp: "Doug → re-choose if still needed",
    helpfulContext:
      "You had chosen to keep the sheet's raw text for an ambiguous cell (a room header, a hotel guest list, a hotel name and address, or the show dates) instead of our split-out reading. That cell has since been edited, so the text you pinned is no longer what the sheet says. We dropped the old choice and went back to reading the cell the normal way. If you still want the raw text for the updated cell, open the show and choose 'use the sheet's raw value' again.",
    title: "Using the sheet's raw text was reset",
    longExplanation:
      "You'd told us to keep an ambiguous cell's raw text as-is instead of our automatic split. The cell was edited since, so the pinned text no longer matches the sheet. We dropped that choice and resumed reading the cell normally. Re-open the show and choose 'use the sheet's raw value' again if you still want it for the updated cell.",
    helpHref: "/help/errors#USE_RAW_DECISION_STALE",
  },
  STALE_WRITE_ABORTED: {
    code: "STALE_WRITE_ABORTED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  STALE_MANUAL_REPLAY_ABORTED: {
    code: "STALE_MANUAL_REPLAY_ABORTED",
    warningClass: "general",
    dougFacing:
      "This manual sync is stale: a newer parse has already been applied. Refresh the page to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "You clicked 'Sync' against a version that's already been superseded by a newer parse. No work was lost; just refresh the admin page to see the current state and try again from there if needed.",
    title: "Manual sync already superseded",
    longExplanation:
      "You clicked Sync against a version that has already been replaced by a newer parse. Nothing was lost. Refresh the admin page to see the current state and act from there.",
    helpHref: "/help/errors#STALE_MANUAL_REPLAY_ABORTED",
  },
  STALE_PUSH_ABORTED: {
    code: "STALE_PUSH_ABORTED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  // Admin-log-only (§12.4 "Admin-log-only codes"): a sync_log write failed while the operation it
  // observes continued. Never rendered to Doug or crew, so every facing field is null (the
  // STALE_WRITE_ABORTED shape) and invariant 5 is untouched.
  SYNC_LOG_EMIT_FAILED: {
    code: "SYNC_LOG_EMIT_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  WIZARD_SESSION_SUPERSEDED: {
    code: "WIZARD_SESSION_SUPERSEDED",
    warningClass: "general",
    dougFacing:
      "Your setup wizard was superseded by another wizard. Refresh and start setup again.",
    crewFacing: null,
    followUp: "Doug → restart wizard",
    helpfulContext:
      "Setup wizards run one at a time. While your tab was open, another wizard was started (probably from a second browser tab or device) and your session was retired. Refresh and start setup over in a single tab; whatever the other wizard scanned is the new state.",
    title: "Setup wizard superseded",
    longExplanation:
      "Setup wizards run one at a time. Another wizard was started (probably from a different tab or device) and your session was retired. Refresh and start setup over in a single tab.",
    helpHref: "/help/errors#WIZARD_SESSION_SUPERSEDED",
  },
  // F5 Task 5.3: durable operator signal for the wizard-session CAS turnover
  // race. Copy is action-GENERIC ("retry, defer, ignore, or discard") and
  // deliberately avoids absolute-rollback claims — retry's commit-window scan
  // residue is ACCEPTED + swept (spec §7 R5-2 / §8), so "rolled back in full"
  // would be false for retry. defer/ignore/discard DO roll back fully; the
  // copy says the action was cancelled without asserting zero residue.
  WIZARD_SESSION_SUPERSEDED_RACE: {
    code: "WIZARD_SESSION_SUPERSEDED_RACE",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary: "Two setup sessions overlapped, and the app kept the newer one. Nothing was lost.",
    dougFacing:
      "A leftover wizard action (<attempted-action>) for <file-name> was safely cancelled before it could change the new wizard's state. Continue in the active wizard tab.",
    crewFacing: null,
    followUp: "Doug → continue in the active wizard tab",
    helpfulContext:
      "Two wizard tabs for the same sheet overlapped; the newer one won and the older tab's action was cancelled before it could touch state. Its leftovers are inert and auto-cleaned. Informational only.",
    title: "Stale wizard action cancelled",
    longExplanation:
      "This appears when two setup-wizard sessions overlap, for instance, two browser tabs both mid-setup for the same sheet, and the app keeps the newer one. An action from the older tab (retry, defer, ignore, or discard) raced the newer wizard that had just taken over, so it's cancelled before it can change the new wizard's state. Any setup-scan leftovers from the old tab are inert and get cleaned up automatically; this alert exists purely so you know the old tab's attempt was seen. Continue working in the active wizard tab.",
    helpHref: "/help/errors#WIZARD_SESSION_SUPERSEDED_RACE",
  },
  // Onboarding-fixups F4 (Task 4.5) — the admin clean-up-old-setup-leftovers
  // action threw an unexpected infra error mid-reap. Per-session transactions:
  // already-reaped sessions stay reaped; the failing session rolled back.
  REAP_STALE_SESSIONS_FAILED: {
    code: "REAP_STALE_SESSIONS_FAILED",
    warningClass: "general",
    dougFacing:
      "We couldn't clean up the old setup leftovers. Refresh and try again, or contact the developer if this keeps happening.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "The clean-up-old-setup-leftovers action failed partway, usually a database or lock fault. Each old setup session is cleaned in its own transaction, so anything already cleaned stayed cleaned and nothing was left half-removed. Running it again is safe; if it keeps failing, contact the developer.",
    title: "Setup-leftovers cleanup failed",
    longExplanation:
      "We couldn't finish cleaning up leftovers from old setup sessions. Each old session is cleaned in its own transaction, so anything already cleaned stayed cleaned and nothing was left half-removed. Refresh and run it again; if it keeps failing, the developer needs to investigate.",
    helpHref: "/help/errors#REAP_STALE_SESSIONS_FAILED",
  },
  WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED: {
    code: "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED",
    warningClass: "general",
    dougFacing:
      "We made an update to the review process since you approved this sheet. Please review and Apply it again to finish setup.",
    crewFacing: null,
    followUp: "Doug → re-Apply the affected sheet",
    helpfulContext:
      "Setup wizards stage your Apply decisions and finalize them in a separate step. Between when you Applied this sheet and when finalize ran, we updated the format used to record your review choices, usually because we added a new kind of decision or expanded what's tracked per item. Rather than silently replay your old-format choices through the new validator (which could mis-derive permissions), we hold this sheet for re-review. Open the wizard tab, re-Apply the affected sheet under the current version, then click Finalize again.",
    title: "Review format updated; re-apply",
    longExplanation:
      "We updated the format used to record your review choices between when you applied this sheet and when finalize ran. Rather than silently replay old-format choices, the wizard holds the sheet for re-review. Re-apply the affected sheet, then click Finalize again.",
    helpHref: "/help/errors#WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED",
  },
  STAGED_PARSE_REVISION_RACE_DURING_FINALIZE: {
    code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
    warningClass: "general",
    dougFacing:
      "This sheet was edited again while we were finishing setup. Please re-review and Apply it, then click Finalize again.",
    crewFacing: null,
    followUp: "Doug → re-Apply the affected sheet",
    helpfulContext:
      "Doug edited this sheet again in Drive between when you clicked Apply (which staged your decisions) and when finalize tried to commit them. The snapshot we captured at Apply no longer represents the current head revision, and committing it would publish stale bytes. The other sheets in this finalize batch are unaffected and still committed; only the raced sheet needs your attention. Open the wizard, re-review the new edit, click Apply, then click Finalize.",
    title: "Sheet edited mid-finalize",
    longExplanation:
      "The sheet was edited again in Drive between when you clicked Apply and when finalize tried to commit. The other sheets in the batch were committed; only the raced sheet needs your attention. Re-review the new edit, click Apply, then click Finalize.",
    helpHref: "/help/errors#STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
  },
  WIZARD_FINALIZE_BATCHES_PENDING: {
    code: "WIZARD_FINALIZE_BATCHES_PENDING",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: "Doug → click Resume finalize OR Cleanup abandoned finalize",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  IDEMPOTENCY_IN_FLIGHT: {
    code: "IDEMPOTENCY_IN_FLIGHT",
    warningClass: "general",
    dougFacing:
      "Hold on. Your previous report is still being submitted. Try again in a moment if it doesn't go through.",
    crewFacing: "Hold on, your previous report is still processing. Try again in a moment.",
    followUp: "client retries after backoff",
    helpfulContext:
      "Your previous report submission is still being processed by the developer's GitHub. Don't worry. Clicking again won't create a duplicate, but it also won't speed things up. If the original doesn't go through within a minute, try once more.",
    title: "Previous report still processing",
    longExplanation:
      "Your previous report submission is still being processed. Clicking again will not create a duplicate but also will not speed things up. If the original doesn't go through within a minute, try once more.",
    helpHref: "/help/errors#IDEMPOTENCY_IN_FLIGHT",
  },
  WATCH_CHANNEL_ORPHANED: {
    code: "WATCH_CHANNEL_ORPHANED",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "The instant-updates connection to Google Drive needs to reconnect. Shows still sync automatically every few minutes, so nothing is lost.",
    crewFacing: null,
    followUp: "Auto-retry with backoff; admin Retry now; Eric if escalated",
    helpfulContext:
      "At worst, edits take a few minutes to appear instead of instantly, since Auto sync still runs. It keeps trying to reconnect on its own, waiting longer between attempts the longer it fails, or use Retry now. Only worth attention if it keeps failing.",
    title: "Live updates need attention",
    longExplanation:
      "This appears when the connection that makes sheet edits show up instantly can't be set up or renewed. Shows keep syncing on the normal schedule regardless, so nothing is lost; at worst, edits take a few minutes longer to appear instead of showing up instantly. The system keeps retrying the connection on its own, waiting longer between attempts the longer it fails, and a Retry now action is available to try immediately. If it keeps failing, it gets flagged for support.",
    helpHref: "/help/errors#WATCH_CHANNEL_ORPHANED",
  },
  WEBHOOK_TOKEN_INVALID: {
    code: "WEBHOOK_TOKEN_INVALID",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A Google Drive push notification failed a security check. Instant updates keep working through the regular sync.",
    dougFacing:
      "A push notification from Google Drive failed verification: possible spoofing or misconfiguration. The developer has been notified.",
    crewFacing: null,
    followUp: "Eric → investigate",
    helpfulContext:
      "The bad token usually means a stale Drive subscription is still firing, occasionally a spoof attempt. The developer is notified and rotates it if needed; no admin action.",
    title: "Drive webhook failed verification",
    longExplanation:
      "This appears when a push notification arrives from Google Drive carrying the wrong verification token. It usually means a stale subscription is still firing, or that someone is attempting to spoof the webhook endpoint. The developer is notified automatically and will rotate the token if needed.",
    helpHref: "/help/errors#WEBHOOK_TOKEN_INVALID",
  },
  WEBHOOK_NOOP_ALREADY_SYNCED: {
    code: "WEBHOOK_NOOP_ALREADY_SYNCED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  CONCURRENT_SYNC_SKIPPED: {
    code: "CONCURRENT_SYNC_SKIPPED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  STAGED_PARSE_OUTDATED: {
    code: "STAGED_PARSE_OUTDATED",
    warningClass: "general",
    dougFacing:
      "The sheet was edited again since you reviewed this parse. We've discarded the staged version; a fresh parse will be ready in a few minutes.",
    crewFacing: null,
    followUp: "Doug → wait, review next",
    helpfulContext:
      "Doug saved another edit to the sheet after the version you were reviewing was staged. The staged version is no longer the most recent state, so we discarded it. The next sync will produce a fresh staged parse to review.",
    title: "Staged parse outdated",
    longExplanation:
      "The sheet was edited again after the staged version you were reviewing was captured. The staged version is no longer the most recent state, so we discarded it. A fresh staged parse will be ready in a few minutes.",
    helpHref: "/help/errors#STAGED_PARSE_OUTDATED",
  },
  STAGED_PARSE_REVISION_RACE: {
    code: "STAGED_PARSE_REVISION_RACE",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  STAGED_PARSE_REVISION_RACE_COOLDOWN: {
    code: "STAGED_PARSE_REVISION_RACE_COOLDOWN",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_REALTIME_BROADCAST_AUTH_FAILED: {
    code: "SHOW_REALTIME_BROADCAST_AUTH_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_REALTIME_SUBSCRIPTION_FAILED: {
    code: "SHOW_REALTIME_SUBSCRIPTION_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_REALTIME_CROSS_SHOW_FORBIDDEN: {
    code: "SHOW_REALTIME_CROSS_SHOW_FORBIDDEN",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_VERSION_CROSS_SHOW_FORBIDDEN: {
    code: "SHOW_VERSION_CROSS_SHOW_FORBIDDEN",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_REALTIME_JWT_RENEWED: {
    code: "SHOW_REALTIME_JWT_RENEWED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  STAGED_PARSE_SOURCE_GONE: {
    code: "STAGED_PARSE_SOURCE_GONE",
    warningClass: "general",
    dougFacing:
      "The source sheet is no longer accessible. The staged parse has been discarded. Re-share or restore the sheet to bring this show back.",
    crewFacing: null,
    followUp: "Doug → restore sheet",
    helpfulContext:
      "Between staging and Apply, the source sheet was deleted, trashed, or unshared in Drive. Without a sheet to read, we can't apply the staged parse. Restore the sheet (or re-share it) and the next sync will produce a new staged parse.",
    title: "Source sheet missing at apply",
    longExplanation:
      "Between staging and Apply, the source sheet was deleted, trashed, or unshared in Drive. Without a sheet to read, we can't apply the staged parse. Restore the sheet or re-share it and the next sync will produce a new staged parse.",
    helpHref: "/help/errors#STAGED_PARSE_SOURCE_GONE",
  },
  STAGED_PARSE_SOURCE_OUT_OF_SCOPE: {
    code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
    warningClass: "general",
    dougFacing:
      "The sheet is no longer in the watched folder. We've discarded the staged parse. Move the sheet back into the folder if you want to publish it.",
    crewFacing: null,
    followUp: "Doug → move sheet",
    helpfulContext:
      "Between staging and Apply, the sheet was moved out of the watched folder. Anything outside the watched folder is invisible to the sync pipeline by design. Move the sheet back in and the next sync will produce a new staged parse.",
    title: "Sheet moved out of watched folder",
    longExplanation:
      "Between staging and Apply, the sheet was moved out of the watched folder. Anything outside the watched folder is invisible to the sync pipeline. Move the sheet back in and the next sync will produce a new staged parse.",
    helpHref: "/help/errors#STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
  },
  REEL_DRIFTED: {
    code: "REEL_DRIFTED",
    warningClass: "parse_warning",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "The opening-reel video in <sheet-name> has been edited since you reviewed this parse, so crew see the text status only. Your next sheet edit re-stages the new reel.",
    crewFacing: null,
    followUp: "Doug → re-edit sheet",
    helpfulContext:
      "The video changed after you last reviewed the show, so crew see the text status without it. Any save to the sheet picks up the current reel on the next sync.",
    title: "Opening reel drifted",
    longExplanation:
      "This appears when the opening-reel video is replaced or edited in Drive after the staged parse was reviewed. Crew see the text status only (for example 'YES') without the inline video, until you save the sheet again to re-stage the new reel.",
    helpHref: "/help/errors#REEL_DRIFTED",
  },
  OPENING_REEL_NOT_VIDEO: {
    code: "OPENING_REEL_NOT_VIDEO",
    warningClass: "parse_warning",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "The opening-reel link in <sheet-name> is not a video file, so crew see the text status only. Replace the link with a video file URL to enable inline playback.",
    crewFacing: "Opening reel link is not a video file",
    followUp: "Doug → re-edit sheet",
    helpfulContext:
      "A Doc, image, or PDF can't play inline, so crew see the text status only. Point the opening-reel cell at an actual video file to turn playback back on.",
    title: "Opening reel link is not a video",
    longExplanation:
      "This appears when the opening-reel cell contains a Drive URL, but the file behind it isn't a video: a Google Doc, Slides deck, image, PDF, or another file type. Crew see the text status only, without an inline player, because a non-video file won't be embedded in a `<video>` element. Replacing the link with a URL whose file type starts with `video/` enables inline playback.",
    helpHref: "/help/errors#OPENING_REEL_NOT_VIDEO",
  },
  OPENING_REEL_PERMISSION_DENIED: {
    code: "OPENING_REEL_PERMISSION_DENIED",
    warningClass: "parse_warning",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "The opening-reel video for <sheet-name> is no longer shared with FXAV, so crew see the text status only. Re-share the video file, or replace the link, to restore inline playback.",
    crewFacing: "Opening reel access revoked",
    followUp: "Doug → re-share / replace link",
    helpfulContext:
      "The video's sharing changed or it moved somewhere FXAV can't read, so crew see the text status only. Re-share it with FXAV, or swap in a video you do share, to restore playback.",
    title: "Opening reel access revoked",
    longExplanation:
      "This appears when Drive returns a permission-denied response while fetching the opening-reel video that was previously accessible. The share may have been revoked, the file made private, or it may have been moved out of a shared drive the service account can read. Crew see the text status only, without inline playback, until you re-share the video file with the service account email or replace the link with a video file you do share.",
    helpHref: "/help/errors#OPENING_REEL_PERMISSION_DENIED",
  },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: {
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    warningClass: "parse_warning",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "A diagram in <sheet-name> can't be re-downloaded automatically. Save the sheet (any edit advances the version) and crew will see the image again on the next sync.",
    crewFacing: null,
    followUp: "Doug → save sheet to advance version",
    helpfulContext:
      "Crew see a placeholder because this diagram can't be recovered on its own. Save the sheet (any edit counts) and the next sync restores the image.",
    title: "Diagram needs sheet re-save to recover",
    longExplanation:
      "This appears when a diagram in a sheet can't be re-downloaded automatically because it lacks a content-derived approval token. Saving the sheet (any edit advances the version) lets us mint a fresh approval token on the next sync, which restores the diagram for crew.",
    helpHref: "/help/errors#EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  },
  AGENDA_GONE_FOR_CREW: {
    code: "AGENDA_GONE_FOR_CREW",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "This agenda isn't available anymore. Text Doug for a fresh link.",
    followUp: "Crew → message Doug",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  AGENDA_UNAUTHENTICATED: {
    code: "AGENDA_UNAUTHENTICATED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "This link has expired. Text Doug for the current agenda link.",
    followUp: "Crew → reopen signed link",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  ASSET_RECOVERY_REVISION_DRIFT: {
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "A gallery image changed while it was being restored, so the app used the newest version. Everything stays current.",
    dougFacing:
      "Diagram recovery for <sheet-name> paused because the show changed while recovery was checking files. We'll retry against the latest version on the next run.",
    crewFacing: null,
    followUp: "informational only",
    helpfulContext:
      "Recovery verified bytes against an older snapshot but a newer Apply landed first, so it aborted rather than attach stale assets to the current revision. The next run retries against the latest automatically.",
    title: "Diagram recovery raced an apply",
    longExplanation:
      "This appears when asset recovery fetches and verifies diagram bytes against an older snapshot revision, but a newer Apply lands before recovery can write those bytes. The recovery run aborts rather than attach old assets to the new approved revision, and the next run retries automatically against the latest version.",
    helpHref: "/help/errors#ASSET_RECOVERY_REVISION_DRIFT",
  },
  ASSET_RECOVERY_DRIFT_COOLDOWN: {
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "The app briefly paused re-checking a gallery image to avoid churn. It resumes on its own.",
    dougFacing:
      "Diagram recovery for <sheet-name> is backing off briefly because this show keeps changing during recovery. We'll retry automatically after the cooldown.",
    crewFacing: null,
    followUp: "informational only",
    helpfulContext:
      "The prior attempt raced an Apply, so recovery backs off for this snapshot to bound retry storms while the show keeps changing. It resumes on its own after the cooldown.",
    title: "Diagram recovery cooling down",
    longExplanation:
      "This appears when the previous asset recovery attempt raced with a newer Apply, so recovery briefly backs off for that snapshot revision. This bounds retry storms while a show is changing frequently, and normal recovery resumes automatically after the cooldown.",
    helpHref: "/help/errors#ASSET_RECOVERY_DRIFT_COOLDOWN",
  },
  APPLY_PROMOTE_PENDING: {
    code: "APPLY_PROMOTE_PENDING",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  ASSET_RECOVERY_BYTES_EXCEEDED: {
    code: "ASSET_RECOVERY_BYTES_EXCEEDED",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "<sheet-name>'s diagram set is too large to recover automatically (more than 60 images, an image over 50MB, or over 3GB total), so crew see placeholders for the missing diagrams. Trim the gallery, or tell the developer if you need the ceiling raised.",
    crewFacing: null,
    followUp: "Doug → trim gallery / Eric → raise cap",
    helpfulContext:
      "The cap keeps one big gallery from blocking other shows' syncs. Crew see placeholders for the missing diagrams; trim the set under the limit, or ask the developer to raise the ceiling if this show genuinely needs it.",
    title: "Diagram set too large to recover",
    longExplanation:
      "This appears when a show's diagram set exceeds the per-run recovery ceiling: more than 60 images, a single image over 50MB, or more than 3GB total. The ceiling keeps the per-show advisory lock short so other syncs aren't blocked behind a large recovery. Crew see placeholders for the missing diagrams; trim the gallery or ask the developer to raise the ceiling if this show truly needs more.",
    helpHref: "/help/errors#ASSET_RECOVERY_BYTES_EXCEEDED",
  },
  DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE: {
    code: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
    warningClass: "parse_warning",
    dougFacing:
      "_<sheet-name>_'s diagrams couldn't be safely captured this sync. The previous version of those images is still showing. The developer has been notified.",
    crewFacing: null,
    followUp: "Eric → investigate; Doug → optionally Report",
    helpfulContext:
      "Google Drive didn't return a usable revision token for this spreadsheet, so we can't safely capture an immutable snapshot of the embedded diagrams. The previous version is still live for crew. The developer has been notified; this is rare and usually clears on the next edit.",
    title: "Diagrams couldn't be safely captured",
    longExplanation:
      "Google Drive did not return a usable revision token for this sheet, so the app could not snapshot the embedded diagrams. The previous version is still live for crew. The developer has been notified. This is rare and usually clears on the next edit to the sheet.",
    helpHref: "/help/errors#DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  },
  STAGED_PARSE_RESTAGED_INLINE: {
    code: "STAGED_PARSE_RESTAGED_INLINE",
    warningClass: "general",
    dougFacing:
      "The sheet was edited since your last look. We re-parsed it inside the wizard. Here's the new review.",
    crewFacing: null,
    followUp: "Doug → review the refreshed parse",
    helpfulContext:
      "The wizard re-parsed the sheet inside your current setup session because Doug edited it after the original scan. Review the refreshed parse. Any decisions you made on the prior version were discarded.",
    title: "Sheet was re-edited mid-review",
    longExplanation:
      "The sheet changed after the original scan, so the wizard re-parsed it inside your current setup session. Any decisions you made on the prior version were dropped. Review the refreshed parse from the top.",
    helpHref: "/help/errors#STAGED_PARSE_RESTAGED_INLINE",
  },
  STAGED_PARSE_SUPERSEDED: {
    code: "STAGED_PARSE_SUPERSEDED",
    warningClass: "general",
    dougFacing:
      "A newer parse has already been applied. Refresh the admin page to review the latest state.",
    crewFacing: null,
    followUp: "Doug → refresh",
    helpfulContext:
      "A newer parse was applied (probably by a different admin or Auto sync) before your Apply landed. Refresh the admin page to see the current state.",
    title: "Newer parse already applied",
    longExplanation:
      "A newer parse was applied (probably by a different admin or Auto sync) before your Apply landed. Refresh the admin page to see the current state.",
    helpHref: "/help/errors#STAGED_PARSE_SUPERSEDED",
  },
  "MI-1_VERSION_DETECTION_FAILED": {
    code: "MI-1_VERSION_DETECTION_FAILED",
    warningClass: "general",
    dougFacing:
      "_<sheet-name>_ doesn't look like your usual show template: none of the version markers we expect (Contact Office row, MAIN/SECONDARY block for v4; Hotel Contact Info row for v2) are present. Either this is a different kind of document, or your template has changed in a way we don't recognize. Tell the developer if your template has changed.",
    crewFacing: null,
    followUp: "Doug → check sheet shape; Eric → add new version detector if real",
    helpfulContext:
      "We look for specific row markers in your show template, the Contact Office row and MAIN/SECONDARY block (v4 sheets), or the Hotel Contact Info row (v2 sheets), to recognize that this is a real show sheet. None of those markers were found. Either this isn't a show sheet, or your template has changed in a way the parser doesn't yet recognize. If your template has changed intentionally, tell the developer.",
    title: "Unrecognized show template",
    longExplanation:
      "We look for specific row markers in your show template to recognize it as a real show sheet (Contact Office row and MAIN/SECONDARY block for v4; Hotel Contact Info row for v2). None of those markers were found. If your template has changed intentionally, tell the developer.",
    helpHref: "/help/errors#MI-1_VERSION_DETECTION_FAILED",
  },
  VERSION_AMBIGUOUS: {
    code: "VERSION_AMBIGUOUS",
    warningClass: "general",
    dougFacing:
      "_<sheet-name>_ has some of your show-template markers but not enough for us to be sure which template it is, so we've paused instead of guessing. Check that the sheet's key rows (the Contact block for v4 sheets, or the GS/BO pull-sheet timing rows for v2 sheets) are intact, or tell the developer if your template changed.",
    crewFacing: null,
    followUp:
      "Doug → check the sheet's version markers; Eric → add/adjust the detector if the template changed",
    helpfulContext:
      "We recognize your show template by a set of distinctive row labels grouped into blocks. This sheet matched too few of them, or the matches were too close between two templates, so we couldn't confidently pick one, and we won't apply a guess. Restore the expected rows (the Contact block for v4 sheets, the GS/BO pull-sheet timing rows for v2 sheets), or tell the developer if you changed the template.",
    title: "Unsure which show template this is",
    longExplanation:
      "We recognize your show template by distinctive row labels grouped into blocks, and we require a clear match before applying it. This sheet matched too few markers, or the call between two templates was too close, so we paused rather than risk parsing it with the wrong rules. Restore the expected rows, or tell the developer if you changed the template.",
    helpHref: "/help/errors#VERSION_AMBIGUOUS",
  },
  "MI-2_TITLE_MISSING": {
    code: "MI-2_TITLE_MISSING",
    warningClass: "general",
    dougFacing: "_<sheet-name>_ doesn't have a recognizable show title. Add or fix the CLIENT row.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Every show needs a title; we read it from the CLIENT row in your sheet. Make sure the CLIENT cell is filled in with the show's title, then save the sheet.",
    title: "Show title missing",
    longExplanation:
      "Every show needs a title, which we read from the CLIENT row. The CLIENT cell is empty or unreadable. Fill it in with the show's title and save the sheet.",
    helpHref: "/help/errors#MI-2_TITLE_MISSING",
  },
  "MI-3_NO_PARSEABLE_DATE": {
    code: "MI-3_NO_PARSEABLE_DATE",
    warningClass: "general",
    dougFacing:
      "_<sheet-name>_ doesn't have any readable dates: we couldn't find Travel In, Set Day, or Show Day 1 as a parseable date. Check the DATES block.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "We look for show dates in the DATES block (Travel In, Set Day, Show Day 1) and couldn't find anything we could read as a calendar date. Make sure your dates are in a familiar format like '6/24' or 'June 24' and that they're in the right cells.",
    title: "No readable show dates",
    longExplanation:
      "We look for show dates in the DATES block (Travel In, Set Day, Show Day 1) and couldn't find anything we could read as a calendar date. Use a familiar format like '6/24' or 'June 24' in the right cells.",
    helpHref: "/help/errors#MI-3_NO_PARSEABLE_DATE",
  },
  "MI-4_NO_CREW": {
    code: "MI-4_NO_CREW",
    warningClass: "general",
    dougFacing: "_<sheet-name>_ has no crew rows. Add at least one person to the CREW block.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Every show needs at least one crew member; we read names from the CREW block. The block exists but no rows have parseable names. Add at least one person to the CREW block.",
    title: "No crew rows",
    longExplanation:
      "Every show needs at least one crew member, which we read from the CREW block. The block exists but no rows have parseable names. Add at least one person to the CREW block.",
    helpHref: "/help/errors#MI-4_NO_CREW",
  },
  "MI-5_NO_ROOMS": {
    code: "MI-5_NO_ROOMS",
    warningClass: "general",
    dougFacing:
      "_<sheet-name>_ has no rooms: we couldn't find General Session, Breakouts, or Additional Rooms. Make sure your room blocks have setup and time fields filled in.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Every show needs at least one room; we read rooms from the General Session, Breakouts, and Additional Rooms blocks. None of those blocks had a row with both a setup and a time. Make sure your room blocks have those fields filled in.",
    title: "No rooms found",
    longExplanation:
      "Every show needs at least one room, which we read from General Session, Breakouts, and Additional Rooms. None of those blocks had a row with both a setup and a time. Fill those fields in.",
    helpHref: "/help/errors#MI-5_NO_ROOMS",
  },
  "MI-5a_DUPLICATE_CREW_NAME": {
    code: "MI-5a_DUPLICATE_CREW_NAME",
    warningClass: "general",
    dougFacing:
      "Two crew rows share the same name in _<sheet-name>_. Disambiguate them (e.g., 'John C.' vs 'John Carleo') so the app can tell them apart.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Two rows in the CREW block have identical names, which means the app can't reliably tell which schedule belongs to which person. Disambiguate them: for example, change one 'John' to 'John C.' or 'John Carleo'.",
    title: "Two crew rows share a name",
    longExplanation:
      "Two rows in the CREW block have identical names, which means the app can't reliably tell which schedule belongs to which person. Disambiguate them: for example, change one 'John' to 'John C.' or 'John Carleo'.",
    helpHref: "/help/errors#MI-5a_DUPLICATE_CREW_NAME",
  },
  "MI-5b_DUPLICATE_CREW_EMAIL": {
    code: "MI-5b_DUPLICATE_CREW_EMAIL",
    warningClass: "general",
    dougFacing:
      "Two crew rows share the same email in _<sheet-name>_. Each crew member needs their own email.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Two rows in the CREW block share the same email address. Email is how we identify a crew member across shows, so duplicates would let one person see another's view. Each crew row needs a distinct email. Fix the typo or paste mistake and re-save.",
    title: "Two crew rows share an email",
    longExplanation:
      "Two rows in the CREW block share the same email address. Email is how we identify a crew member across shows, so duplicates would let one person see another's view. Give each crew row a distinct email.",
    helpHref: "/help/errors#MI-5b_DUPLICATE_CREW_EMAIL",
  },
  SLUG_COLLISION_EXHAUSTED: {
    code: "SLUG_COLLISION_EXHAUSTED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric → investigate",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  ONBOARDING_INTERNAL_ERROR: {
    code: "ONBOARDING_INTERNAL_ERROR",
    warningClass: "general",
    dougFacing:
      "Something went wrong on our side while preparing this sheet. It isn't a problem with the sheet or with Google Drive. Try again once, and contact the developer if it keeps happening.",
    crewFacing: null,
    followUp: "Eric → investigate",
    helpfulContext:
      "A step that runs after your sheet is read hit a bug on our side. Nothing is wrong with the sheet's content or its sharing, and retrying may work, but a repeat means the app needs a code fix. Contact the developer with the time this happened.",
    title: "Internal error while preparing a sheet",
    longExplanation:
      "A step that runs after your sheet is read hit a bug on our side. Nothing is wrong with the sheet's content or its sharing, and retrying may work, but a repeat means the app needs a code fix. Contact the developer with the time this happened.",
    helpHref: "/help/errors#ONBOARDING_INTERNAL_ERROR",
  },
  ONBOARDING_FINALIZE_INTERNAL_ERROR: {
    code: "ONBOARDING_FINALIZE_INTERNAL_ERROR",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric → investigate",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  NO_FOLDER_CONFIGURED: {
    code: "NO_FOLDER_CONFIGURED",
    warningClass: "general",
    dougFacing:
      "(admin-log only on first occurrence; the dashboard explicitly shows the onboarding wizard CTA when no folder is configured, not an error)",
    crewFacing: null,
    followUp: "Doug → run setup wizard",
    helpfulContext:
      "Auto sync ran before the setup wizard saved a watched Drive folder. That is expected during first setup: the dashboard should show the setup call to action instead of treating it as a show error. Run the setup wizard to choose the folder.",
    title: "No watched folder yet",
    longExplanation:
      "Auto sync ran before the setup wizard saved a watched Drive folder. That's expected during first setup; the dashboard shows the setup call to action instead of treating it as a show error. Run the setup wizard to choose a folder.",
    helpHref: "/help/errors#NO_FOLDER_CONFIGURED",
  },
  "MI-6_CREW_SHRINKAGE": {
    code: "MI-6_CREW_SHRINKAGE",
    warningClass: "general",
    dougFacing:
      "Heads-up: *<sheet-name>* now has _<N>_ crew rows (was _<M>_). Review the changes before applying.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "More than one crew member was removed from the sheet since the last approved sync. We hold the change for review because crew shrinkage is sometimes accidental (a paste over the wrong cell range). Open the staged review to confirm the removals are intentional before applying.",
    title: "Crew rows shrunk",
    longExplanation:
      "More than one crew member was removed from the sheet since the last approved sync. We hold the change for review because crew shrinkage is sometimes accidental (a paste over the wrong cell range). Confirm the removals are intentional before applying.",
    helpHref: "/help/errors#MI-6_CREW_SHRINKAGE",
  },
  "MI-7_SECTION_SHRINKAGE": {
    code: "MI-7_SECTION_SHRINKAGE",
    warningClass: "general",
    dougFacing:
      "_<sheet-name>_ lost more than half of its _<section>_: _<prior_count>_ before, _<new_count>_ now. Review before applying.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "More than half of the rows in the named section disappeared since the last approved sync. Section collapses are usually accidental (often a half-finished paste). Open the staged review to confirm before applying.",
    title: "Section lost more than half its rows",
    longExplanation:
      "More than half of the rows in a named section disappeared since the last approved sync. Section collapses are usually accidental, often a half-finished paste. Confirm before applying.",
    helpHref: "/help/errors#MI-7_SECTION_SHRINKAGE",
  },
  "MI-7b_KEYED_PRESERVATION": {
    code: "MI-7b_KEYED_PRESERVATION",
    warningClass: "general",
    dougFacing: "_<sheet-name>_: _<entry>_ is no longer in the sheet. Review before applying.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A specific named entry (a particular hotel, room, or contact) that was in the sheet last sync is no longer there. We hold the change for review because keyed entries usually represent committed bookings or relationships. Confirm before applying.",
    title: "Named entry removed",
    longExplanation:
      "A specific named entry (a particular hotel, room, or contact) that was in the sheet last sync is no longer there. We hold the change for review because keyed entries usually represent committed bookings or relationships.",
    helpHref: "/help/errors#MI-7b_KEYED_PRESERVATION",
  },
  "MI-8_FINANCIAL_FIELD_COLLAPSE": {
    code: "MI-8_FINANCIAL_FIELD_COLLAPSE",
    warningClass: "general",
    dougFacing:
      "_<sheet-name>_: _<field>_ (e.g., PO#, Proposal, COI) was filled in before and is now blank. Confirm this was intentional.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A financial field (PO#, Proposal $, Invoice, Invoice Notes, COI) that was previously filled in is now blank. We hold the change for review because financial blanks are usually accidental. Confirm the blank is intentional before applying.",
    title: "Financial field cleared",
    longExplanation:
      "A financial field (PO#, Proposal $, Invoice, Invoice Notes, COI) that was previously filled in is now blank. We hold the change for review because financial blanks are usually accidental.",
    helpHref: "/help/errors#MI-8_FINANCIAL_FIELD_COLLAPSE",
  },
  ROLE_FLAGS_NOTICE: {
    code: "ROLE_FLAGS_NOTICE",
    warningClass: "general",
    resolution: "manual",
    audience: "doug",
    severity: "info",
    dougFacing: "In <sheet-name>, <role-changes><lead-hint>",
    dougFacingShowScoped: "<role-changes><lead-hint>",
    crewFacing: null,
    followUp: "none (informational)",
    helpfulContext:
      "This fires only for LEAD or FINANCIALS, the roles that unlock internal financials, and every change is logged. Nothing to do unless it was a mistake; if so, correct it in the sheet or role mapping.",
    title: "Role change applied",
    longExplanation:
      "This appears when a crew member's role flags change and get applied automatically, either from a sheet edit or an admin role mapping, both deliberate actions that apply without holding for review. It's specifically raised for changes to a CAPABILITY role, LEAD or FINANCIALS, which grant access to internal financials; those are worth a quick confirm, and a durable audit record captures every one. Department/scope flags, by contrast, only change which tile the crew member sees on their own page and don't raise this alert. No action is needed unless a capability change turns out to be a mistake. If so, correct it in the sheet or the role mapping.",
    helpHref: "/help/errors#ROLE_FLAGS_NOTICE",
  },
  MI11_TARGET_MOVED: {
    code: "MI11_TARGET_MOVED",
    warningClass: "general",
    dougFacing:
      "The sheet changed since this was queued, so we didn't apply it. Re-open the show to review the latest version.",
    crewFacing: null,
    followUp: "Doug → re-review",
    helpfulContext:
      "Before applying a queued email change we re-check the live sheet. If Doug edited the sheet after this change was queued, the change you're approving may no longer match what the sheet says, so we stop and ask you to re-review the latest version rather than apply a stale value.",
    title: "Sheet changed since this was queued",
    longExplanation:
      "Before applying a queued email change we re-check the live sheet. If the sheet was edited after this change was queued, the change you're approving may no longer match what the sheet says, so we stop rather than apply a stale value. Re-open the show to review the latest version.",
    helpHref: "/help/errors#MI11_TARGET_MOVED",
  },
  MI11_DRIVE_RECHECK_FAILED: {
    code: "MI11_DRIVE_RECHECK_FAILED",
    warningClass: "general",
    dougFacing: "We couldn't re-check the sheet right now. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "Before applying a queued email change we ask Google Drive for the sheet's latest revision time. That check just failed, usually a transient network or permissions hiccup. Nothing was changed. Try Approve again in a moment; if it keeps failing, check that the folder is still shared with the service account.",
    title: "Couldn't re-check the sheet",
    longExplanation:
      "Before applying a queued email change we ask Google Drive for the sheet's latest revision time. That check failed, usually a transient network or permissions hiccup. Nothing was changed. Try Approve again in a moment; if it keeps failing, check that the folder is still shared with the service account.",
    helpHref: "/help/errors#MI11_DRIVE_RECHECK_FAILED",
  },
  MI11_HOLD_ALREADY_RESOLVED: {
    code: "MI11_HOLD_ALREADY_RESOLVED",
    warningClass: "general",
    dougFacing: "That change was already resolved. Refresh to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh",
    helpfulContext:
      "This pending email change was already resolved, either a later sync brought the sheet back in line on its own, or you (or another open tab) already approved or rejected it. There's nothing left to do here; refresh the show to see the current state.",
    title: "Change already resolved",
    longExplanation:
      "This pending email change was already resolved, either a later sync brought the sheet back in line on its own, or you (or another open tab) already approved or rejected it. There's nothing left to do here; refresh the show to see the current state.",
    helpHref: "/help/errors#MI11_HOLD_ALREADY_RESOLVED",
  },
  IDENTITY_WOULD_COLLIDE: {
    code: "IDENTITY_WOULD_COLLIDE",
    warningClass: "general",
    dougFacing:
      "We can't apply this email change without it clashing with another crew member's email or name. Fix the conflict in the sheet, then re-sync.",
    crewFacing: null,
    followUp: "Doug → fix sheet conflict",
    helpfulContext:
      "Applying this email change would give a crew member an email or name that another crew member already has, and that other row isn't part of the same swap, so we can't apply it without creating a duplicate. Two crew rows can't share an email. Fix the clash in the sheet (one of them is usually a typo or a stale row), then re-sync.",
    title: "Email change would clash with another crew member",
    longExplanation:
      "Applying this email change would give a crew member an email or name that another crew member already has, and that other row isn't part of the same swap, so we can't apply it without creating a duplicate. Two crew rows can't share an email. Fix the clash in the sheet (one of them is usually a typo or a stale row), then re-sync.",
    helpHref: "/help/errors#IDENTITY_WOULD_COLLIDE",
  },
  UNDO_SUPERSEDED: {
    code: "UNDO_SUPERSEDED",
    warningClass: "general",
    dougFacing:
      "A newer sync already changed this, so there's nothing to undo. Refresh to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh",
    helpfulContext:
      "Undo only reverses the most recent change to a crew member. A newer sync has already changed this person again since the change you're trying to undo, so the saved 'before' value no longer matches what's live. Refresh to see the current state; if you still want the old value, edit the sheet directly.",
    title: "Nothing to undo: a newer sync already changed this",
    longExplanation:
      "Undo only reverses the most recent change to a crew member. A newer sync has already changed this person again since the change you're trying to undo, so the saved 'before' value no longer matches what's live. Refresh to see the current state; if you still want the old value, edit the sheet directly.",
    helpHref: "/help/errors#UNDO_SUPERSEDED",
  },
  UNDO_EMAIL_CLAIMED: {
    code: "UNDO_EMAIL_CLAIMED",
    warningClass: "general",
    dougFacing:
      "We can't undo this: the original email now belongs to someone else on the crew list. Fix it in the sheet instead.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Undoing this would restore an email address that now belongs to a different crew member, and two people can't share an email. Rather than undo, fix the email in the sheet; the next sync will reconcile it safely.",
    title: "Can't undo: that email now belongs to someone else",
    longExplanation:
      "Undoing this would restore an email address that now belongs to a different crew member, and two people can't share an email. Rather than undo, fix the email in the sheet; the next sync will reconcile it safely.",
    helpHref: "/help/errors#UNDO_EMAIL_CLAIMED",
  },
  UNDO_NOT_FOUND: {
    code: "UNDO_NOT_FOUND",
    warningClass: "general",
    dougFacing: "We couldn't find that change to undo. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh",
    helpfulContext:
      "We couldn't find the change you tried to undo. It may have already been undone, or it's a notification-only change (like a section shrinking) that doesn't carry a saved 'before' value to restore. Refresh the feed and try again.",
    title: "Couldn't find that change to undo",
    longExplanation:
      "We couldn't find the change you tried to undo. It may have already been undone, or it's a notification-only change (like a section shrinking) that doesn't carry a saved 'before' value to restore. Refresh the feed and try again.",
    helpHref: "/help/errors#UNDO_NOT_FOUND",
  },
  UNDO_SHOW_ARCHIVED: {
    code: "UNDO_SHOW_ARCHIVED",
    warningClass: "general",
    dougFacing:
      "This show is archived, so its crew list is read-only. Unarchive it first, then undo.",
    crewFacing: null,
    followUp: "Doug → unarchive",
    helpfulContext:
      "You can't undo a change on an archived show; archived shows are read-only. Unarchive the show first, then undo the change; the crew list accepts edits again once it's live.",
    title: "Can't undo: this show is archived",
    longExplanation:
      "You can't undo a change on an archived show; archived shows are read-only. Unarchive the show first, then undo the change; the crew list accepts edits again once it's live.",
    helpHref: "/help/errors#UNDO_SHOW_ARCHIVED",
  },
  UNDO_FINALIZE_OWNED: {
    code: "UNDO_FINALIZE_OWNED",
    warningClass: "general",
    dougFacing: "This show is being finalized right now. Wait for that to finish, then undo.",
    crewFacing: null,
    followUp: "Doug → wait",
    helpfulContext:
      "This show is in the middle of being finalized (the publish wizard owns it right now), so undo is temporarily blocked. Wait for finalize to finish, then try the undo again.",
    title: "Can't undo: this show is being finalized",
    longExplanation:
      "This show is in the middle of being finalized (the publish wizard owns it right now), so undo is temporarily blocked. Wait for finalize to finish, then try the undo again.",
    helpHref: "/help/errors#UNDO_FINALIZE_OWNED",
  },
  mi11_pending_email_change: {
    code: "mi11_pending_email_change",
    warningClass: "general",
    severity: "info",
    dougFacing: "Email change pending for {name}: {old} → {new}",
    crewFacing: null,
    followUp: "Doug → Approve / Reject",
    helpfulContext:
      "This crew member's email changed in the sheet. Because changing an email signs out whoever is currently using that login, we're holding the change until you approve it. Approve to apply the new email (the old login stops working); Reject to keep the current email.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  mi11_pending_rename: {
    code: "mi11_pending_rename",
    warningClass: "general",
    severity: "info",
    dougFacing: "Rename pending: {old} → {new}",
    crewFacing: null,
    followUp: "Doug → Approve / Reject",
    helpfulContext:
      "An existing held crew member was renamed in the sheet. We're holding the rename until you approve it so the login transition is intentional. Approve to apply the new name and email; Reject to keep the original.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  mi11_pending_removal: {
    code: "mi11_pending_removal",
    warningClass: "general",
    severity: "info",
    dougFacing: "Removal pending for {name}",
    crewFacing: null,
    followUp: "Doug → Approve / Reject",
    helpfulContext:
      "A held crew member was dropped from the sheet entirely. We're not silently removing them while their change is pending. Approve to remove them (their login stops working); Reject to keep them on the list.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  mi11_pending_rename_folded: {
    code: "mi11_pending_rename_folded",
    warningClass: "general",
    severity: "info",
    dougFacing: "Email change + rename pending for {name}",
    crewFacing: null,
    followUp: "Doug → Approve / Reject",
    helpfulContext:
      "This crew member has both an email change and a rename pending at once. We're holding both together until you approve, so the login transition happens in one intentional step. Approve to apply the new name + email; Reject to keep the original.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  "MI-11_EMAIL_CHANGE": {
    code: "MI-11_EMAIL_CHANGE",
    warningClass: "general",
    dougFacing:
      "_<crew-name>_'s email is changing from _<prior>_ to _<new>_. After applying, the new email will get sign-in access; their existing share-link will stop working until you Issue a new one.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A crew member's email address changed. After applying, the new email will get sign-in access; their existing share-link will stop working until you Issue them a new one. Confirm the email change is real before applying.",
    title: "Crew email changed",
    longExplanation:
      "A crew member's email address changed. After applying, the new email will get sign-in access; their existing share-link will stop working until you issue a new one.",
    helpHref: "/help/errors#MI-11_EMAIL_CHANGE",
  },
  "MI-12_PROBABLE_RENAME": {
    code: "MI-12_PROBABLE_RENAME",
    warningClass: "general",
    dougFacing:
      "Looks like _<old-name>_ was renamed to _<new-name>_ (same email). Approve the rename, or treat as two unrelated changes.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A row was removed and a new row added in the same sync, and they share the same email address. That usually means a name was edited (rename), not two unrelated changes. Confirm whether to treat as a rename or as two separate changes.",
    title: "Probable crew rename",
    longExplanation:
      "A row was removed and a new row added in the same sync, and they share the same email address. That usually means a name was edited (rename), not two unrelated changes. Confirm whether to treat as a rename.",
    helpHref: "/help/errors#MI-12_PROBABLE_RENAME",
  },
  "MI-13_NAME_AND_EMAIL_CHANGE": {
    code: "MI-13_NAME_AND_EMAIL_CHANGE",
    warningClass: "general",
    dougFacing:
      "Both name and email changed in _<sheet-name>_: _<old-pair>_ and _<new-pair>_. Are these the same person, or unrelated changes?",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A row was removed and a new row added with both a different name AND a different email. We can't tell from the data whether this is the same person or two unrelated changes. Confirm before applying.",
    title: "Name and email both changed",
    longExplanation:
      "A row was removed and a new row added with both a different name AND a different email. We can't tell from the data whether this is the same person or two unrelated changes. Confirm before applying.",
    helpHref: "/help/errors#MI-13_NAME_AND_EMAIL_CHANGE",
  },
  "MI-14_NO_EMAIL_RENAME": {
    code: "MI-14_NO_EMAIL_RENAME",
    warningClass: "general",
    dougFacing:
      "Looks like _<old-name>_ was renamed to _<new-name>_ (no emails to compare). Approve the rename, or treat as two unrelated changes.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A row was removed and a new row added, both without emails. The names are similar enough that this might be a rename, but with no email to compare we can't be sure. Confirm whether to treat as a rename or two separate changes.",
    title: "Possible rename, no emails to compare",
    longExplanation:
      "A row was removed and a new row added, both without emails. The names are similar enough that this might be a rename, but with no email to compare we can't be sure. Confirm whether to treat as a rename.",
    helpHref: "/help/errors#MI-14_NO_EMAIL_RENAME",
  },
  SHOW_FIRST_PUBLISHED: {
    code: "SHOW_FIRST_PUBLISHED",
    warningClass: "general",
    resolution: "manual",
    audience: "doug",
    severity: "info",
    dougFacing:
      "<sheet-name> is now live for crew at its share-token URL: <crew-count> crew, <show-date>. Flip Published off on the show's page if this was a mistake; crew can't open it again until you do.",
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "It auto-published because the sheet came through clean. If it's the wrong sheet or bad timing, flip Published off on the show's page; crew lose access until you turn it back on, and the same link works again when you do.",
    title: "Show published",
    longExplanation:
      "This show auto-published because the parse looked clean and all safety checks passed. If you dragged in the wrong sheet or weren't ready, flip the Published toggle off on the show's page; crew can't open the show until you turn it back on, and the same crew link works again when you do. When email is set up, the published notice also carries a 24-hour undo link that does the same thing.",
    helpHref: "/help/errors#SHOW_FIRST_PUBLISHED",
  },
  SHOW_UNPUBLISHED: {
    code: "SHOW_UNPUBLISHED",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "<sheet-name> has been unpublished; crew who open its link see a 'not available right now' page. Turn Published back on from the show's page when you're ready.",
    crewFacing: null,
    followUp: "Doug \u2192 republish from the show's page when ready",
    helpfulContext:
      "Nothing was deleted and the sheet keeps syncing in the background, so republishing from the show's page brings the same link back exactly as it was.",
    title: "Show unpublished",
    longExplanation:
      "This show has been unpublished, from the Published toggle on its page or via the emailed undo link. Its crew link is paused: crew who open it see a 'not available right now' page with no show details. Nothing else changed; the same link works again when you republish, and the sheet keeps syncing. Turn Published back on from the show's page when you're ready.",
    helpHref: "/help/errors#SHOW_UNPUBLISHED",
  },
  UNPUBLISH_TOKEN_CONSUMED: {
    code: "UNPUBLISH_TOKEN_CONSUMED",
    warningClass: "general",
    dougFacing:
      "This undo has already been used. The show is already unpublished, or someone else (or another tab) got there first.",
    crewFacing: null,
    followUp: "Doug → check show status in admin",
    helpfulContext:
      "The auto-publish undo is single-use, and it's already been used. This outcome is internal; a spent emailed link shows a generic not-found page, and no admin surface renders it since the Published toggle replaced the in-app undo. Check the show's page to confirm the current state; you can flip Published off there any time.",
    title: "Undo already used",
    longExplanation:
      "The auto-publish undo is single-use and has already been used. No surface renders this outcome: spent emailed links show a generic not-found page, and the in-app undo was replaced by the show page's Published toggle. Check the show's page to confirm the current state.",
    helpHref: "/help/errors#UNPUBLISH_TOKEN_CONSUMED",
  },
  UNPUBLISH_TOKEN_EXPIRED: {
    code: "UNPUBLISH_TOKEN_EXPIRED",
    warningClass: "general",
    dougFacing:
      "This unpublish link expired. Links stay valid for 24 hours; to take this show offline now, flip the Published toggle off on the show's page.",
    crewFacing: null,
    followUp: "Doug \u2192 toggle Published off from the show's page",
    helpfulContext:
      "The auto-publish unpublish link is short-lived. It stays valid for 24 hours after issuance; after that, the safety net closes; the show is treated as a normal published show. To take it offline now, open the show's page and flip the Published toggle off.",
    title: "Unpublish link expired",
    longExplanation:
      "The auto-publish unpublish link is short-lived. It stays valid for 24 hours after issuance; after that, the show is treated as a normal published show. To take it offline now, flip the Published toggle off on the show's page.",
    helpHref: "/help/errors#UNPUBLISH_TOKEN_EXPIRED",
  },
  ONBOARDING_SCAN_REVIEW: {
    code: "ONBOARDING_SCAN_REVIEW",
    warningClass: "general",
    dougFacing:
      "_<sheet-name>_ was found in your folder. Review the parse before activating this folder.",
    crewFacing: null,
    followUp: "Doug → review (within wizard)",
    helpfulContext:
      "This sheet was found by the setup wizard's folder scan. Review the parse before activating the folder so you're not committing to data you haven't seen.",
    title: "Onboarding scan needs your review",
    longExplanation:
      "The setup wizard's folder scan found this sheet. Review the parse before activating the folder, so you do not commit to data you have not seen. This is the wizard's version of first-seen review.",
    helpHref: "/help/errors#ONBOARDING_SCAN_REVIEW",
  },
  UNKNOWN_FIELD: {
    code: "UNKNOWN_FIELD",
    warningClass: "parse_warning",
    // Near-miss framing (field-near-miss detector spec §5), stated CONDITIONALLY rather than
    // as fact (2026-08-26 candidate-render spec §6.2). The content-keyed detector only fires
    // on a near match, and the matched label now RENDERS: a `Closest match` band on the per-show
    // card and a plain sibling line on wizard step 3. But one string serves every card while
    // the band is per-warning, so no string here may assert that a near-miss happened. Rows
    // persisted before the detector landed carry no `candidate` at all and never near-matched
    // anything: `emitUnknownField` then had two call sites (blocks/event.ts, blocks/venue.ts
    // at 9f9b0ef06^) and fired on ANY unrecognized label. Four fields therefore say "when we
    // can tell which row you meant" instead of "it nearly matches one now" (dougFacing,
    // helpfulContext, triggerContext, longExplanation); `title` and `followUp` were already
    // true either way. `longExplanation` also renders on /help/errors, where there is no card
    // at all, which is the second reason the copy cannot point at one.
    // No `_<candidate>_` placeholder: the card renders `messageFor(code)` with NO params
    // (PerShowActionableWarnings.tsx, NoteWarningCard.tsx) and `title`/`triggerContext`/
    // `longExplanation` are never interpolated (lookup.ts messageFor), so a placeholder would
    // render literally. The matched candidate rides `ParseWarning.candidate` structurally
    // (warnings.ts emitUnknownField), which is exactly what the render sites read.
    // Impeccable gate dispositions: the card's controls are documented by `controlsNote`,
    // rendered only where those controls mount (spec 2026-08-27-wizard-warning-row-links-copy
    // §4), so F4 holds on the published card and no surface WITHOUT the buttons names them —
    // the wizard's step-3 row named both and mounts neither. Every action string still leads
    // with the imperative rather than system state (F5). F1 is CLOSED by
    // this arc: it objected that no string may ask Doug to judge a suggestion he was never
    // shown, and he is now shown it.
    dougFacing:
      "Rename the row labeled _<key>_ in _<sheet-name>_ so it matches the row we show. It isn't showing on the crew page because the label doesn't match one we read. When we can tell which row you meant, the notice names it.",
    crewFacing: null,
    followUp: "Doug → rename the row in the sheet (or optional Report)",
    helpfulContext:
      "Rename this row in your sheet so it matches the row we show. It isn't showing on the crew page because the label doesn't match one we read.",
    controlsNote: "Use Report to flag it to us, or Ignore to hide this notice.",
    triggerContext: "Appears when a row's label doesn't exactly match a row we know how to show.",
    title: "Row we couldn't match",
    longExplanation:
      "A row in your sheet is labeled something we don't read as one of the rows we show, so it isn't showing on the crew page. When we can tell which row you meant, the notice names it. Rename it in the sheet and it will show the next time this show checks its sheet. We don't rename it for you, because the row you meant would be a guess.",
    helpHref: "/help/errors#UNKNOWN_FIELD",
  },
  UNKNOWN_DAY_RESTRICTION: {
    code: "UNKNOWN_DAY_RESTRICTION",
    warningClass: "parse_warning",
    dougFacing:
      "_<crew-name>_ is flagged as day-restricted (`***` in the role) but the sheet doesn't say which days. Add a parenthetical to their name like `(6/24 and 6/26 ONLY)`. Until you do, their schedule will show 'days unconfirmed.'",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "This crew member is marked day-restricted ('***' in the sheet) but the sheet doesn't say which days, so their schedule shows 'days unconfirmed'. Add the days to the name cell, like '(6/24 and 6/26 ONLY)'.",
    triggerContext: "Appears when a name carries the '***' marker but no days are listed.",
    title: "Day-restricted crew with no days listed",
    longExplanation:
      "A crew member has the day-restriction flag but the sheet doesn't say which days. Add a parenthetical to their name like '(6/24 and 6/26 ONLY)'. Until you do, their schedule will show 'days unconfirmed.'",
    helpHref: "/help/errors#UNKNOWN_DAY_RESTRICTION",
  },
  DAY_RESTRICTION_DOUBLE_LOCATION: {
    code: "DAY_RESTRICTION_DOUBLE_LOCATION",
    warningClass: "parse_warning",
    dougFacing:
      "_<crew-name>_ has day restrictions written in both the name and role cells. We're using the role-cell one. Remove the duplicate so the schedule stays clear.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "We found day restrictions written in both the name cell and the role cell. We're using the role-cell one. Remove the duplicate so the schedule stays clear.",
    title: "Day restriction in two cells",
    longExplanation:
      "We found day restrictions written in both the name cell and the role cell. We're using the role-cell one. Remove the duplicate so the schedule stays clear.",
    helpHref: "/help/errors#DAY_RESTRICTION_DOUBLE_LOCATION",
  },
  UNKNOWN_ROLE_TOKEN: {
    code: "UNKNOWN_ROLE_TOKEN",
    warningClass: "parse_warning",
    dougFacing:
      "_<crew-name>_'s role includes _<token>_, which we didn't recognize, so we left it off their page rather than guess. If that's a real role you use, you can add it right from this warning.",
    crewFacing: null,
    followUp: "Doug → recognize role (or optional Report)",
    helpfulContext:
      "One of this crew member's role labels isn't one we recognize, so we left it off their page instead of guessing. If the label is correct, this card's controls let you add it as a real role.",
    triggerContext: "Appears when a role label in a crew cell isn't on the known-roles list.",
    title: "Role we didn't recognize",
    longExplanation:
      "A crew member's role included a label we didn't recognize, so we left it off their page rather than guess. Nothing else is affected. If the label is a real role you use, you can add it right from this warning.",
    helpHref: "/help/errors#UNKNOWN_ROLE_TOKEN",
  },
  ROLE_TOKEN_MAPPED: {
    code: "ROLE_TOKEN_MAPPED",
    warningClass: "general",
    dougFacing:
      "_<token>_, a role you added, matched someone on this show; we set up their page the way you chose.",
    crewFacing: null,
    followUp: "none (informational)",
    helpfulContext:
      "A role you added from a warning matched a crew member during a sheet check, so their page now shows what you picked. Rendering note: with no extra choices the summary reads 'the standard show page'.",
    title: "Recognized a role you added",
    longExplanation:
      "A role you added from a warning matched a crew member the next time this show checked its sheet, so their page now shows exactly what you chose. If you picked nothing extra, they see the standard show page. You can change what they see from Settings.",
    helpHref: "/help/errors#ROLE_TOKEN_MAPPED",
  },
  UNKNOWN_STAGE_RESTRICTION: {
    code: "UNKNOWN_STAGE_RESTRICTION",
    warningClass: "parse_warning",
    dougFacing:
      "_<crew-name>_'s role mixes a work-phase (like Set) with something we couldn't read (e.g. 'Set / Rehearsal ONLY'), so we can't tell which days apply. We're showing them the whole show to be safe. Use the standard phases: Load In / Set / Show / Strike / Load Out, so we can filter their schedule.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "This role cell mixes a known work-phase with something we couldn't read, so we show this crew member the full schedule rather than hide any of it. Use the standard phases: Load In / Set / Show / Strike / Load Out.",
    triggerContext:
      "Appears when a role cell's phase restriction contains a word outside the standard phases.",
    title: "Stage restriction we couldn't read",
    longExplanation:
      "This crew member's role cell mixes a recognized work-phase (like Set) with a token we couldn't read (e.g. 'Set / Rehearsal ONLY'), so we can't safely tell which days apply. We're showing them the whole show rather than hide a day. Use the standard phases: Load In / Set / Show / Strike / Load Out, so their schedule can be filtered.",
    helpHref: "/help/errors#UNKNOWN_STAGE_RESTRICTION",
  },
  REF_ERROR_LITERAL: {
    code: "REF_ERROR_LITERAL",
    warningClass: "parse_warning",
    dougFacing:
      "A cell in this sheet contains '#REF!', which is what Sheets shows when a formula's reference was deleted. The page will display it as-is until the formula is repaired in the sheet.",
    crewFacing: null,
    followUp: "Doug → fix in sheet",
    helpfulContext:
      "A cell here reads '#REF!' instead of a real value. That is what Sheets leaves behind when the cell a formula pointed at was deleted.",
    triggerContext:
      "Appears when any cell in the sheet contains the text '#REF!', including a cell that mixes it with other text.",
    title: "A cell shows #REF! (broken formula reference)",
    longExplanation:
      "Sheets writes '#REF!' into a cell when the reference its formula depended on was deleted. We show the cell exactly as the sheet has it rather than guessing at the value that belongs there, so the page will keep displaying '#REF!' until the formula is repaired in the sheet.",
    helpHref: "/help/errors#REF_ERROR_LITERAL",
  },
  ROW_CELLS_FUSED: {
    code: "ROW_CELLS_FUSED",
    warningClass: "parse_warning",
    dougFacing:
      "A row in this sheet has one fewer column than its neighbors, which is how a merged cell exports. Values to the right of the merge may appear under the wrong headings until the merge is removed in the sheet.",
    crewFacing: null,
    followUp: "Doug → fix in sheet",
    helpfulContext:
      "A row here has one fewer column than the rows around it. That is what a merged cell looks like once the sheet is exported, and it can push values under the wrong headings.",
    triggerContext:
      "Appears when a row in a section is exactly one cell short of the width its neighboring rows share.",
    title: "Two columns ran together in the sheet",
    longExplanation:
      "Unmerge the cells in that row and it will line up again. Merging two cells makes the export write that row one column short, so the joined values and everything to their right land one column over, and a call time can end up under a role heading. We show the row exactly as the sheet has it rather than guess which value belongs where.",
    helpHref: "/help/errors#ROW_CELLS_FUSED",
  },
  STAGE_WORD_AUTOCORRECTED: {
    code: "STAGE_WORD_AUTOCORRECTED",
    warningClass: "parse_warning",
    dougFacing:
      "We read a likely-misspelled stage word in _<crew-name>_'s role (for example 'Strke' as 'Strike') and used the corrected version, so their schedule still reads correctly. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A stage word in this crew member's role looked misspelled, so we used the closest real one (like 'Strke' as 'Strike'). Update the sheet if the spelling was intentional.",
    triggerContext:
      "Appears when a work-phase word in a role cell is a letter or two off (Load In / Set / Show / Strike / Load Out).",
    title: "Auto-corrected a misspelled stage word",
    longExplanation:
      "A stage word in a crew member's role cell looked misspelled, so we read it as the closest real stage word and used that; the role and schedule still parse correctly. If the spelling was intentional, update the sheet.",
    helpHref: "/help/errors#STAGE_WORD_AUTOCORRECTED",
  },
  ROLE_TOKEN_AUTOCORRECTED: {
    code: "ROLE_TOKEN_AUTOCORRECTED",
    warningClass: "parse_warning",
    dougFacing:
      "We read a likely-misspelled role in _<crew-name>_'s cell (for example 'Content Cretion' as 'Content Creation') and used the corrected version. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A role looked misspelled, so we used the closest real one (like 'Content Cretion' as 'Content Creation'). Update the sheet if the spelling was intentional.",
    triggerContext: "Appears when a role in a crew cell is a letter or two off a known role.",
    title: "Auto-corrected a misspelled role",
    longExplanation:
      "A multi-word role in a crew member's cell looked misspelled, so we read it as the closest real role and used that; the role still parses. If the spelling was intentional, update the sheet.",
    helpHref: "/help/errors#ROLE_TOKEN_AUTOCORRECTED",
  },
  COLUMN_HEADER_AUTOCORRECTED: {
    code: "COLUMN_HEADER_AUTOCORRECTED",
    warningClass: "parse_warning",
    dougFacing:
      "We read a likely-misspelled column header on _<sheet-name>_'s crew table (for example 'E-MAIL' as 'EMAIL') and used the corrected column. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A crew-table column header looked misspelled, so we used the closest real one (like 'E-MAIL' as 'EMAIL'). Fix the header in the sheet if that guess is wrong.",
    triggerContext:
      "Appears when a crew-table column header is a letter or two off a standard header.",
    title: "Auto-corrected a column header",
    longExplanation:
      "A column header on a crew table looked misspelled, so we read it as the closest real header and used that column; the crew rows still parse into the right fields. If it was intentional, update the sheet.",
    helpHref: "/help/errors#COLUMN_HEADER_AUTOCORRECTED",
  },
  CREW_COLUMN_POSITIONAL_FALLBACK: {
    code: "CREW_COLUMN_POSITIONAL_FALLBACK",
    warningClass: "parse_warning",
    dougFacing:
      "We couldn't recognize the column headers on _<sheet-name>_'s crew table, so we read the columns by position instead. Names and roles may have landed in the wrong fields. Check the crew section against your sheet, and add a header row (Name / Role / Phone / Email) so we can read the columns by label.",
    crewFacing: null,
    followUp: "Doug → verify crew columns",
    helpfulContext:
      "We didn't recognize this crew table's headers, so we read columns by position; some names or roles may be misplaced. Add a header row (Name / Role / Phone / Email) and recheck the crew.",
    triggerContext: "Appears when a crew table has no header row we recognize.",
    title: "Guessed crew table columns by position",
    longExplanation:
      "A crew table's header row was missing or used unrecognized labels, so instead of dropping the rows we read the columns by position. The rows parsed but may have landed in the wrong fields. Add a standard header row (Name / Role / Phone / Email) so the columns are read by label.",
    helpHref: "/help/errors#CREW_COLUMN_POSITIONAL_FALLBACK",
  },
  VENUE_GEOCODE_UNRESOLVED: {
    code: "VENUE_GEOCODE_UNRESOLVED",
    warningClass: "parse_warning",
    dougFacing:
      "We couldn't automatically look up the city for _<venue>_, so the crew page shows the venue address instead of a city name. This often clears on the next sync; if it sticks, double-check the venue address in the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix (auto-retries)",
    helpfulContext:
      "We couldn't look up the venue's city from its address, so the page shows the raw address instead. Often temporary; if it keeps happening, check the address for typos.",
    triggerContext: "Appears when the venue address doesn't resolve to a city.",
    title: "Couldn't look up the venue city",
    longExplanation:
      "We look up each venue's city from its address so the crew page can show a clean location. The lookup didn't return a city this time, usually a temporary service hiccup that clears on the next sync. The page falls back to the address. If it persists, check the venue address in the sheet.",
    helpHref: "/help/errors#VENUE_GEOCODE_UNRESOLVED",
  },
  VENUE_TIMEZONE_UNRESOLVED: {
    code: "VENUE_TIMEZONE_UNRESOLVED",
    warningClass: "parse_warning",
    dougFacing:
      "We couldn't work out the time zone for _<venue>_, so the crew page shows times in Eastern Time. This often clears on the next sync once the venue's location resolves; if it sticks, double-check the venue address in the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix (auto-retries)",
    helpfulContext:
      "We couldn't work out the venue's time zone, so times show in Eastern Time for now. It usually clears on the next sync; if not, check the venue address.",
    triggerContext: "Appears when the venue's location doesn't resolve to a time zone.",
    title: "Couldn't determine the venue's time zone",
    longExplanation:
      "We derive each venue's time zone from its location so the crew page shows the right local times. We couldn't this time, so the page falls back to Eastern Time, usually a temporary gap that clears on the next sync once the location resolves. If it persists, check the venue address in the sheet.",
    helpHref: "/help/errors#VENUE_TIMEZONE_UNRESOLVED",
  },
  ORPHANED_CREW_ROWS: {
    code: "ORPHANED_CREW_ROWS",
    warningClass: "parse_warning",
    dougFacing:
      "Some crew rows in _<sheet-name>_ look separated from the CREW section header, so they were not read as crew. A blank row may have been inserted in the middle of the section; check the crew block in your sheet.",
    crewFacing: null,
    followUp: "Doug → remove the stray blank row in the crew section",
    helpfulContext:
      "Rows that look like crew assignments are not attached to a crew section header, so they were not read as crew. A blank row may have been added in the middle of the crew section. Check the crew section in the sheet and remove the stray blank row.",
    triggerContext:
      "Appears when rows carrying crew role text (like 'Load In / Set / Strike / Load Out') sit in a block with no section header above them.",
    title: "Some crew rows came loose from their section",
    longExplanation:
      "A blank row inside the crew section splits the roster into two pieces, and the piece below the blank row loses its connection to the CREW header. Those rows were not read as crew, so the crew members on them may be missing from their pages. Remove the blank row in the sheet and the roster will read as one section again.",
    helpHref: "/help/errors#ORPHANED_CREW_ROWS",
  },
  ROOM_HEADER_SPLIT_AMBIGUOUS: {
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    warningClass: "parse_warning",
    dougFacing:
      "We had to make a judgment call splitting a room line in _<sheet-name>_ into name and dimensions; check the rooms section against your sheet.",
    crewFacing: null,
    followUp: "Doug → spot-check rooms",
    helpfulContext:
      "A room line could split into name and dimensions more than one way, so we picked the most likely reading. Check the rooms section; the name or dimensions might be slightly off.",
    triggerContext: "Appears when a room line mixes its name and dimensions in an unusual order.",
    title: "Made a judgment call splitting a room line",
    longExplanation:
      "A room header could be read as name-then-dimensions in more than one way, so we picked the most likely split rather than dropping the room. The room still parsed, but the name or dimensions may have landed slightly off. Spot-check the rooms section against your sheet.",
    helpHref: "/help/errors#ROOM_HEADER_SPLIT_AMBIGUOUS",
  },
  HOTEL_GUEST_SPLIT_AMBIGUOUS: {
    code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
    warningClass: "parse_warning",
    dougFacing:
      "A hotel line in _<sheet-name>_ may not have been read correctly; check who is on the hotel reservation against your sheet.",
    crewFacing: null,
    followUp: "Doug → spot-check hotel guests",
    helpfulContext:
      "A hotel line could be read more than one way, so we made a judgment call. Check who is on the reservation in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out.",
    triggerContext: "Appears when a hotel line could be read more than one way.",
    title: "A hotel line may be read wrong",
    longExplanation:
      "A hotel line could be read more than one way, so we made a judgment call about where each part starts and ends. Spot-check who is on the reservation in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out.",
    helpHref: "/help/errors#HOTEL_GUEST_SPLIT_AMBIGUOUS",
  },
  HOTEL_INLINE_GROUP_OWN_HOTEL: {
    code: "HOTEL_INLINE_GROUP_OWN_HOTEL",
    warningClass: "parse_warning",
    dougFacing:
      "A hotel line in _<sheet-name>_ seems to book more than one hotel; check each reservation's hotel against your sheet. Moving the bookings into the HOTEL table, one per RESERVATION column, keeps them from running together.",
    crewFacing: null,
    followUp: "Doug → spot-check hotel reservations",
    helpfulContext:
      "One hotel line seems to book more than one hotel, so this reservation was given its own hotel instead of the line's first one. Check its hotel name, address, guests, and dates against your sheet. To avoid this, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column.",
    triggerContext: "Appears when one hotel line seems to book more than one hotel.",
    title: "A hotel line may book more than one hotel",
    longExplanation:
      "One hotel line seems to book more than one hotel, so this reservation was given its own hotel instead of sharing the line's first one. Spot-check this reservation's hotel name, address, guests, and dates. This cannot be fixed in the app: if the hotel is wrong, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column, and the next sync will pick it up.",
    helpHref: "/help/errors#HOTEL_INLINE_GROUP_OWN_HOTEL",
  },
  HOTEL_INLINE_GROUP_HOTEL_SUSPECTED: {
    code: "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
    warningClass: "parse_warning",
    dougFacing:
      "A hotel line in _<sheet-name>_ may show a reservation under the wrong hotel; check it against your sheet. Moving the bookings into the HOTEL table, one per RESERVATION column, fixes this.",
    crewFacing: null,
    followUp: "Doug → fix the sheet: one booking per HOTEL RESERVATION column",
    helpfulContext:
      "A reservation on a shared hotel line may be under the wrong hotel. Check it against your sheet. This cannot be fixed in the app: move the bookings into the sheet's HOTEL table, one booking per RESERVATION column, and the next sync will pick it up.",
    triggerContext:
      "Appears when a reservation on a shared hotel line may be under the wrong hotel.",
    title: "A reservation may show the wrong hotel",
    longExplanation:
      "A reservation on a shared hotel line may be showing the wrong hotel. Spot-check it against your sheet. This cannot be fixed in the app: move the bookings into the sheet's HOTEL table, one booking per RESERVATION column, and the next sync will pick it up.",
    helpHref: "/help/errors#HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
  },
  HOTEL_ADDRESS_SPLIT_AMBIGUOUS: {
    code: "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    warningClass: "parse_warning",
    dougFacing:
      "A hotel line in _<sheet-name>_ may have its name and street address run together; check the hotel name and address against your sheet.",
    crewFacing: null,
    followUp: "Doug → spot-check hotel name and address",
    helpfulContext:
      "A hotel line's name and street address may not have been separated correctly. Check the hotel name and address in case part of one landed in the other.",
    triggerContext:
      "Appears when a hotel line's name and street address may not have been separated correctly.",
    title: "A hotel name and address may be split wrong",
    longExplanation:
      "A hotel line's name and street address may not have been separated correctly. We kept every word rather than dropping any, so nothing is lost, but the dividing point may be off: part of the address may be sitting in the hotel name, or part of the name in the address. Spot-check both against your sheet.",
    helpHref: "/help/errors#HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  },
  DATE_ORDER_SUGGESTS_DMY: {
    code: "DATE_ORDER_SUGGESTS_DMY",
    warningClass: "parse_warning",
    dougFacing:
      "The dates in _<sheet-name>_ look out of order the way we read them (month first). If you wrote them day-first, fix the dates in the sheet; we may have every date wrong.",
    crewFacing: null,
    followUp: "Doug → fix sheet dates",
    helpfulContext:
      "The show dates only make sense read day-first (10/3 as 3 October), but we read them month-first, so every date may be wrong. Rewrite the dates unambiguously, like 'June 24'.",
    triggerContext: "Appears when the sheet's dates are only in order if read day-first.",
    title: "Show dates may be written day-first",
    longExplanation:
      "The show dates only sort into order if read day-first, but we read them month-first, which usually means the sheet was written day-first. If so, every date we parsed may be wrong. Fix the dates in the sheet to an unambiguous format (like 'June 24') and we'll re-read them.",
    helpHref: "/help/errors#DATE_ORDER_SUGGESTS_DMY",
  },
  HOTEL_CARDINALITY_EXCEEDED: {
    code: "HOTEL_CARDINALITY_EXCEEDED",
    warningClass: "parse_warning",
    dougFacing:
      "_<sheet-name>_ lists more than 4 hotels; we kept the first 4. Remove old hotel blocks from the sheet if this is wrong.",
    crewFacing: null,
    followUp: "Doug → trim hotel list",
    helpfulContext:
      "Your sheet lists more than four hotels; we kept the first four and dropped the rest. Remove old or duplicate hotel blocks so the four we keep are the right ones.",
    triggerContext: "Appears when the sheet has more than four hotel blocks.",
    title: "More than four hotels, kept the first four",
    longExplanation:
      "This sheet lists more than four hotels, and we only keep the first four; the extras were dropped. If an old or duplicate hotel block is still in the sheet, remove it so the four we keep are the right ones.",
    helpHref: "/help/errors#HOTEL_CARDINALITY_EXCEEDED",
  },
  SECTION_HEADER_AUTOCORRECTED: {
    code: "SECTION_HEADER_AUTOCORRECTED",
    warningClass: "parse_warning",
    dougFacing:
      "We read a likely-misspelled section header on _<sheet-name>_ (for example 'Transportaton' as 'Transportation') and parsed that section anyway. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A section header looked misspelled, so we read it as the closest real one (like 'Transportaton' as 'Transportation'). Update the sheet if it was intentional.",
    triggerContext: "Appears when a section header is a letter or two off a standard section name.",
    title: "Auto-corrected a section header",
    longExplanation:
      "A section header on a sheet looked misspelled, so we read it as the closest real section and parsed that section anyway; otherwise the whole section would have been dropped. If it was intentional, update the sheet.",
    helpHref: "/help/errors#SECTION_HEADER_AUTOCORRECTED",
  },
  FIELD_LABEL_AUTOCORRECTED: {
    code: "FIELD_LABEL_AUTOCORRECTED",
    warningClass: "parse_warning",
    dougFacing:
      "We read a likely-misspelled field label on _<sheet-name>_ (for example 'Venue Adress' as 'Venue Address') and used the corrected field. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A row label looked misspelled, so we used the closest real one (like 'Venue Adress' as 'Venue Address'). Fix the label in the sheet if that guess is wrong.",
    triggerContext: "Appears when a row label is a letter or two off a standard label.",
    title: "Auto-corrected a field label",
    longExplanation:
      "A field label on a sheet looked misspelled, so we read it as the closest real field and used that; the value is recovered into the right field instead of being dropped. If it was intentional, update the sheet.",
    helpHref: "/help/errors#FIELD_LABEL_AUTOCORRECTED",
  },
  LEADING_COLUMN_AUTOCORRECTED: {
    code: "LEADING_COLUMN_AUTOCORRECTED",
    warningClass: "parse_warning",
    dougFacing:
      "Every row of a section in this sheet started with an empty column, so we read the section one column to the left and it parses correctly. If the empty column was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "Every row in a section started with an empty column, so we read it one column to the left instead. Update the sheet if the empty column was intentional.",
    triggerContext:
      "Appears when every row of a sheet section, including its header, starts with an empty column.",
    title: "Auto-corrected a section that started with an empty column",
    longExplanation:
      "Every row in a sheet section, including its header, started with an empty column, so we read the section one column to the left instead. Nothing was dropped; the section lines up and reads correctly again. If the empty column was intentional, update the sheet.",
    helpHref: "/help/errors#LEADING_COLUMN_AUTOCORRECTED",
  },
  PULL_SHEET_PARSE_PARTIAL: {
    code: "PULL_SHEET_PARSE_PARTIAL",
    warningClass: "parse_warning",
    dougFacing:
      "We couldn't fully read _<N>_ row(s) on _<sheet-name>_'s PULL SHEET, so those rows show their original text. Let us know if you'd like us to handle that format.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "Some pull-sheet rows have a QTY we couldn't read (a word, or a range like '1-2'), so those rows show their original text.",
    controlsNote: "Use Report if you'd like the format supported.",
    triggerContext: "Appears when a pull-sheet QTY cell isn't a plain number.",
    title: "Pull sheet rows we couldn't fully read",
    longExplanation:
      "We couldn't read the QTY on some rows, usually it's a word, a range like '1-2', or another value that isn't a plain number. We kept those cases and show the row's original text so techs still see what's packed. Only those rows are affected. Use Report to have us support the format.",
    helpHref: "/help/errors#PULL_SHEET_PARSE_PARTIAL",
  },
  PULL_SHEET_ON_ARCHIVED_TAB: {
    code: "PULL_SHEET_ON_ARCHIVED_TAB",
    warningClass: "parse_warning",
    dougFacing:
      "A pull sheet was found on an archived tab ('{tab}') and left out. If it's this show's gear, include it in review; otherwise ignore.",
    crewFacing: null,
    followUp: "Doug → include or ignore",
    helpfulContext:
      "We found a PULL SHEET on a tab that looks like an older copy, so we left it out to avoid mixing old gear in. If it really is this show's gear, the Gear section on this page offers to include it.",
    triggerContext:
      "Appears when a PULL SHEET is found on a tab that looks like an older copy of the sheet, not its main tab.",
    title: "Pull sheet found on an archived tab",
    longExplanation:
      "We found a PULL SHEET on a tab that looks archived (an older or renamed tab, not the sheet's current body), so we left it out of the parse to avoid mixing old gear into the current pull list. If that tab really is this show's gear, include it from the review panel and we'll fold it in; otherwise you can ignore this and nothing changes.",
    helpHref: "/help/errors#PULL_SHEET_ON_ARCHIVED_TAB",
  },
  PULL_SHEET_OVERRIDE_CONTENT_CHANGED: {
    code: "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
    warningClass: "parse_warning",
    dougFacing:
      "An included archived-tab pull sheet changed and was set back to skipped for safety; admin must re-confirm.",
    crewFacing: null,
    followUp: "Doug → re-confirm",
    helpfulContext:
      "A pull sheet you'd included changed since you last saw it, so we left it out rather than publish gear you haven't seen. Recheck the tab, then re-include it from the Gear section.",
    triggerContext: "Appears when the contents of an included archived-tab pull sheet change.",
    title: "Included archived-tab pull sheet changed",
    longExplanation:
      "An archived-tab pull sheet you'd included in this show's gear has changed since you accepted it. To avoid silently publishing gear you didn't review, we set that tab back to skipped and left the current pull sheet untouched. Re-open the review panel, check the updated tab, and include it again if it's still correct.",
    helpHref: "/help/errors#PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
  },
  AGENDA_GRID_MALFORMED: {
    code: "AGENDA_GRID_MALFORMED",
    warningClass: "parse_warning",
    dougFacing:
      "We couldn't find the run-of-show grid in _<sheet-name>_'s AGENDA tab, so every day shows the standard schedule instead of the detailed run-of-show. Check that the AGENDA tab still has its header row, or let us know if the layout changed.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "We couldn't find the run-of-show grid in the AGENDA tab, so every day shows the standard schedule. Check the tab still has its header row and its usual name.",
    triggerContext: "Appears when the AGENDA tab is missing, renamed, or missing its header row.",
    title: "Run-of-show grid not found",
    longExplanation:
      "We couldn't find the run-of-show grid in the AGENDA tab, usually a renamed tab or a deleted header row. Until it's back, every day shows the standard schedule and nothing crew-facing breaks. Check the AGENDA tab still has its header row.",
    helpHref: "/help/errors#AGENDA_GRID_MALFORMED",
  },
  AGENDA_BLOCK_UNRESOLVED: {
    code: "AGENDA_BLOCK_UNRESOLVED",
    warningClass: "parse_warning",
    dougFacing:
      "One run-of-show day in _<sheet-name>_'s AGENDA couldn't be matched to a show date, so that day shows the standard schedule. Check the AGENDA date banner, or let us know if it keeps happening.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "One run-of-show day couldn't be matched to a calendar date, so that day shows the standard schedule. Check that day's date banner in the AGENDA tab; it's usually missing or showing an error like #REF!.",
    triggerContext: "Appears when a day in the AGENDA tab has no readable date above it.",
    title: "Run-of-show day not matched to a date",
    longExplanation:
      "One run-of-show day couldn't be matched to a calendar date, so that day shows the standard schedule. Usually the AGENDA date banner is missing or shows an error (like #REF!). Other days are fine.",
    helpHref: "/help/errors#AGENDA_BLOCK_UNRESOLVED",
  },
  AGENDA_DAY_AMBIGUOUS: {
    code: "AGENDA_DAY_AMBIGUOUS",
    warningClass: "parse_warning",
    dougFacing:
      "A run-of-show day in _<sheet-name>_'s AGENDA only listed a weekday that matches more than one show date, so we didn't guess; that day shows the standard schedule. Add the actual date to the AGENDA banner to fix it.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "This run-of-show day names only a weekday that matches two show dates, so we didn't guess and it shows the standard schedule. Add the actual date to the AGENDA banner.",
    triggerContext:
      "Appears when an AGENDA day banner gives only a weekday (like 'Wednesday') and the show has two of them.",
    title: "Run-of-show day matches two dates",
    longExplanation:
      "A run-of-show day only listed a weekday (like 'Wednesday') that matches two of the show's days, so we didn't guess and that day shows the standard schedule. Add the actual date to the AGENDA banner to fix it.",
    helpHref: "/help/errors#AGENDA_DAY_AMBIGUOUS",
  },
  AGENDA_DAY_TRUNCATED: {
    code: "AGENDA_DAY_TRUNCATED",
    warningClass: "parse_warning",
    dougFacing:
      "A run-of-show day in _<sheet-name>_'s AGENDA was too large and was trimmed to fit our limits (too many entries, or some unusually long text). Crew see the trimmed list. Let us know if a real day legitimately needs more.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "This run-of-show day was too large, so crew see a trimmed list. It's almost always a stray cell; let us know if a real day genuinely needs more.",
    triggerContext:
      "Appears when one AGENDA day holds far more entries, or far longer text, than a day normally does.",
    title: "Run-of-show day trimmed",
    longExplanation:
      "One run-of-show day was too large and we trimmed it to keep things fast, usually too many entries, or some unusually long text. Crew see the trimmed list. This is almost always a stray cell; let us know if a real day genuinely needs more.",
    helpHref: "/help/errors#AGENDA_DAY_TRUNCATED",
  },
  AGENDA_DAY_EMPTIED: {
    code: "AGENDA_DAY_EMPTIED",
    warningClass: "parse_warning",
    dougFacing:
      "A run-of-show day in _<sheet-name>_'s AGENDA that we previously published is now empty in the sheet, so that day reverts to the standard schedule. If that's intentional, no action is needed; if not, restore the day's rows.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A run-of-show day you'd published before is now blank in the sheet, so it went back to the standard schedule. Put the rows back if that wasn't on purpose.",
    triggerContext:
      "Appears when a previously published AGENDA day has been cleared out of the sheet.",
    title: "Run-of-show day cleared",
    longExplanation:
      "A run-of-show day you'd published before is now blank in the sheet, so that day went back to the standard schedule (we don't keep old content once it's removed). If you cleared it on purpose you're done; if not, put the rows back and it returns on the next sync.",
    helpHref: "/help/errors#AGENDA_DAY_EMPTIED",
  },
  SCHEDULE_TIME_UNPARSED: {
    code: "SCHEDULE_TIME_UNPARSED",
    warningClass: "parse_warning",
    dougFacing:
      "We couldn't read a start time for one of _<sheet-name>_'s show days, so that day shows the standard schedule. Make sure the day's TIME cell starts with a time like '7:15am - Registration' or '7:30am - 5:50pm'.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "One show day's TIME cell wasn't readable as a start time, so that day shows the standard schedule. Give it a clear start like '7:15am - Registration'.",
    triggerContext: "Appears when a TIME cell doesn't begin with a readable time.",
    title: "Show-day time unreadable",
    longExplanation:
      "A show day's TIME cell had content we couldn't read as a start time, so that day shows the standard schedule. Give the cell a clear start time and it'll update on the next sync.",
    helpHref: "/help/errors#SCHEDULE_TIME_UNPARSED",
  },
  SCHEDULE_STRIKE_DATE_OFF_SCHEDULE: {
    code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
    warningClass: "parse_warning",
    dougFacing:
      "A room's strike time is dated on a day that isn't part of _<sheet-name>_'s schedule, so it shows in your review but not on crew pages. Fix the date in the room's Strike Time cell so it matches a show day.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A room's Strike Time is dated on a day outside the show's schedule, so it won't appear on crew schedules. Fix that cell's date to a show day.",
    triggerContext: "Appears when a Strike Time's date isn't one of the show's days.",
    title: "Strike dated off the schedule",
    longExplanation:
      "A room's Strike Time was dated on a day that isn't part of the show's schedule, so the strike shows in the admin review but not on crew schedules. Fix the date in that room's Strike Time cell to match a show day and it'll appear on the next sync.",
    helpHref: "/help/errors#SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
  },
  AGENDA_FILE_INACCESSIBLE: {
    code: "AGENDA_FILE_INACCESSIBLE",
    warningClass: "parse_warning",
    dougFacing:
      "We couldn't open the agenda file linked on _<sheet-name>_, so there's no day-by-day schedule and crew may not be able to see the agenda either. Most often it's private and not shared with us, or it was deleted; it can also be a non-PDF link or a file too large to open. Confirm the agenda is a shared, reasonably sized PDF (for example, set the link to anyone-with-the-link can view), or replace the link.",
    crewFacing: null,
    followUp: "Doug → check agenda link",
    helpfulContext:
      "We couldn't open the linked agenda file, so there's no schedule and crew may not be able to see the agenda. It may be private and not shared with us, deleted, a non-PDF link, or too large to open. Confirm it's a shared, reasonably sized PDF, or replace the link.",
    triggerContext:
      "Appears when we can't open the linked agenda file: it's missing, not shared with us, not a PDF, or too large.",
    title: "Can't open the agenda file",
    longExplanation:
      "We couldn't open the agenda file linked on this show, so there's no day-by-day schedule and crew may not be able to see the agenda. This happens when the file was deleted, when it's private and not shared with us (a missing file and a not-shared file look the same to us), when the link isn't a readable PDF, or when the file is too large for us to open. Confirm the agenda is a shared, reasonably sized PDF, then re-check, or replace the link.",
    helpHref: "/help/errors#AGENDA_FILE_INACCESSIBLE",
  },
  AGENDA_PDF_UNREADABLE: {
    code: "AGENDA_PDF_UNREADABLE",
    warningClass: "parse_warning",
    dougFacing:
      "We opened the agenda PDF linked on _<sheet-name>_ but couldn't find a day-by-day schedule in it, so crew see the agenda document but not a structured schedule. No action is needed unless the agenda is supposed to include a schedule we can read.",
    crewFacing: null,
    followUp: "Doug → optional check",
    helpfulContext:
      "We opened the agenda PDF but couldn't find a day-by-day schedule in it, so crew see the agenda document only. Nothing is broken; no action is needed unless it should include a readable schedule.",
    triggerContext: "Appears when the agenda PDF opens fine but we couldn't find a schedule in it.",
    title: "No agenda schedule found",
    longExplanation:
      "The agenda PDF opened and downloaded fine, but we couldn't find a day-by-day schedule in it, so crew see the embedded agenda document without a structured schedule. This is a safe fallback; no action is needed unless the agenda is supposed to contain a schedule we can read, in which case check its layout.",
    helpHref: "/help/errors#AGENDA_PDF_UNREADABLE",
  },
  AGENDA_SCHEDULE_LOW_CONFIDENCE: {
    code: "AGENDA_SCHEDULE_LOW_CONFIDENCE",
    warningClass: "parse_warning",
    dougFacing:
      "We read _<sheet-name>_'s agenda PDF but weren't confident enough about the times to show a structured schedule, so crew see the agenda document only. No action is needed unless the agenda layout changed recently.",
    crewFacing: null,
    followUp: "Doug → optional check",
    helpfulContext:
      "We read the agenda PDF but weren't sure enough about the session times to publish them, so crew see the document only. Nothing is broken; no action needed unless the agenda layout recently changed.",
    triggerContext: "Appears when the agenda PDF's times are laid out too unusually to trust.",
    title: "Agenda schedule shown as PDF only",
    longExplanation:
      "The agenda PDF was read but the session times weren't confident enough to publish a structured schedule, so crew see the agenda document only. This is a safe fallback and usually needs no action.",
    helpHref: "/help/errors#AGENDA_SCHEDULE_LOW_CONFIDENCE",
  },
  AGENDA_SCHEDULE_TIME_ADJUSTED: {
    code: "AGENDA_SCHEDULE_TIME_ADJUSTED",
    warningClass: "parse_warning",
    dougFacing:
      "We adjusted at least one session time while reading _<sheet-name>_'s agenda PDF (it looked like a typo, such as a morning time written as evening). Crew see the corrected schedule. Double-check the agenda and fix the source if needed.",
    crewFacing: null,
    followUp: "Doug → check agenda",
    helpfulContext:
      "We corrected at least one agenda session time that looked like a typo, like a morning session marked PM. Open the agenda to confirm; if our correction is wrong, update the agenda document.",
    triggerContext: "Appears when an agenda time only makes sense with its AM/PM flipped.",
    title: "Agenda time adjusted",
    longExplanation:
      "At least one agenda session time was auto-corrected because it looked like a typo. Crew see the corrected schedule; confirm it against the agenda and fix the source cell if the original was wrong.",
    helpHref: "/help/errors#AGENDA_SCHEDULE_TIME_ADJUSTED",
  },
  AGENDA_LINK_NOT_CLICKABLE: {
    code: "AGENDA_LINK_NOT_CLICKABLE",
    warningClass: "parse_warning",
    dougFacing:
      "The agenda link on _<sheet-name>_ isn't a link crew can open; it's a file name, note, or other text rather than a working web link or a Drive file. Update the cell to a working link (or a Drive file), or let us know if it keeps happening.",
    crewFacing: null,
    followUp: "Doug → check agenda link",
    helpfulContext:
      "The agenda cell holds text with nothing to open: a file name or a note instead of a working link. Replace it with a real web link or Drive file.",
    triggerContext: "Appears when the agenda cell has no clickable link in it.",
    title: "Agenda link isn't clickable",
    longExplanation:
      "An agenda-link cell held text with no clickable target: a file name, note, or unsupported link type rather than a working web link or Drive file, so crew had nothing to open. Update it to a working link or the Drive file; if it already looks right and this persists, let us know and we'll take a look.",
    helpHref: "/help/errors#AGENDA_LINK_NOT_CLICKABLE",
  },
  PULL_SHEET_AMBIGUOUS_FORMAT: {
    code: "PULL_SHEET_AMBIGUOUS_FORMAT",
    warningClass: "parse_warning",
    dougFacing:
      "_<sheet-name>_'s PULL SHEET has columns we don't recognize, so the block shows as its original text on crew pages. Let us know if you'd like us to handle that format.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "This looks like a PULL SHEET, but its columns aren't laid out the way we expect, so crew see the original text instead of a clean packing list. Let us know if you'd like this layout supported.",
    triggerContext: "Appears when a PULL SHEET tab's columns don't match any layout we know.",
    title: "Pull sheet columns unrecognized",
    longExplanation:
      "This looks like a PULL SHEET, but the columns aren't laid out the way we expect, so crew see the original text instead of a clean packing list. Let us know if you'd like us to support this layout.",
    helpHref: "/help/errors#PULL_SHEET_AMBIGUOUS_FORMAT",
  },
  PULL_SHEET_UNKNOWN_VARIANT: {
    code: "PULL_SHEET_UNKNOWN_VARIANT",
    warningClass: "parse_warning",
    dougFacing:
      "_<sheet-name>_'s PULL SHEET rows are readable, but we couldn't identify the column layout, so we used the usual one. Crew still see the list. Let us know if quantities, item names, or categories look wrong.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "We could read this pull sheet's rows but not which column is which, so we used the standard column order. Check that quantities, item names, and categories landed right.",
    triggerContext:
      "Appears when a pull-sheet's columns don't match any layout we know for certain.",
    title: "Pull sheet layout not detected",
    longExplanation:
      "We could read this case's rows but couldn't identify the column layout, so we used the usual one. Crew still see the list. Let us know if quantities, item names, or categories look wrong.",
    helpHref: "/help/errors#PULL_SHEET_UNKNOWN_VARIANT",
  },
  DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE: {
    code: "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
    warningClass: "parse_warning",
    dougFacing:
      "_<sheet-name>_: an image in the DIAGRAMS tab couldn't be downloaded, so crew see a placeholder where it should be. Re-paste the image, or let us know if this keeps happening.",
    crewFacing: null,
    followUp: "Doug → optionally fix",
    helpfulContext:
      "An image in the DIAGRAMS tab wouldn't download, so crew see a placeholder where it should be. Drive sometimes drops an image's permissions; re-pasting it usually fixes it. Let us know if it keeps happening.",
    title: "Diagram image couldn't load",
    longExplanation:
      "An image in the DIAGRAMS tab wouldn't download, so crew see a placeholder where it should be. Drive sometimes drops an image's permissions; re-pasting it usually fixes it. Let us know if it keeps happening.",
    helpHref: "/help/errors#DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
  },
  DIAGRAMS_EMBEDDED_CAP_EXCEEDED: {
    code: "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
    warningClass: "parse_warning",
    dougFacing: null,
    crewFacing: null,
    followUp: "Doug → optionally trim",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  DIAGRAMS_TAB_MISSING: {
    code: "DIAGRAMS_TAB_MISSING",
    warningClass: "parse_warning",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  DIAGRAMS_EMBEDDED_NONE_FOUND: {
    code: "DIAGRAMS_EMBEDDED_NONE_FOUND",
    warningClass: "parse_warning",
    dougFacing:
      '(first-seen) "_<sheet-name>_ looks like it should have diagrams but we didn\'t find any images. Confirm before we publish, or paste in the images and re-sync." (existing show with prior gallery) "_<sheet-name>_\'s DIAGRAMS tab returned no images this sync. Confirm before we replace the existing gallery with an empty one, or paste in the images and re-sync."',
    crewFacing: null,
    followUp: "Doug → confirm or add images",
    helpfulContext:
      "This sheet's DIAGRAMS tab is set up for pasted-in images, but we didn't find any (and no image-folder link was given). For a new show we'd rather check with you than publish an empty gallery; for an existing show, crew keep seeing the last set.",
    title: "No images in the DIAGRAMS tab",
    longExplanation:
      "This sheet's DIAGRAMS tab is set up for pasted-in images, but we didn't find any (and no image-folder link was given). For a new show we'd rather check with you than publish an empty gallery; for an existing show, crew keep seeing the last set.",
    helpHref: "/help/errors#DIAGRAMS_EMBEDDED_NONE_FOUND",
  },
  // Admin-log-only, and it STAYS that way: dougFacing/crewFacing/longExplanation/helpHref
  // remain null and no /help/errors row appears. It renders on an operator note card through
  // the CARD_SURFACED_LOG_ONLY carve-out, which is what requires title + helpfulContext.
  //
  // The copy claims RECOGNITION and nothing else, because that is all the parser does. Not
  // "shows on the crew page" (the row's value is stored nowhere), not "correct the spelling"
  // (that directs a sheet edit, which is the registry's own criterion for `actionable`, and
  // this code is not-actionable), not "we read the row" (the value is stored nowhere), and
  // not "misspelled" (TYPO_ALIASES holds "diagrams" and resolveAliasFull lowercases, so the
  // correct spelling `Diagrams` emits this too). Four drafts were wrong in those four ways
  // and every one cleared the banned-vocabulary regex and the caps.
  TYPO_NORMALIZED: {
    code: "TYPO_NORMALIZED",
    warningClass: "parse_warning",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "A row's label in your sheet matched one of the alternate spellings we keep for a field, so it wasn't listed as a row we didn't recognize. This is a record for us; there is nothing for you to fix.",
    triggerContext:
      "Appears when a row's label matches one of the alternate spellings we keep for a field.",
    title: "Label we matched to a known field",
    longExplanation: null,
    helpHref: null,
  },
  // D1 (admin-log-only): a recognized section header parsed zero fields. The
  // operator-facing copy is the inline ParseWarning.message; this catalog row
  // exists only to satisfy the §12.4 / x1 orphan-code structural guard (every
  // active-style `code: "..."` literal must be registered), so all fields are null.
  SECTION_HEADER_NO_FIELDS: {
    code: "SECTION_HEADER_NO_FIELDS",
    warningClass: "parse_warning",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "A section header in your sheet has no readable rows under it, so that section is missing from the crew page. Add the rows back, or delete the leftover header.",
    triggerContext: "Appears when a section header has no usable rows beneath it.",
    title: "Section with nothing under it",
    longExplanation: null,
    helpHref: null,
  },
  // Data-quality warnings (parse-data-quality-warnings, admin-log-only): the
  // operator-facing copy is each inline ParseWarning.message; these catalog rows
  // exist only to satisfy the §12.4 / x1 orphan-code structural guard (every
  // active-style `code: "..."` literal must be registered), so all fields are null.
  FIELD_UNREADABLE: {
    code: "FIELD_UNREADABLE",
    warningClass: "parse_warning",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "A crew phone or email in your sheet couldn't work as one (a phone with no digits, or an email without an @), so that link is left off the crew page. Fix the cell in the sheet.",
    triggerContext:
      "Appears when a crew phone or email cell can't work as a real phone number or email address.",
    title: "Phone or email we couldn't use",
    longExplanation: null,
    helpHref: null,
  },
  UNKNOWN_SECTION_HEADER: {
    code: "UNKNOWN_SECTION_HEADER",
    warningClass: "parse_warning",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "A header in your sheet isn't a section we know, so the rows under it aren't shown on the crew page. Rename it to a standard section.",
    controlsNote: "Use Report if this section should be supported.",
    triggerContext: "Appears when a header row doesn't match any section we know.",
    title: "Section we didn't recognize",
    longExplanation: null,
    helpHref: null,
  },
  BLOCK_DISAPPEARED: {
    code: "BLOCK_DISAPPEARED",
    warningClass: "parse_warning",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  UNEXPECTED_PARENT: {
    code: "UNEXPECTED_PARENT",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  MISSING_REVIEWER_CHOICE: {
    code: "MISSING_REVIEWER_CHOICE",
    warningClass: "general",
    dougFacing:
      "We need your decision for every item. Looks like one was skipped. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "When you Apply a sheet, every triggered review item needs your decision. Your submission was missing a decision for at least one item, usually because the form's state got out of sync with the items the server was tracking. Refresh the admin page (the panel will re-render with the current items) and re-submit your decisions.",
    title: "A review item was skipped",
    longExplanation:
      "Every triggered review item needs a decision before Apply can run. Your submission was missing one. This usually means the form fell out of sync with what the server was tracking. Refresh the admin page so the panel re-renders against the current items, then submit your decisions again.",
    helpHref: "/help/errors#MISSING_REVIEWER_CHOICE",
  },
  EXTRA_REVIEWER_CHOICE: {
    code: "EXTRA_REVIEWER_CHOICE",
    warningClass: "general",
    dougFacing:
      "Something doesn't match between what you reviewed and what we have on file. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Your Apply submission carried a decision for an item the server isn't tracking, usually because the staged parse you were viewing was replaced between when the page loaded and when you clicked Apply. Refresh the admin page so the panel re-renders against the current staged parse, then re-submit your decisions.",
    title: "Apply submission has unknown item",
    longExplanation:
      "Your Apply submission carried a decision for an item the server isn't tracking. This usually happens when the staged parse you were viewing was replaced between when the page loaded and when you clicked Apply. Refresh the admin page and re-submit your decisions.",
    helpHref: "/help/errors#EXTRA_REVIEWER_CHOICE",
  },
  DUPLICATE_REVIEWER_CHOICE: {
    code: "DUPLICATE_REVIEWER_CHOICE",
    warningClass: "general",
    dougFacing: "We got the same decision twice for one item. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Your Apply submission carried two decisions for the same item id. The form should normally prevent this; you've reached this code via a stale or duplicated form state. Refresh the admin page and re-submit your decisions cleanly.",
    title: "Apply submission has duplicate decision",
    longExplanation:
      "Your Apply submission carried two decisions for the same item. The form should normally prevent this; you've reached this code via a stale or duplicated form state. Refresh the admin page and re-submit cleanly.",
    helpHref: "/help/errors#DUPLICATE_REVIEWER_CHOICE",
  },
  INVALID_REVIEWER_ACTION: {
    code: "INVALID_REVIEWER_ACTION",
    warningClass: "general",
    dougFacing: "That action isn't valid for this item. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Each review item has a fixed list of valid decisions (apply / reject / rename / independent, depending on the item's invariant). Your submission carried an action value that isn't in the allowed list for one of the items, usually because the form was hand-edited or the page is running a stale build. Refresh the admin page and re-submit using the form controls.",
    title: "Invalid review action",
    longExplanation:
      "Each review item has a fixed list of valid decisions (apply / reject / rename / independent, depending on the item). Your submission carried an action that isn't in the allowed list. Refresh the admin page and re-submit using the form controls.",
    helpHref: "/help/errors#INVALID_REVIEWER_ACTION",
  },
  REPORT_RATE_LIMITED_ADMIN: {
    code: "REPORT_RATE_LIMITED_ADMIN",
    warningClass: "general",
    dougFacing:
      "You've reported a lot already this hour. Give the developer a beat to catch up. Try again in a little while, or message Eric directly.",
    crewFacing: null,
    followUp: "Doug → wait or message",
    helpfulContext:
      "To keep the developer's inbox under control, the admin report endpoint is capped at 10 reports per hour. The window resets on a rolling basis. Wait the indicated time, or message Eric directly if it's urgent.",
    title: "Bug-report rate limit reached",
    longExplanation:
      "To keep the developer's inbox under control, the admin report endpoint is capped at 10 reports per hour on a rolling window. Wait the indicated time, or message Eric directly if it's urgent.",
    helpHref: "/help/errors#REPORT_RATE_LIMITED_ADMIN",
  },
  REPORT_RATE_LIMITED_CREW: {
    code: "REPORT_RATE_LIMITED_CREW",
    warningClass: "general",
    dougFacing: null,
    crewFacing:
      "We've got your report and we're looking into it. Text Doug directly with show-content questions.",
    followUp: "Crew → wait or text Doug",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  ONBOARDING_FOLDER_INVALID_URL: {
    code: "ONBOARDING_FOLDER_INVALID_URL",
    warningClass: "general",
    dougFacing:
      "That doesn't look like a Google Drive folder URL. It should look like `https://drive.google.com/drive/folders/...`.",
    crewFacing: null,
    followUp: "Doug → re-paste URL",
    helpfulContext:
      "The setup wizard expects a Google Drive folder URL like `https://drive.google.com/drive/folders/<id>` or `https://drive.google.com/drive/u/0/folders/<id>`. Either the URL you pasted isn't a folder URL, or it's malformed. Open the folder in Drive, copy the URL from the address bar, and paste it again.",
    title: "Folder URL not recognized",
    longExplanation:
      "The setup wizard expects a Google Drive folder URL like 'https://drive.google.com/drive/folders/<id>'. Either the URL you pasted isn't a folder URL, or it's malformed. Open the folder in Drive, copy the URL from the address bar, and paste it again.",
    helpHref: "/help/errors#ONBOARDING_FOLDER_INVALID_URL",
  },
  ONBOARDING_FOLDER_NOT_SHARED: {
    code: "ONBOARDING_FOLDER_NOT_SHARED",
    warningClass: "general",
    dougFacing:
      "We can't see this folder yet. Double-check that you shared it with `<service-account-email>` and try again.",
    crewFacing: null,
    followUp: "Doug → fix Drive share",
    helpfulContext:
      "We tried to read your folder using the service account but Drive returned an access-denied response. Open the folder's share dialog and add the service-account email shown in the wizard. Once it's shared, click 'Try again'.",
    title: "Folder not shared with sync account",
    longExplanation:
      "We tried to read your folder using the service account but Drive returned access-denied. Open the folder's share dialog, add the service-account email shown in the wizard, then click 'Try again'.",
    helpHref: "/help/errors#ONBOARDING_FOLDER_NOT_SHARED",
  },
  ONBOARDING_FOLDER_VERIFY_UNAVAILABLE: {
    code: "ONBOARDING_FOLDER_VERIFY_UNAVAILABLE",
    warningClass: "general",
    dougFacing:
      "Google Drive didn't respond while we checked the folder. Nothing was scanned. Wait a moment and try again.",
    crewFacing: null,
    followUp: "Doug → retry in a moment",
    helpfulContext:
      "Before scanning, the wizard asks Google Drive to confirm the folder exists and is really a folder. Drive did not answer within the time limit, so the check was abandoned before any scanning started. Nothing was changed. This is usually a temporary Drive or network hiccup; wait a moment and click Verify again.",
    title: "Google Drive didn't respond",
    longExplanation:
      "The pre-scan folder check timed out reaching Google Drive. Nothing was scanned and nothing was changed. Wait a moment and click Verify again; if it keeps happening, Drive may be having an outage.",
    helpHref: "/help/errors#ONBOARDING_FOLDER_VERIFY_UNAVAILABLE",
  },
  ONBOARDING_OPERATOR_ERROR: {
    code: "ONBOARDING_OPERATOR_ERROR",
    warningClass: "general",
    dougFacing: "Something is wrong on our end. The developer has been notified.",
    crewFacing: null,
    followUp: "Doug → wait; Eric → fix",
    helpfulContext:
      "Something on our end (not your sheet, not your folder) failed during the wizard. The developer has been notified and will fix the underlying issue. Try again in a few minutes; if it persists, message Eric.",
    title: "Setup hit an internal error",
    longExplanation:
      "Something on our end (not your sheet, not your folder) failed during the wizard. The developer has been notified and will fix the underlying issue. Try again in a few minutes.",
    helpHref: "/help/errors#ONBOARDING_OPERATOR_ERROR",
  },
  ONBOARDING_LEGACY_ROW_AMBIGUOUS: {
    code: "ONBOARDING_LEGACY_ROW_AMBIGUOUS",
    warningClass: "general",
    dougFacing:
      "Some sheets were set up by an older version of setup, and we can't safely finish publishing them automatically. Run setup again so those sheets are re-checked, or contact the developer.",
    crewFacing: null,
    followUp: "Doug → re-run setup; Eric if it persists",
    helpfulContext:
      "A previous setup run staged these sheets with an older version of the app that didn't record which setup created them, so we can't safely tell which pages to publish. Run setup again from the start; the wizard will re-scan your folder and re-stage those sheets, or contact the developer if this keeps happening.",
    title: "Sheets from an older setup run",
    longExplanation:
      "A previous setup run staged these sheets with an older version of the app that didn't record which setup created them, so we can't safely tell which pages to publish. Run setup again from the start; the wizard will re-scan your folder and re-stage those sheets. If this keeps happening, contact the developer.",
    helpHref: "/help/errors#ONBOARDING_LEGACY_ROW_AMBIGUOUS",
  },
  ONBOARDING_NOT_RESOLVED: {
    code: "ONBOARDING_NOT_RESOLVED",
    warningClass: "general",
    dougFacing:
      "Some sheets in your folder still need review before we can finish setup. Resolve them and try again.",
    crewFacing: null,
    followUp: "Doug → resolve remaining sheets, retry finalize",
    helpfulContext:
      "Some sheets in your folder still need review before setup can finish. Open each unresolved sheet in the wizard, decide what to do with it (approve, defer, ignore), then click finalize again.",
    title: "Unresolved sheets in setup",
    longExplanation:
      "Some sheets in your folder still need review before setup can finish. Open each unresolved sheet in the wizard, decide what to do with it (approve, defer, ignore), then click Finalize again.",
    helpHref: "/help/errors#ONBOARDING_NOT_RESOLVED",
  },
  FINALIZE_OWNED_SHOW: {
    code: "FINALIZE_OWNED_SHOW",
    warningClass: "general",
    dougFacing:
      "This show is busy with a setup-wizard publish or a staged-changes finalize. Wait for it to finish, then try again.",
    crewFacing: null,
    followUp: "Doug \u2192 wait for the finalize to complete",
    helpfulContext:
      "This show is owned by an in-flight finalize: either a setup wizard publishing it for the first time, or a staged-changes finalize applying updates to the live show. Until that finalize commits, admin write actions (Re-sync from Drive, Apply/Discard staged changes, publish/unpublish, and similar gated actions) are blocked to prevent races against the in-flight work. Wait for it to finish; the moment the finalize commits, this action will succeed.",
    title: "Show busy with an in-flight finalize",
    longExplanation:
      "This show is owned by an in-flight finalize: a setup wizard publishing it, or a staged-changes finalize updating it. Admin write actions on it are gated until that finalize commits, to prevent races. Wait for it to finish, then retry.",
    helpHref: "/help/errors#FINALIZE_OWNED_SHOW",
  },
  SHOW_ARCHIVED_BY_ADMIN: {
    code: "SHOW_ARCHIVED_BY_ADMIN",
    warningClass: "general",
    severity: "info",
    dougFacing: "Archived. Crew links are dead until you re-publish and issue a new link.",
    crewFacing: null,
    followUp: "Doug → re-publish + issue new link when ready",
    helpfulContext:
      "Archiving a show takes it off the air immediately: the existing crew share link stops resolving (we rotate the share token), and the show moves to the Archived bucket. Crew can no longer reach the page. When you're ready to bring it back, unarchive it, re-publish, and issue a fresh crew link; the old link will never work again.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_UNARCHIVED: {
    code: "SHOW_UNARCHIVED",
    warningClass: "general",
    severity: "info",
    dougFacing: "Unarchived. The show is held (not published). Publish it to go live again.",
    crewFacing: null,
    followUp: "Doug → publish to go live",
    helpfulContext:
      "Unarchiving brings a show back from the Archived bucket into a held (not-yet-published) state and runs a catch-up sync against the current sheet. It is not live yet; crew still can't reach it. Review anything the catch-up sync staged, then publish to make it live again and issue a new crew link.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_PUBLISHED_BY_ADMIN: {
    code: "SHOW_PUBLISHED_BY_ADMIN",
    warningClass: "general",
    severity: "info",
    dougFacing: "Published. Issue a crew link to give your crew access.",
    crewFacing: null,
    followUp: "Doug → issue crew link",
    helpfulContext:
      "Publishing makes a held show live. The crew page will resolve once you issue a crew link; publishing alone doesn't hand anyone a URL. Use 'Issue crew link' to generate the share link to send your crew.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_ARCHIVED_IMMUTABLE: {
    code: "SHOW_ARCHIVED_IMMUTABLE",
    warningClass: "general",
    dougFacing: "This show is archived. Unarchive it before making changes.",
    crewFacing: null,
    followUp: "Doug → unarchive first",
    helpfulContext:
      "Archived shows are frozen: re-syncs, applies, discards, token rotation, and similar write actions are blocked so an archived show can't be changed underneath you. If you need to make a change, unarchive the show first; it returns in a held state where you can re-sync and review before publishing.",
    title: "Show is archived",
    longExplanation:
      "Archived shows are frozen: re-syncs, applies, discards, and token rotation are blocked so an archived show can't change underneath you. Unarchive it first; it returns in a held (not-published) state where you can re-sync and review before publishing again.",
    helpHref: "/help/errors#SHOW_ARCHIVED_IMMUTABLE",
  },
  PUBLISH_BLOCKED_PENDING_REVIEW: {
    code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    warningClass: "general",
    dougFacing:
      "This show has changes from its sheet that haven't been synced or reviewed yet. Re-sync, clear anything pending, then publish.",
    crewFacing: null,
    followUp: "Doug → re-sync + clear, then publish",
    helpfulContext:
      "We can't publish this show until it's fully caught up with its sheet: it has unsynced changes, a staged edit waiting in the inbox, or an update that's being held. Re-sync the show from Drive and clear whatever is pending (apply or discard the staged change, resolve the review), then publish.",
    title: "Can't publish yet: not fully synced",
    longExplanation:
      "Publishing is blocked until the show is fully caught up with its sheet: there are unsynced changes, a staged edit waiting in the inbox, or an update that's being held. Re-sync from Drive and clear whatever is pending (apply or discard the staged change, resolve the review), then publish.",
    helpHref: "/help/errors#PUBLISH_BLOCKED_PENDING_REVIEW",
  },
  SHOW_AWAITING_PUBLISH_APPROVAL: {
    code: "SHOW_AWAITING_PUBLISH_APPROVAL",
    warningClass: "general",
    severity: "info",
    dougFacing: "A new show parsed cleanly and is waiting for your approval to publish.",
    crewFacing: null,
    followUp: "Doug → review + publish",
    helpfulContext:
      "Auto-publish for clean new shows is turned off, so this newly-seen sheet parsed cleanly but is waiting for you to approve it before it goes live. Review it in the inbox and publish when you're ready, or flip Published on from the show's page. Turn auto-publish back on in Settings if you'd rather clean new shows go live automatically.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  WIZARD_FINALIZE_CHECKPOINT_MISSING: {
    code: "WIZARD_FINALIZE_CHECKPOINT_MISSING",
    warningClass: "general",
    dougFacing:
      "Setup isn't ready to publish yet. Click 'Promote next batch' until all sheets are processed, then publish.",
    crewFacing: null,
    followUp: "Doug → continue clicking 'Promote next batch'",
    helpfulContext:
      "Setup's final-publish step was invoked before all sheets in the candidate folder finished publishing. The wizard UI normally auto-fires the next 'Promote next batch' click until the response indicates all batches are complete; this error means either the UI hadn't reached that state OR the operator manually invoked the final-publish endpoint. Continue clicking 'Promote next batch' in the wizard until the progress indicator says 'All sheets published'; the final-publish step will fire automatically at that point.",
    title: "Setup not yet ready to publish",
    longExplanation:
      "Setup's final-publish step was invoked before all sheets in the candidate folder finished publishing. Click 'Promote next batch' in the wizard until the progress indicator says 'All sheets published'; the final-publish step will fire automatically at that point.",
    helpHref: "/help/errors#WIZARD_FINALIZE_CHECKPOINT_MISSING",
  },
  WIZARD_FINALIZE_UNRESOLVED_ROWS: {
    code: "WIZARD_FINALIZE_UNRESOLVED_ROWS",
    warningClass: "general",
    dougFacing:
      "Some sheets still need review before we can finish setup. Resolve the rows highlighted on the wizard screen, then click 'Publish' again.",
    crewFacing: null,
    followUp: "Doug → re-Apply or re-Discard the unresolved rows",
    helpfulContext:
      "Setup cannot publish while the scan manifest still has unresolved rows. Resolve each staged, hard-failed, discard-retryable, or live-row-conflict item in the wizard, then click Publish again.",
    title: "Setup has unresolved rows",
    longExplanation:
      "Setup cannot publish while the scan manifest still has unresolved rows. Resolve each staged, hard-failed, discard-retryable, or live-row-conflict item highlighted on the wizard screen, then click Publish again.",
    helpHref: "/help/errors#WIZARD_FINALIZE_UNRESOLVED_ROWS",
  },
  BOOTSTRAP_GENERIC: {
    code: "BOOTSTRAP_GENERIC",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Couldn't load the show. Refresh the page, or try signing in.",
    followUp: "Crew → try `/auth/sign-in`",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  NETWORK_UNREACHABLE: {
    code: "NETWORK_UNREACHABLE",
    warningClass: "general",
    dougFacing:
      "Couldn't reach the server. Check your connection and try again; there's no admin trail because the request never arrived.",
    crewFacing: "Couldn't reach the server. Check your connection and try again.",
    followUp: "Either → check connection, retry; persistent → Eric",
    helpfulContext:
      "The client-side fetch failed before reaching the server, typically the user's device is offline, DNS is failing, a captive portal is blocking the request, or a browser extension is intercepting the call. Because the request never arrived, no §A code was emitted and no admin trail exists; the only signal is the user-facing one. Recovery is the same regardless of audience: check connectivity and retry. If this code recurs against a known-online network, suspect a same-origin browser extension or a CSP block.",
    title: "Couldn't reach the server",
    longExplanation:
      "The browser couldn't reach the server. Typically this means the device is offline, DNS is failing, a captive portal is blocking the request, or a browser extension is intercepting the call. Check connectivity and retry; the request never arrived, so there's no admin trail either.",
    helpHref: "/help/errors#NETWORK_UNREACHABLE",
  },
  WIZARD_SESSION_SUPERSEDED_DURING_SCAN: {
    code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: "Doug → use the active wizard tab",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  LIVE_ROW_CONFLICT: {
    code: "LIVE_ROW_CONFLICT",
    warningClass: "general",
    resolution: "manual",
    audience: "doug",
    dougFacing:
      "<sheet-name> is already being processed by the live folder sync, so setup skipped it. Resolve it from the dashboard, then re-run setup if needed.",
    crewFacing: null,
    followUp: "Doug → resolve live row from dashboard, then re-run setup",
    helpfulContext:
      "Setup stepped aside so it wouldn't clobber the live version already in flight. Apply or Discard that row from the dashboard, then re-run setup if you still need to.",
    title: "Live sync owns this sheet",
    longExplanation:
      "This appears when setup tries to stage a parse for a sheet that the live folder sync is already processing. To avoid clobbering the live row, the wizard's stage is skipped. Resolve the live row from the dashboard: either Apply or Discard it, then re-run setup if you still need to.",
    helpHref: "/help/errors#LIVE_ROW_CONFLICT",
  },
  ONBOARDING_SCAN_FAILED: {
    code: "ONBOARDING_SCAN_FAILED",
    warningClass: "general",
    dougFacing:
      "The folder scan hit a problem partway through and couldn't finish. Run the scan again from this step; if it keeps failing, text Eric.",
    crewFacing: null,
    followUp: "Doug → run the scan again; Eric → check the scan log by requestId if it recurs",
    helpfulContext:
      "Usually a temporary problem reading the folder from Google Drive. Anything the failed run already staged is re-checked and replaced when you run the scan again, and nothing reaches any crew page until setup completes.",
    title: "The folder scan stopped partway",
    longExplanation:
      "This appears when the setup scan of your Drive folder stops on an unexpected error before finishing, most often a temporary Google Drive problem while listing the folder or reading a sheet. Anything the failed run already staged is re-checked and replaced by the next run, and nothing reaches any crew page until setup completes. Run the scan again from the same step; if it fails repeatedly, text Eric so he can check the scan log for this run.",
    helpHref: "/help/errors#ONBOARDING_SCAN_FAILED",
  },
  ONBOARDING_SHEET_UNREADABLE: {
    code: "ONBOARDING_SHEET_UNREADABLE",
    warningClass: "general",
    resolution: "manual",
    audience: "doug",
    dougFacing:
      "Some sheets in your show folder couldn't be read and were skipped: <failed-sheet-names>. Fix or remove them in Drive and this clears on its own; you can also dismiss it now.",
    crewFacing: null,
    followUp:
      "Doug → fix or remove the named sheets in Drive (live sync picks them up), or Settings → Re-run setup for the guided path; alert self-clears either way",
    helpfulContext:
      "These files never reach any crew page, so nothing is exposed. The usual cause is a missing or renamed section header; fix or remove them in Drive and the next sync clears this, or dismiss it now if they're meant to be skipped.",
    title: "Some sheets couldn't be read",
    longExplanation:
      "This appears when a setup scan of your Drive show folder finds one or more files it can't read as a show sheet, so it skips them; they're never staged and never appear on any crew page. The alert names the first few affected sheets. The usual fix is correcting the sheet's layout in Drive, most often a missing or renamed section header, or removing the file from the folder entirely; the next live sync notices the fix on its own and the alert clears automatically. Re-running setup from Settings also works and walks through a guided list. You can dismiss this alert at any time without fixing anything.",
    helpHref: "/help/errors#ONBOARDING_SHEET_UNREADABLE",
  },
  WIZARD_ISOLATION_INDEXES_MISSING: {
    code: "WIZARD_ISOLATION_INDEXES_MISSING",
    warningClass: "general",
    dougFacing:
      "We can't safely scan your folder right now; a recent database update hasn't been applied yet. Eric has been notified; setup will be available again in a few minutes.",
    crewFacing: null,
    followUp: "Eric → apply migration; Doug → retry wizard once migration completes",
    helpfulContext:
      "The setup wizard scans your folder by writing per-session staging rows into the same tables the live sync writes to (pending_syncs, pending_ingestions, onboarding_scan_manifest). To keep wizard rows from colliding with live rows, the database has four partial unique indexes that route writes to the right slot. The scan checks for those indexes before writing anything; if any are missing, the wizard aborts cleanly rather than risk a partial scan against a half-migrated schema. Eric is automatically notified to apply the migration; once that's done, click Re-run Setup to retry.",
    title: "Database not ready for setup",
    longExplanation:
      "The setup wizard scans your folder by writing per-session staging rows that depend on partial unique indexes to keep wizard rows from colliding with live rows. One of those indexes is missing, so the wizard aborts cleanly rather than risk a partial scan. Eric is automatically notified; click Re-run Setup once the migration is applied.",
    helpHref: "/help/errors#WIZARD_ISOLATION_INDEXES_MISSING",
  },
  PENDING_SNAPSHOT_PROMOTE_STUCK: {
    code: "PENDING_SNAPSHOT_PROMOTE_STUCK",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A behind-the-scenes diagram update is taking longer than expected to finish. The developer can clear it; your published shows are unaffected.",
    dougFacing:
      "A diagram snapshot promotion for <show-name> has been stuck for more than 15 minutes. Eric needs to run the snapshot-promote repair tool before cleanup can finish.",
    crewFacing: null,
    followUp: "Eric → run snapshot-promote-repair admin tool",
    helpfulContext:
      "It's stuck in the non-reclaimable promote-started state, so cleanup can't reclaim the prefix. The snapshot-promote repair tool reconciles the temp and canonical prefixes to finish it.",
    title: "Snapshot promotion stuck",
    longExplanation:
      "A diagram snapshot promotion has been in the non-reclaimable promote-started state for more than 15 minutes. Eric needs to reconcile the temp and canonical prefixes before cleanup can continue.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_PROMOTE_STUCK",
  },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: {
    code: "PENDING_SNAPSHOT_ROLLBACK_STUCK",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A diagram change is waiting to roll back cleanly. The developer handles this; your live shows keep working.",
    dougFacing:
      "A diagram snapshot rollback for <sheet-name> stalled after moving some assets. Eric needs to run the snapshot-rollback repair tool before cleanup can finish.",
    crewFacing: null,
    followUp: "Eric → run snapshot-rollback-repair admin tool",
    helpfulContext:
      "Assets are split across the temp and canonical prefixes after a half-finished rollback. The snapshot-rollback repair tool reconciles both and completes it so cleanup can continue.",
    title: "Snapshot rollback stalled",
    longExplanation:
      "A diagram snapshot rollback failed midway, leaving assets split across temp and canonical prefixes. Eric needs to reconcile both prefixes and finish the rollback before cleanup can continue.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_ROLLBACK_STUCK",
  },
  BRANCH_PROTECTION_DRIFT: {
    code: "BRANCH_PROTECTION_DRIFT",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A developer safety setting drifted from its expected value. This is a code-side check the developer will restore.",
    dougFacing:
      "Branch protection on <repo> no longer matches the X.6 contract. Restore the required checks and review settings before merging.",
    crewFacing: null,
    followUp: "Eric → restore branch protection per X.6 contract",
    helpfulContext:
      "Something drifted: a required check, a review requirement, admin enforcement, or a push or deletion restriction. Restore the settings so no PR can merge without the full audit suite.",
    title: "Branch protection drift",
    longExplanation:
      "The branch-protection monitor found that the main-branch protection no longer matches the X.6 contract: a required check is missing, reviews are not required, stale reviews are not dismissed, admin enforcement is off, or force pushes / deletions are allowed. Restore the settings so pull requests cannot merge without the full audit suite.",
    helpHref: "/help/errors#BRANCH_PROTECTION_DRIFT",
  },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: {
    code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "The tool that watches developer safety settings couldn't sign in. The developer will reconnect it.",
    dougFacing:
      "Branch-protection monitoring for <repo> cannot authenticate with GitHub. Rotate the GH App token or PAT within 24 hours.",
    crewFacing: null,
    followUp: "Eric → rotate GH App / PAT within 24h",
    helpfulContext:
      "Without auth the monitor can't prove the merge gate is still enforced, so drift would go unseen. Rotate the GitHub App token or fallback PAT within 24 hours and confirm the job succeeds.",
    title: "Branch-protection monitor can't auth",
    longExplanation:
      "The privileged branch-protection monitor could not authenticate to GitHub, so it cannot prove the merge gate is still enforcing the required checks. Rotate the GitHub App token or fallback PAT and confirm the scheduled job succeeds again.",
    helpHref: "/help/errors#BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
  },
  PENDING_INGESTION_NOT_FOUND: {
    code: "PENDING_INGESTION_NOT_FOUND",
    warningClass: "general",
    dougFacing:
      "We couldn't find that pending sheet anymore; it was probably resolved by another tab or browser. Refresh the dashboard to see the latest state.",
    crewFacing: null,
    followUp: "Doug → refresh dashboard",
    helpfulContext:
      "The dashboard's pending-sheet panel renders rows by id. When you clicked Retry or Discard, the server looked up that id and didn't find a row; it had already been resolved (probably from another browser tab) between the time the panel rendered and your click. Refresh the dashboard to load the current state, then act on whatever's still pending.",
    title: "Pending sheet already resolved",
    longExplanation:
      "When you clicked Retry or Discard, the server looked up the pending sheet by id and didn't find a row; it had already been resolved, probably from another browser tab. Refresh the dashboard to load the current state.",
    helpHref: "/help/errors#PENDING_INGESTION_NOT_FOUND",
  },
  STAGED_REVIEW_ITEMS_CORRUPT: {
    code: "STAGED_REVIEW_ITEMS_CORRUPT",
    warningClass: "general",
    dougFacing:
      "This staged sheet's review checklist is corrupted, so it can't be applied safely. Discard it and re-sync the sheet to rebuild a clean review. If this keeps blocking the final publish step of setup, contact the developer to clear it.",
    crewFacing: null,
    followUp: "Doug → discard + re-sync the sheet",
    helpfulContext:
      "The saved list of changes that need your review for this staged sheet is stored in a format we can't read; it should be a list of review items but isn't. Rather than risk applying changes you never got to see, we block Apply and ask you to discard the row and re-sync the sheet; the next sync rebuilds a clean review checklist. This usually only affects rows left over from an earlier app issue.",
    title: "Staged review checklist corrupted",
    longExplanation:
      "The stored triggered_review_items for this staged sheet is not a readable list of review items, so we can't tell which changes need your review. Apply is blocked to avoid applying unreviewed changes. Discard the row and re-sync the sheet to rebuild a clean review checklist.",
    helpHref: "/help/errors#STAGED_REVIEW_ITEMS_CORRUPT",
  },
  STAGED_PARSE_RESULT_CORRUPT: {
    code: "STAGED_PARSE_RESULT_CORRUPT",
    warningClass: "general",
    dougFacing:
      "This staged sheet's saved data is corrupted, so it can't be applied safely. Discard it and re-sync the sheet to rebuild it. If this keeps blocking the final publish step of setup, contact the developer to clear it.",
    crewFacing: null,
    followUp: "Doug → discard + re-sync the sheet",
    helpfulContext:
      "The saved data for this staged sheet is stored in a format we can't read; it should be the parsed sheet but isn't. Rather than apply something we can't interpret, we block Apply and ask you to discard the row and re-sync the sheet; the next sync rebuilds it cleanly. This usually only affects rows left over from an earlier app issue.",
    title: "Staged sheet data corrupted",
    longExplanation:
      "The stored parse_result for this staged sheet could not be coerced to a usable parsed-sheet object at the Apply read boundary, so Apply is blocked rather than dereferencing a corrupt value. Discard the row and re-sync the sheet to rebuild it.",
    helpHref: "/help/errors#STAGED_PARSE_RESULT_CORRUPT",
  },
  LIVE_ROW_REQUIRED: {
    code: "LIVE_ROW_REQUIRED",
    warningClass: "general",
    dougFacing:
      "That sheet belongs to an in-progress setup wizard. Open the wizard in this browser to act on it, or use the dashboard once setup is finished.",
    crewFacing: null,
    followUp: "Doug → use the wizard tab, or wait for setup to finish",
    helpfulContext:
      "There are two flavors of pending-sheet rows: live rows (managed from the post-onboarding dashboard's Sheets-we-couldn't-auto-apply panel) and wizard-staged rows (managed inside the setup wizard). The Retry / Discard endpoints behind the post-onboarding panel act only on live rows; you reached this code by acting on a wizard-staged row from a stale post-onboarding view. The wizard owns its own action surface; open the wizard tab to act on those rows, or wait until setup finishes (which converts the wizard rows into live rows).",
    title: "Wizard-staged row, not a live row",
    longExplanation:
      "There are two flavors of pending-sheet rows: live rows managed from the post-onboarding Sheets-we-couldn't-auto-apply panel, and wizard-staged rows managed inside the setup wizard. The post-onboarding Retry / Discard endpoints act only on live rows; open the wizard tab to act on the wizard-staged rows, or wait until setup finishes.",
    helpHref: "/help/errors#LIVE_ROW_REQUIRED",
  },
  MISSING_PENDING_INGESTION_MODTIME: {
    code: "MISSING_PENDING_INGESTION_MODTIME",
    warningClass: "general",
    dougFacing:
      "Something is wrong on our end with this sheet's tracking data; we can't safely defer it without a watermark. The developer has been notified. Try 'Permanently ignore' if you want to dismiss this row.",
    crewFacing: null,
    followUp: "Eric → investigate; Doug → use Permanently ignore as workaround",
    helpfulContext:
      "Defer-until-modified needs to know the file's current `modifiedTime` so Auto sync knows when to resume processing. Every place that creates a pending-sheet row (Phase 1 hard-fails, Drive-fetch failures, retry handlers) populates this column. If you're seeing this code, something we wrote produced a row without it; the developer has been notified. As a workaround you can use Permanently ignore (which doesn't need the watermark).",
    title: "Tracking watermark missing",
    longExplanation:
      "Defer-until-modified needs the file's current modified time so Auto sync knows when to resume processing. This pending row was created without one, because something we wrote produced a bad row. The developer has been notified. You can use 'Permanently ignore' to dismiss the row.",
    helpHref: "/help/errors#MISSING_PENDING_INGESTION_MODTIME",
  },
  PENDING_INGESTION_TRANSITIONED: {
    code: "PENDING_INGESTION_TRANSITIONED",
    warningClass: "general",
    dougFacing:
      "Another browser tab acted on this sheet a moment before you. Refresh the dashboard to see the latest state.",
    crewFacing: null,
    followUp: "Doug → refresh dashboard",
    helpfulContext:
      "While you were clicking, another browser tab acted on the same sheet and finished its action a fraction of a second before yours. To prevent your click from writing on top of someone else's resolution, the server stopped before doing anything. Refresh the dashboard to see the latest state and act if anything still needs attention.",
    title: "Another tab acted first",
    longExplanation:
      "While you were clicking, another browser tab acted on the same sheet and finished a fraction of a second before yours. The server stopped before doing anything to prevent your click from writing on top of the other resolution. Refresh the dashboard to see the latest state.",
    helpHref: "/help/errors#PENDING_INGESTION_TRANSITIONED",
  },
  LOCK_OWNERSHIP_ASSERTION_FAILED: {
    code: "LOCK_OWNERSHIP_ASSERTION_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric → investigate",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  ADMIN_ALERT_NOT_FOUND: {
    code: "ADMIN_ALERT_NOT_FOUND",
    warningClass: "general",
    dougFacing:
      "We couldn't find that alert anymore. It may have been resolved already. Refresh the page to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh page",
    helpfulContext:
      "When you tried to resolve that alert, the server looked it up by id and either didn't find it (already resolved + cleaned up, or never existed) or it belongs to a different show than the page you clicked from. Refresh the dashboard to see the current state.",
    title: "Alert no longer exists",
    longExplanation:
      "When you tried to resolve that alert, the server looked it up by id and either didn't find it (already resolved and cleaned up) or it belongs to a different show than the page you clicked from. Refresh the dashboard to see the current state.",
    helpHref: "/help/errors#ADMIN_ALERT_NOT_FOUND",
  },
  ALERT_REQUIRES_SHOW_SCOPED_RESOLVE: {
    code: "ALERT_REQUIRES_SHOW_SCOPED_RESOLVE",
    warningClass: "general",
    dougFacing:
      "This alert belongs to a specific show. Click through to the show's parse panel to resolve it from the show context, where the resolution is recorded with the show's audit trail.",
    crewFacing: null,
    followUp: "Doug → click through to show",
    helpfulContext:
      "Per-show alerts are tied to a specific show and resolved from that show's parse panel, not from the global dashboard banner. We require the click-through to the show's page so that when you resolve the alert, the resolution is recorded in the context of the show you actually inspected. The dashboard's redirect link will take you straight to the show's alert section; resolve it there.",
    title: "Alert must be resolved from show page",
    longExplanation:
      "Per-show alerts are resolved from the show's parse panel, not the global dashboard banner. We require the click-through so the resolution is recorded in the show's audit trail. The dashboard's redirect link will take you straight to the show's alert section.",
    helpHref: "/help/errors#ALERT_REQUIRES_SHOW_SCOPED_RESOLVE",
  },
  OAUTH_STATE_INVALID: {
    code: "OAUTH_STATE_INVALID",
    warningClass: "general",
    dougFacing:
      "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    crewFacing:
      "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    followUp: "Crew → reopen the link; Eric if persistent",
    helpfulContext:
      "Google OAuth uses a one-time security token (the `state` parameter) to make sure the sign-in callback came from the request your browser actually started. The token was missing, expired, or didn't match, most often because you started sign-in in one window and clicked the callback in another, or the cookie storing the expected value was cleared. Click the original link from Doug again to start fresh.",
    title: "Sign-in interrupted",
    longExplanation:
      "Google OAuth uses a one-time security token to make sure the callback came from the request your browser actually started. The token was missing, expired, or didn't match, most often because you started sign-in in one window and clicked the callback in another. Click the original link again to start fresh.",
    helpHref: "/help/errors#OAUTH_STATE_INVALID",
  },
  OAUTH_REDIRECT_INVALID: {
    code: "OAUTH_REDIRECT_INVALID",
    warningClass: "general",
    dougFacing:
      "Sign-in landed somewhere we don't recognize. Please click the original link from Doug again to start over.",
    crewFacing:
      "Sign-in landed somewhere we don't recognize. Please click the original link from Doug again to start over.",
    followUp: "Crew → reopen the link; Eric if persistent",
    helpfulContext:
      "The Google OAuth callback's `next` parameter pointed somewhere outside the allowed list of post-sign-in destinations (the canonical site origin + `/show/<slug>`, `/admin`, or `/me` paths. Note: `/show/<slug>/p` is NOT a valid destination because the bootstrap surface requires a `#t=<jwt>` fragment that does not survive the OAuth round-trip). Without this guard, an attacker could trick the round-trip into landing on a malicious origin or onto the bootstrap shell with no fragment, while we were still minting your session cookie. Click the original link from Doug again.",
    title: "Sign-in redirect rejected",
    longExplanation:
      "The Google OAuth callback's destination pointed outside the allowed list of post-sign-in pages. Without this guard, an attacker could trick the round-trip into landing on a malicious origin or onto a bootstrap shell missing its required fragment, while we were minting your session cookie. Click the original link from Doug again.",
    helpHref: "/help/errors#OAUTH_REDIRECT_INVALID",
  },
  SYNC_DELAYED_MODERATE: {
    code: "SYNC_DELAYED_MODERATE",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Last checked *<time>* ago. Text Doug if anything looks off.",
    followUp: "Crew → mention to Doug",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SYNC_DELAYED_SEVERE: {
    code: "SYNC_DELAYED_SEVERE",
    warningClass: "general",
    dougFacing:
      "*<sheet-name>*: crew page hasn't synced from Drive in over 6 hours. Instant updates or Auto sync has stalled. Check the dashboard.",
    crewFacing: "This page hasn't updated recently. Text Doug to check on it.",
    followUp: "Crew → text Doug; Doug → check dashboard",
    helpfulContext:
      "The crew page hasn't synced from Drive in over six hours. That's well past the normal sync schedule, so something is stalled. Open the dashboard to check whether instant updates are healthy and whether Auto sync is running.",
    title: "Sync stalled for more than 6 hours",
    longExplanation:
      "The crew page hasn't synced from Drive in over six hours, well past the normal sync schedule, so something is stalled. Open the dashboard to check whether instant updates are healthy and whether Auto sync is running.",
    helpHref: "/help/errors#SYNC_DELAYED_SEVERE",
  },
  SYNC_STALLED: {
    code: "SYNC_STALLED",
    warningClass: "general",
    resolution: "auto",
    audience: "doug",
    severity: "warning",
    dougFacing:
      "Auto sync hasn't run in over an hour, so new sheet changes won't reach crew pages until it resumes. If this keeps happening, check the Drive connection or re-run setup.",
    crewFacing: null,
    followUp: "Doug → check Drive connection / re-run setup",
    helpfulContext:
      "Already-published pages stay up; only new edits are waiting. It usually recovers on its own, but if it sticks the Drive connection may have lapsed, so re-run setup or check the connection.",
    title: "Syncing has stalled",
    longExplanation:
      "This appears when the scheduled job that reads show sheets from Google Drive hasn't completed a run in over an hour. New edits won't reach crew pages until the job resumes. This is usually transient; if it persists, the Drive connection may have lapsed or the scheduler may be down.",
    helpHref: "/help/errors#SYNC_STALLED",
  },
  EMAIL_DELIVERY_FAILED: {
    code: "EMAIL_DELIVERY_FAILED",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A notification email couldn't be sent. The system keeps retrying, and the developer will check the email setup.",
    severity: "warning",
    dougFacing:
      "A notification email for <show-name> couldn't be sent. We'll keep retrying automatically; if it persists, the developer will check the email provider setup.",
    crewFacing: null,
    followUp: "Eric → check provider key / verified sending domain",
    helpfulContext:
      "Retries continue on their own. A persistent failure usually points at the provider API key or the verified sending domain in settings.",
    title: "Couldn't send a notification email",
    longExplanation:
      "A notification email couldn't be delivered through the email provider. We retry automatically; a persistent failure usually means the provider API key or sending domain needs attention in settings.",
    helpHref: "/help/errors#EMAIL_DELIVERY_FAILED",
  },
  EMAIL_NOT_CONFIGURED: {
    code: "EMAIL_NOT_CONFIGURED",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "Notification emails aren't set up yet, so those emails won't go out. The developer configures this; in-app alerts still work.",
    severity: "warning",
    dougFacing:
      "Email notifications aren't set up yet, so sync-problem alerts, the daily digest, and auto-publish undo emails won't be sent. The developer configures this on the deployment.",
    crewFacing: null,
    followUp:
      "Eric → configure email env (provider key / sending address / site address) on the deployment",
    helpfulContext:
      "Email needs three settings before anything sends: provider API key, verified sending address, and the public site URL for links. Dashboard alerts and each show's Publish toggle keep working without it.",
    title: "Email notifications not set up",
    longExplanation:
      "The app can't send email until three things are configured: the provider API key, the verified sending address, and the public site address used for links in the emails. Sync-problem alerts, the daily digest, and auto-publish undo emails all wait on the same three settings. You'll still see alerts in the dashboard, and each show's Published toggle keeps working.",
    helpHref: "/help/errors#EMAIL_NOT_CONFIGURED",
  },
  TILE_SERVER_RENDER_FAILED: {
    code: "TILE_SERVER_RENDER_FAILED",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "One piece of a crew page had trouble drawing and fell back safely. The developer can look; the rest of the page is fine.",
    dougFacing:
      "<sheet-name>: a section failed to load on the server and will keep retrying. Refresh in a minute. Tell the developer if it persists.",
    crewFacing: "This section couldn't load; last good data shown.",
    followUp: "Doug → refresh / Report; Eric → investigate",
    helpfulContext:
      "Only that one section crashed; the rest of the page rendered. It keeps retrying, so a refresh usually clears it. If it recurs, use Report so the developer gets the stack.",
    title: "Page section failed to render",
    longExplanation:
      "One of the page sections crashed while the server was rendering it. The rest of the page rendered normally. The page will keep retrying; refresh in a minute. If this keeps happening, click Report so the developer can investigate.",
    helpHref: "/help/errors#TILE_SERVER_RENDER_FAILED",
  },
  TILE_PROJECTION_FETCH_FAILED: {
    code: "TILE_PROJECTION_FETCH_FAILED",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A crew page couldn't load one section's data this time. It retries automatically, and the developer can review it.",
    dougFacing:
      "<sheet-name>: one or more data sources couldn't load, so the page rendered with what did load. Refresh in a minute. Tell the developer if it persists.",
    crewFacing: null,
    followUp: "Doug → refresh / Report; Eric → investigate",
    helpfulContext:
      "The failed data sources are listed in the alert detail; their sections fell back while the rest loaded. A refresh usually clears it; use Report if it keeps happening.",
    title: "Some show data couldn't load",
    longExplanation:
      "The crew page rendered, but one or more of its data sources failed to fetch from the server. The page shows the data that did load; the affected sections fall back. The specific failed sources are listed in the alert detail. Refresh in a minute; if this keeps happening, click Report so the developer can investigate.",
    helpHref: "/help/errors#TILE_PROJECTION_FETCH_FAILED",
  },
  STALE_DISCARD_REJECTED: {
    code: "STALE_DISCARD_REJECTED",
    warningClass: "general",
    dougFacing:
      "The staged parse you were viewing was replaced by a newer sync. Refresh and review the latest version before deciding.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "A newer parse was staged for this sheet between when you opened the review and when you clicked Discard. Refresh the admin page to see the latest version before deciding.",
    title: "Staged parse replaced before discard",
    longExplanation:
      "A newer parse was staged for this sheet between when you opened the review and when you clicked Discard. Refresh the admin page to see the latest version before deciding.",
    helpHref: "/help/errors#STALE_DISCARD_REJECTED",
  },
  LINK_CROSS_SHOW_REUSE: {
    code: "LINK_CROSS_SHOW_REUSE",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  REPORT_ORPHANED_LOST_LEASE: {
    code: "REPORT_ORPHANED_LOST_LEASE",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "A bug-report cleanup step tidied up an abandoned record on its own. Nothing you filed was affected.",
    dougFacing:
      "A duplicate bug-report issue for <show-name> was auto-closed during a retry race. Click through to verify it closed correctly. If this recurs, increase the lease window.",
    crewFacing: null,
    followUp: "Eric → review orphan, tune lease window if recurring",
    helpfulContext:
      "Two retries of the same report both created a GitHub issue in a lease race, so the duplicate was auto-closed. Click through to confirm; if it recurs, the lease window needs widening.",
    title: "Duplicate report issue auto-closed",
    longExplanation:
      "Two retries of the same bug-report submission both succeeded in creating GitHub issues (a lease race condition). We auto-closed the duplicate. Click through to confirm; if this keeps appearing, the developer needs to extend the lease window.",
    helpHref: "/help/errors#REPORT_ORPHANED_LOST_LEASE",
  },
  GITHUB_BOT_LOGIN_MISSING: {
    code: "GITHUB_BOT_LOGIN_MISSING",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A developer tool for bug reports isn't fully set up. Reporting still works; the developer will finish the connection.",
    dougFacing:
      "GitHub bot login is unconfigured, so the report-recovery path is degraded. Set the `GITHUB_BOT_LOGIN` environment variable to the bot's GitHub username and redeploy.",
    crewFacing: null,
    followUp: "Eric → configure env var",
    helpfulContext:
      "Recovery needs the bot's GitHub username to find issues from earlier attempts. Set GITHUB_BOT_LOGIN to that username and redeploy to restore full recovery coverage.",
    title: "GitHub bot login not configured",
    longExplanation:
      "This appears when the bug-report recovery path needs the bot account's GitHub username, to find issues created by previous recovery attempts, but the `GITHUB_BOT_LOGIN` environment variable isn't set on the deployment. Configure it and redeploy to restore full recovery-path coverage.",
    helpHref: "/help/errors#GITHUB_BOT_LOGIN_MISSING",
  },
  REPORT_LEASE_THRASHING: {
    code: "REPORT_LEASE_THRASHING",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "The bug-report system retried a step several times in a row. The developer will look; reports still go through.",
    dougFacing:
      "Bug-report processing is thrashing on <show-name>; retries are racing against leases. This usually means the lease window needs tuning.",
    crewFacing: null,
    followUp: "Eric → tune lease window",
    helpfulContext:
      "Too many retries fire inside the lease window, usually because it's shorter than GitHub's current response time. Widening the lease window settles it.",
    title: "Bug-report leases thrashing",
    longExplanation:
      "Bug-report submissions for this show are racing against their own leases, with too many retries firing inside the lease window. Usually this means the lease window is shorter than the GitHub API's response time under current conditions. The developer needs to tune the window.",
    helpHref: "/help/errors#REPORT_LEASE_THRASHING",
  },
  ADMIN_EMAIL_ALREADY_ACTIVE: {
    code: "ADMIN_EMAIL_ALREADY_ACTIVE",
    warningClass: "general",
    dougFacing: "_<email>_ is already an administrator.",
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "Idempotent re-add of an already-active admin email. Not a destructive condition; the row is unchanged.",
    title: "Email is already an administrator",
    longExplanation:
      "You tried to re-add an email that's already on the active administrator list. The row is unchanged; no harm done.",
    helpHref: "/help/errors#ADMIN_EMAIL_ALREADY_ACTIVE",
  },
  ADMIN_ALERT_COUNT_FAILED: {
    code: "ADMIN_ALERT_COUNT_FAILED",
    warningClass: "general",
    dougFacing: "We couldn't check for alerts right now. Refresh in a moment.",
    crewFacing: null,
    followUp: "Doug → refresh; if persistent, check Supabase admin_alerts RLS + grants",
    helpfulContext:
      "The bell unseen-count read (loadBellUnseenCount, lib/admin/bellFeed.ts) returned/threw an error. The NotifBell renders a degraded warn bell instead of hiding, so a broken count is visible.",
    title: "Couldn't check alerts",
    longExplanation:
      "We couldn't read the alert count, usually a transient database or permissions issue. Refresh in a moment; if it keeps failing, the developer needs to check the admin_alerts table access.",
    helpHref: "/help/errors#ADMIN_ALERT_COUNT_FAILED",
  },
  ALERT_BELL_FEED_FAILED: {
    code: "ALERT_BELL_FEED_FAILED",
    warningClass: "general",
    dougFacing:
      "We couldn't load your notifications just now. Refresh in a moment or use Retry; nothing has been lost.",
    crewFacing: null,
    followUp: "none (transient read failure)",
    helpfulContext:
      "The bell notification panel failed to fetch its feed (server or database hiccup). Alerts are stored server-side, so nothing is lost; the panel retries on demand.",
    title: "Notifications didn't load",
    longExplanation:
      "The bell notification panel failed to fetch its feed (server or database hiccup). Alerts are stored server-side, so nothing is lost; the panel retries on demand.",
    helpHref: "/help/errors#ALERT_BELL_FEED_FAILED",
  },
  ADMIN_ROUTE_LOAD_FAILED: {
    code: "ADMIN_ROUTE_LOAD_FAILED",
    warningClass: "general",
    dougFacing:
      "This admin page couldn't load. Refresh in a moment; if it keeps failing, contact the developer.",
    crewFacing: null,
    followUp: "Doug → refresh; if persistent, contact the developer",
    helpfulContext:
      "Fixed code for the app/admin/error.tsx + app/admin/settings/error.tsx client boundaries AND the layout's identity-fault catch (app/admin/layout.tsx). Used instead of ADMIN_SESSION_LOOKUP_FAILED, whose dougFacing is null + crew-facing (wrong audience). error.tsx files are client components; Next serializes errors as Error & { digest } so a thrown code field is unreliable; the boundary renders this fixed code, not err.code.",
    title: "Admin page couldn't load",
    longExplanation:
      "Something went wrong loading this admin page. Refresh in a moment; if it keeps failing, the developer needs to take a look.",
    helpHref: "/help/errors#ADMIN_ROUTE_LOAD_FAILED",
  },
  PAGE_RENDER_FAILED: {
    code: "PAGE_RENDER_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "This page ran into a problem. Try reloading. If it keeps happening, text Doug.",
    followUp: "Crew → reload",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  ADMIN_EMAIL_WRITE_FAILED: {
    code: "ADMIN_EMAIL_WRITE_FAILED",
    warningClass: "general",
    dougFacing: "Couldn't update administrators right now. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, check Supabase admin_emails RPC + grants",
    helpfulContext:
      "addAdminAction / revokeAdminAction caught an AdminEmailsInfraError from addAdminEmail / revokeAdminEmail (after the requireDeveloperIdentity gate) and returned { kind: 'infra_error' }. Rendered inline by AddAdminForm + RevokeRowButton instead of tearing down the settings section.",
    title: "Couldn't update administrators",
    longExplanation:
      "We couldn't add or revoke that administrator, usually a transient database or permissions issue. Try again in a moment; if it keeps failing, the developer needs to check the database connection.",
    helpHref: "/help/errors#ADMIN_EMAIL_WRITE_FAILED",
  },
  ADMIN_DRIVE_HEALTH_UNAVAILABLE: {
    code: "ADMIN_DRIVE_HEALTH_UNAVAILABLE",
    warningClass: "general",
    dougFacing: "Couldn't read sync status right now. Refresh in a moment.",
    crewFacing: null,
    followUp: "Doug → refresh; if persistent, check Supabase shows + drive_watch_channels access",
    helpfulContext:
      "fetchDriveConnectionHealth returned { kind: 'infra_error' }, a watch-status, active-shows count, or last_checked_at read returned/threw. Renders the Warn pill + this status line, never a false Healthy.",
    title: "Couldn't read sync status",
    longExplanation:
      "We couldn't read how your Drive sync is doing. Refresh in a moment; if it keeps failing, the developer needs to check the database connection.",
    helpHref: "/help/errors#ADMIN_DRIVE_HEALTH_UNAVAILABLE",
  },
  SYNC_STATUS_UNKNOWN: {
    code: "SYNC_STATUS_UNKNOWN",
    warningClass: "general",
    dougFacing: "A show's sync state isn't recognized right now. The developer should take a look.",
    crewFacing: null,
    followUp: "Doug → contact the developer; enum drift in shows.last_sync_status",
    helpfulContext:
      "fetchDriveConnectionHealth (lib/admin/driveConnectionHealth.ts) found an active show whose last_sync_status is outside the recognized set, or a null status on a fresh-timestamp row. Surfaces the Warn pill so enum drift is visible at any age (precedes the age-based stale tiers).",
    title: "Sync state not recognized",
    longExplanation:
      "One of your shows reports a sync state the app doesn't recognize. This usually means the sync code changed and the developer needs to update how states are read.",
    helpHref: "/help/errors#SYNC_STATUS_UNKNOWN",
  },
  ADMIN_EMAIL_INVALID: {
    code: "ADMIN_EMAIL_INVALID",
    warningClass: "general",
    dougFacing: "Enter a valid email address.",
    crewFacing: null,
    followUp: "Doug → retype the email",
    helpfulContext: "The submitted email failed canonicalization or HTML5 type=email validation.",
    title: "Email address invalid",
    longExplanation:
      "The email you submitted didn't pass the standard email-format check. Re-enter it as a valid address.",
    helpHref: "/help/errors#ADMIN_EMAIL_INVALID",
  },
  ADMIN_EMAIL_LIST_FAILED: {
    code: "ADMIN_EMAIL_LIST_FAILED",
    warningClass: "general",
    dougFacing:
      "We can't load the administrator list right now. Refresh in a moment; if the problem continues, check the database connection.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, check Supabase admin_emails RLS + grants",
    helpfulContext:
      "AdminEmailsInfraError from listAdminEmails() (typically RLS denial, missing grant, schema-cache skew, or network fault). Surfaced IN-SECTION by the Administrators section (via the typed fetchEmbeddedAdminEmails wrapper) on BOTH the embedded /admin/settings and the deep-link /admin/settings/admins; renders this message + retry. (Route/session faults on those segments are NOT this code; they bubble to the error.tsx boundary as ADMIN_ROUTE_LOAD_FAILED.)",
    title: "Couldn't load administrator list",
    longExplanation:
      "We couldn't load the list of administrators, usually a transient database or permissions issue. Refresh in a moment; if it keeps failing, the developer needs to check the database connection.",
    helpHref: "/help/errors#ADMIN_EMAIL_LIST_FAILED",
  },
  ADMIN_EMAIL_RE_ADD_PROMPT: {
    code: "ADMIN_EMAIL_RE_ADD_PROMPT",
    warningClass: "general",
    dougFacing: "_<email>_ was previously revoked. Re-add this email to restore admin access?",
    crewFacing: null,
    followUp: "Doug → confirm re-add or cancel",
    helpfulContext:
      "The submitted email matches a row with revoked_at set. UI surfaces this as a confirmation prompt; submitting the same form with confirm_re_add=true re-activates the row per amendment §5.4.",
    title: "Re-add previously revoked admin?",
    longExplanation:
      "The email you submitted matches a previously revoked administrator. Confirm whether you'd like to re-add and restore admin access for that email.",
    helpHref: "/help/errors#ADMIN_EMAIL_RE_ADD_PROMPT",
  },
  ADMIN_FORBIDDEN: {
    code: "ADMIN_FORBIDDEN",
    warningClass: "general",
    dougFacing: "Your admin session cannot access this action. Sign in again and retry.",
    crewFacing: null,
    followUp: "Doug → sign in again",
    helpfulContext:
      "Admin-only endpoints return this when the request does not carry a valid admin session.",
    title: "Admin action not allowed",
    longExplanation:
      "Your current admin session can't access this action. Sign in again and retry.",
    helpHref: "/help/errors#ADMIN_FORBIDDEN",
  },
  ADMIN_SESSION_LOOKUP_FAILED: {
    code: "ADMIN_SESSION_LOOKUP_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Something is misconfigured for this show. Doug has been notified.",
    followUp: "Eric → investigate admin/session lookup",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  AGENDA_ASSET_LOOKUP_FAILED: {
    code: "AGENDA_ASSET_LOOKUP_FAILED",
    warningClass: "general",
    dougFacing: "The agenda PDF could not be loaded. Refresh and try again.",
    crewFacing: "This agenda could not be loaded. Text Doug if it keeps happening.",
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "The agenda asset route could not resolve or stream the linked Drive PDF for the show.",
    title: "Agenda PDF could not load",
    longExplanation:
      "We couldn't resolve or stream the linked agenda PDF for this show. Refresh and try again; if it keeps failing, the developer needs to investigate.",
    helpHref: "/help/errors#AGENDA_ASSET_LOOKUP_FAILED",
  },
  APPLY_STATUS_NOT_FOUND: {
    code: "APPLY_STATUS_NOT_FOUND",
    warningClass: "general",
    dougFacing:
      "That apply job is no longer available. Refresh the show and check the current status.",
    crewFacing: null,
    followUp: "Doug → refresh the admin view",
    helpfulContext:
      "The apply-status endpoint could not find the requested show, apply id, or pending sync row.",
    title: "Apply job not found",
    longExplanation:
      "That apply job is no longer available, usually because it has already completed or the staged sync row has been resolved. Refresh the show and check the current status.",
    helpHref: "/help/errors#APPLY_STATUS_NOT_FOUND",
  },
  CLEANUP_REQUIRES_STALE_SESSION: {
    code: "CLEANUP_REQUIRES_STALE_SESSION",
    warningClass: "general",
    dougFacing: "Cleanup is only available for stale setup sessions.",
    crewFacing: null,
    followUp: "Doug → wait or finish setup; Eric if the session is stuck",
    helpfulContext:
      "Abandoned finalize cleanup is guarded by a stale-session check and a finalize-recency check so it cannot interrupt an active setup publish.",
    title: "Cleanup only valid on stale sessions",
    longExplanation:
      "Abandoned-finalize cleanup is guarded by a stale-session check and a finalize-recency check so it can't interrupt an active setup publish. This session isn't stale enough yet.",
    helpHref: "/help/errors#CLEANUP_REQUIRES_STALE_SESSION",
  },
  CONCURRENT_FINALIZE_IN_FLIGHT: {
    code: "CONCURRENT_FINALIZE_IN_FLIGHT",
    warningClass: "general",
    dougFacing: "Setup publishing is already running in another tab.",
    crewFacing: null,
    followUp: "Doug → wait for the active setup tab",
    helpfulContext:
      "Only one finalize worker can hold the wizard finalize advisory lock for a session. A second request returns this code instead of racing the first.",
    title: "Setup publish already running",
    longExplanation:
      "Setup publishing is already running in another tab. Only one finalize worker can hold the wizard finalize lock for a session; wait for the other tab to finish.",
    helpHref: "/help/errors#CONCURRENT_FINALIZE_IN_FLIGHT",
  },
  DIAGRAM_ASSET_LOOKUP_FAILED: {
    code: "DIAGRAM_ASSET_LOOKUP_FAILED",
    warningClass: "general",
    dougFacing: "A diagram could not be loaded. Refresh and try again.",
    crewFacing: "This diagram could not be loaded. Text Doug if it keeps happening.",
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "The diagram asset route could not resolve or stream the stored immutable diagram revision.",
    title: "Diagram could not load",
    longExplanation:
      "We couldn't resolve or stream the stored diagram for this show. Refresh and try again; if it keeps failing, the developer needs to investigate.",
    helpHref: "/help/errors#DIAGRAM_ASSET_LOOKUP_FAILED",
  },
  DRIVE_METADATA_MISSING: {
    code: "DRIVE_METADATA_MISSING",
    warningClass: "general",
    dougFacing:
      "Google Drive didn't return the revision details we need to sync safely. We'll retry automatically on the next sync; no action needed.",
    crewFacing: null,
    followUp: "Eric → inspect Drive metadata response",
    helpfulContext:
      "The sync engine requires a head revision id so markdown export, enrichment, and final apply all describe the same sheet revision.",
    title: "Drive returned incomplete sheet metadata",
    longExplanation:
      "Google Drive didn't return the sheet revision metadata we need to sync safely. The sync engine requires a head revision id so markdown export, enrichment, and final apply all describe the same sheet revision. We'll retry on the next run.",
    helpHref: "/help/errors#DRIVE_METADATA_MISSING",
  },
  EMBEDDED_ASSET_DRIFTED: {
    code: "EMBEDDED_ASSET_DRIFTED",
    warningClass: "parse_warning",
    resolution: "auto",
    audience: "doug",
    dougFacing:
      "An embedded diagram in <sheet-name> changed after staging, so crew see a placeholder for that image. A new sheet edit re-stages it.",
    crewFacing: null,
    followUp: "Doug → re-edit the sheet to re-stage the diagram",
    helpfulContext:
      "Crew keep the last good image and see a placeholder only for the one that changed. Save the sheet again to pick up the new version.",
    title: "Embedded diagram changed after staging",
    longExplanation:
      "This appears when Apply re-checks the spreadsheet revision, object id, and embedded-image fingerprint before downloading bytes, and finds a mismatch. The prior approved content stays live and the image is marked for recovery or re-stage; saving the sheet again re-stages the new image.",
    helpHref: "/help/errors#EMBEDDED_ASSET_DRIFTED",
  },
  FOLDER_NOT_FOUND: {
    code: "FOLDER_NOT_FOUND",
    warningClass: "general",
    dougFacing: "We could not find that Drive folder.",
    crewFacing: null,
    followUp: "Doug → check the link or restore the folder",
    helpfulContext:
      "Drive returned missing, deleted, or trashed for the folder ID in the link. Confirm the folder still exists, that the URL points to the folder itself, and that it has not been moved to trash.",
    title: "Drive folder not found",
    longExplanation:
      "Google Drive returned missing, deleted, or trashed for the folder ID in the link. Confirm the folder still exists, that the URL points to the folder itself, and that it hasn't been moved to trash.",
    helpHref: "/help/errors#FOLDER_NOT_FOUND",
  },
  FOLDER_NOT_SHARED: {
    code: "FOLDER_NOT_SHARED",
    warningClass: "general",
    dougFacing: "This folder is not shared with the sync account yet.",
    crewFacing: null,
    followUp: "Doug → share the folder with the FXAV service account, then retry",
    helpfulContext:
      "The app reads show sheets through a Google service account. Share the Drive folder with that account using Viewer access, then click Verify again. If the folder is in a shared drive, make sure the service account can see that shared drive too.",
    title: "Folder not shared with sync account",
    longExplanation:
      "The app reads show sheets through a Google service account. Share the Drive folder with that account using Viewer access, then click Verify again. If the folder is in a shared drive, make sure the service account can see that shared drive too.",
    helpHref: "/help/errors#FOLDER_NOT_SHARED",
  },
  INVALID_FOLDER_URL: {
    code: "INVALID_FOLDER_URL",
    warningClass: "general",
    dougFacing: "Paste a Google Drive folder link.",
    crewFacing: null,
    followUp: "Doug → paste the folder link from Drive",
    helpfulContext:
      "The setup wizard needs the URL for a Google Drive folder, usually shaped like drive.google.com/drive/folders/<folder-id>. Open the folder in Drive, copy the browser URL, and paste that full link here.",
    title: "Folder link not recognized",
    longExplanation:
      "The setup wizard needs the URL for a Google Drive folder, usually shaped like 'drive.google.com/drive/folders/<folder-id>'. Open the folder in Drive, copy the browser URL, and paste that full link.",
    helpHref: "/help/errors#INVALID_FOLDER_URL",
  },
  INVALID_JSON: {
    code: "INVALID_JSON",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "The request was not valid JSON.",
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  LAST_ADMIN_LOCKOUT_REFUSED: {
    code: "LAST_ADMIN_LOCKOUT_REFUSED",
    warningClass: "general",
    dougFacing:
      "You can't revoke the last administrator. Add another admin first, then revoke this one.",
    crewFacing: null,
    followUp: "Doug → add another admin first",
    helpfulContext:
      "Self-revoke of the only active administrator is refused at the Server Action layer to prevent admin lockout. Other-revoke (rogue admin revoking peers) is by-design allowed; see the spec amendment §5.5 + §11 anti-goal.",
    title: "Can't revoke the last administrator",
    longExplanation:
      "Self-revoke of the only active administrator is refused to prevent admin lockout. Add another admin first, then revoke this one.",
    helpHref: "/help/errors#LAST_ADMIN_LOCKOUT_REFUSED",
  },
  LINKED_FOLDER_OVERFLOW_TRUNCATED: {
    code: "LINKED_FOLDER_OVERFLOW_TRUNCATED",
    warningClass: "parse_warning",
    dougFacing:
      "The linked diagram folder has more images than this release can publish. Crew see the first 60 images.",
    crewFacing: null,
    followUp: "Doug → trim or split the folder if omitted images matter",
    helpfulContext:
      "Linked-folder diagram freezing caps the combined embedded and linked gallery at 60 assets.",
    title: "Linked folder over 60 images",
    longExplanation:
      "The linked diagram folder has more images than one release can publish. Crew see the first 60 images; everything beyond that is truncated.",
    helpHref: "/help/errors#LINKED_FOLDER_OVERFLOW_TRUNCATED",
  },
  OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA: {
    code: "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA",
    warningClass: "general",
    dougFacing: "Drive returned an incomplete folder response. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug → retry; Eric if this repeats",
    helpfulContext:
      "The app reached Google Drive, but the metadata response did not include the fields needed to prove the link is a readable folder. This is usually transient. If it repeats, the developer should inspect the Drive API response and service-account configuration.",
    title: "Drive folder response incomplete",
    longExplanation:
      "We reached Google Drive but the metadata response didn't include the fields needed to confirm the link is a readable folder. Usually transient; try again in a moment. If it repeats, the developer should inspect the Drive API response.",
    helpHref: "/help/errors#OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA",
  },
  OPERATOR_ERROR_NOT_FOLDER: {
    code: "OPERATOR_ERROR_NOT_FOLDER",
    warningClass: "general",
    dougFacing: "That link points to a file, not a folder.",
    crewFacing: null,
    followUp: "Doug → open the parent folder and copy that folder link",
    helpfulContext:
      "The wizard scans every sheet inside one folder. A direct Google Sheet link cannot be used for setup because it does not tell the app which sibling sheets belong in the same onboarding run.",
    title: "Link is a file, not a folder",
    longExplanation:
      "The setup wizard scans every sheet inside one folder. A direct Google Sheet link can't be used for setup because it doesn't tell the app which sibling sheets belong in the same onboarding run.",
    helpHref: "/help/errors#OPERATOR_ERROR_NOT_FOLDER",
  },
  PENDING_SNAPSHOT_DELETE_STUCK: {
    code: "PENDING_SNAPSHOT_DELETE_STUCK",
    warningClass: "general",
    resolution: "auto",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "An old diagram version is slow to clean up. It's harmless, and the developer will tidy it up.",
    dougFacing:
      "A diagram snapshot cleanup for <show-name> is stuck; crew pages are still protected, but storage cleanup needs repair.",
    crewFacing: null,
    followUp: "Doug → run snapshot repair; if persistent, Eric",
    helpfulContext:
      "A row marked for deletion never had its storage prefix reclaimed. Crew pages are unaffected; this is storage hygiene only. Reconcile and reclaim the prefix to clear it.",
    title: "Snapshot cleanup stuck",
    longExplanation:
      "Old diagram snapshot cleanup is stuck: a pending row is marked for deletion but the storage prefix hasn't been reclaimed. Crew pages are still protected, but storage cleanup needs repair.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_DELETE_STUCK",
  },
  PENDING_SNAPSHOT_NOT_STUCK: {
    code: "PENDING_SNAPSHOT_NOT_STUCK",
    warningClass: "general",
    dougFacing: "That diagram snapshot does not need repair.",
    crewFacing: null,
    followUp: "Doug → refresh the admin view",
    helpfulContext:
      "The repair endpoint only accepts pending snapshot rows that started promotion and exceeded the repair threshold.",
    title: "Snapshot doesn't need repair",
    longExplanation:
      "The repair endpoint only accepts pending snapshot rows that started promotion and exceeded the repair threshold. This snapshot isn't in that state.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_NOT_STUCK",
  },
  PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT: {
    code: "PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT",
    warningClass: "general",
    dougFacing: "That diagram snapshot is still being promoted. Check again in a few minutes.",
    crewFacing: null,
    followUp: "Doug → wait, then refresh",
    helpfulContext:
      "Promotion repair is blocked until the promote_started_at threshold has elapsed.",
    title: "Snapshot still being promoted",
    longExplanation:
      "Promotion repair is blocked until the promote-started threshold has elapsed. Check again in a few minutes.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT",
  },
  PENDING_SYNC_NOT_FOUND: {
    code: "PENDING_SYNC_NOT_FOUND",
    warningClass: "general",
    dougFacing: "That staged sync is no longer available.",
    crewFacing: null,
    followUp: "Doug → refresh the admin page",
    helpfulContext:
      "The admin page renders staged-sync rows by id. When you clicked Apply or Discard, the server looked up that id and didn't find a row, usually because another browser tab acted on the same staged sync between when the page loaded and when you clicked. Refresh the admin page to see the current state and act on whatever's still pending.",
    title: "Staged sync no longer available",
    longExplanation:
      "When you clicked Apply or Discard, the server looked up the staged sync by id and didn't find a row, usually because another browser tab acted on it between when the page loaded and when you clicked. Refresh the admin page to see the current state.",
    helpHref: "/help/errors#PENDING_SYNC_NOT_FOUND",
  },
  REEL_ASSET_LOOKUP_FAILED: {
    code: "REEL_ASSET_LOOKUP_FAILED",
    warningClass: "general",
    dougFacing: "The opening reel could not be loaded. Refresh and try again.",
    crewFacing: "This video could not be loaded. Text Doug if it keeps happening.",
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "The reel asset route could not resolve or stream the immutable Drive revision for the show.",
    title: "Opening reel could not load",
    longExplanation:
      "We couldn't resolve or stream the stored opening-reel revision for this show. Refresh and try again; if it keeps failing, the developer needs to investigate.",
    helpHref: "/help/errors#REEL_ASSET_LOOKUP_FAILED",
  },
  REPORT_DUPLICATE_LIVE_MATCHES: {
    code: "REPORT_DUPLICATE_LIVE_MATCHES",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "The bug-report system found two records that look the same and paused to stay safe. The developer will sort it out.",
    dougFacing:
      "Multiple live GitHub issues match one report for <show-name>. Recovery is paused until Eric reviews the duplicates.",
    crewFacing: null,
    followUp: "Eric → inspect duplicate report issues and close the incorrect one",
    helpfulContext:
      "More than one live issue carries the same report marker, so recovery fails closed instead of guessing a winner. Review the duplicates and close all but one to resume it.",
    title: "Multiple live issues for one report",
    longExplanation:
      "The bug-report recovery scan found more than one non-orphan GitHub issue with the same report marker. The system fails closed instead of choosing a winner; Eric needs to review the duplicates.",
    helpHref: "/help/errors#REPORT_DUPLICATE_LIVE_MATCHES",
  },
  REPORT_HORIZON_EXPIRED: {
    code: "REPORT_HORIZON_EXPIRED",
    warningClass: "general",
    dougFacing:
      "This report attempt has expired (older than 24 hours). If the issue still applies, please file a fresh report.",
    crewFacing:
      "This report attempt has expired. Please open a fresh report if the issue still applies.",
    followUp: "Doug or crew → start a fresh report if still needed",
    helpfulContext:
      "Bug-report retry recovery only runs within 24 hours of the original attempt. Older unresolved rows are handled by the reaper.",
    title: "Bug-report attempt expired",
    longExplanation:
      "Bug-report retry recovery only runs within 24 hours of the original attempt. This attempt is older than that. If the issue still applies, file a fresh report.",
    helpHref: "/help/errors#REPORT_HORIZON_EXPIRED",
  },
  REPORT_LOOKUP_INCONCLUSIVE: {
    code: "REPORT_LOOKUP_INCONCLUSIVE",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "A bug-report lookup wasn't certain and stayed cautious. Crew can simply try again.",
    dougFacing:
      "We couldn't confirm whether a report for <show-name> went through. Try again in a few minutes.",
    crewFacing:
      "We couldn't confirm whether your previous report went through. Please try again in a few minutes.",
    followUp: "Eric → review GitHub issue lookup and retry state",
    helpfulContext:
      "Recovery couldn't reliably list recent issues for this report, so it refused to risk a duplicate. Usually a transient GitHub API blip that clears on the next retry.",
    title: "Report lookup inconclusive",
    longExplanation:
      "The bug-report recovery path couldn't conclusively list recent GitHub issues for this report, so it refused to create a duplicate issue. Try again in a few minutes.",
    helpHref: "/help/errors#REPORT_LOOKUP_INCONCLUSIVE",
  },
  REPORT_OPEN_ORPHAN_LABEL: {
    code: "REPORT_OPEN_ORPHAN_LABEL",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "A bug report ended up in an unusual state the developer needs to review. Nothing you filed was lost.",
    dougFacing:
      "An open GitHub issue for <show-name> carries the orphan-cleanup label. Eric needs to re-close it or remove the label.",
    crewFacing: null,
    followUp: "Eric → inspect the labeled issue",
    helpfulContext:
      "Orphan cleanup only labels closed 'not planned' issues, so an open one means it was reopened or GitHub returned an odd state. Re-close the issue or remove the label.",
    title: "Open issue carries orphan label",
    longExplanation:
      "Orphan cleanup should close issues with the 'not planned' state. Seeing the orphan label on an open issue means manual intervention happened or GitHub returned an unexpected state. Eric needs to review and either re-close the issue or remove the label.",
    helpHref: "/help/errors#REPORT_OPEN_ORPHAN_LABEL",
  },
  REPORT_PIPELINE_FAILED: {
    code: "REPORT_PIPELINE_FAILED",
    warningClass: "general",
    dougFacing:
      "The report system hit a server error before it could finish. Please try again in a few minutes.",
    crewFacing:
      "The report system hit a server error before it could finish. Please try again in a few minutes.",
    followUp: "Eric → inspect report pipeline logs and database connectivity",
    helpfulContext:
      "The report route caught a typed infrastructure failure from the report submission or reaper path and returned a cataloged 500 response instead of crashing.",
    title: "Bug-report pipeline error",
    longExplanation:
      "The report route caught a typed infrastructure failure from the report submission or reaper path and returned a cataloged 500 instead of crashing. Try again in a few minutes.",
    helpHref: "/help/errors#REPORT_PIPELINE_FAILED",
  },
  SELF_DEVELOPER_DEMOTE_FORBIDDEN: {
    code: "SELF_DEVELOPER_DEMOTE_FORBIDDEN",
    warningClass: "general",
    dougFacing:
      "To keep at least one developer in control, you can't turn off your own developer access. Ask another developer to do it if you need to step down.",
    crewFacing: null,
    followUp: "Developer → ask another developer to turn off your access",
    helpfulContext:
      "set_admin_developer_rpc refuses a self-demote unconditionally inside its SECURITY DEFINER body; it returns self_developer_demote_forbidden when the demotion target (is_developer=false) canonicalizes to the same email as public.auth_email_canonical(), so a developer can never turn off their own developer access, even via a hand-forged PostgREST rpc() call that bypasses the developer-gated Server Action. Because a self-demote is always refused, at least one developer always remains in control. Turning off another developer's access (developer-to-developer demote) stays allowed by design.",
    title: "You can't remove your own developer access",
    longExplanation:
      "A developer can never turn off their own developer access; the database refuses it directly, behind the Server Action guard. To keep at least one developer in control, ask another developer to remove your developer access if you need to step down.",
    helpHref: "/help/errors#SELF_DEVELOPER_DEMOTE_FORBIDDEN",
  },
  SELF_REVOKE_FORBIDDEN: {
    code: "SELF_REVOKE_FORBIDDEN",
    warningClass: "general",
    dougFacing:
      "You can't revoke your own administrator access. Ask another developer to do it if you need to be removed.",
    crewFacing: null,
    followUp: "Doug → ask another developer to revoke you",
    helpfulContext:
      "revoke_admin_email_rpc refuses a self-revoke unconditionally inside its SECURITY DEFINER body; comparing the canonical target email to public.auth_email_canonical(), so an admin can never revoke their own access even via a hand-forged PostgREST rpc() call that bypasses the Server Action. This is defense-in-depth behind the M12.5 Server-Action guard. Other-revoke is now developer-only (this milestone closes the §5.5 rogue-revoke risk); a non-developer actor is refused (42501 at the RPC / forbidden() at the Server Action).",
    title: "Can't revoke your own access",
    longExplanation:
      "An administrator can never revoke their own access; the database refuses it directly, behind the Server Action guard. If you need to be removed, ask another developer to revoke you.",
    helpHref: "/help/errors#SELF_REVOKE_FORBIDDEN",
  },
  SESSION_NOT_FOUND: {
    code: "SESSION_NOT_FOUND",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Open the original link Doug shared again.",
    followUp: "Crew → reopen link",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_BUSY_RETRY: {
    code: "SHOW_BUSY_RETRY",
    warningClass: "general",
    dougFacing: "That show is already syncing. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug → retry after the current sync finishes",
    helpfulContext: "Another sync is holding the per-show advisory lock; retry with backoff.",
    title: "Show already syncing",
    longExplanation:
      "Another sync is holding the per-show advisory lock for this show. Retry in a moment.",
    helpHref: "/help/errors#SHOW_BUSY_RETRY",
  },
  SHOW_REALTIME_TOKEN_MISCONFIGURED: {
    code: "SHOW_REALTIME_TOKEN_MISCONFIGURED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric → configure realtime JWT env",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_VERSION_AUTH_FAILED: {
    code: "SHOW_VERSION_AUTH_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_VERSION_TOKEN_RPC_FAILED: {
    code: "SHOW_VERSION_TOKEN_RPC_FAILED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric → investigate version-token RPC",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SLUG_REQUIRED: {
    code: "SLUG_REQUIRED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "A show slug is required.",
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  RESCAN_REVIEW_REQUIRED: {
    code: "RESCAN_REVIEW_REQUIRED",
    warningClass: "general",
    dougFacing: "This sheet changed and needs your review before publishing.",
    crewFacing: null,
    followUp: "Doug → re-review this sheet in setup, then publish",
    helpfulContext:
      "A re-scan of this sheet surfaced a change that needs a decision (for example a crew email, name, or roster change), so setup is holding it out of the publish batch until you re-review and re-approve it from the reapply page.",
    title: "This sheet changed during setup",
    longExplanation:
      "You re-scanned this sheet and the refreshed version changed something that needs a look: a crew email, name, or roster change, or a new data-quality gap. Setup is holding it out of the publish batch until you open it and re-approve it from the reapply page; the publish checkbox alone won't clear it.",
    helpHref: "/help/errors#RESCAN_REVIEW_REQUIRED",
  },
  STAGED_PARSE_FAILED: {
    code: "STAGED_PARSE_FAILED",
    warningClass: "general",
    dougFacing:
      "We couldn't turn that sheet into a show. Open the sheet to check the part that changed, then run the same action again. If it keeps happening, contact the developer.",
    crewFacing: null,
    followUp: "Doug → open the sheet, then retry; persistent → Eric",
    helpfulContext:
      "The sheet itself reached us, so this is not a sharing problem. Most often something in the sheet changed in a way we could not read; sometimes the copy saved by the last scan is missing or was already marked failed. Open the sheet to check the part that changed, then run the same action again. Any previously approved version stays live for crew until a clean version goes through. If a fresh scan keeps landing here, contact the developer.",
    title: "Sheet could not be read",
    longExplanation:
      "This appears when we reached the sheet but could not build a show from it. The usual cause is a change in the sheet that we could not read: a section header, a column, or a block in a shape we do not recognize. It can also mean the copy saved by the last scan is missing or was already marked failed, in which case a fresh scan is the fix. Any previously approved version stays live for crew until a clean version goes through. If it keeps happening after a fresh scan, contact the developer.",
    helpHref: "/help/errors#STAGED_PARSE_FAILED",
  },
  ROLE_MAPPINGS_OUTDATED_AT_PUBLISH: {
    code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
    warningClass: "general",
    dougFacing:
      "The roles you've added changed after setup reviewed this part, so it's on hold instead of going live.",
    crewFacing: null,
    followUp:
      "Doug → re-scan the sheet in setup (or run the show's sheet check), then publish again",
    helpfulContext:
      "Setup remembers which of your added roles shaped this show's pages. One of those roles was removed or changed after the sheet was reviewed, so publishing is on hold rather than going live with out-of-date choices. Re-scan the sheet in setup (or run the show's sheet check) to pick up your current choices, then publish again.",
    title: "Roles changed during setup",
    longExplanation:
      "Setup remembers which of your added roles shaped this show's pages. One of those roles was removed or changed after the sheet was reviewed, so publishing is on hold rather than going live with out-of-date choices. Re-scan the sheet in setup (or run the show's sheet check) to pick up your current choices, then publish again.",
    helpHref: "/help/errors#ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
  },
  STAGED_PARSE_OUTDATED_AT_PHASE_D: {
    code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
    warningClass: "general",
    dougFacing: "This sheet changed after setup reviewed it, so its update is on hold.",
    crewFacing: null,
    followUp: "Doug → re-scan the folder in setup, then re-review and publish",
    helpfulContext:
      "Setup saves the version of each sheet you reviewed and checks it has not changed before publishing. This sheet looks like it was edited after review, so the update is on hold instead of overwriting the newer version. Go back to the scan step and re-scan the folder to pick up the latest version, then review and publish again.",
    title: "This sheet changed during setup",
    longExplanation:
      "Setup saves the version of each sheet you reviewed and confirms it has not changed before publishing. This sheet was edited after review, so its update is on hold rather than overwriting the newer content. Go back to the scan step and re-scan the folder to refresh this sheet, then review and publish again.",
    helpHref: "/help/errors#STAGED_PARSE_OUTDATED_AT_PHASE_D",
  },
  STALE_ORPHAN_REPORT: {
    code: "STALE_ORPHAN_REPORT",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "An old, unfinished bug-report reservation was cleared automatically during routine cleanup. No action needed.",
    dougFacing:
      "A stale bug-report reservation for <show-name> expired before it could create a GitHub issue. No action needed unless it repeats.",
    crewFacing: null,
    followUp: "Eric → inspect report-reaper logs if this recurs",
    helpfulContext:
      "The reservation aged past the 24-hour recovery horizon with an expired lease and was reaped before an issue existed. Repeats would point at a stuck submit path worth a look.",
    title: "Stale bug-report reservation expired",
    longExplanation:
      "A bug-report reservation aged past the 24-hour recovery horizon with its processing lease expired and was deleted by the reaper. No user action is needed unless this repeats.",
    helpHref: "/help/errors#STALE_ORPHAN_REPORT",
  },
  SYNC_FILE_FAILED: {
    code: "SYNC_FILE_FAILED",
    warningClass: "general",
    dougFacing: "One sheet could not be synced. The other sheets continued.",
    crewFacing: null,
    followUp: "Doug → retry sync; Eric if persistent",
    helpfulContext: "A per-file sync step failed and was isolated from the rest of the folder run.",
    title: "One sheet failed during folder sync",
    longExplanation:
      "A per-file sync step failed and was isolated from the rest of the folder run. The other sheets continued normally.",
    helpHref: "/help/errors#SYNC_FILE_FAILED",
  },
  SYNC_INFRA_ERROR: {
    code: "SYNC_INFRA_ERROR",
    warningClass: "general",
    dougFacing: "A sync infrastructure step failed. The rest of the folder continued.",
    crewFacing: null,
    followUp: "Eric → inspect sync_log payload",
    helpfulContext:
      "A database or Supabase boundary returned an infrastructure error. The structured log payload keeps the original operation and error class for debugging.",
    title: "Sync hit an infrastructure error",
    longExplanation:
      "A database or Supabase boundary returned an unexpected error during the sync step. The rest of the folder kept running. The structured log payload preserves the original operation and error class so the developer can investigate.",
    helpHref: "/help/errors#SYNC_INFRA_ERROR",
  },
  SYNC_STEP_TIMEOUT: {
    code: "SYNC_STEP_TIMEOUT",
    warningClass: "general",
    dougFacing: "A Drive sync step timed out. We'll retry on the next run.",
    crewFacing: null,
    followUp: "Eric → inspect Drive latency if recurring",
    helpfulContext:
      "A Drive read or enrichment step exceeded the per-step timeout while the show sync lock was held.",
    title: "Drive sync step timed out",
    longExplanation:
      "A Drive read or enrichment step exceeded its per-step timeout while the show sync lock was held. We'll retry on the next run.",
    helpHref: "/help/errors#SYNC_STEP_TIMEOUT",
  },
  PICKER_EPOCH_RESET: {
    code: "PICKER_EPOCH_RESET",
    warningClass: "general",
    resolution: "manual",
    audience: "doug",
    dougFacing:
      "Picker selections for <show-name> were reset. Crew will be asked to pick themselves again on their next visit.",
    crewFacing: null,
    followUp: "Doug → re-share the show link if needed",
    helpfulContext:
      "The share link itself didn't change, so crew just pick their name again on the next visit, and any open tabs re-prompt on refresh. Nothing to fix; this is a record of the reset.",
    title: "Picker selections reset",
    longExplanation:
      "This appears after an admin reset bumps a show's picker epoch, which invalidates every saved per-device picker selection without changing the public share link itself. Crew members are asked to pick themselves again the next time they open the link. Any tabs already open re-prompt automatically on refresh or the next realtime update.",
    helpHref: "/help/errors#PICKER_EPOCH_RESET",
  },
  PICKER_SELECTION_RACE: {
    code: "PICKER_SELECTION_RACE",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "Two show-picker actions overlapped, and the app sorted it out automatically. No action needed.",
    dougFacing:
      "In <show-name>, a stale picker selection for <crew-name> was cleaned up after the show's access state changed. No action needed: newer selections were left intact.",
    crewFacing: null,
    followUp: "Informational; Eric if frequent",
    helpfulContext:
      "A browser cleaned up a picker cookie whose epoch or crew member no longer matches the show, typically after a reset or roster change. Compare-and-delete touched only that stale entry. No action.",
    title: "Stale picker selection cleaned",
    longExplanation:
      "This appears when a browser submits cleanup for a picker cookie entry whose epoch or crew member no longer matches the show's current access state, typically after an admin reset or a roster change. The compare-and-delete cleanup path removes only that one stale entry and leaves any newer, still-valid selections untouched. No action is needed.",
    helpHref: "/help/errors#PICKER_SELECTION_RACE",
  },
  PICKER_IDENTITY_CLAIMED_TAMPER: {
    code: "PICKER_IDENTITY_CLAIMED_TAMPER",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "A malformed crew-page request was blocked automatically. Nothing needs your attention.",
    dougFacing:
      "A request tried to open a crew page as an already-claimed crew member, which the normal picker never offers. It was blocked and sent to sign-in. Nothing is exposed; text Eric if this repeats.",
    crewFacing: null,
    followUp: "Informational; Eric → check the picker tamper log if it repeats",
    helpfulContext:
      "The crew picker only offers open spots, so a request naming a claimed one cannot come from the normal page. The attempt was blocked before anything loaded and the visitor landed on sign-in; crew pages and data were not exposed.",
    title: "A hand-built crew page request was blocked",
    longExplanation:
      "This appears when a request asks to open a crew page as a crew member whose spot is already claimed. The normal picker never offers a claimed spot, so a request naming one cannot come from the page itself; it is treated as tampering, blocked before anything loads, and redirected to sign-in. Crew pages and data are not exposed. Repeated attempts are worth mentioning to Eric, who can check the picker tamper log for the details each attempt records.",
    helpHref: "/help/errors#PICKER_IDENTITY_CLAIMED_TAMPER",
  },
  PICKER_EPOCH_STALE_BANNER: {
    code: "PICKER_EPOCH_STALE_BANNER",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Doug reset access for this show. Pick yourself again.",
    followUp: "Crew → pick name",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_REMOVED_FROM_ROSTER_BANNER: {
    code: "PICKER_REMOVED_FROM_ROSTER_BANNER",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Your selection is no longer on the roster. Pick your name again.",
    followUp: "Crew → pick name or text Doug",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_EMPTY_ROSTER: {
    code: "PICKER_EMPTY_ROSTER",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Doug hasn't added crew yet. Check back soon.",
    followUp: "Crew → check back; Doug → update sheet",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_NAME_NOT_LISTED: {
    code: "PICKER_NAME_NOT_LISTED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Don't see your name? Ask the person who shared this link to add you.",
    followUp: "Crew → ask the link sender",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_SHOW_UNAVAILABLE: {
    code: "PICKER_SHOW_UNAVAILABLE",
    warningClass: "general",
    dougFacing: null,
    crewFacing:
      "This show isn't available right now. Text Doug for an updated link if you think this is a mistake.",
    followUp: "Crew → text Doug",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  CREW_LINK_UNAVAILABLE: {
    code: "CREW_LINK_UNAVAILABLE",
    warningClass: "general",
    dougFacing: null,
    crewFacing:
      "This link isn't available. If you had a working link, it may have been reset. Text Doug for the current link.",
    followUp: "Crew → text Doug for the current link",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  CREW_SHOW_PAUSED: {
    code: "CREW_SHOW_PAUSED",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "It may be back soon. If you're expecting this show, text Doug.",
    followUp: "Crew → check back later",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_INVALID_INPUT: {
    code: "PICKER_INVALID_INPUT",
    warningClass: "general",
    dougFacing:
      "A picker selection form submitted invalid input. The request was rejected before any cookie was written.",
    crewFacing: "Something went wrong with that selection. Please try picking your name again.",
    followUp: "Crew → try again; Eric if repeated",
    helpfulContext:
      "A picker form submitted malformed slug, share-token, show, epoch, or crew-member data. The server rejected the request before touching the picker cookie.",
    title: "Picker input rejected",
    longExplanation:
      "The picker action received malformed form data and rejected it before writing a credential. If this repeats without a custom client or stale page, inspect the rendered hidden fields.",
    helpHref: "/help/errors#PICKER_INVALID_INPUT",
  },
  PICKER_SWITCH_FAILED: {
    code: "PICKER_SWITCH_FAILED",
    warningClass: "general",
    // Asserts ONLY the server-observable fact. It deliberately does not claim
    // "the identity was not cleared" (a reachable branch stages the cookie
    // deletion before revalidatePath throws) nor "they were shown a retry" (a
    // viewer who closed the menu mid-clear never sees the alert).
    dougFacing: "A crew member's switch person clear did not land.",
    crewFacing: "Couldn't switch. Please try again.",
    followUp: "Crew → try again; Eric if repeated",
    helpfulContext: "The picker clear action failed for a crew member's switch-person tap.",
    title: "Switch person failed",
    longExplanation:
      "A crew member tapped switch person and the clear did not land. The avatar menu stays open with a retry instead of appearing to have worked.",
    helpHref: "/help/errors#PICKER_SWITCH_FAILED",
  },
  PICKER_CREW_MEMBER_NOT_FOUND: {
    code: "PICKER_CREW_MEMBER_NOT_FOUND",
    warningClass: "general",
    dougFacing: "A picker selection targeted a crew row that no longer exists on the show.",
    crewFacing:
      "That crew member was just removed from this show. Pick yourself from the current roster.",
    followUp: "Crew → pick current row; Doug → refresh roster",
    helpfulContext:
      "The submitted crew member was present when the picker rendered but was gone by the time the selection action re-validated inside the show lock.",
    title: "Picker crew row missing",
    longExplanation:
      "A selection referred to a crew row that no longer exists for the show. This usually means a sync changed the roster while the picker page was open.",
    helpHref: "/help/errors#PICKER_CREW_MEMBER_NOT_FOUND",
  },
  PICKER_CREW_MEMBER_WRONG_SHOW: {
    code: "PICKER_CREW_MEMBER_WRONG_SHOW",
    warningClass: "general",
    dougFacing:
      "A picker selection submitted a crew member from a different show. The request was rejected as possible form tampering.",
    crewFacing: "Something went wrong with that selection. Please try picking your name again.",
    followUp: "Crew → try again; Eric if repeated",
    helpfulContext:
      "The submitted crew member exists but belongs to a different show than the share link. The action rejected it without writing a picker cookie.",
    title: "Picker crew row wrong show",
    longExplanation:
      "The picker action received a crew-member id from a different show. This is treated as a tamper signal and no cookie is minted.",
    helpHref: "/help/errors#PICKER_CREW_MEMBER_WRONG_SHOW",
  },
  PICKER_INVALID_SHARE_TOKEN: {
    code: "PICKER_INVALID_SHARE_TOKEN",
    warningClass: "general",
    dougFacing: "A picker selection used a share link token that no longer resolves for this show.",
    crewFacing: "This link is out of date. Text Doug for the current show link.",
    followUp: "Crew → ask Doug for latest link",
    helpfulContext:
      "The selection action re-validated the slug and share token inside the show lock and found that the token no longer matches the show, usually because the share link was rotated.",
    title: "Picker share token invalid",
    longExplanation:
      "The submitted share token no longer resolves for the show. No picker cookie was written; the crew member needs the current show link.",
    helpHref: "/help/errors#PICKER_INVALID_SHARE_TOKEN",
  },
  PICKER_RESOLVER_LOOKUP_FAILED: {
    code: "PICKER_RESOLVER_LOOKUP_FAILED",
    warningClass: "general",
    dougFacing:
      "The picker access resolver hit a database or session lookup error. Crew may see a temporary sign-in failure page.",
    crewFacing: "Couldn't load your show access. Please try again in a moment.",
    followUp: "Crew → retry; Eric if persistent",
    helpfulContext:
      "The picker resolver failed while reading show, crew, share-token, or session state. The app fails closed so it does not accidentally authorize the wrong person.",
    title: "Picker resolver failed",
    longExplanation:
      "A database or auth lookup failed while resolving picker access. The request was stopped instead of falling back to a possibly stale credential.",
    helpHref: "/help/errors#PICKER_RESOLVER_LOOKUP_FAILED",
  },
  PICKER_IDENTITY_CLAIMED: {
    code: "PICKER_IDENTITY_CLAIMED",
    warningClass: "general",
    dougFacing:
      "A picker selection targeted a crew identity that is already claimed by Google sign-in.",
    crewFacing:
      "This name is claimed by a signed-in user. Sign in with their Google account to use it.",
    followUp: "Crew → sign in with Google",
    helpfulContext:
      "A submitted crew row has already been claimed through OAuth. The picker does not mint bypass cookies for claimed identities; the user is routed to Google sign-in instead.",
    title: "Picker identity claimed",
    longExplanation:
      "The selected crew identity is protected by Google sign-in. The action rejected the bypass selection and sends the user through OAuth.",
    helpHref: "/help/errors#PICKER_IDENTITY_CLAIMED",
  },
  PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER: {
    code: "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
    warningClass: "general",
    dougFacing: null,
    crewFacing:
      "This identity is now claimed by a signed-in user. Pick yourself from the current roster or sign in to use the same identity.",
    followUp: "Crew → pick name or sign in",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_BOOTSTRAP_RPC_FAILED: {
    code: "PICKER_BOOTSTRAP_RPC_FAILED",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "The show-picker had trouble starting up for someone. It usually recovers on retry; the developer can check if it persists.",
    dougFacing:
      "In <show-name>, Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening for the same show, contact the developer.",
    dougFacingShowScoped:
      "Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.",
    crewFacing: "Couldn't sign you in. Please try again in a moment.",
    followUp: "Crew → retry; Eric → inspect claim_oauth_identity",
    helpfulContext:
      "The route had a valid Google session but the identity claim errored, so it returned a clean retry page instead of a redirect loop. Repeats on one show may point at a claim-path problem.",
    title: "Picker bootstrap claim failed",
    longExplanation:
      "This appears when the picker-bootstrap route has a valid Google session but the crew-identity claim step returns an error or throws partway through. Rather than redirect the visitor in a loop, the route returns a terminal retry page so they can try again cleanly. If this keeps recurring for the same show, it may point to a deeper claim-path problem worth a developer look.",
    helpHref: "/help/errors#PICKER_BOOTSTRAP_RPC_FAILED",
  },
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: {
    code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "degraded",
    dougSummary:
      "The show-picker couldn't match a show once. It typically resolves on the next try; the developer can review it.",
    dougFacing:
      "Google picker bootstrap couldn't resolve the show link before session validation, so the visitor saw a retry page.",
    crewFacing: "Couldn't sign you in. Please try again in a moment.",
    followUp: "Crew → retry; Eric → inspect resolve_show_by_slug_and_token",
    helpfulContext:
      "It failed before any signed-in identity existed, so the alert carries no email or share token by design. The visitor saw a retry page and can open the link again.",
    title: "Picker bootstrap show resolve failed",
    longExplanation:
      "This appears when the picker-bootstrap route fails while resolving the tokenized show URL, before it even has a signed-in visitor's email to work with. Because no identity is available yet at this point, the alert intentionally carries no email and excludes the bearer share token from its context. The visitor sees a retry page and can try the link again.",
    helpHref: "/help/errors#PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
  },
  OAUTH_IDENTITY_CLAIMED: {
    code: "OAUTH_IDENTITY_CLAIMED",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary:
      "A sign-in identity was already linked, and the app handled it automatically. No action needed.",
    dougFacing:
      "In <show-name>, <crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
    dougFacingShowScoped:
      "<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
    crewFacing: null,
    followUp: "Informational",
    helpfulContext:
      "From now on that row skips the picker and goes straight through Google sign-in. Routine success record; no action needed.",
    title: "Crew identity claimed",
    longExplanation:
      "This appears when a crew row's identity gets claimed through the OAuth claim path after a Google sign-in. The claim stamps that crew row as claimed by the specific signed-in user, so on future visits picker attempts for that row route straight through Google sign-in instead of showing the picker again. No action is needed; this is a routine record of a successful claim.",
    helpHref: "/help/errors#OAUTH_IDENTITY_CLAIMED",
  },
  CALLBACK_CLAIM_THREW: {
    code: "CALLBACK_CLAIM_THREW",
    warningClass: "general",
    resolution: "manual",
    audience: "health",
    healthWeight: "notice",
    dougSummary: "A sign-in step hit a hiccup and will retry on the next visit. No action needed.",
    dougFacing:
      "The OAuth callback's claim step threw before it could finish. The next show visit retries automatically through picker bootstrap.",
    crewFacing: null,
    followUp: "Eric → inspect callback claim logs",
    helpfulContext:
      "The callback never mints picker cookies, so nothing is left half-claimed. Picker bootstrap retries the claim automatically on the visitor's next show visit.",
    title: "OAuth claim threw",
    longExplanation:
      "This appears when the OAuth callback hits an unexpected exception while trying to stamp a crew identity claim. The callback itself never mints picker cookies, so nothing is left in a half-claimed state; the bootstrap route simply retries the claim automatically on the visitor's next show visit.",
    helpHref: "/help/errors#CALLBACK_CLAIM_THREW",
  },
  SIGN_IN_OR_SKIP_PROMPT: {
    code: "SIGN_IN_OR_SKIP_PROMPT",
    warningClass: "general",
    dougFacing: null,
    crewFacing:
      "Sign in to use the same identity on every show, or skip to pick from this show's roster.",
    followUp: "Crew → sign in or continue as guest",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SIGN_IN_OR_SKIP_PROMPT_MISMATCH: {
    code: "SIGN_IN_OR_SKIP_PROMPT_MISMATCH",
    warningClass: "general",
    dougFacing: null,
    crewFacing:
      "You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest, which signs this device out so you can pick your name from the roster.",
    followUp: "Crew → sign out or continue as guest",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  IDENTITY_DEACTIVATED_LOCK_HINT: {
    code: "IDENTITY_DEACTIVATED_LOCK_HINT",
    warningClass: "general",
    dougFacing: null,
    crewFacing: "Sign in to use this identity.",
    followUp: "Crew → sign in",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  TRAVEL_FLIGHT_NAME_UNMATCHED: {
    code: "TRAVEL_FLIGHT_NAME_UNMATCHED",
    warningClass: "parse_warning",
    dougFacing:
      "A flight on the TRAVEL tab couldn't be matched to a crew name. Check the name spelling matches the roster.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A flight's crew name didn't match exactly one roster name, so the flight was skipped rather than mis-assigned. Fix the spelling so it matches the roster.",
    triggerContext: "Appears when a FLIGHT DETAILS name matches zero or several crew names.",
    title: "TRAVEL flight name unmatched",
    longExplanation:
      "A flight in the TRAVEL tab couldn't be matched to any roster crew member. The flight is skipped to avoid mis-assigning it; correct the name spelling so it matches the roster.",
    helpHref: "/help/errors#TRAVEL_FLIGHT_NAME_UNMATCHED",
  },
  TRAVEL_FLIGHT_UNPARSEABLE: {
    code: "TRAVEL_FLIGHT_UNPARSEABLE",
    warningClass: "parse_warning",
    dougFacing:
      "A crew member's TRAVEL-tab flight couldn't be read (no recognizable flight date). Check the format.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A flight row had no readable date, so it was skipped. Start each leg with an M/D date, like '3/22 AA123 JFK - LAX'.",
    triggerContext: "Appears when a FLIGHT DETAILS cell has no date we can read.",
    title: "Flight we couldn't read",
    longExplanation:
      "A crew member's TRAVEL-tab flight cell had no recognizable flight date and was skipped. Check the format matches the expected pattern.",
    helpHref: "/help/errors#TRAVEL_FLIGHT_UNPARSEABLE",
  },
  TRAVEL_FLIGHT_AMBIGUOUS_TABLE: {
    code: "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
    warningClass: "parse_warning",
    dougFacing:
      "Found more than one TRAVEL flight table. Remove or rename the duplicate/old one so flights can be read.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "The sheet has more than one TRAVEL flight table, so no flights were attached, since they could belong to different shows. Remove or rename the old table so only one remains.",
    triggerContext: "Appears when the sheet holds two or more FLIGHT DETAILS tables.",
    title: "Multiple TRAVEL flight tables",
    longExplanation:
      "More than one TRAVEL flight table was found in the sheet. Flights are not attached from any of them; remove or rename the duplicate so only one remains.",
    helpHref: "/help/errors#TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
  },
  TRAVEL_TRANSPORT_NAME_UNMATCHED: {
    code: "TRAVEL_TRANSPORT_NAME_UNMATCHED",
    warningClass: "parse_warning",
    dougFacing:
      "A transport assignment in _<sheet-name>_ doesn't clearly match a crew member, possibly a typo, or two names merged into one cell, so that person won't see their transport details. Check the transport section, or add the crew member if they're genuinely missing.",
    crewFacing: null,
    followUp: "Doug → fix the transport name or add the crew member",
    helpfulContext:
      "A transport assignee's name didn't clearly match one crew member, so that ride can't show on anyone's page. Fix the spelling, split merged names, or add the missing crew member.",
    triggerContext: "Appears when a transport name matches zero or several crew names.",
    title: "Transport name doesn't match a crew member",
    longExplanation:
      "We match each transport assignment to a crew member by name. This name didn't clearly match one crew member, usually a typo, or two names merged into one cell, so that person won't see their transport details. Fix the transport section of the sheet, or add the crew member if they're genuinely missing.",
    helpHref: "/help/errors#TRAVEL_TRANSPORT_NAME_UNMATCHED",
  },
  WEBHOOK_HEADERS_MISSING: {
    code: "WEBHOOK_HEADERS_MISSING",
    warningClass: "general",
    dougFacing: "A Drive webhook request was missing required Google headers.",
    crewFacing: null,
    followUp: "Eric → inspect webhook delivery",
    helpfulContext:
      "Google Drive's push notifications carry a fixed set of headers identifying the channel, resource, and verification token. A request reached our webhook endpoint without those headers, usually that means a stale subscription is still firing or someone's probing the endpoint. The developer has been notified; no action is needed unless this keeps appearing.",
    title: "Drive webhook missing headers",
    longExplanation:
      "Google Drive's push notifications carry a fixed set of headers identifying the channel, resource, and verification token. A request reached our webhook endpoint without those headers, usually because a stale subscription is still firing or someone is probing the endpoint. The developer has been notified.",
    helpHref: "/help/errors#WEBHOOK_HEADERS_MISSING",
  },
  // Validation-environment reset / reseed — admin-only routes, crew-invisible.
  VALIDATION_RESET_NOT_ALLOWED: {
    code: "VALIDATION_RESET_NOT_ALLOWED",
    warningClass: "general",
    dougFacing: "Data reset is only available on the validation environment.",
    crewFacing: null,
    followUp: "Doug → use the validation environment",
    helpfulContext:
      "The Reset-validation-data action (Settings → Maintenance card) only runs against the validation Supabase project as a safety fence so it can never be triggered against a production or staging database. If you're seeing this, either the environment variable pointing at the Supabase project is wrong, or the request reached the wrong deployment. Use the validation environment URL to trigger a reset.",
    title: "Reset only on validation",
    longExplanation:
      "The Reset-validation-data action (Settings → Maintenance card) only runs against the validation Supabase project as a safety fence so it can never be triggered against a production or staging database. Use the validation environment URL to trigger a reset.",
    helpHref: "/help/errors#VALIDATION_RESET_NOT_ALLOWED",
  },
  VALIDATION_RESET_NOT_ENABLED: {
    code: "VALIDATION_RESET_NOT_ENABLED",
    warningClass: "general",
    dougFacing: "Destructive reset isn't enabled for this database yet.",
    crewFacing: null,
    followUp: "Eric → enable the reset flag",
    helpfulContext:
      "The Reset-validation-data action (Settings → Maintenance card) reached the correct project but the destructive-reset flag is turned off, which prevents any data from being wiped. The developer needs to enable the flag for this project before resets are allowed. Once enabled, the action will proceed normally.",
    title: "Reset flag not enabled",
    longExplanation:
      "The Reset-validation-data action (Settings → Maintenance card) reached the correct project but the destructive-reset flag is turned off. The developer needs to enable the flag for this project before resets are allowed.",
    helpHref: "/help/errors#VALIDATION_RESET_NOT_ENABLED",
  },
  VALIDATION_RESET_FAILED: {
    code: "VALIDATION_RESET_FAILED",
    warningClass: "general",
    dougFacing: "The validation reset couldn't finish. Please try again.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "The Reset-validation-data action (Settings → Maintenance card) started the delete-based reset sequence but hit an unexpected database or infrastructure fault partway through. The database may be in a partially reset state. Running the reset again is safe; the sequence is designed to be idempotent. If it keeps failing, the developer needs to investigate the underlying database error.",
    title: "Validation reset failed",
    longExplanation:
      "The Reset-validation-data action (Settings → Maintenance card) hit an unexpected fault partway through the delete-based reset sequence. Running the reset again is safe. If it keeps failing, the developer needs to investigate.",
    helpHref: "/help/errors#VALIDATION_RESET_FAILED",
  },
  VALIDATION_RESEED_FAILED: {
    code: "VALIDATION_RESEED_FAILED",
    warningClass: "general",
    dougFacing: "Reseeding the validation fixtures couldn't finish. Please try again.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "The Reseed-validation-fixtures action (Settings → Maintenance card) started inserting fixture rows but hit an unexpected database or infrastructure fault partway through. The fixture data may be partially written. Running the reseed again is safe. If it keeps failing, the developer needs to investigate the underlying database error.",
    title: "Validation reseed failed",
    longExplanation:
      "The Reseed-validation-fixtures action (Settings → Maintenance card) hit an unexpected fault partway through the fixture-insert sequence. Running the reseed again is safe. If it keeps failing, the developer needs to investigate.",
    helpHref: "/help/errors#VALIDATION_RESEED_FAILED",
  },
} as const satisfies Record<string, MessageCatalogEntry>;

export type MessageCode = keyof typeof MESSAGE_CATALOG;
