export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
  title: string | null;
  longExplanation: string | null;
  helpHref: string | null;
};

export const MESSAGE_CATALOG = {
  GOOGLE_NO_CREW_MATCH: {
    code: "GOOGLE_NO_CREW_MATCH",
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
    dougFacing:
      "Two crew rows share the same email — Google login is unsafe to resolve. The duplicate-email check normally catches this; please re-share the sheet so we can re-parse, or contact the developer.",
    crewFacing: "Something is misconfigured for this show. Doug has been notified.",
    followUp: "Doug → fix sheet duplicate; if persistent, Eric",
    helpfulContext:
      "When two people on the crew list share the same email address, we can't safely tell who's logging in. The duplicate-email check should normally catch this in the parse step. If you're seeing this code, the safest fix is to look at the most recent edits to your crew block — usually one of the two emails is a typo or a paste mistake. Once you correct the duplicate in your sheet, this alert will clear automatically on the next sync.",
    title: "Two crew rows share an email",
    longExplanation:
      "Two rows in the CREW block share the same email address, so we can't safely tell who is logging in. Usually one of the two emails is a typo or paste mistake. Fix the duplicate in the sheet and this alert will clear on the next sync.",
    helpHref: "/help/errors#AMBIGUOUS_EMAIL_BINDING",
  },
  SESSION_IDLE_TIMEOUT: {
    code: "SESSION_IDLE_TIMEOUT",
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
    dougFacing:
      "We couldn't fetch this sheet from Google Drive. Could be a transient network issue, or the sheet's been moved or unshared. We'll keep retrying. If this stays for more than an hour, click 'Retry' or check the sheet's share settings.",
    crewFacing: "We couldn't get the latest from Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug → check share / Retry",
    helpfulContext:
      "Google Drive temporarily blocked or refused our request to read this sheet. The most common cause is a transient network or permissions hiccup; we keep retrying automatically. If this stays for more than an hour, double-check that the folder is still shared with the service account email and that the sheet hasn't been moved out of the watched folder.",
    title: "Drive fetch failed",
    longExplanation:
      "Google Drive temporarily blocked or refused our request to read this sheet. We keep retrying automatically; if this stays for more than an hour, confirm the folder is still shared with the service account and that the sheet is still in the watched folder.",
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
    dougFacing:
      "_<sheet-name>_ isn't in your folder anymore. Either you moved/unshared it, or it was deleted. Re-share it to bring the show back.",
    crewFacing: "We couldn't get the latest from Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug → re-share sheet",
    helpfulContext:
      "We expected to find this sheet in your watched folder but it's not there anymore. Either someone moved it to a different folder, the share was removed, or the file was deleted. Crew see the last good version we have on file. Re-share or move the sheet back into the folder and we'll pick it up on the next sync.",
    title: "Sheet no longer in folder",
    longExplanation:
      "We expected to find this sheet in the watched folder but it isn't there anymore. Either it was moved, unshared, or deleted. Crew see the last good version on file; re-share or move the sheet back in to bring the show back.",
    helpHref: "/help/errors#SHEET_UNAVAILABLE",
  },
  PARSE_ERROR_LAST_GOOD: {
    code: "PARSE_ERROR_LAST_GOOD",
    dougFacing:
      "_<sheet-name>_'s latest edit didn't parse. The previous approved version is still showing to crew. See the per-show parse panel for the error detail.",
    crewFacing:
      "We couldn't read the latest edit to Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug → fix sheet (see parse panel); Crew → mention to Doug",
    helpfulContext:
      "A recent edit to the sheet introduced something the parser couldn't read, but we kept the previously approved version live so crew aren't blocked. Open the per-show parse panel to see the specific MI-N code explaining what went wrong, fix it in the sheet, and the next sync will replace the stale data.",
    title: "Latest edit didn't parse",
    longExplanation:
      "A recent edit to the sheet introduced something the parser couldn't read. The previously approved version is still serving crew. Open the per-show parse panel for the specific underlying error, fix the sheet, and the next sync will replace the stale data.",
    helpHref: "/help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD",
  },
  STALE_WRITE_ABORTED: {
    code: "STALE_WRITE_ABORTED",
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
    dougFacing:
      "This manual sync is stale — a newer parse has already been applied. Refresh the page to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "You clicked 'Sync' against a version that's already been superseded by a newer parse. No work was lost — just refresh the admin page to see the current state and try again from there if needed.",
    title: "Manual sync already superseded",
    longExplanation:
      "You clicked Sync against a version that has already been replaced by a newer parse. Nothing was lost. Refresh the admin page to see the current state and act from there.",
    helpHref: "/help/errors#STALE_MANUAL_REPLAY_ABORTED",
  },
  STALE_PUSH_ABORTED: {
    code: "STALE_PUSH_ABORTED",
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
    dougFacing:
      "A leftover action from a retired setup wizard bumped into the newer one and was safely cancelled before it could change the new wizard's state. Any setup-scan leftovers from the old tab are inert and cleaned up automatically — continue in the active wizard tab.",
    crewFacing: null,
    followUp: "Doug → continue in the active wizard tab",
    helpfulContext:
      "Setup wizards run one at a time. An action from an older wizard tab (retry, defer, ignore, or discard) raced a newer wizard that had just taken over, and we cancelled the older action before it could change the new wizard's state. Any setup-scan leftovers from the old tab are inert and cleaned up automatically — this alert exists so you know the old tab tried. Continue in the active wizard tab.",
    title: "Stale wizard action cancelled",
    longExplanation:
      "Setup wizards run one at a time. An action from an older wizard tab (retry, defer, ignore, or discard) raced a newer wizard that had just taken over; the older action was cancelled before it could change the new wizard's state, and any setup-scan leftovers from the old tab are inert and cleaned up automatically. Continue working in the active wizard tab.",
    helpHref: "/help/errors#WIZARD_SESSION_SUPERSEDED_RACE",
  },
  // Onboarding-fixups F4 (Task 4.5) — the admin clean-up-old-setup-leftovers
  // action threw an unexpected infra error mid-reap. Per-session transactions:
  // already-reaped sessions stay reaped; the failing session rolled back.
  REAP_STALE_SESSIONS_FAILED: {
    code: "REAP_STALE_SESSIONS_FAILED",
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
    dougFacing:
      "We made an update to the review process since you approved this sheet. Please review and Apply it again to finish setup.",
    crewFacing: null,
    followUp: "Doug → re-Apply the affected sheet",
    helpfulContext:
      "Setup wizards stage your Apply decisions and finalize them in a separate step. Between when you Applied this sheet and when finalize ran, we updated the format used to record your review choices — usually because we added a new kind of decision or expanded what's tracked per item. Rather than silently replay your old-format choices through the new validator (which could mis-derive permissions), we hold this sheet for re-review. Open the wizard tab, re-Apply the affected sheet under the current version, then click Finalize again.",
    title: "Review format updated; re-apply",
    longExplanation:
      "We updated the format used to record your review choices between when you applied this sheet and when finalize ran. Rather than silently replay old-format choices, the wizard holds the sheet for re-review. Re-apply the affected sheet, then click Finalize again.",
    helpHref: "/help/errors#WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED",
  },
  STAGED_PARSE_REVISION_RACE_DURING_FINALIZE: {
    code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
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
    dougFacing:
      "Hold on — your previous report is still being submitted. Try again in a moment if it doesn't go through.",
    crewFacing: "Hold on, your previous report is still processing. Try again in a moment.",
    followUp: "client retries after backoff",
    helpfulContext:
      "Your previous report submission is still being processed by the developer's GitHub. Don't worry — clicking again won't create a duplicate, but it also won't speed things up. If the original doesn't go through within a minute, try once more.",
    title: "Previous report still processing",
    longExplanation:
      "Your previous report submission is still being processed. Clicking again will not create a duplicate but also will not speed things up. If the original doesn't go through within a minute, try once more.",
    helpHref: "/help/errors#IDEMPOTENCY_IN_FLIGHT",
  },
  WATCH_CHANNEL_ORPHANED: {
    code: "WATCH_CHANNEL_ORPHANED",
    dougFacing:
      "A push subscription couldn't be confirmed. We'll fall back to cron until it's resolved.",
    crewFacing: null,
    followUp: "Eric → reconcile / retry",
    helpfulContext:
      "We tried to register a real-time push subscription with Google Drive and didn't get a confirmation back. The cron job will keep this show in sync on its normal schedule; this just means edits won't appear instantly until the developer reconciles the subscription.",
    title: "Push subscription not confirmed",
    longExplanation:
      "We tried to register a real-time push subscription with Google Drive and didn't get a confirmation back. The cron job keeps shows in sync on its normal schedule; edits just won't appear instantly until the subscription is reconciled.",
    helpHref: "/help/errors#WATCH_CHANNEL_ORPHANED",
  },
  WEBHOOK_TOKEN_INVALID: {
    code: "WEBHOOK_TOKEN_INVALID",
    dougFacing:
      "A push notification from Google Drive failed verification — possible spoofing or misconfiguration. The developer has been notified.",
    crewFacing: null,
    followUp: "Eric → investigate",
    helpfulContext:
      "A push notification arrived from Google Drive carrying the wrong verification token. This usually means a stale subscription is still firing or someone's spoofing the endpoint. The developer has been notified and will rotate the token if needed.",
    title: "Drive webhook failed verification",
    longExplanation:
      "A push notification from Google Drive arrived carrying the wrong verification token. Usually this means a stale subscription is still firing or someone is probing the endpoint. The developer has been notified.",
    helpHref: "/help/errors#WEBHOOK_TOKEN_INVALID",
  },
  WEBHOOK_NOOP_ALREADY_SYNCED: {
    code: "WEBHOOK_NOOP_ALREADY_SYNCED",
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
    dougFacing:
      "The opening-reel video has been edited since you reviewed this parse. Crew see the text status only until your next sheet edit re-stages the new reel.",
    crewFacing: null,
    followUp: "Doug → re-edit sheet",
    helpfulContext:
      "The opening-reel video was replaced or edited in Drive after the staged parse was reviewed. Crew see the text status only (e.g., 'YES') without the inline video until you save the sheet again to re-stage the new reel.",
    title: "Opening reel drifted",
    longExplanation:
      "The opening-reel video was replaced or edited in Drive after the staged parse was reviewed. Crew see the text status only without the inline video until you save the sheet again to re-stage the new reel.",
    helpHref: "/help/errors#REEL_DRIFTED",
  },
  OPENING_REEL_NOT_VIDEO: {
    code: "OPENING_REEL_NOT_VIDEO",
    dougFacing:
      "The opening-reel link is not a video file. Crew see the text status only — replace the link with a video file URL to enable inline playback.",
    crewFacing: "Opening reel link is not a video file",
    followUp: "Doug → re-edit sheet",
    helpfulContext:
      "The opening-reel cell in your sheet contains a Drive URL, but the file behind it isn't a video — it's a Google Doc, Slides deck, image, PDF, or some other file type. Crew see the text status only (e.g., 'YES', 'BACKUP ONLY') without an inline player, because we won't try to embed a non-video file in a `<video>` element. To enable inline playback, replace the link with a video file URL (the file's MIME type must start with `video/`).",
    title: "Opening reel link is not a video",
    longExplanation:
      "The opening-reel cell points to a Drive file that isn't a video (most likely a Google Doc, image, or PDF). Crew see the text status only without an inline player. To enable inline playback, replace the link with a video file URL.",
    helpHref: "/help/errors#OPENING_REEL_NOT_VIDEO",
  },
  OPENING_REEL_PERMISSION_DENIED: {
    code: "OPENING_REEL_PERMISSION_DENIED",
    dougFacing:
      "The opening-reel video is no longer shared with FXAV. Crew see the text status only — re-share the video file (or replace the link) to restore inline playback.",
    crewFacing: "Opening reel access revoked",
    followUp: "Doug → re-share / replace link",
    helpfulContext:
      "Drive returned a permission-denied response when we tried to fetch the opening-reel video. The file used to be accessible (we had it pinned at a previous Apply), but the share was revoked, the file was made private, or it was moved out of a shared drive the service account can read. Crew see the text status only without inline playback. To restore: re-share the video file with the service account email, or replace the link with a video file you do share.",
    title: "Opening reel access revoked",
    longExplanation:
      "Drive returned permission-denied when we tried to fetch the opening-reel video. The file used to be accessible but the share was revoked, the file was made private, or it was moved out of a shared drive. Re-share the video, or replace the link with one you do share.",
    helpHref: "/help/errors#OPENING_REEL_PERMISSION_DENIED",
  },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: {
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    dougFacing:
      "A diagram in this sheet can't be re-downloaded automatically. Save the sheet (any edit advances the version) and crew will see the image again on the next sync.",
    crewFacing: null,
    followUp: "Doug → save sheet to advance version",
    helpfulContext:
      "A diagram in your sheet can't be re-downloaded automatically because it doesn't have a content-derived approval token. The fix is to save the sheet — any edit advances the version and lets us mint a fresh approval token on the next sync, which restores the diagram for crew.",
    title: "Diagram needs sheet re-save to recover",
    longExplanation:
      "A diagram in this sheet can't be re-downloaded automatically because it lacks a content-derived approval token. Save the sheet. Any edit advances the version and lets us mint a fresh token on the next sync, which restores the diagram.",
    helpHref: "/help/errors#EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  },
  AGENDA_GONE_FOR_CREW: {
    code: "AGENDA_GONE_FOR_CREW",
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
    dougFacing:
      "Diagram recovery paused because the show changed while recovery was checking files. We'll retry against the latest version on the next run.",
    crewFacing: null,
    followUp: "informational only",
    helpfulContext:
      "Asset recovery fetched and verified diagram bytes against an older snapshot revision, but a newer Apply landed before recovery could write those bytes. The recovery run aborts so it does not attach old assets to the new approved revision.",
    title: "Diagram recovery raced an apply",
    longExplanation:
      "Asset recovery fetched and verified diagram bytes against an older snapshot revision, but a newer Apply landed before recovery could write those bytes. The recovery run aborts so old assets are not attached to the new approved revision; the next run retries against the latest version.",
    helpHref: "/help/errors#ASSET_RECOVERY_REVISION_DRIFT",
  },
  ASSET_RECOVERY_DRIFT_COOLDOWN: {
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    dougFacing:
      "Diagram recovery is backing off briefly because this show keeps changing during recovery. We'll retry automatically after the cooldown.",
    crewFacing: null,
    followUp: "informational only",
    helpfulContext:
      "The previous asset recovery attempt raced with a newer Apply, so recovery is briefly backing off for this snapshot revision. This bounds retry storms while the show is changing frequently.",
    title: "Diagram recovery cooling down",
    longExplanation:
      "The previous asset recovery attempt raced with a newer Apply, so recovery is briefly backing off for this snapshot revision. This bounds retry storms while the show is changing frequently; we'll retry automatically after the cooldown.",
    helpHref: "/help/errors#ASSET_RECOVERY_DRIFT_COOLDOWN",
  },
  APPLY_PROMOTE_PENDING: {
    code: "APPLY_PROMOTE_PENDING",
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
    dougFacing:
      "This show's diagram set is too large to recover automatically (more than 60 images, an image >50MB, or >3GB total). Crew see placeholders for the missing diagrams. Tell the developer if you need this raised, or trim the gallery.",
    crewFacing: null,
    followUp: "Doug → trim gallery / Eric → raise cap",
    helpfulContext:
      "Asset recovery stops above 60 images, above 50MB for one image, or above 3GB per run so the per-show advisory lock stays short and other syncs are not blocked behind a huge gallery recovery. Trim the gallery or ask the developer to raise the ceiling if this show truly needs more.",
    title: "Diagram set too large to recover",
    longExplanation:
      "This show's diagram set is over the per-run ceiling (more than 60 images, an image larger than 50MB, or more than 3GB total). The ceiling keeps the per-show lock short so other syncs aren't blocked behind a huge recovery. Crew see placeholders for the missing diagrams; trim the gallery or ask the developer to raise the ceiling.",
    helpHref: "/help/errors#ASSET_RECOVERY_BYTES_EXCEEDED",
  },
  DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE: {
    code: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
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
    dougFacing:
      "The sheet was edited since your last look — we re-parsed it inside the wizard. Here's the new review.",
    crewFacing: null,
    followUp: "Doug → review the refreshed parse",
    helpfulContext:
      "The wizard re-parsed the sheet inside your current setup session because Doug edited it after the original scan. Review the refreshed parse — any decisions you made on the prior version were discarded.",
    title: "Sheet was re-edited mid-review",
    longExplanation:
      "The sheet changed after the original scan, so the wizard re-parsed it inside your current setup session. Any decisions you made on the prior version were dropped. Review the refreshed parse from the top.",
    helpHref: "/help/errors#STAGED_PARSE_RESTAGED_INLINE",
  },
  STAGED_PARSE_SUPERSEDED: {
    code: "STAGED_PARSE_SUPERSEDED",
    dougFacing:
      "A newer parse has already been applied. Refresh the admin page to review the latest state.",
    crewFacing: null,
    followUp: "Doug → refresh",
    helpfulContext:
      "A newer parse was applied (probably by a different admin or a cron run) before your Apply landed. Refresh the admin page to see the current state.",
    title: "Newer parse already applied",
    longExplanation:
      "A newer parse was applied (probably by a different admin or a cron run) before your Apply landed. Refresh the admin page to see the current state.",
    helpHref: "/help/errors#STAGED_PARSE_SUPERSEDED",
  },
  "MI-1_VERSION_DETECTION_FAILED": {
    code: "MI-1_VERSION_DETECTION_FAILED",
    dougFacing:
      "_<sheet-name>_ doesn't look like your usual show template — none of the version markers we expect (Contact Office row, MAIN/SECONDARY block for v4; Hotel Contact Info row for v2) are present. Either this is a different kind of document, or your template has changed in a way we don't recognize. Tell the developer if your template has changed.",
    crewFacing: null,
    followUp: "Doug → check sheet shape; Eric → add new version detector if real",
    helpfulContext:
      "We look for specific row markers in your show template — the Contact Office row and MAIN/SECONDARY block (v4 sheets), or the Hotel Contact Info row (v2 sheets) — to recognize that this is a real show sheet. None of those markers were found. Either this isn't a show sheet, or your template has changed in a way the parser doesn't yet recognize. If your template has changed intentionally, tell the developer.",
    title: "Unrecognized show template",
    longExplanation:
      "We look for specific row markers in your show template to recognize it as a real show sheet (Contact Office row and MAIN/SECONDARY block for v4; Hotel Contact Info row for v2). None of those markers were found. If your template has changed intentionally, tell the developer.",
    helpHref: "/help/errors#MI-1_VERSION_DETECTION_FAILED",
  },
  "MI-2_TITLE_MISSING": {
    code: "MI-2_TITLE_MISSING",
    dougFacing: "_<sheet-name>_ doesn't have a recognizable show title. Add or fix the CLIENT row.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Every show needs a title — we read it from the CLIENT row in your sheet. Make sure the CLIENT cell is filled in with the show's title, then save the sheet.",
    title: "Show title missing",
    longExplanation:
      "Every show needs a title, which we read from the CLIENT row. The CLIENT cell is empty or unreadable. Fill it in with the show's title and save the sheet.",
    helpHref: "/help/errors#MI-2_TITLE_MISSING",
  },
  "MI-3_NO_PARSEABLE_DATE": {
    code: "MI-3_NO_PARSEABLE_DATE",
    dougFacing:
      "_<sheet-name>_ doesn't have any readable dates — we couldn't find Travel In, Set Day, or Show Day 1 as a parseable date. Check the DATES block.",
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
    dougFacing: "_<sheet-name>_ has no crew rows. Add at least one person to the CREW block.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Every show needs at least one crew member — we read names from the CREW block. The block exists but no rows have parseable names. Add at least one person to the CREW block.",
    title: "No crew rows",
    longExplanation:
      "Every show needs at least one crew member, which we read from the CREW block. The block exists but no rows have parseable names. Add at least one person to the CREW block.",
    helpHref: "/help/errors#MI-4_NO_CREW",
  },
  "MI-5_NO_ROOMS": {
    code: "MI-5_NO_ROOMS",
    dougFacing:
      "_<sheet-name>_ has no rooms — we couldn't find General Session, Breakouts, or Additional Rooms. Make sure your room blocks have setup and time fields filled in.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Every show needs at least one room — we read rooms from the General Session, Breakouts, and Additional Rooms blocks. None of those blocks had a row with both a setup and a time. Make sure your room blocks have those fields filled in.",
    title: "No rooms found",
    longExplanation:
      "Every show needs at least one room, which we read from General Session, Breakouts, and Additional Rooms. None of those blocks had a row with both a setup and a time. Fill those fields in.",
    helpHref: "/help/errors#MI-5_NO_ROOMS",
  },
  "MI-5a_DUPLICATE_CREW_NAME": {
    code: "MI-5a_DUPLICATE_CREW_NAME",
    dougFacing:
      "Two crew rows share the same name in _<sheet-name>_. Disambiguate them (e.g., 'John C.' vs 'John Carleo') so the app can tell them apart.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Two rows in the CREW block have identical names, which means the app can't reliably tell which schedule belongs to which person. Disambiguate them — for example, change one 'John' to 'John C.' or 'John Carleo'.",
    title: "Two crew rows share a name",
    longExplanation:
      "Two rows in the CREW block have identical names, which means the app can't reliably tell which schedule belongs to which person. Disambiguate them: for example, change one 'John' to 'John C.' or 'John Carleo'.",
    helpHref: "/help/errors#MI-5a_DUPLICATE_CREW_NAME",
  },
  "MI-5b_DUPLICATE_CREW_EMAIL": {
    code: "MI-5b_DUPLICATE_CREW_EMAIL",
    dougFacing:
      "Two crew rows share the same email in _<sheet-name>_. Each crew member needs their own email.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Two rows in the CREW block share the same email address. Email is how we identify a crew member across shows, so duplicates would let one person see another's view. Each crew row needs a distinct email — fix the typo or paste mistake and re-save.",
    title: "Two crew rows share an email",
    longExplanation:
      "Two rows in the CREW block share the same email address. Email is how we identify a crew member across shows, so duplicates would let one person see another's view. Give each crew row a distinct email.",
    helpHref: "/help/errors#MI-5b_DUPLICATE_CREW_EMAIL",
  },
  SLUG_COLLISION_EXHAUSTED: {
    code: "SLUG_COLLISION_EXHAUSTED",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric → investigate",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  ONBOARDING_FINALIZE_INTERNAL_ERROR: {
    code: "ONBOARDING_FINALIZE_INTERNAL_ERROR",
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
    dougFacing:
      "(admin-log only on first occurrence; the dashboard explicitly shows the onboarding wizard CTA when no folder is configured, not an error)",
    crewFacing: null,
    followUp: "Doug → run setup wizard",
    helpfulContext:
      "Cron ran before the setup wizard saved a watched Drive folder. That is expected during first setup: the dashboard should show the setup call to action instead of treating it as a show error. Run the setup wizard to choose the folder.",
    title: "No watched folder yet",
    longExplanation:
      "Cron ran before the setup wizard saved a watched Drive folder. That's expected during first setup; the dashboard shows the setup call to action instead of treating it as a show error. Run the setup wizard to choose a folder.",
    helpHref: "/help/errors#NO_FOLDER_CONFIGURED",
  },
  "MI-6_CREW_SHRINKAGE": {
    code: "MI-6_CREW_SHRINKAGE",
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
    dougFacing:
      "_<sheet-name>_ lost more than half of its _<section>_ — _<prior_count>_ before, _<new_count>_ now. Review before applying.",
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
    dougFacing: "_<sheet-name>_: _<entry>_ is no longer in the sheet. Review before applying.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A specific named entry — a particular hotel, room, or contact — that was in the sheet last sync is no longer there. We hold the change for review because keyed entries usually represent committed bookings or relationships. Confirm before applying.",
    title: "Named entry removed",
    longExplanation:
      "A specific named entry (a particular hotel, room, or contact) that was in the sheet last sync is no longer there. We hold the change for review because keyed entries usually represent committed bookings or relationships.",
    helpHref: "/help/errors#MI-7b_KEYED_PRESERVATION",
  },
  "MI-8_FINANCIAL_FIELD_COLLAPSE": {
    code: "MI-8_FINANCIAL_FIELD_COLLAPSE",
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
  "MI-9_ROLE_FLAGS_DELTA": {
    code: "MI-9_ROLE_FLAGS_DELTA",
    dougFacing:
      "_<crew-name>_'s LEAD status changed (was _<prior>_, now _<new>_). LEAD grants admin / ops / financials access — confirm before applying.",
    crewFacing: null,
    followUp: "Doug → review staged",
    helpfulContext:
      "A crew member's LEAD status changed — they either gained or lost LEAD. LEAD grants admin/ops surface access including the ability to see internal financials, so we hold every LEAD toggle for review. (Non-LEAD role_flags changes — like swapping a department designation from A1 to V1, or adding BO — auto-apply with a `ROLE_FLAGS_NOTICE` entry in the alert feed and do NOT trigger this code.) Confirm the LEAD change is intentional before applying.",
    title: "LEAD status changed",
    longExplanation:
      "A crew member's LEAD status changed. LEAD grants admin / ops surface access including internal financials, so every LEAD toggle is held for review. Confirm the change is intentional before applying.",
    helpHref: "/help/errors#MI-9_ROLE_FLAGS_DELTA",
  },
  ROLE_FLAGS_NOTICE: {
    code: "ROLE_FLAGS_NOTICE",
    severity: "info",
    dougFacing:
      "A crew member's role flags changed. The LEAD bit is unchanged, so the change was applied automatically — this entry is here for audit.",
    crewFacing: null,
    followUp: "none (informational)",
    helpfulContext:
      "A crew member's role flags changed in a way that doesn't affect LEAD status — for example, a department designation swap (A1 → V1), or an additive flag like BO. These changes affect which scope tile the crew member sees on their own page but don't grant or remove admin/ops access, so we apply them automatically and log this entry for your audit trail. No action needed; if you want to see the prior value, the audit page captures it.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  MI11_TARGET_MOVED: {
    code: "MI11_TARGET_MOVED",
    dougFacing:
      "The sheet changed since this was queued, so we didn't apply it. Re-open the show to review the latest version.",
    crewFacing: null,
    followUp: "Doug → re-review",
    helpfulContext:
      "Before applying a queued email change we re-check the live sheet. If Doug edited the sheet after this change was queued, the change you're approving may no longer match what the sheet says — so we stop and ask you to re-review the latest version rather than apply a stale value.",
    title: "Sheet changed since this was queued",
    longExplanation:
      "Before applying a queued email change we re-check the live sheet. If the sheet was edited after this change was queued, the change you're approving may no longer match what the sheet says — so we stop rather than apply a stale value. Re-open the show to review the latest version.",
    helpHref: "/help/errors#MI11_TARGET_MOVED",
  },
  MI11_DRIVE_RECHECK_FAILED: {
    code: "MI11_DRIVE_RECHECK_FAILED",
    dougFacing: "We couldn't re-check the sheet right now. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "Before applying a queued email change we ask Google Drive for the sheet's latest revision time. That check just failed — usually a transient network or permissions hiccup. Nothing was changed. Try Approve again in a moment; if it keeps failing, check that the folder is still shared with the service account.",
    title: "Couldn't re-check the sheet",
    longExplanation:
      "Before applying a queued email change we ask Google Drive for the sheet's latest revision time. That check failed — usually a transient network or permissions hiccup. Nothing was changed. Try Approve again in a moment; if it keeps failing, check that the folder is still shared with the service account.",
    helpHref: "/help/errors#MI11_DRIVE_RECHECK_FAILED",
  },
  MI11_HOLD_ALREADY_RESOLVED: {
    code: "MI11_HOLD_ALREADY_RESOLVED",
    dougFacing: "That change was already resolved. Refresh to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh",
    helpfulContext:
      "This pending email change was already resolved — either a later sync brought the sheet back in line on its own, or you (or another open tab) already approved or rejected it. There's nothing left to do here; refresh the show to see the current state.",
    title: "Change already resolved",
    longExplanation:
      "This pending email change was already resolved — either a later sync brought the sheet back in line on its own, or you (or another open tab) already approved or rejected it. There's nothing left to do here; refresh the show to see the current state.",
    helpHref: "/help/errors#MI11_HOLD_ALREADY_RESOLVED",
  },
  IDENTITY_WOULD_COLLIDE: {
    code: "IDENTITY_WOULD_COLLIDE",
    dougFacing:
      "We can't apply this email change without it clashing with another crew member's email or name. Fix the conflict in the sheet, then re-sync.",
    crewFacing: null,
    followUp: "Doug → fix sheet conflict",
    helpfulContext:
      "Applying this email change would give a crew member an email or name that another crew member already has, and that other row isn't part of the same swap — so we can't apply it without creating a duplicate. Two crew rows can't share an email. Fix the clash in the sheet (one of them is usually a typo or a stale row), then re-sync.",
    title: "Email change would clash with another crew member",
    longExplanation:
      "Applying this email change would give a crew member an email or name that another crew member already has, and that other row isn't part of the same swap — so we can't apply it without creating a duplicate. Two crew rows can't share an email. Fix the clash in the sheet (one of them is usually a typo or a stale row), then re-sync.",
    helpHref: "/help/errors#IDENTITY_WOULD_COLLIDE",
  },
  UNDO_SUPERSEDED: {
    code: "UNDO_SUPERSEDED",
    dougFacing:
      "A newer sync already changed this, so there's nothing to undo. Refresh to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh",
    helpfulContext:
      "Undo only reverses the most recent change to a crew member. A newer sync has already changed this person again since the change you're trying to undo, so the saved 'before' value no longer matches what's live. Refresh to see the current state; if you still want the old value, edit the sheet directly.",
    title: "Nothing to undo — a newer sync already changed this",
    longExplanation:
      "Undo only reverses the most recent change to a crew member. A newer sync has already changed this person again since the change you're trying to undo, so the saved 'before' value no longer matches what's live. Refresh to see the current state; if you still want the old value, edit the sheet directly.",
    helpHref: "/help/errors#UNDO_SUPERSEDED",
  },
  UNDO_EMAIL_CLAIMED: {
    code: "UNDO_EMAIL_CLAIMED",
    dougFacing:
      "We can't undo this — the original email now belongs to someone else on the crew list. Fix it in the sheet instead.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "Undoing this would restore an email address that now belongs to a different crew member, and two people can't share an email. Rather than undo, fix the email in the sheet — the next sync will reconcile it safely.",
    title: "Can't undo — that email now belongs to someone else",
    longExplanation:
      "Undoing this would restore an email address that now belongs to a different crew member, and two people can't share an email. Rather than undo, fix the email in the sheet — the next sync will reconcile it safely.",
    helpHref: "/help/errors#UNDO_EMAIL_CLAIMED",
  },
  UNDO_NOT_FOUND: {
    code: "UNDO_NOT_FOUND",
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
  mi11_pending_email_change: {
    code: "mi11_pending_email_change",
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
    severity: "info",
    dougFacing:
      "_<sheet-name>_ is now live for crew at its share-token URL. _<crew-count>_ crew, _<show-date>_. **Made a mistake?** You have 24 hours to Undo auto-publish — while that window is open, the button is on this alert and on the show's page, and when email is set up the published notice carries the same undo link. After it closes, archive the show from its page instead. Either way its crew link switches off until you republish.",
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "We auto-published this show because the parse looked clean — all the safety checks passed. The crew page is now live at its share-token URL. If you dragged in the wrong sheet or weren't ready, you have 24 hours to Undo auto-publish — while that window is open, the button is on this alert and on the show's page, and when email is set up the published notice carries the same undo link. After it closes, archive the show from its per-show page instead. Either way the crew link stops resolving until you republish.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_UNPUBLISHED: {
    code: "SHOW_UNPUBLISHED",
    dougFacing:
      "_<sheet-name>_ has been unpublished. Its share-token URL no longer works. Drag the sheet back into your watched folder when you're ready to publish again.",
    crewFacing: null,
    followUp: "Doug → optionally re-share when ready",
    helpfulContext:
      "You clicked Unpublish on a recently-published show. The show is now archived, its share-token URL no longer resolves, and crew can no longer reach the page. Nothing is lost — your sheet is unchanged. Drag it back into the watched folder when you're ready to publish for real.",
    title: "Show unpublished",
    longExplanation:
      "You clicked Unpublish on a recently-published show. The show is archived, its share-token URL no longer resolves, and crew can no longer reach the page. Nothing is lost. Drag the sheet back into the watched folder when you're ready to publish again.",
    helpHref: "/help/errors#SHOW_UNPUBLISHED",
  },
  UNPUBLISH_TOKEN_CONSUMED: {
    code: "UNPUBLISH_TOKEN_CONSUMED",
    dougFacing:
      "This undo has already been used. The show is already unpublished, or someone else (or another tab) got there first.",
    crewFacing: null,
    followUp: "Doug → check show status in admin",
    helpfulContext:
      "The auto-publish undo is single-use, and it's already been used. Either the show is already unpublished, or you (or another tab) already triggered it. You'll only ever see this message inside the admin — a spent emailed link shows a generic not-found page instead. Check the show's page to confirm the current state.",
    title: "Undo already used",
    longExplanation:
      "The auto-publish undo is single-use and has already been used. Either the show is already unpublished, or another tab or admin got there first. This message renders only inside the admin — spent emailed links show a generic not-found page. Check the show's page to confirm the current state.",
    helpHref: "/help/errors#UNPUBLISH_TOKEN_CONSUMED",
  },
  UNPUBLISH_TOKEN_EXPIRED: {
    code: "UNPUBLISH_TOKEN_EXPIRED",
    dougFacing:
      "This unpublish link expired. Links stay valid for 24 hours; to take this show offline now, archive it from the admin dashboard.",
    crewFacing: null,
    followUp: "Doug → archive via dashboard",
    helpfulContext:
      "The auto-publish unpublish link is short-lived. It stays valid for 24 hours after issuance; after that, the safety net closes — the show is treated as a normal published show. To take it offline now, open the admin dashboard and archive it from the show's parse panel.",
    title: "Unpublish link expired",
    longExplanation:
      "The auto-publish unpublish link is short-lived. It stays valid for 24 hours after issuance; after that, the show is treated as a normal published show. To take it offline now, archive it from the show's parse panel.",
    helpHref: "/help/errors#UNPUBLISH_TOKEN_EXPIRED",
  },
  ONBOARDING_SCAN_REVIEW: {
    code: "ONBOARDING_SCAN_REVIEW",
    dougFacing:
      "_<sheet-name>_ was found in your folder — review the parse before activating this folder.",
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
    dougFacing:
      "We found a row labeled _<key>_ in _<sheet-name>_ that doesn't match a section we recognize. We kept it as-is and nothing's broken. Want to flag it to us?",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "We found a row that doesn't match any section we read (CLIENT, DATES, CREW, and so on). It isn't breaking anything — we kept the row exactly as it is. If it's something you want handled, use Report; otherwise you can ignore this.",
    title: "Unrecognized row in sheet",
    longExplanation:
      "We found a row that doesn't match any section we read (CLIENT, DATES, CREW, and so on). It isn't breaking anything — we kept the row exactly as it is. If it's something you want handled, use Report; otherwise you can ignore this.",
    helpHref: "/help/errors#UNKNOWN_FIELD",
  },
  UNKNOWN_DAY_RESTRICTION: {
    code: "UNKNOWN_DAY_RESTRICTION",
    dougFacing:
      "_<crew-name>_ is flagged as day-restricted (`***` in the role) but the sheet doesn't say which days. Add a parenthetical to their name like `(6/24 and 6/26 ONLY)`. Until you do, their schedule will show 'days unconfirmed.'",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "A crew member has the `***` day-restriction flag but the sheet does not name which days they work. Add a parenthetical such as `(6/24 and 6/26 ONLY)` to the name cell so their schedule can be filtered safely.",
    title: "Day-restricted crew with no days listed",
    longExplanation:
      "A crew member has the day-restriction flag but the sheet doesn't say which days. Add a parenthetical to their name like '(6/24 and 6/26 ONLY)'. Until you do, their schedule will show 'days unconfirmed.'",
    helpHref: "/help/errors#UNKNOWN_DAY_RESTRICTION",
  },
  DAY_RESTRICTION_DOUBLE_LOCATION: {
    code: "DAY_RESTRICTION_DOUBLE_LOCATION",
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
    dougFacing:
      "_<crew-name>_'s role includes _<token>_, which we didn't recognize, so we left it off their page rather than guess. If that's a real role you use, let us know and we'll add it.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "One of this crew member's role labels wasn't one we recognize, so we left it off their page instead of guessing — nothing else is affected. If the label is correct, let us know and we'll add it.",
    title: "Role we didn't recognize",
    longExplanation:
      "A crew member's role included a label we didn't recognize, so we left it off their page rather than guess. Nothing else is affected. If the label is a real role you use, let us know and we'll add it.",
    helpHref: "/help/errors#UNKNOWN_ROLE_TOKEN",
  },
  STAGE_WORD_AUTOCORRECTED: {
    code: "STAGE_WORD_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled stage word in _<crew-name>_'s role (for example 'Strke' as 'Strike') and used the corrected version, so their schedule still reads correctly. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A stage word in this crew member's role looked misspelled (e.g. 'Strke'), so we read it as the closest real stage word ('Strike') and used that — nothing else is affected. If the spelling was intentional, update the sheet.",
    title: "Auto-corrected a misspelled stage word",
    longExplanation:
      "A stage word in a crew member's role cell looked misspelled, so we read it as the closest real stage word and used that — the role and schedule still parse correctly. If the spelling was intentional, update the sheet.",
    helpHref: "/help/errors#STAGE_WORD_AUTOCORRECTED",
  },
  ROLE_TOKEN_AUTOCORRECTED: {
    code: "ROLE_TOKEN_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled role in _<crew-name>_'s cell (for example 'Content Cretion' as 'Content Creation') and used the corrected version. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A multi-word role in this crew member's cell looked misspelled (e.g. 'Content Cretion'), so we read it as the closest real role ('Content Creation') and used that. If the spelling was intentional, update the sheet.",
    title: "Auto-corrected a misspelled role",
    longExplanation:
      "A multi-word role in a crew member's cell looked misspelled, so we read it as the closest real role and used that — the role still parses. If the spelling was intentional, update the sheet.",
    helpHref: "/help/errors#ROLE_TOKEN_AUTOCORRECTED",
  },
  COLUMN_HEADER_AUTOCORRECTED: {
    code: "COLUMN_HEADER_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled column header on _<sheet-name>_'s crew table (for example 'E-MAIL' as 'EMAIL') and used the corrected column. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A column header on this crew table looked misspelled (e.g. 'E-MAIL'), so we read it as the closest real header ('EMAIL') and used that column. If it was intentional, update the sheet.",
    title: "Auto-corrected a column header",
    longExplanation:
      "A column header on a crew table looked misspelled, so we read it as the closest real header and used that column — the crew rows still parse into the right fields. If it was intentional, update the sheet.",
    helpHref: "/help/errors#COLUMN_HEADER_AUTOCORRECTED",
  },
  SECTION_HEADER_AUTOCORRECTED: {
    code: "SECTION_HEADER_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled section header on _<sheet-name>_ (for example 'Transportaton' as 'Transportation') and parsed that section anyway. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A section header on this sheet looked misspelled (e.g. 'Transportaton'), so we read it as the closest real section ('Transportation') and parsed that section anyway. If it was intentional, update the sheet.",
    title: "Auto-corrected a section header",
    longExplanation:
      "A section header on a sheet looked misspelled, so we read it as the closest real section and parsed that section anyway — otherwise the whole section would have been dropped. If it was intentional, update the sheet.",
    helpHref: "/help/errors#SECTION_HEADER_AUTOCORRECTED",
  },
  FIELD_LABEL_AUTOCORRECTED: {
    code: "FIELD_LABEL_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled field label on _<sheet-name>_ (for example 'Venue Adress' as 'Venue Address') and used the corrected field. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A field label on this sheet looked misspelled (e.g. 'Venue Adress'), so we read it as the closest real field ('Venue Address') and used that. If it was intentional, update the sheet.",
    title: "Auto-corrected a field label",
    longExplanation:
      "A field label on a sheet looked misspelled, so we read it as the closest real field and used that — the value is recovered into the right field instead of being dropped. If it was intentional, update the sheet.",
    helpHref: "/help/errors#FIELD_LABEL_AUTOCORRECTED",
  },
  PULL_SHEET_PARSE_PARTIAL: {
    code: "PULL_SHEET_PARSE_PARTIAL",
    dougFacing:
      "We couldn't fully read _<N>_ row(s) on _<sheet-name>_'s PULL SHEET, so those rows show their original text. Let us know if you'd like us to handle that format.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "We couldn't read the QTY on some rows — usually it's a word, a range like '1-2', or another value that isn't a plain number. We kept those cases and show the row's original text so techs still see what's packed. Only those rows are affected. Use Report to have us support the format.",
    title: "Pull sheet rows we couldn't fully read",
    longExplanation:
      "We couldn't read the QTY on some rows — usually it's a word, a range like '1-2', or another value that isn't a plain number. We kept those cases and show the row's original text so techs still see what's packed. Only those rows are affected. Use Report to have us support the format.",
    helpHref: "/help/errors#PULL_SHEET_PARSE_PARTIAL",
  },
  AGENDA_GRID_MALFORMED: {
    code: "AGENDA_GRID_MALFORMED",
    dougFacing:
      "We couldn't find the run-of-show grid in _<sheet-name>_'s AGENDA tab, so every day shows the standard schedule instead of the detailed run-of-show. Check that the AGENDA tab still has its header row, or let us know if the layout changed.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "We couldn't find the run-of-show grid in the AGENDA tab — usually a renamed tab or a deleted header row. Until it's back, every day shows the standard schedule and nothing crew-facing breaks. Check the AGENDA tab still has its header row.",
    title: "Run-of-show grid not found",
    longExplanation:
      "We couldn't find the run-of-show grid in the AGENDA tab — usually a renamed tab or a deleted header row. Until it's back, every day shows the standard schedule and nothing crew-facing breaks. Check the AGENDA tab still has its header row.",
    helpHref: "/help/errors#AGENDA_GRID_MALFORMED",
  },
  AGENDA_BLOCK_UNRESOLVED: {
    code: "AGENDA_BLOCK_UNRESOLVED",
    dougFacing:
      "One run-of-show day in _<sheet-name>_'s AGENDA couldn't be matched to a show date, so that day shows the standard schedule. Check the AGENDA date banner, or let us know if it keeps happening.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "One run-of-show day couldn't be matched to a calendar date, so that day shows the standard schedule. Usually the AGENDA date banner is missing or shows an error (like #REF!). Other days are fine.",
    title: "Run-of-show day not matched to a date",
    longExplanation:
      "One run-of-show day couldn't be matched to a calendar date, so that day shows the standard schedule. Usually the AGENDA date banner is missing or shows an error (like #REF!). Other days are fine.",
    helpHref: "/help/errors#AGENDA_BLOCK_UNRESOLVED",
  },
  AGENDA_DAY_AMBIGUOUS: {
    code: "AGENDA_DAY_AMBIGUOUS",
    dougFacing:
      "A run-of-show day in _<sheet-name>_'s AGENDA only listed a weekday that matches more than one show date, so we didn't guess — that day shows the standard schedule. Add the actual date to the AGENDA banner to fix it.",
    crewFacing: null,
    followUp: "Doug → fix sheet",
    helpfulContext:
      "A run-of-show day only listed a weekday (like 'Wednesday') that matches two of the show's days, so we didn't guess and that day shows the standard schedule. Add the actual date to the AGENDA banner to fix it.",
    title: "Run-of-show day matches two dates",
    longExplanation:
      "A run-of-show day only listed a weekday (like 'Wednesday') that matches two of the show's days, so we didn't guess and that day shows the standard schedule. Add the actual date to the AGENDA banner to fix it.",
    helpHref: "/help/errors#AGENDA_DAY_AMBIGUOUS",
  },
  AGENDA_DAY_TRUNCATED: {
    code: "AGENDA_DAY_TRUNCATED",
    dougFacing:
      "A run-of-show day in _<sheet-name>_'s AGENDA was too large and was trimmed to fit our limits (too many entries, or some unusually long text). Crew see the trimmed list. Let us know if a real day legitimately needs more.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "One run-of-show day was too large and we trimmed it to keep things fast — usually too many entries, or some unusually long text. Crew see the trimmed list. This is almost always a stray cell; let us know if a real day genuinely needs more.",
    title: "Run-of-show day trimmed",
    longExplanation:
      "One run-of-show day was too large and we trimmed it to keep things fast — usually too many entries, or some unusually long text. Crew see the trimmed list. This is almost always a stray cell; let us know if a real day genuinely needs more.",
    helpHref: "/help/errors#AGENDA_DAY_TRUNCATED",
  },
  AGENDA_DAY_EMPTIED: {
    code: "AGENDA_DAY_EMPTIED",
    dougFacing:
      "A run-of-show day in _<sheet-name>_'s AGENDA that we previously published is now empty in the sheet, so that day reverts to the standard schedule. If that's intentional, no action is needed; if not, restore the day's rows.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A run-of-show day you'd published before is now blank in the sheet, so that day went back to the standard schedule (we don't keep old content once it's removed). If you cleared it on purpose you're done; if not, put the rows back and it returns on the next sync.",
    title: "Run-of-show day cleared",
    longExplanation:
      "A run-of-show day you'd published before is now blank in the sheet, so that day went back to the standard schedule (we don't keep old content once it's removed). If you cleared it on purpose you're done; if not, put the rows back and it returns on the next sync.",
    helpHref: "/help/errors#AGENDA_DAY_EMPTIED",
  },
  SCHEDULE_TIME_UNPARSED: {
    code: "SCHEDULE_TIME_UNPARSED",
    dougFacing:
      "We couldn't read a start time for one of _<sheet-name>_'s show days, so that day shows the standard schedule. Make sure the day's TIME cell starts with a time like '7:15am - Registration' or '7:30am - 5:50pm'.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "One show day's TIME cell had text we couldn't read as a start time, so that day shows the standard schedule instead. Give it a clear start like '7:15am - Registration' and it'll update on the next sync.",
    title: "Show-day time unreadable",
    longExplanation:
      "A show day's TIME cell had content we couldn't read as a start time, so that day shows the standard schedule. Give the cell a clear start time and it'll update on the next sync.",
    helpHref: "/help/errors#SCHEDULE_TIME_UNPARSED",
  },
  SCHEDULE_STRIKE_DATE_OFF_SCHEDULE: {
    code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
    dougFacing:
      "A room's strike time is dated on a day that isn't part of _<sheet-name>_'s schedule, so it shows in your review but not on crew pages. Fix the date in the room's Strike Time cell so it matches a show day.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A room's Strike Time was dated on a day that isn't part of the show's schedule, so the strike shows in your admin review but not on crew schedules. Fix the date in that room's Strike Time cell to match a show day (travel-in, set, a show day, or travel-out) and it'll appear for crew on the next sync.",
    title: "Strike dated off the schedule",
    longExplanation:
      "A room's Strike Time was dated on a day that isn't part of the show's schedule, so the strike shows in the admin review but not on crew schedules. Fix the date in that room's Strike Time cell to match a show day and it'll appear on the next sync.",
    helpHref: "/help/errors#SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
  },
  AGENDA_PDF_UNREADABLE: {
    code: "AGENDA_PDF_UNREADABLE",
    dougFacing:
      "We couldn't read the agenda PDF linked on _<sheet-name>_, so crew see the embedded agenda document but not a structured day-by-day schedule. Check that the agenda link still opens, or let us know if it keeps happening.",
    crewFacing: null,
    followUp: "Doug → check agenda link",
    helpfulContext:
      "A linked agenda PDF couldn't be downloaded or read, so crew see the embedded agenda document but not a structured day-by-day schedule. This is usually a temporary download hiccup or an agenda whose layout we couldn't parse. Open the agenda link to confirm it still works; if it does and this keeps appearing, let us know and we'll take a look.",
    title: "Agenda PDF unreadable",
    longExplanation:
      "A linked agenda PDF couldn't be downloaded or read, so crew see the embedded agenda document but not a structured schedule. Confirm the agenda link still opens; if it does and this persists, let us know and we'll take a look.",
    helpHref: "/help/errors#AGENDA_PDF_UNREADABLE",
  },
  AGENDA_SCHEDULE_LOW_CONFIDENCE: {
    code: "AGENDA_SCHEDULE_LOW_CONFIDENCE",
    dougFacing:
      "We read _<sheet-name>_'s agenda PDF but weren't confident enough about the times to show a structured schedule, so crew see the agenda document only. No action is needed unless the agenda layout changed recently.",
    crewFacing: null,
    followUp: "Doug → optional check",
    helpfulContext:
      "The agenda PDF was read, but we weren't confident enough about the session times to publish a structured schedule, so crew see the agenda document on its own. This is a safe fallback — nothing is broken. It usually means the agenda's layout is unusual; no action is needed unless the agenda format changed recently and you expected the structured times to appear.",
    title: "Agenda schedule shown as PDF only",
    longExplanation:
      "The agenda PDF was read but the session times weren't confident enough to publish a structured schedule, so crew see the agenda document only. This is a safe fallback and usually needs no action.",
    helpHref: "/help/errors#AGENDA_SCHEDULE_LOW_CONFIDENCE",
  },
  AGENDA_SCHEDULE_TIME_ADJUSTED: {
    code: "AGENDA_SCHEDULE_TIME_ADJUSTED",
    dougFacing:
      "We adjusted at least one session time while reading _<sheet-name>_'s agenda PDF (it looked like a typo, such as a morning time written as evening). Crew see the corrected schedule — double-check the agenda and fix the source if needed.",
    crewFacing: null,
    followUp: "Doug → check agenda",
    helpfulContext:
      "While reading the agenda PDF we corrected at least one session time that looked like a typo — for example a morning session written with an evening marker. Crew see the corrected schedule alongside the original agenda document. Open the agenda to confirm the corrected time is right, and fix the source cell if the original was wrong.",
    title: "Agenda time adjusted",
    longExplanation:
      "At least one agenda session time was auto-corrected because it looked like a typo. Crew see the corrected schedule; confirm it against the agenda and fix the source cell if the original was wrong.",
    helpHref: "/help/errors#AGENDA_SCHEDULE_TIME_ADJUSTED",
  },
  PULL_SHEET_AMBIGUOUS_FORMAT: {
    code: "PULL_SHEET_AMBIGUOUS_FORMAT",
    dougFacing:
      "_<sheet-name>_'s PULL SHEET has columns we don't recognize, so the block shows as its original text on crew pages. Let us know if you'd like us to handle that format.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "This looks like a PULL SHEET, but the columns aren't laid out the way we expect, so crew see the original text instead of a clean packing list. Let us know if you'd like us to support this layout.",
    title: "Pull sheet columns unrecognized",
    longExplanation:
      "This looks like a PULL SHEET, but the columns aren't laid out the way we expect, so crew see the original text instead of a clean packing list. Let us know if you'd like us to support this layout.",
    helpHref: "/help/errors#PULL_SHEET_AMBIGUOUS_FORMAT",
  },
  PULL_SHEET_UNKNOWN_VARIANT: {
    code: "PULL_SHEET_UNKNOWN_VARIANT",
    dougFacing:
      "_<sheet-name>_'s PULL SHEET rows are readable, but we couldn't identify the column layout, so we used the usual one. Crew still see the list. Let us know if quantities, item names, or categories look wrong.",
    crewFacing: null,
    followUp: "Doug → optional Report",
    helpfulContext:
      "We could read this case's rows but couldn't identify the column layout, so we used the usual one. Crew still see the list. Let us know if quantities, item names, or categories look wrong.",
    title: "Pull sheet layout not detected",
    longExplanation:
      "We could read this case's rows but couldn't identify the column layout, so we used the usual one. Crew still see the list. Let us know if quantities, item names, or categories look wrong.",
    helpHref: "/help/errors#PULL_SHEET_UNKNOWN_VARIANT",
  },
  DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE: {
    code: "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
    dougFacing:
      "_<sheet-name>_: an image in the DIAGRAMS tab couldn't be downloaded, so crew see a placeholder where it should be. Re-paste the image, or let us know if this keeps happening.",
    crewFacing: null,
    followUp: "Doug → optionally fix",
    helpfulContext:
      "An image in the DIAGRAMS tab wouldn't download, so crew see a placeholder where it should be. Drive sometimes drops an image's permissions — re-pasting it usually fixes it. Let us know if it keeps happening.",
    title: "Diagram image couldn't load",
    longExplanation:
      "An image in the DIAGRAMS tab wouldn't download, so crew see a placeholder where it should be. Drive sometimes drops an image's permissions — re-pasting it usually fixes it. Let us know if it keeps happening.",
    helpHref: "/help/errors#DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
  },
  DIAGRAMS_EMBEDDED_CAP_EXCEEDED: {
    code: "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
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
    dougFacing:
      '(first-seen) "_<sheet-name>_ looks like it should have diagrams but we didn\'t find any images. Confirm before we publish, or paste in the images and re-sync." (existing show with prior gallery) "_<sheet-name>_\'s DIAGRAMS tab returned no images this sync — confirm before we replace the existing gallery with an empty one, or paste in the images and re-sync."',
    crewFacing: null,
    followUp: "Doug → confirm or add images",
    helpfulContext:
      "This sheet's DIAGRAMS tab is set up for pasted-in images, but we didn't find any (and no image-folder link was given). For a new show we'd rather check with you than publish an empty gallery; for an existing show, crew keep seeing the last set.",
    title: "No images in the DIAGRAMS tab",
    longExplanation:
      "This sheet's DIAGRAMS tab is set up for pasted-in images, but we didn't find any (and no image-folder link was given). For a new show we'd rather check with you than publish an empty gallery; for an existing show, crew keep seeing the last set.",
    helpHref: "/help/errors#DIAGRAMS_EMBEDDED_NONE_FOUND",
  },
  TYPO_NORMALIZED: {
    code: "TYPO_NORMALIZED",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  // D1 (admin-log-only): a recognized section header parsed zero fields. The
  // operator-facing copy is the inline ParseWarning.message; this catalog row
  // exists only to satisfy the §12.4 / x1 orphan-code structural guard (every
  // active-style `code: "..."` literal must be registered), so all fields are null.
  SECTION_HEADER_NO_FIELDS: {
    code: "SECTION_HEADER_NO_FIELDS",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  // Data-quality warnings (parse-data-quality-warnings, admin-log-only): the
  // operator-facing copy is each inline ParseWarning.message; these catalog rows
  // exist only to satisfy the §12.4 / x1 orphan-code structural guard (every
  // active-style `code: "..."` literal must be registered), so all fields are null.
  FIELD_UNREADABLE: {
    code: "FIELD_UNREADABLE",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  UNKNOWN_SECTION_HEADER: {
    code: "UNKNOWN_SECTION_HEADER",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  BLOCK_DISAPPEARED: {
    code: "BLOCK_DISAPPEARED",
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
    dougFacing:
      "We need your decision for every item — looks like one was skipped. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "When you Apply a sheet, every triggered review item needs your decision. Your submission was missing a decision for at least one item — usually because the form's state got out of sync with the items the server was tracking. Refresh the admin page (the panel will re-render with the current items) and re-submit your decisions.",
    title: "A review item was skipped",
    longExplanation:
      "Every triggered review item needs a decision before Apply can run. Your submission was missing one. This usually means the form fell out of sync with what the server was tracking. Refresh the admin page so the panel re-renders against the current items, then submit your decisions again.",
    helpHref: "/help/errors#MISSING_REVIEWER_CHOICE",
  },
  EXTRA_REVIEWER_CHOICE: {
    code: "EXTRA_REVIEWER_CHOICE",
    dougFacing:
      "Something doesn't match between what you reviewed and what we have on file. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Your Apply submission carried a decision for an item the server isn't tracking — usually because the staged parse you were viewing was replaced between when the page loaded and when you clicked Apply. Refresh the admin page so the panel re-renders against the current staged parse, then re-submit your decisions.",
    title: "Apply submission has unknown item",
    longExplanation:
      "Your Apply submission carried a decision for an item the server isn't tracking. This usually happens when the staged parse you were viewing was replaced between when the page loaded and when you clicked Apply. Refresh the admin page and re-submit your decisions.",
    helpHref: "/help/errors#EXTRA_REVIEWER_CHOICE",
  },
  DUPLICATE_REVIEWER_CHOICE: {
    code: "DUPLICATE_REVIEWER_CHOICE",
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
    dougFacing: "That action isn't valid for this item. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Each review item has a fixed list of valid decisions (apply / reject / rename / independent, depending on the item's invariant). Your submission carried an action value that isn't in the allowed list for one of the items — usually because the form was hand-edited or the page is running a stale build. Refresh the admin page and re-submit using the form controls.",
    title: "Invalid review action",
    longExplanation:
      "Each review item has a fixed list of valid decisions (apply / reject / rename / independent, depending on the item). Your submission carried an action that isn't in the allowed list. Refresh the admin page and re-submit using the form controls.",
    helpHref: "/help/errors#INVALID_REVIEWER_ACTION",
  },
  REPORT_RATE_LIMITED_ADMIN: {
    code: "REPORT_RATE_LIMITED_ADMIN",
    dougFacing:
      "You've reported a lot already this hour — give the developer a beat to catch up. Try again in a little while, or message Eric directly.",
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
  ONBOARDING_OPERATOR_ERROR: {
    code: "ONBOARDING_OPERATOR_ERROR",
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
    dougFacing:
      "Some sheets were set up by an older version of setup, and we can't safely finish publishing them automatically. Run setup again so those sheets are re-checked, or contact the developer.",
    crewFacing: null,
    followUp: "Doug → re-run setup; Eric if it persists",
    helpfulContext:
      "A previous setup run staged these sheets with an older version of the app that didn't record which setup created them, so we can't safely tell which pages to publish. Run setup again from the start — the wizard will re-scan your folder and re-stage those sheets — or contact the developer if this keeps happening.",
    title: "Sheets from an older setup run",
    longExplanation:
      "A previous setup run staged these sheets with an older version of the app that didn't record which setup created them, so we can't safely tell which pages to publish. Run setup again from the start — the wizard will re-scan your folder and re-stage those sheets. If this keeps happening, contact the developer.",
    helpHref: "/help/errors#ONBOARDING_LEGACY_ROW_AMBIGUOUS",
  },
  ONBOARDING_NOT_RESOLVED: {
    code: "ONBOARDING_NOT_RESOLVED",
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
    dougFacing:
      "This show is currently being published as part of a setup wizard. Wait for the wizard to finish, then try again.",
    crewFacing: null,
    followUp: "Doug → wait for wizard finalize to complete",
    helpfulContext:
      "This show is currently being published as part of a setup wizard's multi-batch finalize. Until the wizard's final-publish step commits, the row is held with `published = false` and admin write actions (Re-sync from Drive, Apply/Discard staged changes, and similar gated actions) are blocked to prevent races against the in-flight finalize. Wait for the wizard tab to finish — the dashboard 'Publishing…' badge clears the moment the final-publish step commits, after which this action will succeed.",
    title: "Show currently owned by setup wizard",
    longExplanation:
      "This show is currently being published as part of a setup wizard's multi-batch finalize. Admin write actions on it are gated until the wizard's final-publish step commits, to prevent races. Wait for the wizard tab to finish, then retry.",
    helpHref: "/help/errors#FINALIZE_OWNED_SHOW",
  },
  SHOW_ARCHIVED_BY_ADMIN: {
    code: "SHOW_ARCHIVED_BY_ADMIN",
    severity: "info",
    dougFacing: "Archived. Crew links are dead until you re-publish and issue a new link.",
    crewFacing: null,
    followUp: "Doug → re-publish + issue new link when ready",
    helpfulContext:
      "Archiving a show takes it off the air immediately: the existing crew share link stops resolving (we rotate the share token), and the show moves to the Archived bucket. Crew can no longer reach the page. When you're ready to bring it back, unarchive it, re-publish, and issue a fresh crew link — the old link will never work again.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_UNARCHIVED: {
    code: "SHOW_UNARCHIVED",
    severity: "info",
    dougFacing: "Unarchived. The show is held (not published) — publish it to go live again.",
    crewFacing: null,
    followUp: "Doug → publish to go live",
    helpfulContext:
      "Unarchiving brings a show back from the Archived bucket into a held (not-yet-published) state and runs a catch-up sync against the current sheet. It is not live yet — crew still can't reach it. Review anything the catch-up sync staged, then publish to make it live again and issue a new crew link.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_PUBLISHED_BY_ADMIN: {
    code: "SHOW_PUBLISHED_BY_ADMIN",
    severity: "info",
    dougFacing: "Published. Issue a crew link to give your crew access.",
    crewFacing: null,
    followUp: "Doug → issue crew link",
    helpfulContext:
      "Publishing makes a held show live. The crew page will resolve once you issue a crew link — publishing alone doesn't hand anyone a URL. Use 'Issue crew link' to generate the share link to send your crew.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SHOW_ARCHIVED_IMMUTABLE: {
    code: "SHOW_ARCHIVED_IMMUTABLE",
    dougFacing: "This show is archived. Unarchive it before making changes.",
    crewFacing: null,
    followUp: "Doug → unarchive first",
    helpfulContext:
      "Archived shows are frozen — re-syncs, applies, discards, token rotation, and similar write actions are blocked so an archived show can't be changed underneath you. If you need to make a change, unarchive the show first; it returns in a held state where you can re-sync and review before publishing.",
    title: "Show is archived",
    longExplanation:
      "Archived shows are frozen: re-syncs, applies, discards, and token rotation are blocked so an archived show can't change underneath you. Unarchive it first — it returns in a held (not-published) state where you can re-sync and review before publishing again.",
    helpHref: "/help/errors#SHOW_ARCHIVED_IMMUTABLE",
  },
  PUBLISH_BLOCKED_PENDING_REVIEW: {
    code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    dougFacing:
      "This show has unsynced changes, a pending review, or a sync-suppression rule. Re-sync and clear it, then publish.",
    crewFacing: null,
    followUp: "Doug → re-sync + clear, then publish",
    helpfulContext:
      "We can't publish this show because it isn't in a clean, fully-reconciled state: there are unsynced changes, a pending review in the inbox, or an active sync-suppression rule on the sheet. Re-sync the show from Drive and clear whatever is pending (apply or discard the staged change, resolve the review), then publish.",
    title: "Can't publish yet — not fully synced",
    longExplanation:
      "Publishing is blocked because the show isn't fully reconciled with its sheet: there are unsynced changes, a pending review in the inbox, or an active sync-suppression rule. Re-sync from Drive and clear whatever is pending (apply or discard the staged change, resolve the review), then publish.",
    helpHref: "/help/errors#PUBLISH_BLOCKED_PENDING_REVIEW",
  },
  SHOW_AWAITING_PUBLISH_APPROVAL: {
    code: "SHOW_AWAITING_PUBLISH_APPROVAL",
    severity: "info",
    dougFacing: "A new show parsed cleanly and is waiting for your approval to publish.",
    crewFacing: null,
    followUp: "Doug → review + publish",
    helpfulContext:
      "Auto-publish for clean new shows is turned off, so this newly-seen sheet parsed cleanly but is waiting for you to approve it before it goes live. Review it in the inbox and publish when you're ready. Turn auto-publish back on in Settings if you'd rather clean new shows go live automatically.",
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  WIZARD_FINALIZE_CHECKPOINT_MISSING: {
    code: "WIZARD_FINALIZE_CHECKPOINT_MISSING",
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
    dougFacing:
      "Couldn't reach the server. Check your connection and try again — there's no admin trail because the request never arrived.",
    crewFacing: "Couldn't reach the server. Check your connection and try again.",
    followUp: "Either → check connection, retry; persistent → Eric",
    helpfulContext:
      "The client-side fetch failed before reaching the server — typically the user's device is offline, DNS is failing, a captive portal is blocking the request, or a browser extension is intercepting the call. Because the request never arrived, no §A code was emitted and no admin trail exists; the only signal is the user-facing one. Recovery is the same regardless of audience: check connectivity and retry. If this code recurs against a known-online network, suspect a same-origin browser extension or a CSP block.",
    title: "Couldn't reach the server",
    longExplanation:
      "The browser couldn't reach the server. Typically this means the device is offline, DNS is failing, a captive portal is blocking the request, or a browser extension is intercepting the call. Check connectivity and retry; the request never arrived, so there's no admin trail either.",
    helpHref: "/help/errors#NETWORK_UNREACHABLE",
  },
  WIZARD_SESSION_SUPERSEDED_DURING_SCAN: {
    code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
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
    dougFacing:
      "A sheet is already being processed by the live folder sync, so we're skipping it during setup. Resolve it from the dashboard, then re-run setup if needed.",
    crewFacing: null,
    followUp: "Doug → resolve live row from dashboard, then re-run setup",
    helpfulContext:
      "Setup tried to stage a parse for a sheet that the live folder sync is already processing. We skipped the wizard's stage to avoid clobbering the live row. Resolve the live row from the dashboard — either Apply or Discard it — then re-run setup if you still need to.",
    title: "Live sync owns this sheet",
    longExplanation:
      "Setup tried to stage a parse for a sheet that the live folder sync is already processing. We skipped the wizard's stage to avoid clobbering the live row. Resolve the live row from the dashboard (either Apply or Discard it), then re-run setup if you still need to.",
    helpHref: "/help/errors#LIVE_ROW_CONFLICT",
  },
  WIZARD_ISOLATION_INDEXES_MISSING: {
    code: "WIZARD_ISOLATION_INDEXES_MISSING",
    dougFacing:
      "We can't safely scan your folder right now — a recent database update hasn't been applied yet. Eric has been notified; setup will be available again in a few minutes.",
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
    dougFacing:
      "A diagram snapshot promotion has been stuck for more than 15 minutes. Eric needs to run the snapshot-promote repair tool before cleanup can finish.",
    crewFacing: null,
    followUp: "Eric → run snapshot-promote-repair admin tool",
    helpfulContext:
      "A diagram snapshot promotion has been in the non-reclaimable promote-started state for more than 15 minutes. Eric needs to reconcile the temp and canonical prefixes before cleanup can continue.",
    title: "Snapshot promotion stuck",
    longExplanation:
      "A diagram snapshot promotion has been in the non-reclaimable promote-started state for more than 15 minutes. Eric needs to reconcile the temp and canonical prefixes before cleanup can continue.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_PROMOTE_STUCK",
  },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: {
    code: "PENDING_SNAPSHOT_ROLLBACK_STUCK",
    dougFacing:
      "A diagram snapshot rollback stalled after moving some assets. Eric needs to run the snapshot-rollback repair tool before cleanup can finish.",
    crewFacing: null,
    followUp: "Eric → run snapshot-rollback-repair admin tool",
    helpfulContext:
      "A diagram snapshot rollback failed midway, leaving assets split across temp and canonical prefixes. Eric needs to reconcile both prefixes and finish the rollback before cleanup can continue.",
    title: "Snapshot rollback stalled",
    longExplanation:
      "A diagram snapshot rollback failed midway, leaving assets split across temp and canonical prefixes. Eric needs to reconcile both prefixes and finish the rollback before cleanup can continue.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_ROLLBACK_STUCK",
  },
  BRANCH_PROTECTION_DRIFT: {
    code: "BRANCH_PROTECTION_DRIFT",
    dougFacing:
      "Branch protection no longer matches the X.6 contract. Restore the required checks and review settings before merging.",
    crewFacing: null,
    followUp: "Eric → restore branch protection per X.6 contract",
    helpfulContext:
      "The privileged branch-protection monitor queried GitHub and found that the main-branch protection no longer matches the X.6 contract: one of the eight required checks is missing, reviews are not required, stale reviews are not dismissed, admin enforcement is off, or force pushes/deletions are allowed. Restore the branch protection settings for main so pull requests cannot merge without the full X.* audit suite.",
    title: "Branch protection drift",
    longExplanation:
      "The branch-protection monitor found that the main-branch protection no longer matches the X.6 contract: a required check is missing, reviews are not required, stale reviews are not dismissed, admin enforcement is off, or force pushes / deletions are allowed. Restore the settings so pull requests cannot merge without the full audit suite.",
    helpHref: "/help/errors#BRANCH_PROTECTION_DRIFT",
  },
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: {
    code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    dougFacing:
      "Branch-protection monitoring cannot authenticate with GitHub. Rotate the GH App token or PAT within 24 hours.",
    crewFacing: null,
    followUp: "Eric → rotate GH App / PAT within 24h",
    helpfulContext:
      "The privileged branch-protection monitor could not authenticate to GitHub, so it cannot prove the merge gate is still enforcing the required X.* checks. Rotate the GitHub App token or fallback PAT, then confirm the scheduled branch-protection job succeeds again; otherwise drift could go undetected until the reader check's freshness window expires.",
    title: "Branch-protection monitor can't auth",
    longExplanation:
      "The privileged branch-protection monitor could not authenticate to GitHub, so it cannot prove the merge gate is still enforcing the required checks. Rotate the GitHub App token or fallback PAT and confirm the scheduled job succeeds again.",
    helpHref: "/help/errors#BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
  },
  PENDING_INGESTION_NOT_FOUND: {
    code: "PENDING_INGESTION_NOT_FOUND",
    dougFacing:
      "We couldn't find that pending sheet anymore — it was probably resolved by another tab or browser. Refresh the dashboard to see the latest state.",
    crewFacing: null,
    followUp: "Doug → refresh dashboard",
    helpfulContext:
      "The dashboard's pending-sheet panel renders rows by id. When you clicked Retry or Discard, the server looked up that id and didn't find a row — it had already been resolved (probably from another browser tab) between the time the panel rendered and your click. Refresh the dashboard to load the current state, then act on whatever's still pending.",
    title: "Pending sheet already resolved",
    longExplanation:
      "When you clicked Retry or Discard, the server looked up the pending sheet by id and didn't find a row; it had already been resolved, probably from another browser tab. Refresh the dashboard to load the current state.",
    helpHref: "/help/errors#PENDING_INGESTION_NOT_FOUND",
  },
  STAGED_REVIEW_ITEMS_CORRUPT: {
    code: "STAGED_REVIEW_ITEMS_CORRUPT",
    dougFacing:
      "This staged sheet's review checklist is corrupted, so it can't be applied safely. Discard it and re-sync the sheet to rebuild a clean review. If this keeps blocking the final publish step of setup, contact the developer to clear it.",
    crewFacing: null,
    followUp: "Doug → discard + re-sync the sheet",
    helpfulContext:
      "The saved list of changes that need your review for this staged sheet is stored in a format we can't read — it should be a list of review items but isn't. Rather than risk applying changes you never got to see, we block Apply and ask you to discard the row and re-sync the sheet; the next sync rebuilds a clean review checklist. This usually only affects rows left over from an earlier app issue.",
    title: "Staged review checklist corrupted",
    longExplanation:
      "The stored triggered_review_items for this staged sheet is not a readable list of review items, so we can't tell which changes need your review. Apply is blocked to avoid applying unreviewed changes. Discard the row and re-sync the sheet to rebuild a clean review checklist.",
    helpHref: "/help/errors#STAGED_REVIEW_ITEMS_CORRUPT",
  },
  STAGED_PARSE_RESULT_CORRUPT: {
    code: "STAGED_PARSE_RESULT_CORRUPT",
    dougFacing:
      "This staged sheet's saved data is corrupted, so it can't be applied safely. Discard it and re-sync the sheet to rebuild it. If this keeps blocking the final publish step of setup, contact the developer to clear it.",
    crewFacing: null,
    followUp: "Doug → discard + re-sync the sheet",
    helpfulContext:
      "The saved data for this staged sheet is stored in a format we can't read — it should be the parsed sheet but isn't. Rather than apply something we can't interpret, we block Apply and ask you to discard the row and re-sync the sheet; the next sync rebuilds it cleanly. This usually only affects rows left over from an earlier app issue.",
    title: "Staged sheet data corrupted",
    longExplanation:
      "The stored parse_result for this staged sheet could not be coerced to a usable parsed-sheet object at the Apply read boundary, so Apply is blocked rather than dereferencing a corrupt value. Discard the row and re-sync the sheet to rebuild it.",
    helpHref: "/help/errors#STAGED_PARSE_RESULT_CORRUPT",
  },
  LIVE_ROW_REQUIRED: {
    code: "LIVE_ROW_REQUIRED",
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
    dougFacing:
      "Something is wrong on our end with this sheet's tracking data — we can't safely defer it without a watermark. The developer has been notified. Try 'Permanently ignore' if you want to dismiss this row.",
    crewFacing: null,
    followUp: "Eric → investigate; Doug → use Permanently ignore as workaround",
    helpfulContext:
      "Defer-until-modified needs to know the file's current `modifiedTime` so cron knows when to resume processing. Every place that creates a pending-sheet row (Phase 1 hard-fails, Drive-fetch failures, retry handlers) populates this column. If you're seeing this code, something we wrote produced a row without it — the developer has been notified. As a workaround you can use Permanently ignore (which doesn't need the watermark).",
    title: "Tracking watermark missing",
    longExplanation:
      "Defer-until-modified needs the file's current modified time so cron knows when to resume processing. This pending row was created without one, because something we wrote produced a bad row. The developer has been notified. You can use 'Permanently ignore' to dismiss the row.",
    helpHref: "/help/errors#MISSING_PENDING_INGESTION_MODTIME",
  },
  PENDING_INGESTION_TRANSITIONED: {
    code: "PENDING_INGESTION_TRANSITIONED",
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
    dougFacing:
      "We couldn't find that alert anymore. It may have been resolved already. Refresh the page to see the current state.",
    crewFacing: null,
    followUp: "Doug → refresh page",
    helpfulContext:
      "When you clicked Mark resolved, the server looked up that alert by id and either didn't find it (already resolved + cleaned up, or never existed) or it belongs to a different show than the page you clicked from. Refresh the dashboard to see the current state.",
    title: "Alert no longer exists",
    longExplanation:
      "When you clicked Mark resolved, the server looked up that alert by id and either didn't find it (already resolved and cleaned up) or it belongs to a different show than the page you clicked from. Refresh the dashboard to see the current state.",
    helpHref: "/help/errors#ADMIN_ALERT_NOT_FOUND",
  },
  ALERT_REQUIRES_SHOW_SCOPED_RESOLVE: {
    code: "ALERT_REQUIRES_SHOW_SCOPED_RESOLVE",
    dougFacing:
      "This alert belongs to a specific show. Click through to the show's parse panel to resolve it from the show context, where the resolution is recorded with the show's audit trail.",
    crewFacing: null,
    followUp: "Doug → click through to show",
    helpfulContext:
      "Per-show alerts are tied to a specific show and resolved from that show's parse panel — not from the global dashboard banner. We require the click-through to the show's page so that when you mark the alert resolved, the resolution is recorded in the context of the show you actually inspected. The dashboard's redirect link will take you straight to the show's alert section; click 'Mark resolved' there.",
    title: "Alert must be resolved from show page",
    longExplanation:
      "Per-show alerts are resolved from the show's parse panel, not the global dashboard banner. We require the click-through so the resolution is recorded in the show's audit trail. The dashboard's redirect link will take you straight to the show's alert section.",
    helpHref: "/help/errors#ALERT_REQUIRES_SHOW_SCOPED_RESOLVE",
  },
  OAUTH_STATE_INVALID: {
    code: "OAUTH_STATE_INVALID",
    dougFacing:
      "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    crewFacing:
      "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    followUp: "Crew → reopen the link; Eric if persistent",
    helpfulContext:
      "Google OAuth uses a one-time security token (the `state` parameter) to make sure the sign-in callback came from the request your browser actually started. The token was missing, expired, or didn't match — most often because you started sign-in in one window and clicked the callback in another, or the cookie storing the expected value was cleared. Click the original link from Doug again to start fresh.",
    title: "Sign-in interrupted",
    longExplanation:
      "Google OAuth uses a one-time security token to make sure the callback came from the request your browser actually started. The token was missing, expired, or didn't match, most often because you started sign-in in one window and clicked the callback in another. Click the original link again to start fresh.",
    helpHref: "/help/errors#OAUTH_STATE_INVALID",
  },
  OAUTH_REDIRECT_INVALID: {
    code: "OAUTH_REDIRECT_INVALID",
    dougFacing:
      "Sign-in landed somewhere we don't recognize. Please click the original link from Doug again to start over.",
    crewFacing:
      "Sign-in landed somewhere we don't recognize. Please click the original link from Doug again to start over.",
    followUp: "Crew → reopen the link; Eric if persistent",
    helpfulContext:
      "The Google OAuth callback's `next` parameter pointed somewhere outside the allowed list of post-sign-in destinations (the canonical site origin + `/show/<slug>`, `/admin`, or `/me` paths — note: `/show/<slug>/p` is NOT a valid destination because the bootstrap surface requires a `#t=<jwt>` fragment that does not survive the OAuth round-trip). Without this guard, an attacker could trick the round-trip into landing on a malicious origin or onto the bootstrap shell with no fragment, while we were still minting your session cookie. Click the original link from Doug again.",
    title: "Sign-in redirect rejected",
    longExplanation:
      "The Google OAuth callback's destination pointed outside the allowed list of post-sign-in pages. Without this guard, an attacker could trick the round-trip into landing on a malicious origin or onto a bootstrap shell missing its required fragment, while we were minting your session cookie. Click the original link from Doug again.",
    helpHref: "/help/errors#OAUTH_REDIRECT_INVALID",
  },
  SYNC_DELAYED_MODERATE: {
    code: "SYNC_DELAYED_MODERATE",
    dougFacing: null,
    crewFacing: "Last synced *<time>* ago. Text Doug if anything looks off.",
    followUp: "Crew → mention to Doug",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  SYNC_DELAYED_SEVERE: {
    code: "SYNC_DELAYED_SEVERE",
    dougFacing:
      "*<sheet-name>*: crew page hasn't synced from Drive in over 6 hours. Push or cron is stalled — check the dashboard.",
    crewFacing: "This page hasn't updated recently. Text Doug to check on it.",
    followUp: "Crew → text Doug; Doug → check dashboard",
    helpfulContext:
      "The crew page hasn't synced from Drive in over six hours. That's well past the normal cron interval, so something is stalled. Open the dashboard to check whether push subscriptions are healthy and whether the cron job is running.",
    title: "Sync stalled for more than 6 hours",
    longExplanation:
      "The crew page hasn't synced from Drive in over six hours, well past the normal cron interval, so something is stalled. Open the dashboard to check whether push subscriptions are healthy and whether the cron job is running.",
    helpHref: "/help/errors#SYNC_DELAYED_SEVERE",
  },
  SYNC_STALLED: {
    code: "SYNC_STALLED",
    severity: "warning",
    dougFacing:
      "Automatic syncing hasn't run in over an hour, so new sheet changes won't appear until it resumes. If this keeps happening, check the Drive connection or re-run setup.",
    crewFacing: null,
    followUp: "Doug → check Drive connection / re-run setup",
    helpfulContext:
      "The scheduled job that reads your show sheets from Google Drive hasn't completed a run in over an hour. New edits won't reach crew pages until it resumes. Usually transient; if it persists, the Drive connection may have lapsed or the scheduler may be down.",
    title: "Syncing has stalled",
    longExplanation:
      "The background sync that pulls show sheets from Google Drive hasn't completed in over an hour. Crew pages keep showing the last good data until it resumes; if this persists, re-check the Drive connection or re-run setup.",
    helpHref: "/help/errors#SYNC_STALLED",
  },
  EMAIL_DELIVERY_FAILED: {
    code: "EMAIL_DELIVERY_FAILED",
    severity: "warning",
    dougFacing:
      "We couldn't send a notification email. We'll keep retrying; if it keeps failing, check the email settings.",
    crewFacing: null,
    followUp: "Doug → check email settings if this persists",
    helpfulContext:
      "An outbound notification email failed to send through the email provider. The system retries automatically a few times. If it keeps failing, the provider key or the verified sending domain may need attention.",
    title: "Couldn't send a notification email",
    longExplanation:
      "A notification email couldn't be delivered through the email provider. We retry automatically; a persistent failure usually means the provider API key or sending domain needs attention in settings.",
    helpHref: "/help/errors#EMAIL_DELIVERY_FAILED",
  },
  EMAIL_NOT_CONFIGURED: {
    code: "EMAIL_NOT_CONFIGURED",
    severity: "warning",
    dougFacing:
      "Email notifications aren't set up yet, so sync-problem alerts, the daily digest, and auto-publish undo emails won't be sent. Check that the email provider key, the sending address, and the site address are all configured.",
    crewFacing: null,
    followUp: "Doug → check email provider key, sending address, and site address",
    helpfulContext:
      "Outbound email isn't fully configured, so sync-problem alerts, the daily digest, and auto-publish undo emails won't be sent. This needs three things set: the provider API key, a verified sending address, and the app's public site address (used to build the links in each email). In-app alerts and the in-app undo button still work; set whichever is missing to enable email.",
    title: "Email notifications not set up",
    longExplanation:
      "The app can't send email until three things are configured: the provider API key, the verified sending address, and the public site address used for links in the emails. Sync-problem alerts, the daily digest, and auto-publish undo emails all wait on the same three settings. You'll still see alerts — and the in-app undo button — in the dashboard.",
    helpHref: "/help/errors#EMAIL_NOT_CONFIGURED",
  },
  TILE_SERVER_RENDER_FAILED: {
    code: "TILE_SERVER_RENDER_FAILED",
    dougFacing:
      "*<sheet-name>*: a section couldn't load on the server. The page will keep trying — refresh in a minute. Tell the developer if this keeps happening.",
    crewFacing: "This section couldn't load — last good data shown.",
    followUp: "Doug → refresh / Report; Eric → investigate",
    helpfulContext:
      "One of the page sections crashed while the server was rendering it. The rest of the page rendered normally. The page will keep retrying — refresh in a minute. If this keeps happening, click 'Report' so the developer can investigate.",
    title: "Page section failed to render",
    longExplanation:
      "One of the page sections crashed while the server was rendering it. The rest of the page rendered normally. The page will keep retrying; refresh in a minute. If this keeps happening, click Report so the developer can investigate.",
    helpHref: "/help/errors#TILE_SERVER_RENDER_FAILED",
  },
  TILE_PROJECTION_FETCH_FAILED: {
    code: "TILE_PROJECTION_FETCH_FAILED",
    dougFacing:
      "*<sheet-name>*: one or more crew-page data sources couldn't load (the failed sources are listed in the alert detail). The page rendered with the rest of the data; refresh in a minute. Tell the developer if this keeps happening.",
    crewFacing: null,
    followUp: "Doug → refresh / Report; Eric → investigate",
    helpfulContext:
      "The crew page loaded, but one or more of its data sources failed to fetch from the server. The page rendered with the data that did load. The specific failed sources are listed in the alert detail. Refresh in a minute; if this keeps happening, click 'Report' so the developer can investigate.",
    title: "Some show data couldn't load",
    longExplanation:
      "The crew page rendered, but one or more of its data sources failed to fetch from the server. The page shows the data that did load; the affected sections fall back. The specific failed sources are listed in the alert detail. Refresh in a minute; if this keeps happening, click Report so the developer can investigate.",
    helpHref: "/help/errors#TILE_PROJECTION_FETCH_FAILED",
  },
  STALE_DISCARD_REJECTED: {
    code: "STALE_DISCARD_REJECTED",
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
    dougFacing:
      "An orphaned bug-report issue was created during a retry race and auto-closed. Click through to verify the issue closed correctly. If this code recurs frequently, increase the lease window.",
    crewFacing: null,
    followUp: "Eric → review orphan, tune lease window if recurring",
    helpfulContext:
      "Two retries of the same bug-report submission both succeeded in creating GitHub issues — a lease race condition. We auto-closed the duplicate. Click through to confirm; if this code keeps appearing, the developer needs to extend the lease window.",
    title: "Duplicate report issue auto-closed",
    longExplanation:
      "Two retries of the same bug-report submission both succeeded in creating GitHub issues (a lease race condition). We auto-closed the duplicate. Click through to confirm; if this keeps appearing, the developer needs to extend the lease window.",
    helpHref: "/help/errors#REPORT_ORPHANED_LOST_LEASE",
  },
  GITHUB_BOT_LOGIN_MISSING: {
    code: "GITHUB_BOT_LOGIN_MISSING",
    dougFacing:
      "GitHub bot login is unconfigured — the report-recovery path is degraded. Set `GITHUB_BOT_LOGIN` env var to the bot's GitHub username.",
    crewFacing: null,
    followUp: "Eric → configure env var",
    helpfulContext:
      "The bug-report recovery path needs to know the GitHub username of the bot account so it can find issues created by previous attempts. The `GITHUB_BOT_LOGIN` environment variable isn't set. Configure it on the deployment and redeploy.",
    title: "GitHub bot login not configured",
    longExplanation:
      "The bug-report recovery path needs to know the GitHub username of the bot account so it can find issues created by previous attempts. The GITHUB_BOT_LOGIN environment variable isn't set; configure it on the deployment and redeploy.",
    helpHref: "/help/errors#GITHUB_BOT_LOGIN_MISSING",
  },
  REPORT_LEASE_THRASHING: {
    code: "REPORT_LEASE_THRASHING",
    dougFacing:
      "Bug-report processing is thrashing on this show — retries are racing against leases. Check Eric's status; this usually means the lease window needs tuning.",
    crewFacing: null,
    followUp: "Eric → tune lease window",
    helpfulContext:
      "Bug-report submissions for this show are racing against their own leases — too many retries firing inside the lease window. Usually means the lease window is shorter than the GitHub API's response time under current conditions. The developer needs to tune the window.",
    title: "Bug-report leases thrashing",
    longExplanation:
      "Bug-report submissions for this show are racing against their own leases, with too many retries firing inside the lease window. Usually this means the lease window is shorter than the GitHub API's response time under current conditions. The developer needs to tune the window.",
    helpHref: "/help/errors#REPORT_LEASE_THRASHING",
  },
  ADMIN_EMAIL_ALREADY_ACTIVE: {
    code: "ADMIN_EMAIL_ALREADY_ACTIVE",
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
    dougFacing: "We couldn't check for alerts right now. Refresh in a moment.",
    crewFacing: null,
    followUp: "Doug → refresh; if persistent, check Supabase admin_alerts RLS + grants",
    helpfulContext:
      "The shared admin_alerts head:true count (lib/admin/alertCount.ts) returned/threw an error. The NotifBell renders a degraded warn bell and the AlertBanner renders a degraded summary instead of hiding, so a broken count is visible.",
    title: "Couldn't check alerts",
    longExplanation:
      "We couldn't read the alert count, usually a transient database or permissions issue. Refresh in a moment; if it keeps failing, the developer needs to check the admin_alerts table access.",
    helpHref: "/help/errors#ADMIN_ALERT_COUNT_FAILED",
  },
  ADMIN_ROUTE_LOAD_FAILED: {
    code: "ADMIN_ROUTE_LOAD_FAILED",
    dougFacing:
      "This admin page couldn't load. Refresh in a moment; if it keeps failing, contact the developer.",
    crewFacing: null,
    followUp: "Doug → refresh; if persistent, contact the developer",
    helpfulContext:
      "Fixed code for the app/admin/error.tsx + app/admin/settings/error.tsx client boundaries AND the layout's identity-fault catch (app/admin/layout.tsx). Used instead of ADMIN_SESSION_LOOKUP_FAILED, whose dougFacing is null + crew-facing (wrong audience). error.tsx files are client components; Next serializes errors as Error & { digest } so a thrown code field is unreliable — the boundary renders this fixed code, not err.code.",
    title: "Admin page couldn't load",
    longExplanation:
      "Something went wrong loading this admin page. Refresh in a moment; if it keeps failing, the developer needs to take a look.",
    helpHref: "/help/errors#ADMIN_ROUTE_LOAD_FAILED",
  },
  ADMIN_EMAIL_WRITE_FAILED: {
    code: "ADMIN_EMAIL_WRITE_FAILED",
    dougFacing: "Couldn't update administrators right now. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, check Supabase admin_emails RPC + grants",
    helpfulContext:
      "addAdminAction / revokeAdminAction caught an AdminEmailsInfraError from addAdminEmail / revokeAdminEmail (after the requireAdminIdentity gate) and returned { kind: 'infra_error' }. Rendered inline by AddAdminForm + RevokeRowButton instead of tearing down the settings section.",
    title: "Couldn't update administrators",
    longExplanation:
      "We couldn't add or revoke that administrator, usually a transient database or permissions issue. Try again in a moment; if it keeps failing, the developer needs to check the database connection.",
    helpHref: "/help/errors#ADMIN_EMAIL_WRITE_FAILED",
  },
  ADMIN_DRIVE_HEALTH_UNAVAILABLE: {
    code: "ADMIN_DRIVE_HEALTH_UNAVAILABLE",
    dougFacing: "Couldn't read sync status right now. Refresh in a moment.",
    crewFacing: null,
    followUp: "Doug → refresh; if persistent, check Supabase shows + drive_watch_channels access",
    helpfulContext:
      "fetchDriveConnectionHealth returned { kind: 'infra_error' } — a watch-status, active-shows count, or last_synced_at read returned/threw. Renders the Warn pill + this status line, never a false Healthy.",
    title: "Couldn't read sync status",
    longExplanation:
      "We couldn't read how your Drive sync is doing. Refresh in a moment; if it keeps failing, the developer needs to check the database connection.",
    helpHref: "/help/errors#ADMIN_DRIVE_HEALTH_UNAVAILABLE",
  },
  SYNC_STATUS_UNKNOWN: {
    code: "SYNC_STATUS_UNKNOWN",
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
    dougFacing:
      "We can't load the administrator list right now. Refresh in a moment; if the problem continues, check the database connection.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, check Supabase admin_emails RLS + grants",
    helpfulContext:
      "AdminEmailsInfraError from listAdminEmails() (typically RLS denial, missing grant, schema-cache skew, or network fault). Surfaced IN-SECTION by the Administrators section (via the typed fetchEmbeddedAdminEmails wrapper) on BOTH the embedded /admin/settings and the deep-link /admin/settings/admins; renders this message + retry. (Route/session faults on those segments are NOT this code — they bubble to the error.tsx boundary as ADMIN_ROUTE_LOAD_FAILED.)",
    title: "Couldn't load administrator list",
    longExplanation:
      "We couldn't load the list of administrators, usually a transient database or permissions issue. Refresh in a moment; if it keeps failing, the developer needs to check the database connection.",
    helpHref: "/help/errors#ADMIN_EMAIL_LIST_FAILED",
  },
  ADMIN_EMAIL_RE_ADD_PROMPT: {
    code: "ADMIN_EMAIL_RE_ADD_PROMPT",
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
    dougFacing: "Google Drive did not return the sheet revision metadata we need to sync safely.",
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
    dougFacing:
      "An embedded diagram changed after staging. Crew see a placeholder for that image until a new sheet edit re-stages it.",
    crewFacing: null,
    followUp: "Doug → re-edit the sheet to re-stage the diagram",
    helpfulContext:
      "Apply re-checks the spreadsheet revision, object id, and embedded-image fingerprint before downloading bytes. A mismatch leaves the prior approved content live and marks the image for recovery or re-stage.",
    title: "Embedded diagram changed after staging",
    longExplanation:
      "Apply re-checks each embedded image's fingerprint against what was staged. This image's fingerprint changed after the staged parse was reviewed, so the prior approved content stays live. Save the sheet again to re-stage the new image.",
    helpHref: "/help/errors#EMBEDDED_ASSET_DRIFTED",
  },
  FOLDER_NOT_FOUND: {
    code: "FOLDER_NOT_FOUND",
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
    dougFacing:
      "Old diagram snapshot cleanup is stuck. Crew pages are still protected, but storage cleanup needs repair.",
    crewFacing: null,
    followUp: "Doug → run snapshot repair; if persistent, Eric",
    helpfulContext:
      "A pending snapshot upload row is marked for deletion but the storage prefix has not been reclaimed.",
    title: "Snapshot cleanup stuck",
    longExplanation:
      "Old diagram snapshot cleanup is stuck: a pending row is marked for deletion but the storage prefix hasn't been reclaimed. Crew pages are still protected, but storage cleanup needs repair.",
    helpHref: "/help/errors#PENDING_SNAPSHOT_DELETE_STUCK",
  },
  PENDING_SNAPSHOT_NOT_STUCK: {
    code: "PENDING_SNAPSHOT_NOT_STUCK",
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
    dougFacing: "That staged sync is no longer available.",
    crewFacing: null,
    followUp: "Doug → refresh the admin page",
    helpfulContext:
      "The admin page renders staged-sync rows by id. When you clicked Apply or Discard, the server looked up that id and didn't find a row — usually because another browser tab acted on the same staged sync between when the page loaded and when you clicked. Refresh the admin page to see the current state and act on whatever's still pending.",
    title: "Staged sync no longer available",
    longExplanation:
      "When you clicked Apply or Discard, the server looked up the staged sync by id and didn't find a row, usually because another browser tab acted on it between when the page loaded and when you clicked. Refresh the admin page to see the current state.",
    helpHref: "/help/errors#PENDING_SYNC_NOT_FOUND",
  },
  REEL_ASSET_LOOKUP_FAILED: {
    code: "REEL_ASSET_LOOKUP_FAILED",
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
    dougFacing:
      "Multiple live GitHub issues were found for one report submission. Recovery is paused until Eric reviews the duplicates.",
    crewFacing: null,
    followUp: "Eric → inspect duplicate report issues and close the incorrect one",
    helpfulContext:
      "The recovery scan found more than one non-orphan issue with the same bug-report marker. The system fails closed instead of choosing a winner.",
    title: "Multiple live issues for one report",
    longExplanation:
      "The bug-report recovery scan found more than one non-orphan GitHub issue with the same report marker. The system fails closed instead of choosing a winner; Eric needs to review the duplicates.",
    helpHref: "/help/errors#REPORT_DUPLICATE_LIVE_MATCHES",
  },
  REPORT_HORIZON_EXPIRED: {
    code: "REPORT_HORIZON_EXPIRED",
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
    dougFacing:
      "We couldn't confirm whether your previous report went through. Please try again in a few minutes.",
    crewFacing:
      "We couldn't confirm whether your previous report went through. Please try again in a few minutes.",
    followUp: "Eric → review GitHub issue lookup and retry state",
    helpfulContext:
      "The bug-report recovery path could not conclusively list recent GitHub issues for this idempotency key, so it refused to create a duplicate issue.",
    title: "Report lookup inconclusive",
    longExplanation:
      "The bug-report recovery path couldn't conclusively list recent GitHub issues for this report, so it refused to create a duplicate issue. Try again in a few minutes.",
    helpHref: "/help/errors#REPORT_LOOKUP_INCONCLUSIVE",
  },
  REPORT_OPEN_ORPHAN_LABEL: {
    code: "REPORT_OPEN_ORPHAN_LABEL",
    dougFacing:
      "An open GitHub issue carries the orphan-cleanup label. Eric needs to review and either re-close the issue or remove the label.",
    crewFacing: null,
    followUp: "Eric → inspect the labeled issue",
    helpfulContext:
      "Orphan cleanup should close issues with state_reason=not_planned. Seeing the orphan label on an open issue indicates manual intervention or an unexpected GitHub state.",
    title: "Open issue carries orphan label",
    longExplanation:
      "Orphan cleanup should close issues with the 'not planned' state. Seeing the orphan label on an open issue means manual intervention happened or GitHub returned an unexpected state. Eric needs to review and either re-close the issue or remove the label.",
    helpHref: "/help/errors#REPORT_OPEN_ORPHAN_LABEL",
  },
  REPORT_PIPELINE_FAILED: {
    code: "REPORT_PIPELINE_FAILED",
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
  SELF_REVOKE_FORBIDDEN: {
    code: "SELF_REVOKE_FORBIDDEN",
    dougFacing:
      "You can't revoke your own administrator access. Ask another admin to do it if you need to be removed.",
    crewFacing: null,
    followUp: "Doug → ask another admin to revoke you",
    helpfulContext:
      "revoke_admin_email_rpc refuses a self-revoke unconditionally inside its SECURITY DEFINER body — comparing the canonical target email to public.auth_email_canonical() — so an admin can never revoke their own access even via a hand-forged PostgREST rpc() call that bypasses the Server Action. This is defense-in-depth behind the M12.5 Server-Action guard. Other-revoke (a rogue admin revoking a peer, including the last peer) stays allowed by design; see amendment §5.5 + §11 anti-goal.",
    title: "Can't revoke your own access",
    longExplanation:
      "An administrator can never revoke their own access — the database refuses it directly, behind the Server Action guard. If you need to be removed, ask another admin to revoke you.",
    helpHref: "/help/errors#SELF_REVOKE_FORBIDDEN",
  },
  SESSION_NOT_FOUND: {
    code: "SESSION_NOT_FOUND",
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
    dougFacing: null,
    crewFacing: "A show slug is required.",
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  STAGED_PARSE_FAILED: {
    code: "STAGED_PARSE_FAILED",
    dougFacing: "That sheet could not be parsed during retry.",
    crewFacing: null,
    followUp: "Doug → open the sheet and fix its structure, then retry",
    helpfulContext:
      "The live first-seen retry path fetched the sheet but the parser could not convert it into a show payload.",
    title: "Sheet parse failed during retry",
    longExplanation:
      "The live first-seen retry path fetched the sheet but the parser couldn't convert it into a show payload. The previous approved version (if any) is still serving crew. Check the per-show parse panel for the specific underlying error.",
    helpHref: "/help/errors#STAGED_PARSE_FAILED",
  },
  STAGED_PARSE_OUTDATED_AT_PHASE_D: {
    code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
    dougFacing: "A live show changed after setup staged its publish changes.",
    crewFacing: null,
    followUp: "Doug → re-run setup review for that sheet before final publish",
    helpfulContext:
      "Finalize Phase D only promotes shadow changes when the live show has not advanced past the wizard-staged modified time.",
    title: "Live show advanced during finalize",
    longExplanation:
      "Finalize Phase D only promotes shadow changes when the live show hasn't advanced past the wizard-staged modified time. A live show changed after setup staged its publish changes, so this batch is held.",
    helpHref: "/help/errors#STAGED_PARSE_OUTDATED_AT_PHASE_D",
  },
  STALE_ORPHAN_REPORT: {
    code: "STALE_ORPHAN_REPORT",
    dougFacing:
      "A stale bug-report reservation expired before it could create a GitHub issue. No user action is needed unless this repeats.",
    crewFacing: null,
    followUp: "Eric → inspect report-reaper logs if this recurs",
    helpfulContext:
      "The report reaper deleted an unresolved report row older than the 24-hour recovery horizon after its processing lease had expired.",
    title: "Stale bug-report reservation expired",
    longExplanation:
      "A bug-report reservation aged past the 24-hour recovery horizon with its processing lease expired and was deleted by the reaper. No user action is needed unless this repeats.",
    helpHref: "/help/errors#STALE_ORPHAN_REPORT",
  },
  SYNC_FILE_FAILED: {
    code: "SYNC_FILE_FAILED",
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
    dougFacing:
      "Picker selections were reset for this show. Crew will be asked to pick themselves again on their next visit.",
    crewFacing: null,
    followUp: "Doug → re-share the show link if needed",
    helpfulContext:
      "An admin reset bumped the show's picker epoch, invalidating saved per-device picker selections without changing the public share link. Existing open tabs will re-prompt on refresh or realtime invalidation.",
    title: "Picker selections reset",
    longExplanation:
      "The show's picker epoch was bumped by an admin reset. Saved picker choices on crew devices are no longer accepted, so crew will choose themselves again the next time the page resolves.",
    helpHref: "/help/errors#PICKER_EPOCH_RESET",
  },
  PICKER_SELECTION_RACE: {
    code: "PICKER_SELECTION_RACE",
    dougFacing:
      "A stale saved picker selection was cleaned up after the show access state changed.",
    crewFacing: null,
    followUp: "Informational; Eric if frequent",
    helpfulContext:
      "A browser submitted cleanup for a picker cookie entry whose epoch or crew member no longer matched the current show state. The compare-and-delete path removed only the stale entry and left newer selections intact.",
    title: "Stale picker selection cleaned",
    longExplanation:
      "The app cleaned a stale picker-cookie entry after detecting that it no longer matched the current show access state. This is expected after resets or roster changes; repeated alerts may indicate churn.",
    helpHref: "/help/errors#PICKER_SELECTION_RACE",
  },
  PICKER_EPOCH_STALE_BANNER: {
    code: "PICKER_EPOCH_STALE_BANNER",
    dougFacing: null,
    crewFacing: "Doug reset access for this show — pick yourself again.",
    followUp: "Crew → pick name",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_REMOVED_FROM_ROSTER_BANNER: {
    code: "PICKER_REMOVED_FROM_ROSTER_BANNER",
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
    dougFacing: null,
    crewFacing: "Doug hasn't added crew yet — check back soon.",
    followUp: "Crew → check back; Doug → update sheet",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_SHOW_UNAVAILABLE: {
    code: "PICKER_SHOW_UNAVAILABLE",
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
    dougFacing: null,
    crewFacing:
      "This link isn't available. If you had a working link, it may have been reset. Text Doug for the current link.",
    followUp: "Crew → text Doug for the current link",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  PICKER_INVALID_INPUT: {
    code: "PICKER_INVALID_INPUT",
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
  PICKER_CREW_MEMBER_NOT_FOUND: {
    code: "PICKER_CREW_MEMBER_NOT_FOUND",
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
    dougFacing:
      "Google picker bootstrap could not claim the signed-in user's crew identity. The user saw a retry page.",
    crewFacing: "Couldn't sign you in. Please try again in a moment.",
    followUp: "Crew → retry; Eric → inspect claim_oauth_identity",
    helpfulContext:
      "The picker-bootstrap route had a valid Google session but the claim_oauth_identity RPC returned an error or threw. The route returned a terminal 502 instead of redirecting in a loop.",
    title: "Picker bootstrap claim failed",
    longExplanation:
      "Google sign-in succeeded, but the database claim step failed. The app stopped on a retry page and emitted this alert so the failed claim can be investigated.",
    helpHref: "/help/errors#PICKER_BOOTSTRAP_RPC_FAILED",
  },
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED: {
    code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
    dougFacing:
      "Google picker bootstrap could not resolve the show link before session validation. The user saw a retry page.",
    crewFacing: "Couldn't sign you in. Please try again in a moment.",
    followUp: "Crew → retry; Eric → inspect resolve_show_by_slug_and_token",
    helpfulContext:
      "The picker-bootstrap route failed while resolving the tokenized show URL before it had a user email. The alert context is intentionally email-less and excludes the bearer share token.",
    title: "Picker bootstrap show resolve failed",
    longExplanation:
      "The bootstrap route could not resolve the show from the tokenized URL before checking the Google session. It failed closed with a retry page and emitted an email-less alert.",
    helpHref: "/help/errors#PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
  },
  OAUTH_IDENTITY_CLAIMED: {
    code: "OAUTH_IDENTITY_CLAIMED",
    dougFacing: "A crew identity was claimed through Google sign-in.",
    crewFacing: null,
    followUp: "Informational",
    helpfulContext:
      "The OAuth claim path stamped a crew row as claimed by a signed-in user. Future picker attempts for that row must route through Google sign-in.",
    title: "Crew identity claimed",
    longExplanation:
      "A signed-in user's canonical email matched a crew row and the row was stamped as claimed. This prevents other devices from selecting that identity through bypass picker flow.",
    helpHref: "/help/errors#OAUTH_IDENTITY_CLAIMED",
  },
  CALLBACK_CLAIM_THREW: {
    code: "CALLBACK_CLAIM_THREW",
    dougFacing:
      "The OAuth callback claim step threw before it could finish. The next show visit will retry through picker bootstrap.",
    crewFacing: null,
    followUp: "Eric → inspect callback claim logs",
    helpfulContext:
      "The OAuth callback encountered an unexpected exception while attempting to stamp crew identity claims. The callback does not mint picker cookies; the bootstrap route can retry the claim on the next show visit.",
    title: "OAuth claim threw",
    longExplanation:
      "The callback's claim-stamp block threw unexpectedly. The user may still be signed in, and the lazy picker bootstrap path is responsible for retrying the claim safely.",
    helpHref: "/help/errors#CALLBACK_CLAIM_THREW",
  },
  SIGN_IN_OR_SKIP_PROMPT: {
    code: "SIGN_IN_OR_SKIP_PROMPT",
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
    dougFacing: null,
    crewFacing:
      "You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest to pick from the roster.",
    followUp: "Crew → sign out or continue as guest",
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  },
  IDENTITY_DEACTIVATED_LOCK_HINT: {
    code: "IDENTITY_DEACTIVATED_LOCK_HINT",
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
    dougFacing:
      "A flight on the TRAVEL tab couldn't be matched to a crew name — check the name spelling matches the roster.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A flight in the TRAVEL tab's FLIGHT DETAILS table couldn't be attached because its crew name didn't exactly match a roster name (zero or multiple matches). The flight is skipped (never mis-assigned); fix the name spelling so it matches the roster.",
    title: "TRAVEL flight name unmatched",
    longExplanation:
      "A flight in the TRAVEL tab couldn't be matched to any roster crew member. The flight is skipped to avoid mis-assigning it; correct the name spelling so it matches the roster.",
    helpHref: "/help/errors#TRAVEL_FLIGHT_NAME_UNMATCHED",
  },
  TRAVEL_FLIGHT_UNPARSEABLE: {
    code: "TRAVEL_FLIGHT_UNPARSEABLE",
    dougFacing:
      "A crew member's TRAVEL-tab flight couldn't be read (no recognizable flight date) — check the format.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "A flight in the TRAVEL tab's FLIGHT DETAILS table couldn't be attached because the cell contained no recognizable flight date. The flight is skipped; check that the format starts each leg with an M/D date (e.g. '3/22 AA123 JFK - LAX').",
    title: "TRAVEL flight unparseable",
    longExplanation:
      "A crew member's TRAVEL-tab flight cell had no recognizable flight date and was skipped. Check the format matches the expected pattern.",
    helpHref: "/help/errors#TRAVEL_FLIGHT_UNPARSEABLE",
  },
  TRAVEL_FLIGHT_AMBIGUOUS_TABLE: {
    code: "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
    dougFacing:
      "Found more than one TRAVEL flight table — remove or rename the duplicate/old one so flights can be read.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "The parser found more than one TRAVEL flight table in the sheet export. Because the tables could represent different shows or states, flights are not attached from any of them. Remove or rename the duplicate/old table so only one remains and flights can be read.",
    title: "Multiple TRAVEL flight tables",
    longExplanation:
      "More than one TRAVEL flight table was found in the sheet. Flights are not attached from any of them; remove or rename the duplicate so only one remains.",
    helpHref: "/help/errors#TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
  },
  WEBHOOK_HEADERS_MISSING: {
    code: "WEBHOOK_HEADERS_MISSING",
    dougFacing: "A Drive webhook request was missing required Google headers.",
    crewFacing: null,
    followUp: "Eric → inspect webhook delivery",
    helpfulContext:
      "Google Drive's push notifications carry a fixed set of headers identifying the channel, resource, and verification token. A request reached our webhook endpoint without those headers — usually that means a stale subscription is still firing or someone's probing the endpoint. The developer has been notified; no action is needed unless this keeps appearing.",
    title: "Drive webhook missing headers",
    longExplanation:
      "Google Drive's push notifications carry a fixed set of headers identifying the channel, resource, and verification token. A request reached our webhook endpoint without those headers, usually because a stale subscription is still firing or someone is probing the endpoint. The developer has been notified.",
    helpHref: "/help/errors#WEBHOOK_HEADERS_MISSING",
  },
  // Validation-environment reset / reseed — admin-only routes, crew-invisible.
  VALIDATION_RESET_NOT_ALLOWED: {
    code: "VALIDATION_RESET_NOT_ALLOWED",
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
    dougFacing: "The validation reset couldn't finish. Please try again.",
    crewFacing: null,
    followUp: "Doug → retry; if persistent, Eric",
    helpfulContext:
      "The Reset-validation-data action (Settings → Maintenance card) started the delete-based reset sequence but hit an unexpected database or infrastructure fault partway through. The database may be in a partially reset state. Running the reset again is safe — the sequence is designed to be idempotent. If it keeps failing, the developer needs to investigate the underlying database error.",
    title: "Validation reset failed",
    longExplanation:
      "The Reset-validation-data action (Settings → Maintenance card) hit an unexpected fault partway through the delete-based reset sequence. Running the reset again is safe. If it keeps failing, the developer needs to investigate.",
    helpHref: "/help/errors#VALIDATION_RESET_FAILED",
  },
  VALIDATION_RESEED_FAILED: {
    code: "VALIDATION_RESEED_FAILED",
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
