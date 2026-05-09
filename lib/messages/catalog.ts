export type MessageCatalogEntry = {
  code: string;
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
    helpfulContext: null,
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
    helpfulContext:
      "Signed-in links go through a small bootstrap step that proves your browser actually rendered the link's start page in the last 30 seconds. If the rendered page sits open longer than 30 seconds before you complete sign-in, or you opened a lot of bootstrap pages back-to-back in different tabs, the bootstrap proof expires. Refresh the page and click the link again.",
  },
  CSRF_KEY_ROTATED: {
    code: "CSRF_KEY_ROTATED",
    dougFacing: "Sessions have been rotated; please open your original signed link again.",
    crewFacing: "Your sign-in session was rotated. Refresh the page and click your link again.",
    followUp: "Crew -> re-click signed link; Doug -> refresh and re-click",
    helpfulContext: null,
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
    helpfulContext: null,
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
    helpfulContext: null,
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
   * loop. The code is for the wire protocol — never shown to the user.
   */
  SHOW_BUSY_RETRY: {
    code: "SHOW_BUSY_RETRY",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
  },
  STALE_WRITE_ABORTED: {
    code: "STALE_WRITE_ABORTED",
    dougFacing: "A newer sync already won. Refresh to see the latest staged or applied data.",
    crewFacing: null,
    followUp: "Doug -> refresh the admin page",
    helpfulContext:
      "The cron worker refused to write an older parse over a newer Drive revision.",
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
    dougFacing:
      "The sheet keeps changing mid-sync, so retries are temporarily backing off.",
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
    helpfulContext: null,
  },
  STAGED_PARSE_SOURCE_GONE: {
    code: "STAGED_PARSE_SOURCE_GONE",
    dougFacing: "This Drive sheet is unavailable or was deleted.",
    crewFacing: null,
    followUp: "Doug -> restore the sheet or discard the staged parse",
    helpfulContext: null,
  },
  STAGED_PARSE_OUTDATED: {
    code: "STAGED_PARSE_OUTDATED",
    dougFacing: "A newer sheet revision exists. Refresh and review the latest staged parse.",
    crewFacing: null,
    followUp: "Doug -> refresh",
    helpfulContext: null,
  },
  STAGED_PARSE_RESTAGED_INLINE: {
    code: "STAGED_PARSE_RESTAGED_INLINE",
    dougFacing: "The sheet changed during review, so we restaged it from the latest revision.",
    crewFacing: null,
    followUp: "Doug -> review the updated parse",
    helpfulContext: null,
  },
  STAGED_PARSE_SUPERSEDED: {
    code: "STAGED_PARSE_SUPERSEDED",
    dougFacing: "The staged parse you were viewing was replaced by a newer sync.",
    crewFacing: null,
    followUp: "Doug -> refresh and review the latest staged parse",
    helpfulContext: null,
  },
  STALE_DISCARD_REJECTED: {
    code: "STALE_DISCARD_REJECTED",
    dougFacing:
      "The staged parse you were viewing was replaced by a newer sync. Refresh and review the latest version before deciding.",
    crewFacing: null,
    followUp: "Doug -> refresh",
    helpfulContext: null,
  },
  WIZARD_SESSION_SUPERSEDED: {
    code: "WIZARD_SESSION_SUPERSEDED",
    dougFacing: "This onboarding scan was replaced by a newer scan.",
    crewFacing: null,
    followUp: "Doug -> continue from the latest onboarding scan",
    helpfulContext: null,
  },
  WIZARD_SESSION_SUPERSEDED_DURING_SCAN: {
    code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
    dougFacing: "A newer onboarding scan started before this one finished.",
    crewFacing: null,
    followUp: "Doug -> use the latest scan",
    helpfulContext: null,
  },
  WIZARD_ISOLATION_INDEXES_MISSING: {
    code: "WIZARD_ISOLATION_INDEXES_MISSING",
    dougFacing:
      "Onboarding isolation indexes are missing. Stop onboarding until the database migration is fixed.",
    crewFacing: null,
    followUp: "Eric -> verify pending_syncs and pending_ingestions partition indexes",
    helpfulContext: null,
  },
  LIVE_ROW_CONFLICT: {
    code: "LIVE_ROW_CONFLICT",
    dougFacing:
      "A live show row conflicted with the staged sync. The developer needs to reconcile it before applying.",
    crewFacing: null,
    followUp: "Eric -> reconcile the live row and staged parse",
    helpfulContext: null,
  },
  FINALIZE_OWNED_SHOW: {
    code: "FINALIZE_OWNED_SHOW",
    dougFacing: "This onboarding finalize step tried to take over an existing owned show.",
    crewFacing: null,
    followUp: "Doug -> review the existing show before finalizing",
    helpfulContext: null,
  },
  WEBHOOK_HEADERS_MISSING: {
    code: "WEBHOOK_HEADERS_MISSING",
    dougFacing: "A Drive webhook request was missing required Google headers.",
    crewFacing: null,
    followUp: "Eric -> inspect webhook delivery",
    helpfulContext: null,
  },
  WEBHOOK_NOOP_ALREADY_SYNCED: {
    code: "WEBHOOK_NOOP_ALREADY_SYNCED",
    dougFacing: "This Drive notification was already synced.",
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
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
    helpfulContext: null,
  },
  REEL_DRIFTED: {
    code: "REEL_DRIFTED",
    dougFacing: "The opening reel changed after staging and needs review.",
    crewFacing: null,
    followUp: "Doug -> review the reel before applying",
    helpfulContext: null,
  },
  MISSING_REVIEWER_CHOICE: {
    code: "MISSING_REVIEWER_CHOICE",
    dougFacing: "Choose how to handle every review item before applying.",
    crewFacing: null,
    followUp: "Doug -> complete all review choices",
    helpfulContext: null,
  },
  INVALID_REVIEWER_ACTION: {
    code: "INVALID_REVIEWER_ACTION",
    dougFacing: "One review choice was not valid. Refresh and try again.",
    crewFacing: null,
    followUp: "Doug -> refresh and retry",
    helpfulContext: null,
  },
  PENDING_SYNC_NOT_FOUND: {
    code: "PENDING_SYNC_NOT_FOUND",
    dougFacing: "That staged sync is no longer available.",
    crewFacing: null,
    followUp: "Doug -> refresh the admin page",
    helpfulContext: null,
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
    helpfulContext: null,
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
    crewFacing: null,
    followUp: "Eric -> tune lease window",
    helpfulContext:
      "Bug-report submissions for this show are racing against their own leases - too many retries firing inside the lease window.",
  },
  TILE_SERVER_RENDER_FAILED: {
    code: "TILE_SERVER_RENDER_FAILED",
    dougFacing:
      "*<sheet-name>*: a section couldn't load on the server. The page will keep trying - refresh in a minute. Tell the developer if this keeps happening.",
    crewFacing: "This section couldn't load - last good data shown.",
    followUp: "Doug -> refresh / Report; Eric -> investigate",
    helpfulContext:
      "One of the page sections crashed while the server was rendering it. The rest of the page rendered normally. The page will keep retrying.",
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
