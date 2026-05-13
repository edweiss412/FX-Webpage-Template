export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
};

export const MESSAGE_CATALOG = {
  LINK_EXPIRED: {
    code: "LINK_EXPIRED",
    dougFacing: null,
    crewFacing: "This link has expired. Ask Doug for a new one.",
    followUp: "Crew -> text Doug",
    helpfulContext: null,
  },
  LINK_REVOKED_FLOOR: {
    code: "LINK_REVOKED_FLOOR",
    dougFacing: null,
    crewFacing: "This link has been replaced. Ask Doug for a new link.",
    followUp: "Crew -> text Doug",
    helpfulContext: null,
  },
  LINK_REVOKED_SURGICAL: {
    code: "LINK_REVOKED_SURGICAL",
    dougFacing: null,
    crewFacing: "This link has been revoked. Ask Doug for a new link.",
    followUp: "Crew -> text Doug",
    helpfulContext: null,
  },
  LINK_VERSION_MISMATCH: {
    code: "LINK_VERSION_MISMATCH",
    dougFacing: null,
    crewFacing: "This link is out of date. Ask Doug for a new link.",
    followUp: "Crew -> text Doug",
    helpfulContext: null,
  },
  LINK_NO_CREW_MATCH: {
    code: "LINK_NO_CREW_MATCH",
    dougFacing: null,
    crewFacing: "You've been removed from this show. Contact Doug if this is a mistake.",
    followUp: "Crew -> text Doug",
    helpfulContext: null,
  },
  LEAKED_LINK_DETECTED: {
    code: "LEAKED_LINK_DETECTED",
    dougFacing:
      "A signed link was opened with `?t=` in the URL - we treat that as a possible leak. The affected link has been auto-revoked and the crew member's row is in 'no live link' state. Click 'Issue new link' for them when you're ready.",
    crewFacing: "This link format isn't supported and has been revoked. Ask Doug for a new one.",
    followUp: "Doug -> Issue new link",
    helpfulContext:
      "A signed link is meant to live in the URL fragment after `#t=`, never in the query string after `?t=`. When Vercel logged a `?t=` URL, that token may have been written to a request log or referrer header — we treat it as compromised and revoke it automatically. Click 'Issue new link' to send the affected crew member a fresh one.",
  },
  CSRF_DENIED: {
    code: "CSRF_DENIED",
    dougFacing: null,
    crewFacing:
      "We couldn't open this link. Try the original link Doug shared again, in the same browser.",
    followUp: "Crew -> reopen original link; if persistent, Eric",
    helpfulContext: null,
  },
  CSRF_NONCE_EXPIRED: {
    code: "CSRF_NONCE_EXPIRED",
    dougFacing: null,
    crewFacing: "Please refresh and click the link again - your bootstrap window expired.",
    followUp: "Crew -> re-click signed link",
    helpfulContext: null,
  },
  CSRF_KEY_ROTATED: {
    code: "CSRF_KEY_ROTATED",
    dougFacing: "Sessions have been rotated; please open your original signed link again.",
    crewFacing: "Your sign-in session was rotated. Refresh the page and click your link again.",
    followUp: "Crew -> re-click signed link; Doug -> refresh and re-click",
    helpfulContext:
      "While you were using the app, the developer rotated the secret key the app uses to verify CSRF tokens. The token your browser was holding was minted under the old key, so it was rejected to keep stale tokens from authorizing actions after the rotation. Refresh the page and click your link again to mint a fresh CSRF token.",
  },
  GOOGLE_NO_CREW_MATCH: {
    code: "GOOGLE_NO_CREW_MATCH",
    dougFacing: null,
    crewFacing: "Your email isn't on the crew list for this show. Ask Doug to add you.",
    followUp: "Crew -> text Doug",
    helpfulContext: null,
  },
  AMBIGUOUS_EMAIL_BINDING: {
    code: "AMBIGUOUS_EMAIL_BINDING",
    dougFacing:
      "Two crew rows share the same email - Google login is unsafe to resolve. The duplicate-email check normally catches this; please re-share the sheet so we can re-parse, or contact the developer.",
    crewFacing: "Something is misconfigured for this show. Doug has been notified.",
    followUp: "Doug -> fix sheet duplicate; if persistent, Eric",
    helpfulContext:
      "When two people on the crew list share the same email address, we can't safely tell who's logging in. The duplicate-email check should normally catch this in the parse step. If you're seeing this code, the safest fix is to look at the most recent edits to your crew block — usually one of the two emails is a typo or a paste mistake. Once you correct the duplicate in your sheet, this alert will clear automatically on the next sync.",
  },
  SESSION_NOT_FOUND: {
    code: "SESSION_NOT_FOUND",
    dougFacing: null,
    crewFacing: "Open the original link Doug shared again.",
    followUp: "Crew -> reopen link",
    helpfulContext: null,
  },
  SESSION_IDLE_TIMEOUT: {
    code: "SESSION_IDLE_TIMEOUT",
    dougFacing: null,
    crewFacing: "Your session timed out. Open the original link Doug shared again.",
    followUp: "Crew -> reopen link",
    helpfulContext: null,
  },
  SESSION_ABSOLUTE_TIMEOUT: {
    code: "SESSION_ABSOLUTE_TIMEOUT",
    dougFacing: null,
    crewFacing: "Time to refresh - open the original link Doug shared again.",
    followUp: "Crew -> reopen link",
    helpfulContext: null,
  },
  LINK_SESSION_KEY_ROTATED: {
    code: "LINK_SESSION_KEY_ROTATED",
    dougFacing: "Sessions have been rotated; please open your original signed link again.",
    crewFacing: null,
    followUp: "User -> re-open original signed link",
    helpfulContext:
      "While you were finishing sign-in, the developer rotated the secret key the app uses to authenticate link sessions. Your session was bound to the old key, so it was retired to keep the old key from authorizing any new requests after the rotation. Open the original signed link Doug shared again to mint a fresh session.",
  },
  LINK_REDEEM_KEY_ROTATED: {
    code: "LINK_REDEEM_KEY_ROTATED",
    dougFacing: "Sessions have been rotated; please open your original signed link again.",
    crewFacing: null,
    followUp: "User -> re-open original signed link",
    helpfulContext:
      "While you were finishing sign-in, the developer rotated the secret key the app uses to verify signed links. Your link was minted under the old key, so the redemption was rejected to keep the old key from authorizing any new sessions after the rotation. Open the original signed link Doug shared again.",
  },
  OAUTH_STATE_INVALID: {
    code: "OAUTH_STATE_INVALID",
    dougFacing:
      "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    crewFacing:
      "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    followUp: "Crew -> reopen the link; Eric if persistent",
    helpfulContext:
      "Google OAuth uses a one-time security token to make sure the sign-in callback came from the request your browser actually started. The token was missing, expired, or didn't match. Click the original link from Doug again to start fresh.",
  },
  OAUTH_REDIRECT_INVALID: {
    code: "OAUTH_REDIRECT_INVALID",
    dougFacing:
      "Sign-in landed somewhere we don't recognize. Please click the original link from Doug again to start over.",
    crewFacing:
      "Sign-in landed somewhere we don't recognize. Please click the original link from Doug again to start over.",
    followUp: "Crew -> reopen the link; Eric if persistent",
    helpfulContext:
      "The Google OAuth callback's `next` parameter pointed somewhere outside the allowed list of post-sign-in destinations. Without this guard, an attacker could trick the round-trip into landing on a malicious origin or onto the bootstrap shell with no fragment.",
  },
  ADMIN_SESSION_LOOKUP_FAILED: {
    code: "ADMIN_SESSION_LOOKUP_FAILED",
    dougFacing: null,
    crewFacing: "Something is misconfigured for this show. Doug has been notified.",
    followUp: "Eric -> investigate admin/session lookup",
    helpfulContext: null,
  },
  /**
   * R22 F3 (round-22 §B MEDIUM): redeem-link contention retry signal.
   *
   * The redeem-link route uses an in-process advisory lock with "try"
   * mode (R22 F3 changed from "block" — block-mode held a postgres
   * connection per blocked waiter and could exhaust the pool under
   * venue-scale bursts of users redeeming links for the same show
   * within seconds of each other). When the lock is contended, losers
   * receive a 503 with this code and the client retries with jittered
   * exponential backoff. Same shape as bootstrapMint's R8 #2 retry
   * loop. M6 admin sync routes can also surface this to Doug when a
   * show-level sync lock is contended.
   */
  SHOW_BUSY_RETRY: {
    code: "SHOW_BUSY_RETRY",
    dougFacing: "That show is already syncing. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug -> retry after the current sync finishes",
    helpfulContext: "Another sync is holding the per-show advisory lock; retry with backoff.",
  },
  STALE_WRITE_ABORTED: {
    code: "STALE_WRITE_ABORTED",
    dougFacing: "A newer sync already won. Refresh to see the latest staged or applied data.",
    crewFacing: null,
    followUp: "Doug -> refresh the admin page",
    helpfulContext: "The cron worker refused to write an older parse over a newer Drive revision.",
  },
  STALE_PUSH_ABORTED: {
    code: "STALE_PUSH_ABORTED",
    dougFacing: "A newer sync already won. The push notification was ignored.",
    crewFacing: null,
    followUp: "Doug -> refresh if the admin view looks stale",
    helpfulContext: "A Google Drive push event tried to apply data older than the current row.",
  },
  STALE_MANUAL_REPLAY_ABORTED: {
    code: "STALE_MANUAL_REPLAY_ABORTED",
    dougFacing:
      "That manual sync was based on an older sheet revision. Refresh and run sync again if needed.",
    crewFacing: null,
    followUp: "Doug -> refresh, then retry",
    helpfulContext:
      "Manual sync allows same-revision replay, but it still refuses to apply a strictly older revision.",
  },
  CONCURRENT_SYNC_SKIPPED: {
    code: "CONCURRENT_SYNC_SKIPPED",
    dougFacing: "Another sync is already running for this show. Try again in a moment.",
    crewFacing: null,
    followUp: "Doug -> retry shortly",
    helpfulContext:
      "The per-show advisory lock was busy, so this attempt skipped instead of waiting.",
  },
  ASSET_RECOVERY_BYTES_EXCEEDED: {
    code: "ASSET_RECOVERY_BYTES_EXCEEDED",
    dougFacing:
      "This show's diagram set is too large to recover automatically. Crew may see placeholders for missing diagrams.",
    crewFacing: null,
    followUp: "Doug -> trim the gallery or ask Eric if the recovery ceiling needs to be raised",
    helpfulContext:
      "Asset recovery stops above 60 images, above 50MB for one image, or above 3GB per run so the per-show lock stays short.",
  },
  ASSET_RECOVERY_REVISION_DRIFT: {
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    dougFacing:
      "Diagram recovery raced a newer approved snapshot and paused briefly before retrying.",
    crewFacing: null,
    followUp: "Doug -> no action unless this repeats; Eric -> inspect recovery cooldowns",
    helpfulContext:
      "Asset recovery raced a newer Apply and aborted without mutating the show; the next cron pass re-evaluates the current revision after cooldown.",
  },
  ASSET_RECOVERY_DRIFT_COOLDOWN: {
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    dougFacing:
      "Diagram recovery is backing off because this snapshot recently changed during repair.",
    crewFacing: null,
    followUp: "Doug -> wait for the next sync or run a manual re-sync",
    helpfulContext:
      "Asset recovery skipped this pass because the same show/revision recently drifted; manual re-sync bypasses the cooldown gate.",
  },
  ADMIN_FORBIDDEN: {
    code: "ADMIN_FORBIDDEN",
    dougFacing: "Your admin session cannot access this action. Sign in again and retry.",
    crewFacing: null,
    followUp: "Doug -> sign in again",
    helpfulContext:
      "Admin-only endpoints return this when the request does not carry a valid admin session.",
  },
  APPLY_STATUS_NOT_FOUND: {
    code: "APPLY_STATUS_NOT_FOUND",
    dougFacing:
      "That apply job is no longer available. Refresh the show and check the current status.",
    crewFacing: null,
    followUp: "Doug -> refresh the admin view",
    helpfulContext:
      "The apply-status endpoint could not find the requested show, apply id, or pending sync row.",
  },
  STAGED_PARSE_REVISION_RACE: {
    code: "STAGED_PARSE_REVISION_RACE",
    dougFacing:
      "The sheet changed while we were reading it. We'll retry from the new revision on the next sync.",
    crewFacing: null,
    followUp: "Doug -> wait for the next sync or retry after editing pauses",
    helpfulContext:
      "Markdown export, enrichment, and Drive metadata must all describe the same revision.",
  },
  STAGED_PARSE_REVISION_RACE_COOLDOWN: {
    code: "STAGED_PARSE_REVISION_RACE_COOLDOWN",
    dougFacing: "The sheet keeps changing mid-sync, so retries are temporarily backing off.",
    crewFacing: null,
    followUp: "Doug -> pause edits briefly or retry manually",
    helpfulContext:
      "Repeated same-revision binding races are cooled down to protect Drive API quota.",
  },
  STAGED_PARSE_SOURCE_OUT_OF_SCOPE: {
    code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
    dougFacing: "This staged sheet is no longer in the watched Drive folder.",
    crewFacing: null,
    followUp: "Doug -> move the sheet back or discard the staged parse",
    helpfulContext:
      "Between staging and Apply, the sheet was moved out of the watched folder. Anything outside the watched folder is invisible to the sync pipeline by design. Move the sheet back in and the next sync will produce a new staged parse.",
  },
  STAGED_PARSE_SOURCE_GONE: {
    code: "STAGED_PARSE_SOURCE_GONE",
    dougFacing: "This Drive sheet is unavailable or was deleted.",
    crewFacing: null,
    followUp: "Doug -> restore the sheet or discard the staged parse",
    helpfulContext:
      "Between staging and Apply, the source sheet was deleted, trashed, or unshared in Drive. Without a sheet to read, we can't apply the staged parse. Restore the sheet (or re-share it) and the next sync will produce a new staged parse.",
  },
  STAGED_PARSE_OUTDATED: {
    code: "STAGED_PARSE_OUTDATED",
    dougFacing: "A newer sheet revision exists. Refresh and review the latest staged parse.",
    crewFacing: null,
    followUp: "Doug -> refresh",
    helpfulContext:
      "Doug saved another edit to the sheet after the version you were reviewing was staged. The staged version is no longer the most recent state, so we discarded it. The next sync will produce a fresh staged parse to review.",
  },
  STAGED_PARSE_RESTAGED_INLINE: {
    code: "STAGED_PARSE_RESTAGED_INLINE",
    dougFacing: "The sheet changed during review, so we restaged it from the latest revision.",
    crewFacing: null,
    followUp: "Doug -> review the updated parse",
    helpfulContext:
      "The wizard re-parsed the sheet inside your current setup session because Doug edited it after the original scan. Review the refreshed parse — any decisions you made on the prior version were discarded.",
  },
  STAGED_PARSE_SUPERSEDED: {
    code: "STAGED_PARSE_SUPERSEDED",
    dougFacing: "The staged parse you were viewing was replaced by a newer sync.",
    crewFacing: null,
    followUp: "Doug -> refresh and review the latest staged parse",
    helpfulContext:
      "A newer parse was applied (probably by a different admin or a cron run) before your Apply landed. Refresh the admin page to see the current state.",
  },
  STALE_DISCARD_REJECTED: {
    code: "STALE_DISCARD_REJECTED",
    dougFacing:
      "The staged parse you were viewing was replaced by a newer sync. Refresh and review the latest version before deciding.",
    crewFacing: null,
    followUp: "Doug -> refresh",
    helpfulContext:
      "A newer parse was staged for this sheet between when you opened the review and when you clicked Discard. Refresh the admin page to see the latest version before deciding.",
  },
  WIZARD_SESSION_SUPERSEDED: {
    code: "WIZARD_SESSION_SUPERSEDED",
    dougFacing: "This onboarding scan was replaced by a newer scan.",
    crewFacing: null,
    followUp: "Doug -> continue from the latest onboarding scan",
    helpfulContext:
      "Setup wizards run one at a time. While your tab was open, another wizard was started (probably from a second browser tab or device) and your session was retired. Refresh and start setup over in a single tab; whatever the other wizard scanned is the new state.",
  },
  WIZARD_SESSION_SUPERSEDED_DURING_SCAN: {
    code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
    dougFacing: "A newer onboarding scan started before this one finished.",
    crewFacing: null,
    followUp: "Doug -> use the latest scan",
    helpfulContext:
      "Setup wizards run one at a time per folder. While your scan was still running, someone (probably you, in a second tab) started a fresh scan against the same folder, which retires the in-flight one. Close this tab and continue from the wizard tab that holds the newer scan.",
  },
  WIZARD_ISOLATION_INDEXES_MISSING: {
    code: "WIZARD_ISOLATION_INDEXES_MISSING",
    dougFacing:
      "Onboarding isolation indexes are missing. Stop onboarding until the database migration is fixed.",
    crewFacing: null,
    followUp: "Eric -> verify pending_syncs and pending_ingestions partition indexes",
    helpfulContext:
      "The setup wizard scans your folder by writing per-session staging rows into the same tables the live sync writes to (pending_syncs, pending_ingestions, onboarding_scan_manifest). To keep wizard rows from colliding with live rows, the database has four partial unique indexes that route writes to the right slot. The scan checks for those indexes before writing anything; if any are missing, the wizard aborts cleanly rather than risk a partial scan against a half-migrated schema. Eric is automatically notified to apply the migration; once that's done, click Re-run Setup to retry.",
  },
  LIVE_ROW_CONFLICT: {
    code: "LIVE_ROW_CONFLICT",
    dougFacing:
      "A live show row conflicted with the staged sync. The developer needs to reconcile it before applying.",
    crewFacing: null,
    followUp: "Eric -> reconcile the live row and staged parse",
    helpfulContext:
      "Setup tried to stage a parse for a sheet that the live folder sync is already processing. We skipped the wizard's stage to avoid clobbering the live row. Resolve the live row from the dashboard — either Apply or Discard it — then re-run setup if you still need to.",
  },
  ROLE_FLAGS_NOTICE: {
    code: "ROLE_FLAGS_NOTICE",
    severity: "info",
    dougFacing:
      "A non-Lead crew capability changed and was applied automatically. Review the updated crew row if anything looks off.",
    crewFacing: null,
    followUp: "Doug -> no action needed unless the role is wrong",
    helpfulContext:
      "LEAD additions or removals still require review. Non-Lead role flag changes sync automatically and are recorded here for visibility.",
  },
  SHOW_FIRST_PUBLISHED: {
    code: "SHOW_FIRST_PUBLISHED",
    severity: "info",
    dougFacing:
      "_<sheet-name>_ is now live for crew. _<crew-count>_ crew, _<show-date>_. **Made a mistake?** [Click here to unpublish](signed-link) within 24h.",
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "We auto-published this show because the parse looked clean — all the safety checks passed. The crew page is now live and signed links you send out will work. If you dragged in the wrong sheet or weren't ready, click 'Unpublish' in this email within 24 hours and we'll archive it and kill any links you've already sent.",
  },
  SHOW_UNPUBLISHED: {
    code: "SHOW_UNPUBLISHED",
    dougFacing:
      "_<sheet-name>_ has been unpublished. Crew links no longer work. Drag the sheet back into your watched folder when you're ready to publish again.",
    crewFacing: null,
    followUp: "Doug → optionally re-share when ready",
    helpfulContext:
      "You clicked Unpublish on a recently-published show. The show is now archived, any signed links you sent in the last 24h have been revoked, and crew can no longer reach the page. Nothing is lost — your sheet is unchanged. Drag it back into the watched folder when you're ready to publish for real.",
  },
  UNPUBLISH_TOKEN_CONSUMED: {
    code: "UNPUBLISH_TOKEN_CONSUMED",
    dougFacing:
      "That unpublish link was already used. The show is already unpublished or the undo window has been closed.",
    crewFacing: null,
    followUp: "Doug -> no action if the show is already archived",
    helpfulContext:
      "Unpublish undo tokens are single-use. A second click on the same email link returns this code instead of running link revocation twice.",
  },
  UNPUBLISH_TOKEN_EXPIRED: {
    code: "UNPUBLISH_TOKEN_EXPIRED",
    dougFacing:
      "That unpublish link has expired. Use the normal admin archive flow if the show still needs to come down.",
    crewFacing: null,
    followUp: "Doug -> archive from admin if needed",
    helpfulContext:
      "First-seen auto-publish undo links are valid for 24 hours. After that, wrong-publish recovery uses the regular admin archive workflow.",
  },
  FINALIZE_OWNED_SHOW: {
    code: "FINALIZE_OWNED_SHOW",
    dougFacing: "This onboarding finalize step tried to take over an existing owned show.",
    crewFacing: null,
    followUp: "Doug -> review the existing show before finalizing",
    helpfulContext:
      "This show is currently being published as part of a setup wizard's multi-batch finalize. Until the wizard's final-publish step commits, the row is held with `published = false` and admin write actions (Re-sync, Archive, Apply/Discard staged changes) are gated to prevent races against the in-flight finalize. Wait for the wizard tab to finish — the dashboard 'Publishing…' badge clears the moment the final-publish step commits, after which this action will succeed.",
  },
  WEBHOOK_HEADERS_MISSING: {
    code: "WEBHOOK_HEADERS_MISSING",
    dougFacing: "A Drive webhook request was missing required Google headers.",
    crewFacing: null,
    followUp: "Eric -> inspect webhook delivery",
    helpfulContext:
      "Google Drive's push notifications carry a fixed set of headers identifying the channel, resource, and verification token. A request reached our webhook endpoint without those headers — usually that means a stale subscription is still firing or someone's probing the endpoint. The developer has been notified; no action is needed unless this keeps appearing.",
  },
  WEBHOOK_NOOP_ALREADY_SYNCED: {
    code: "WEBHOOK_NOOP_ALREADY_SYNCED",
    dougFacing: "This Drive notification was already synced.",
    crewFacing: null,
    followUp: null,
    helpfulContext:
      "Google Drive sometimes redelivers the same push notification (network hiccups or Google's own retries). When the notification's revision was already processed, we skip the sync to avoid duplicate work and record this so the admin log shows why the webhook returned early. No action is needed.",
  },
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE: {
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    dougFacing:
      "Embedded diagram recovery could not complete from the current revision. Edit or re-save the sheet so it can restage.",
    crewFacing: null,
    followUp: "Doug -> make a small sheet edit, then sync again",
    helpfulContext:
      "The current approved diagram snapshot stays live until a fresh revision can be captured.",
  },
  LINKED_ASSET_DRIFTED: {
    code: "LINKED_ASSET_DRIFTED",
    dougFacing: "A linked Drive asset changed after staging and needs review.",
    crewFacing: null,
    followUp: "Doug -> review linked assets before applying",
    helpfulContext:
      "A diagram in the linked Google Drive folder was edited after the staged parse was reviewed. Crew see a placeholder where that diagram should be — we won't show drifted bytes that an operator hasn't approved. Save the sheet again (any edit advances the version) to re-stage the new diagram.",
  },
  REEL_DRIFTED: {
    code: "REEL_DRIFTED",
    dougFacing: "The opening reel changed after staging and needs review.",
    crewFacing: null,
    followUp: "Doug -> review the reel before applying",
    helpfulContext:
      "The opening-reel video was replaced or edited in Drive after the staged parse was reviewed. Crew see the text status only (e.g., 'YES') without the inline video until you save the sheet again to re-stage the new reel.",
  },
  OPENING_REEL_PERMISSION_DENIED: {
    code: "OPENING_REEL_PERMISSION_DENIED",
    dougFacing:
      "The opening reel can no longer be accessed. The show will publish without the video until access is restored and re-synced.",
    crewFacing: null,
    followUp: "Doug -> restore Drive access to the reel, then sync again",
    helpfulContext:
      "Apply clears all opening-reel pins when Drive returns permission denied so the crew page falls back to text only.",
  },
  OPENING_REEL_NOT_VIDEO: {
    code: "OPENING_REEL_NOT_VIDEO",
    dougFacing:
      "The opening reel link points to a non-video file. The show will publish without the video.",
    crewFacing: null,
    followUp: "Doug -> replace the opening reel link with a video file and sync again",
    helpfulContext: "The reel route only serves Drive files whose MIME type starts with video/.",
  },
  DIAGRAMS_TAB_MISSING: {
    code: "DIAGRAMS_TAB_MISSING",
    dougFacing: null,
    crewFacing: null,
    followUp: "none",
    helpfulContext: null,
  },
  DIAGRAMS_EMBEDDED_NONE_FOUND: {
    code: "DIAGRAMS_EMBEDDED_NONE_FOUND",
    dougFacing:
      "The DIAGRAMS tab returned no embedded images. Confirm before replacing the current gallery, or paste in the images and sync again.",
    crewFacing: null,
    followUp: "Doug -> confirm the empty gallery or add images",
    helpfulContext:
      "A sheet that appears configured for embedded diagrams produced zero embedded objects and no linked-folder URL. Existing approved galleries stay live until an operator confirms the empty result.",
  },
  DIAGRAMS_EMBEDDED_CAP_EXCEEDED: {
    code: "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
    dougFacing:
      "The DIAGRAMS tab has more than 60 images. Only the first 60 will be shown to crew.",
    crewFacing: null,
    followUp: "Doug -> trim the gallery if the omitted images matter",
    helpfulContext:
      "The embedded diagram extractor caps galleries at 60 images to keep sync and storage bounded.",
  },
  DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE: {
    code: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
    dougFacing:
      "This sheet's diagrams could not be safely captured this sync. The previous version of those images is still showing.",
    crewFacing: null,
    followUp: "Eric -> inspect Drive revisions; Doug -> optionally report",
    helpfulContext:
      "Drive did not return a usable spreadsheet revision token for embedded-image freezing. Apply preserves the prior approved diagram snapshot instead of replacing it with an unsafe result.",
  },
  DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE: {
    code: "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
    dougFacing:
      "An image embedded in the DIAGRAMS tab could not be downloaded. Crew see a placeholder where it should be.",
    crewFacing: null,
    followUp: "Doug -> re-paste the image, or tell Eric if it keeps happening",
    helpfulContext:
      "The Sheets API described an embedded image, but its download URL was inaccessible to the service account.",
  },
  LINKED_FOLDER_OVERFLOW_TRUNCATED: {
    code: "LINKED_FOLDER_OVERFLOW_TRUNCATED",
    dougFacing:
      "The linked diagram folder has more images than this release can publish. Crew see the first 60 images.",
    crewFacing: null,
    followUp: "Doug -> trim or split the folder if omitted images matter",
    helpfulContext:
      "Linked-folder diagram freezing caps the combined embedded and linked gallery at 60 assets.",
  },
  EMBEDDED_ASSET_DRIFTED: {
    code: "EMBEDDED_ASSET_DRIFTED",
    dougFacing:
      "An embedded diagram changed after staging. Crew see a placeholder for that image until a new sheet edit re-stages it.",
    crewFacing: null,
    followUp: "Doug -> re-edit the sheet to re-stage the diagram",
    helpfulContext:
      "Apply re-checks the spreadsheet revision, object id, and embedded-image fingerprint before downloading bytes. A mismatch leaves the prior approved content live and marks the image for recovery or re-stage.",
  },
  DIAGRAM_ASSET_LOOKUP_FAILED: {
    code: "DIAGRAM_ASSET_LOOKUP_FAILED",
    dougFacing: "A diagram could not be loaded. Refresh and try again.",
    crewFacing: "This diagram could not be loaded. Ask Doug if it keeps happening.",
    followUp: "Doug -> retry; if persistent, Eric",
    helpfulContext:
      "The diagram asset route could not resolve or stream the stored immutable diagram revision.",
  },
  REEL_ASSET_LOOKUP_FAILED: {
    code: "REEL_ASSET_LOOKUP_FAILED",
    dougFacing: "The opening reel could not be loaded. Refresh and try again.",
    crewFacing: "This video could not be loaded. Ask Doug if it keeps happening.",
    followUp: "Doug -> retry; if persistent, Eric",
    helpfulContext:
      "The reel asset route could not resolve or stream the immutable Drive revision for the show.",
  },
  AGENDA_ASSET_LOOKUP_FAILED: {
    code: "AGENDA_ASSET_LOOKUP_FAILED",
    dougFacing: "The agenda PDF could not be loaded. Refresh and try again.",
    crewFacing: "This agenda could not be loaded. Ask Doug if it keeps happening.",
    followUp: "Doug -> retry; if persistent, Eric",
    helpfulContext:
      "The agenda asset route could not resolve or stream the linked Drive PDF for the show.",
  },
  AGENDA_GONE_FOR_CREW: {
    code: "AGENDA_GONE_FOR_CREW",
    dougFacing: null,
    crewFacing: "This agenda isn't available anymore. Ask Doug for a fresh link.",
    followUp: "Crew -> message Doug",
    helpfulContext: null,
  },
  AGENDA_UNAUTHENTICATED: {
    code: "AGENDA_UNAUTHENTICATED",
    dougFacing: null,
    crewFacing: "Your link to this agenda expired. Reopen Doug's latest message to view it.",
    followUp: "Crew -> reopen signed link",
    helpfulContext: null,
  },
  PENDING_SNAPSHOT_ROLLBACK_STUCK: {
    code: "PENDING_SNAPSHOT_ROLLBACK_STUCK",
    dougFacing:
      "A diagram snapshot rollback is stuck. Use the repair action before applying this show again.",
    crewFacing: null,
    followUp: "Doug -> run snapshot repair; if persistent, Eric",
    helpfulContext:
      "A pending diagram snapshot entered rollback cleanup but did not finish deleting its temporary prefix.",
  },
  PENDING_SNAPSHOT_PROMOTE_STUCK: {
    code: "PENDING_SNAPSHOT_PROMOTE_STUCK",
    dougFacing:
      "A diagram snapshot promotion is stuck. Use the repair action so the approved diagrams can go live.",
    crewFacing: null,
    followUp: "Doug -> run snapshot repair",
    helpfulContext:
      "A pending diagram snapshot started promotion but did not complete the storage move and current/pending cutover.",
  },
  PENDING_SNAPSHOT_DELETE_STUCK: {
    code: "PENDING_SNAPSHOT_DELETE_STUCK",
    dougFacing:
      "Old diagram snapshot cleanup is stuck. Crew pages are still protected, but storage cleanup needs repair.",
    crewFacing: null,
    followUp: "Doug -> run snapshot repair; if persistent, Eric",
    helpfulContext:
      "A pending snapshot upload row is marked for deletion but the storage prefix has not been reclaimed.",
  },
  PENDING_SNAPSHOT_NOT_STUCK: {
    code: "PENDING_SNAPSHOT_NOT_STUCK",
    dougFacing: "That diagram snapshot does not need repair.",
    crewFacing: null,
    followUp: "Doug -> refresh the admin view",
    helpfulContext:
      "The repair endpoint only accepts pending snapshot rows that started promotion and exceeded the repair threshold.",
  },
  PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT: {
    code: "PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT",
    dougFacing: "That diagram snapshot is still being promoted. Check again in a few minutes.",
    crewFacing: null,
    followUp: "Doug -> wait, then refresh",
    helpfulContext:
      "Promotion repair is blocked until the promote_started_at threshold has elapsed.",
  },
  MISSING_REVIEWER_CHOICE: {
    code: "MISSING_REVIEWER_CHOICE",
    dougFacing:
      "We need your decision for every item — looks like one was skipped. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "When you Apply a sheet, every triggered review item needs your decision. Your submission was missing a decision for at least one item — usually because the form's state got out of sync with the items the server was tracking. Refresh the admin page (the panel will re-render with the current items) and re-submit your decisions.",
  },
  EXTRA_REVIEWER_CHOICE: {
    code: "EXTRA_REVIEWER_CHOICE",
    dougFacing:
      "Something doesn't match between what you reviewed and what we have on file. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Your Apply submission carried a decision for an item the server isn't tracking — usually because the staged parse you were viewing was replaced between when the page loaded and when you clicked Apply. Refresh the admin page so the panel re-renders against the current staged parse, then re-submit your decisions.",
  },
  DUPLICATE_REVIEWER_CHOICE: {
    code: "DUPLICATE_REVIEWER_CHOICE",
    dougFacing: "We got the same decision twice for one item. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Your Apply submission carried two decisions for the same item id. The form should normally prevent this; you've reached this code via a stale or duplicated form state. Refresh the admin page and re-submit your decisions cleanly.",
  },
  INVALID_REVIEWER_ACTION: {
    code: "INVALID_REVIEWER_ACTION",
    dougFacing: "That action isn't valid for this item. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug → refresh admin",
    helpfulContext:
      "Each review item has a fixed list of valid decisions (apply / reject / rename / independent, depending on the item's invariant). Your submission carried an action value that isn't in the allowed list for one of the items — usually because the form was hand-edited or the page is running a stale build. Refresh the admin page and re-submit using the form controls.",
  },
  PENDING_SYNC_NOT_FOUND: {
    code: "PENDING_SYNC_NOT_FOUND",
    dougFacing: "That staged sync is no longer available.",
    crewFacing: null,
    followUp: "Doug -> refresh the admin page",
    helpfulContext:
      "The admin page renders staged-sync rows by id. When you clicked Apply or Discard, the server looked up that id and didn't find a row — usually because another browser tab acted on the same staged sync between when the page loaded and when you clicked. Refresh the admin page to see the current state and act on whatever's still pending.",
  },
  SYNC_FILE_FAILED: {
    code: "SYNC_FILE_FAILED",
    dougFacing: "One sheet could not be synced. The other sheets continued.",
    crewFacing: null,
    followUp: "Doug -> retry sync; Eric if persistent",
    helpfulContext: "A per-file sync step failed and was isolated from the rest of the folder run.",
  },
  SYNC_INFRA_ERROR: {
    code: "SYNC_INFRA_ERROR",
    dougFacing: "A sync infrastructure step failed. The rest of the folder continued.",
    crewFacing: null,
    followUp: "Eric -> inspect sync_log payload",
    helpfulContext:
      "A database or Supabase boundary returned an infrastructure error. The structured log payload keeps the original operation and error class for debugging.",
  },
  SYNC_STEP_TIMEOUT: {
    code: "SYNC_STEP_TIMEOUT",
    dougFacing: "A Drive sync step timed out. We'll retry on the next run.",
    crewFacing: null,
    followUp: "Eric -> inspect Drive latency if recurring",
    helpfulContext:
      "A Drive read or enrichment step exceeded the per-step timeout while the show sync lock was held.",
  },
  DRIVE_METADATA_MISSING: {
    code: "DRIVE_METADATA_MISSING",
    dougFacing: "Google Drive did not return the sheet revision metadata we need to sync safely.",
    crewFacing: null,
    followUp: "Eric -> inspect Drive metadata response",
    helpfulContext:
      "The sync engine requires a head revision id so markdown export, enrichment, and final apply all describe the same sheet revision.",
  },
  SHEET_UNAVAILABLE: {
    code: "SHEET_UNAVAILABLE",
    dougFacing:
      "_<sheet-name>_ isn't in your folder anymore. Either you moved/unshared it, or it was deleted. Re-share it to bring the show back.",
    crewFacing: "We couldn't get the latest from Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug -> re-share sheet",
    helpfulContext:
      "We expected to find this sheet in your watched folder but it's not there anymore. Either someone moved it to a different folder, the share was removed, or the file was deleted. Crew see the last good version we have on file. Re-share or move the sheet back into the folder and we'll pick it up on the next sync.",
  },
  DRIVE_FETCH_FAILED: {
    code: "DRIVE_FETCH_FAILED",
    dougFacing:
      "We couldn't fetch this sheet from Google Drive. Could be a transient network issue, or the sheet's been moved or unshared. We'll keep retrying. If this stays for more than an hour, click 'Retry' or check the sheet's share settings.",
    crewFacing: "We couldn't get the latest from Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug -> check share / Retry",
    helpfulContext:
      "Google Drive temporarily blocked or refused our request to read this sheet. The most common cause is a transient network or permissions hiccup; we keep retrying automatically. If this stays for more than an hour, double-check that the folder is still shared with the service account email and that the sheet hasn't been moved out of the watched folder.",
  },
  PARSE_ERROR_LAST_GOOD: {
    code: "PARSE_ERROR_LAST_GOOD",
    dougFacing:
      "_<sheet-name>_'s latest edit didn't parse. The previous approved version is still showing to crew. See the per-show parse panel for the error detail.",
    crewFacing:
      "We couldn't read the latest edit to Doug's sheet. Showing what we had at _<time>_.",
    followUp: "Doug -> fix sheet (see parse panel); Crew -> mention to Doug",
    helpfulContext:
      "A recent edit to the sheet introduced something the parser couldn't read, but we kept the previously approved version live so crew aren't blocked. Open the per-show parse panel to see the specific MI-N code explaining what went wrong, fix it in the sheet, and the next sync will replace the stale data.",
  },
  SYNC_DELAYED_MODERATE: {
    code: "SYNC_DELAYED_MODERATE",
    dougFacing: null,
    crewFacing: "Last synced *<time>* ago. Check with Doug if anything looks off.",
    followUp: "Crew -> mention to Doug",
    helpfulContext: null,
  },
  SYNC_DELAYED_SEVERE: {
    code: "SYNC_DELAYED_SEVERE",
    dougFacing:
      "*<sheet-name>*: crew page hasn't synced from Drive in over 6 hours. Push or cron is stalled — check the dashboard.",
    crewFacing: "Couldn't sync recently — contact Doug.",
    followUp: "Crew -> text Doug; Doug -> check dashboard",
    helpfulContext:
      "The crew page hasn't synced from Drive in over six hours. That's well past the normal cron interval, so something is stalled. Open the dashboard to check whether push subscriptions are healthy and whether the cron job is running.",
  },
  LOCK_OWNERSHIP_ASSERTION_FAILED: {
    code: "LOCK_OWNERSHIP_ASSERTION_FAILED",
    dougFacing: "A sync attempted to write without proving it owned the show lock.",
    crewFacing: null,
    followUp: "Eric -> stop sync and inspect lock topology",
    helpfulContext:
      "Every show write must happen under exactly one advisory lock keyed by the Drive file id.",
  },
  /**
   * R21 F2 (round-21 §B MEDIUM): leaked-link revocation failure.
   *
   * The middleware compromise handler tried to revoke a signed link that
   * was leaked into the URL (?t=...) but the SECURITY DEFINER RPC failed
   * (DB outage, network, RLS misconfiguration). The leaked link MAY
   * still be usable until the operator intervenes — this is the highest-
   * severity admin alert in the catalog because it is the recovery path
   * for a confirmed credential compromise.
   *
   * Pre-fix middleware reused ADMIN_SESSION_LOOKUP_FAILED for the alert
   * row, but that catalog entry has dougFacing:null so the AlertBanner
   * (surface="admin") rendered an empty shell with just a Resolve
   * button — Doug got no signal what to act on.
   */
  LEAKED_LINK_REVOCATION_FAILED: {
    code: "LEAKED_LINK_REVOCATION_FAILED",
    dougFacing:
      "A signed crew link was detected in a URL but couldn't be revoked. The leaked link may still work until this is resolved — Eric has been notified.",
    crewFacing: null,
    followUp:
      "Eric -> investigate revoke_leaked_link_atomic + DB connectivity, then re-run the compromise flow",
    helpfulContext:
      "When a magic-link token appears in the URL query string instead of being redeemed normally, the middleware treats it as a credential compromise and atomically revokes the underlying token version. This alert means that revocation RPC itself failed, so the leaked link could still be redeemed by an attacker until an operator clears the token version manually.",
  },
  WATCH_CHANNEL_ORPHANED: {
    code: "WATCH_CHANNEL_ORPHANED",
    dougFacing:
      "A push subscription couldn't be confirmed. We'll fall back to cron until it's resolved.",
    crewFacing: null,
    followUp: "Eric -> reconcile / retry",
    helpfulContext:
      "We tried to register a real-time push subscription with Google Drive and didn't get a confirmation back. The cron job will keep this show in sync on its normal schedule.",
  },
  WEBHOOK_TOKEN_INVALID: {
    code: "WEBHOOK_TOKEN_INVALID",
    dougFacing:
      "A push notification from Google Drive failed verification - possible spoofing or misconfiguration. The developer has been notified.",
    crewFacing: null,
    followUp: "Eric -> investigate",
    helpfulContext:
      "A push notification arrived from Google Drive carrying the wrong verification token. This usually means a stale subscription is still firing or someone's spoofing the endpoint. The developer has been notified and will rotate the token if needed.",
  },
  REPORT_ORPHANED_LOST_LEASE: {
    code: "REPORT_ORPHANED_LOST_LEASE",
    dougFacing:
      "An orphaned bug-report issue was created during a retry race and auto-closed. Click through to verify the issue closed correctly. If this code recurs frequently, increase the lease window.",
    crewFacing: null,
    followUp: "Eric -> review orphan, tune lease window if recurring",
    helpfulContext:
      "Two retries of the same bug-report submission both succeeded in creating GitHub issues. We auto-closed the duplicate. Click through to confirm.",
  },
  IDEMPOTENCY_IN_FLIGHT: {
    code: "IDEMPOTENCY_IN_FLIGHT",
    dougFacing:
      "That report is already being processed. Wait a moment, then refresh if the issue does not appear.",
    crewFacing:
      "That report is already being processed. Wait a moment, then try again if needed.",
    followUp: "Doug or crew -> wait for the in-flight report attempt to finish",
    helpfulContext:
      "A report with the same idempotency key currently has a live processing lease. The backend returns a conflict instead of creating a duplicate GitHub issue.",
  },
  REPORT_RATE_LIMITED_ADMIN: {
    code: "REPORT_RATE_LIMITED_ADMIN",
    dougFacing:
      "Too many admin bug reports were sent recently. Wait a bit, then try again.",
    crewFacing: null,
    followUp: "Doug -> retry after the rate-limit window",
    helpfulContext:
      "Admin bug-report submissions are rate-limited separately from crew submissions to protect GitHub and the app from accidental repeated sends.",
  },
  REPORT_RATE_LIMITED_CREW: {
    code: "REPORT_RATE_LIMITED_CREW",
    dougFacing: null,
    crewFacing:
      "Too many reports were sent recently. Please wait a bit, then try again.",
    followUp: "Crew -> retry after the rate-limit window",
    helpfulContext: null,
  },
  REPORT_LOOKUP_INCONCLUSIVE: {
    code: "REPORT_LOOKUP_INCONCLUSIVE",
    dougFacing:
      "We couldn't confirm whether your previous report went through. Please try again in a few minutes.",
    crewFacing:
      "We couldn't confirm whether your previous report went through. Please try again in a few minutes.",
    followUp: "Eric -> review GitHub issue lookup and retry state",
    helpfulContext:
      "The bug-report recovery path could not conclusively list recent GitHub issues for this idempotency key, so it refused to create a duplicate issue.",
  },
  REPORT_PIPELINE_FAILED: {
    code: "REPORT_PIPELINE_FAILED",
    dougFacing:
      "The report system hit a server error before it could finish. Please try again in a few minutes.",
    crewFacing:
      "The report system hit a server error before it could finish. Please try again in a few minutes.",
    followUp: "Eric -> inspect report pipeline logs and database connectivity",
    helpfulContext:
      "The report route caught a typed infrastructure failure from the report submission or reaper path and returned a cataloged 500 response instead of crashing.",
  },
  REPORT_HORIZON_EXPIRED: {
    code: "REPORT_HORIZON_EXPIRED",
    dougFacing:
      "This report attempt has expired (older than 24 hours). If the issue still applies, please file a fresh report.",
    crewFacing:
      "This report attempt has expired. Please open a fresh report if the issue still applies.",
    followUp: "Doug or crew -> start a fresh report if still needed",
    helpfulContext:
      "Bug-report retry recovery only runs within 24 hours of the original attempt. Older unresolved rows are handled by the reaper.",
  },
  REPORT_DUPLICATE_LIVE_MATCHES: {
    code: "REPORT_DUPLICATE_LIVE_MATCHES",
    dougFacing:
      "Multiple live GitHub issues were found for one report submission. Recovery is paused until Eric reviews the duplicates.",
    crewFacing: null,
    followUp: "Eric -> inspect duplicate report issues and close the incorrect one",
    helpfulContext:
      "The recovery scan found more than one non-orphan issue with the same bug-report marker. The system fails closed instead of choosing a winner.",
  },
  REPORT_OPEN_ORPHAN_LABEL: {
    code: "REPORT_OPEN_ORPHAN_LABEL",
    dougFacing:
      "An open GitHub issue carries the orphan-cleanup label. Eric needs to review and either re-close the issue or remove the label.",
    crewFacing: null,
    followUp: "Eric -> inspect the labeled issue",
    helpfulContext:
      "Orphan cleanup should close issues with state_reason=not_planned. Seeing the orphan label on an open issue indicates manual intervention or an unexpected GitHub state.",
  },
  GITHUB_BOT_LOGIN_MISSING: {
    code: "GITHUB_BOT_LOGIN_MISSING",
    dougFacing:
      "GitHub bot login is unconfigured - the report-recovery path is degraded. Set `GITHUB_BOT_LOGIN` env var to the bot's GitHub username.",
    crewFacing: null,
    followUp: "Eric -> configure env var",
    helpfulContext:
      "The bug-report recovery path needs to know the GitHub username of the bot account so it can find issues created by previous attempts.",
  },
  REPORT_LEASE_THRASHING: {
    code: "REPORT_LEASE_THRASHING",
    dougFacing:
      "Bug-report processing is thrashing on this show - retries are racing against leases. Check Eric's status; this usually means the lease window needs tuning.",
    crewFacing:
      "We're hitting heavy contention on the report system. Please try again in a moment.",
    followUp: "Eric -> tune lease window",
    helpfulContext:
      "Bug-report submissions for this show are racing against their own leases - too many retries firing inside the lease window.",
  },
  STALE_ORPHAN_REPORT: {
    code: "STALE_ORPHAN_REPORT",
    dougFacing:
      "A stale bug-report reservation expired before it could create a GitHub issue. No user action is needed unless this repeats.",
    crewFacing: null,
    followUp: "Eric -> inspect report-reaper logs if this recurs",
    helpfulContext:
      "The report reaper deleted an unresolved report row older than the 24-hour recovery horizon after its processing lease had expired.",
  },
  TILE_SERVER_RENDER_FAILED: {
    code: "TILE_SERVER_RENDER_FAILED",
    dougFacing:
      "*<sheet-name>*: a section couldn't load on the server. The page will keep trying — refresh in a minute. Tell the developer if this keeps happening.",
    crewFacing: "This section couldn't load — last good data shown.",
    followUp: "Doug -> refresh / Report; Eric -> investigate",
    helpfulContext:
      "One of the page sections crashed while the server was rendering it. The rest of the page rendered normally. The page will keep retrying — refresh in a minute. If this keeps happening, click 'Report' so the developer can investigate.",
  },
  INVALID_JSON: {
    code: "INVALID_JSON",
    dougFacing: null,
    crewFacing: "The request was not valid JSON.",
    followUp: null,
    helpfulContext: null,
  },
  SLUG_REQUIRED: {
    code: "SLUG_REQUIRED",
    dougFacing: null,
    crewFacing: "A show slug is required.",
    followUp: null,
    helpfulContext: null,
  },
  SHOW_REALTIME_BROADCAST_AUTH_FAILED: {
    code: "SHOW_REALTIME_BROADCAST_AUTH_FAILED",
    dougFacing: null,
    crewFacing: null,
    followUp: "none",
    helpfulContext: null,
  },
  SHOW_REALTIME_CROSS_SHOW_FORBIDDEN: {
    code: "SHOW_REALTIME_CROSS_SHOW_FORBIDDEN",
    dougFacing: null,
    crewFacing: null,
    followUp: "none",
    helpfulContext: null,
  },
  SHOW_REALTIME_TOKEN_MISCONFIGURED: {
    code: "SHOW_REALTIME_TOKEN_MISCONFIGURED",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric -> configure realtime JWT env",
    helpfulContext: null,
  },
  SHOW_VERSION_AUTH_FAILED: {
    code: "SHOW_VERSION_AUTH_FAILED",
    dougFacing: null,
    crewFacing: null,
    followUp: "none",
    helpfulContext: null,
  },
  SHOW_VERSION_CROSS_SHOW_FORBIDDEN: {
    code: "SHOW_VERSION_CROSS_SHOW_FORBIDDEN",
    dougFacing: null,
    crewFacing: null,
    followUp: "none",
    helpfulContext: null,
  },
  SHOW_VERSION_TOKEN_RPC_FAILED: {
    code: "SHOW_VERSION_TOKEN_RPC_FAILED",
    dougFacing: null,
    crewFacing: null,
    followUp: "Eric -> investigate version-token RPC",
    helpfulContext: null,
  },
} as const satisfies Record<string, MessageCatalogEntry>;

export type MessageCode = keyof typeof MESSAGE_CATALOG;
