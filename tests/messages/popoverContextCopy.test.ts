/**
 * tests/messages/popoverContextCopy.test.ts
 * (spec 2026-07-20-alert-popover-context-design §6)
 *
 * Frozen-literal oracle for the 45 authored popover `helpfulContext` strings.
 * The catalog IS the subject under test, so the expected strings are hardcoded
 * here (inverting the usual derive-never-hardcode rule) — same posture as
 * tests/messages/_metaShowScopedTemplates.test.ts PAIRED. Editing a catalog
 * string without updating this fixture fails, naming the code.
 */
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const FROZEN: Record<string, string> = {
  AMBIGUOUS_EMAIL_BINDING:
    "Usually a recent typo or paste dropped the same address into two email cells. Once you correct it, the next sync clears this on its own; you can also mark it resolved right away.",
  DRIVE_FETCH_FAILED:
    "Crew keep seeing the last synced version while this retries on its own. If it lasts over an hour, confirm the folder is still shared with FXAV and that the sheet hasn't been moved out of it.",
  SHEET_UNAVAILABLE:
    "Until the sheet is back in the watched folder, crew keep the last good version on file. Move or re-share it into the folder and the next sync brings the show back automatically.",
  PARSE_ERROR_LAST_GOOD:
    "The parse panel shows the exact line that failed to read. Fix it in the sheet and the next sync replaces the older version crew currently see; nothing else to do.",
  RESYNC_SHRINK_HELD:
    "The update was held so a bad edit can't silently wipe crew or a section. If the drop was intentional, re-sync to apply it; if not, fix the sheet and a clean sync clears this.",
  RESYNC_QUALITY_REGRESSED:
    "Fewer fields or sections came through than last time, so parts of the page thinned out even though the sync went through. The parse panel flags what dropped; fix the sheet and a clean sync restores it.",
  WIZARD_SESSION_SUPERSEDED_RACE:
    "Two wizard tabs for the same sheet overlapped; the newer one won and the older tab's action was cancelled before it could touch state. Its leftovers are inert and auto-cleaned. Informational only.",
  WATCH_CHANNEL_ORPHANED:
    "At worst, edits take a few minutes to appear instead of instantly, since the scheduled sync still runs. It reconnects on its own each hour, or use Retry now. Only worth attention if it keeps failing.",
  WEBHOOK_TOKEN_INVALID:
    "The bad token usually means a stale Drive subscription is still firing, occasionally a spoof attempt. The developer is notified and rotates it if needed; no admin action.",
  REEL_DRIFTED:
    "The video changed after you last reviewed the show, so crew see the text status without it. Any save to the sheet picks up the current reel on the next sync.",
  OPENING_REEL_NOT_VIDEO:
    "A Doc, image, or PDF can't play inline, so crew see the text status only. Point the opening-reel cell at an actual video file to turn playback back on.",
  OPENING_REEL_PERMISSION_DENIED:
    "The video's sharing changed or it moved somewhere FXAV can't read, so crew see the text status only. Re-share it with FXAV, or swap in a video you do share, to restore playback.",
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE:
    "Crew see a placeholder because this diagram can't be recovered on its own. Save the sheet (any edit counts) and the next sync restores the image.",
  ASSET_RECOVERY_REVISION_DRIFT:
    "Recovery verified bytes against an older snapshot but a newer Apply landed first, so it aborted rather than attach stale assets to the current revision. The next run retries against the latest automatically.",
  ASSET_RECOVERY_DRIFT_COOLDOWN:
    "The prior attempt raced an Apply, so recovery backs off for this snapshot to bound retry storms while the show keeps changing. It resumes on its own after the cooldown.",
  ASSET_RECOVERY_BYTES_EXCEEDED:
    "The cap keeps one big gallery from blocking other shows' syncs. Crew see placeholders for the missing diagrams; trim the set under the limit, or ask the developer to raise the ceiling if this show genuinely needs it.",
  ROLE_FLAGS_NOTICE:
    "This fires only for LEAD or FINANCIALS, the roles that unlock internal financials and admin access, and every change is logged. Nothing to do unless it was a mistake; if so, correct it in the sheet or role mapping.",
  SHOW_FIRST_PUBLISHED:
    "It auto-published because the sheet came through clean. If it's the wrong sheet or bad timing, flip Published off on the show's page; crew lose access until you turn it back on, and the same link works again when you do.",
  SHOW_UNPUBLISHED:
    "Nothing was deleted and the sheet keeps syncing in the background, so republishing from the show's page brings the same link back exactly as it was.",
  LIVE_ROW_CONFLICT:
    "Setup stepped aside so it wouldn't clobber the live version already in flight. Apply or Discard that row from the dashboard, then re-run setup if you still need to.",
  ONBOARDING_SHEET_UNREADABLE:
    "These files never reach any crew page, so nothing is exposed. The usual cause is a missing or renamed section header; fix or remove them in Drive and the next sync clears this, or dismiss it now if they're meant to be skipped.",
  PENDING_SNAPSHOT_PROMOTE_STUCK:
    "It's stuck in the non-reclaimable promote-started state, so cleanup can't reclaim the prefix. The snapshot-promote repair tool reconciles the temp and canonical prefixes to finish it.",
  PENDING_SNAPSHOT_ROLLBACK_STUCK:
    "Assets are split across the temp and canonical prefixes after a half-finished rollback. The snapshot-rollback repair tool reconciles both and completes it so cleanup can continue.",
  BRANCH_PROTECTION_DRIFT:
    "Something drifted: a required check, a review requirement, admin enforcement, or a push or deletion restriction. Restore the settings so no PR can merge without the full audit suite.",
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED:
    "Without auth the monitor can't prove the merge gate is still enforced, so drift would go unseen. Rotate the GitHub App token or fallback PAT within 24 hours and confirm the job succeeds.",
  SYNC_STALLED:
    "Already-published pages stay up; only new edits are waiting. It usually recovers on its own, but if it sticks the Drive connection may have lapsed, so re-run setup or check the connection.",
  EMAIL_DELIVERY_FAILED:
    "Retries continue on their own. A persistent failure usually points at the provider API key or the verified sending domain in settings.",
  EMAIL_NOT_CONFIGURED:
    "Email needs three settings before anything sends: provider API key, verified sending address, and the public site URL for links. Dashboard alerts and each show's Publish toggle keep working without it.",
  TILE_SERVER_RENDER_FAILED:
    "Only that one section crashed; the rest of the page rendered. It keeps retrying, so a refresh usually clears it. If it recurs, use Report so the developer gets the stack.",
  TILE_PROJECTION_FETCH_FAILED:
    "The failed data sources are listed in the alert detail; their sections fell back while the rest loaded. A refresh usually clears it; use Report if it keeps happening.",
  REPORT_ORPHANED_LOST_LEASE:
    "Two retries of the same report both created a GitHub issue in a lease race, so the duplicate was auto-closed. Click through to confirm; if it recurs, the lease window needs widening.",
  GITHUB_BOT_LOGIN_MISSING:
    "Recovery needs the bot's GitHub username to find issues from earlier attempts. Set GITHUB_BOT_LOGIN to that username and redeploy to restore full recovery coverage.",
  REPORT_LEASE_THRASHING:
    "Too many retries fire inside the lease window, usually because it's shorter than GitHub's current response time. Widening the lease window settles it.",
  EMBEDDED_ASSET_DRIFTED:
    "Crew keep the last good image and see a placeholder only for the one that changed. Save the sheet again to pick up the new version.",
  PENDING_SNAPSHOT_DELETE_STUCK:
    "A row marked for deletion never had its storage prefix reclaimed. Crew pages are unaffected; this is storage hygiene only. Reconcile and reclaim the prefix to clear it.",
  REPORT_DUPLICATE_LIVE_MATCHES:
    "More than one live issue carries the same report marker, so recovery fails closed instead of guessing a winner. Review the duplicates and close all but one to resume it.",
  REPORT_LOOKUP_INCONCLUSIVE:
    "Recovery couldn't reliably list recent issues for this report, so it refused to risk a duplicate. Usually a transient GitHub API blip that clears on the next retry.",
  REPORT_OPEN_ORPHAN_LABEL:
    "Orphan cleanup only labels closed 'not planned' issues, so an open one means it was reopened or GitHub returned an odd state. Re-close the issue or remove the label.",
  STALE_ORPHAN_REPORT:
    "The reservation aged past the 24-hour recovery horizon with an expired lease and was reaped before an issue existed. Repeats would point at a stuck submit path worth a look.",
  PICKER_EPOCH_RESET:
    "The share link itself didn't change, so crew just pick their name again on the next visit, and any open tabs re-prompt on refresh. Nothing to fix; this is a record of the reset.",
  PICKER_SELECTION_RACE:
    "A browser cleaned up a picker cookie whose epoch or crew member no longer matches the show, typically after a reset or roster change. Compare-and-delete touched only that stale entry. No action.",
  PICKER_BOOTSTRAP_RPC_FAILED:
    "The route had a valid Google session but the identity claim errored, so it returned a clean retry page instead of a redirect loop. Repeats on one show may point at a claim-path problem.",
  PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED:
    "It failed before any signed-in identity existed, so the alert carries no email or share token by design. The visitor saw a retry page and can open the link again.",
  OAUTH_IDENTITY_CLAIMED:
    "From now on that row skips the picker and goes straight through Google sign-in. Routine success record; no action needed.",
  CALLBACK_CLAIM_THREW:
    "The callback never mints picker cookies, so nothing is left half-claimed. Picker bootstrap retries the claim automatically on the visitor's next show visit.",
};

describe("popover helpfulContext copy (frozen oracle)", () => {
  it("the oracle is closed over exactly the 45 authored codes", () => {
    // F5: an omitted pair must not silently pass. Pin the count so dropping a
    // code from the oracle fails here rather than leaving its copy unchecked.
    expect(Object.keys(FROZEN).length).toBe(45);
  });

  for (const [code, expected] of Object.entries(FROZEN)) {
    it(`${code} carries the authored popover copy`, () => {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      expect(entry, `${code} missing from catalog`).toBeDefined();
      expect(entry.helpfulContext).toBe(expected);
    });
  }
});
