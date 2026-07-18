/**
 * Full-sweep copy batch A (spec docs/superpowers/specs/2026-07-18-alert-copy-
 * full-sweep-design.md §6.a — 13 codes). Data-driven: every batch-A code gets
 * helpfulContext:null, non-null longExplanation/title, helpHref pinned to
 * /help/errors#<CODE>, and dougFacing containing a distinctive substring of
 * the §6.a new_dougFacing text (a fragment, not the full string — x1-catalog-
 * parity already pins the full §12.4 string verbatim).
 */
import { describe, expect, test } from "vitest";

import { MESSAGE_CATALOG, messageFor, type MessageCode } from "@/lib/messages/lookup";
import { predicate, allM12FieldsNonNull } from "@/lib/messages/catalogDocsValidator";
import { ADMIN_ALERTS_CODES } from "@/tests/messages/adminAlertsRegistry";

const BATCH_A: ReadonlyArray<{ code: MessageCode; dougFacingSubstring: string }> = [
  {
    code: "AMBIGUOUS_EMAIL_BINDING",
    dougFacingSubstring: "so Google login can't safely tell who's who",
  },
  {
    code: "OAUTH_IDENTITY_CLAIMED",
    dougFacingSubstring: "was claimed through Google sign-in as",
  },
  {
    code: "PICKER_BOOTSTRAP_RPC_FAILED",
    dougFacingSubstring: "couldn't claim the signed-in user's crew identity",
  },
  {
    code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
    dougFacingSubstring: "couldn't resolve the show link before session validation",
  },
  {
    code: "CALLBACK_CLAIM_THREW",
    dougFacingSubstring: "retries automatically through picker bootstrap",
  },
  {
    code: "PICKER_SELECTION_RACE",
    dougFacingSubstring: "No action needed — newer selections were left intact",
  },
  {
    code: "PICKER_EPOCH_RESET",
    dougFacingSubstring: "Picker selections for",
  },
  {
    code: "WIZARD_SESSION_SUPERSEDED_RACE",
    dougFacingSubstring: "was safely cancelled before it could change the new wizard's state",
  },
  {
    code: "ONBOARDING_SHEET_UNREADABLE",
    dougFacingSubstring: "couldn't be read and were skipped:",
  },
  {
    code: "WATCH_CHANNEL_ORPHANED",
    dougFacingSubstring: "needs to reconnect",
  },
  {
    code: "WEBHOOK_TOKEN_INVALID",
    dougFacingSubstring: "failed verification",
  },
  {
    code: "GITHUB_BOT_LOGIN_MISSING",
    dougFacingSubstring: "GitHub username and redeploy",
  },
  {
    code: "ROLE_FLAGS_NOTICE",
    dougFacingSubstring: "<role-changes><lead-hint>",
  },
];

describe("full-sweep copy batch A (§6.a — 13 codes)", () => {
  test.each(BATCH_A)(
    "$code: helpfulContext null, longExplanation/title non-null, helpHref pinned, dougFacing updated",
    ({ code, dougFacingSubstring }) => {
      const entry = MESSAGE_CATALOG[code];
      expect(entry.helpfulContext).toBeNull();
      expect(entry.longExplanation).not.toBeNull();
      expect(entry.title).not.toBeNull();
      expect(entry.helpHref).toBe(`/help/errors#${code}`);
      expect(entry.dougFacing).not.toBeNull();
      expect(entry.dougFacing).toContain(dougFacingSubstring);
    },
  );

  test("all 13 batch-A codes are present in MESSAGE_CATALOG", () => {
    for (const { code } of BATCH_A) {
      expect(MESSAGE_CATALOG[code]).toBeDefined();
    }
    expect(BATCH_A).toHaveLength(13);
  });
});

/**
 * Full-sweep copy batch B (spec docs/superpowers/specs/2026-07-18-alert-copy-
 * full-sweep-design.md §6.b — 15 codes). Same data-driven shape as batch A.
 */
const BATCH_B: ReadonlyArray<{
  code: MessageCode;
  dougFacingSubstring: string;
  helpHrefOverride?: string;
}> = [
  {
    code: "LIVE_ROW_CONFLICT",
    dougFacingSubstring: "is already being processed by the live folder sync",
  },
  {
    code: "DRIVE_FETCH_FAILED",
    dougFacingSubstring: "likely a transient network issue",
  },
  {
    code: "PARSE_ERROR_LAST_GOOD",
    dougFacingSubstring: "latest edit didn't parse, so the previous approved version",
    // Ratified WARN_/PARSE_ parse-warnings carve-out (design doc §4.4; ratified
    // E-content.md R2) — see 8dfdef812, which restored this after the §6.b batch
    // briefly moved it onto the generic /help/errors# pattern.
    helpHrefOverride: "/help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD",
  },
  {
    code: "SHEET_UNAVAILABLE",
    dougFacingSubstring: "isn't in your folder anymore",
  },
  {
    code: "RESYNC_SHRINK_HELD",
    dougFacingSubstring: "dropped crew or a whole section",
  },
  {
    code: "RESYNC_QUALITY_REGRESSED",
    dougFacingSubstring: "lost some data quality",
  },
  {
    code: "SYNC_STALLED",
    dougFacingSubstring: "won't reach crew pages until it resumes",
  },
  {
    code: "ASSET_RECOVERY_BYTES_EXCEEDED",
    dougFacingSubstring: "diagram set is too large to recover automatically",
  },
  {
    code: "ASSET_RECOVERY_REVISION_DRIFT",
    dougFacingSubstring: "paused because the show changed while recovery was checking files",
  },
  {
    code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    dougFacingSubstring: "is backing off briefly because this show keeps changing",
  },
  {
    code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    dougFacingSubstring: "can't be re-downloaded automatically",
  },
  {
    code: "EMBEDDED_ASSET_DRIFTED",
    dougFacingSubstring: "changed after staging, so crew see a placeholder",
  },
  {
    code: "REEL_DRIFTED",
    dougFacingSubstring: "has been edited since you reviewed this parse",
  },
  {
    code: "OPENING_REEL_PERMISSION_DENIED",
    dougFacingSubstring: "is no longer shared with FXAV",
  },
  {
    code: "OPENING_REEL_NOT_VIDEO",
    dougFacingSubstring: "is not a video file, so crew see the text status only",
  },
];

describe("full-sweep copy batch B (§6.b — 15 codes)", () => {
  test.each(BATCH_B)(
    "$code: helpfulContext null, longExplanation/title non-null, helpHref pinned, dougFacing updated",
    ({ code, dougFacingSubstring, helpHrefOverride }) => {
      const entry = MESSAGE_CATALOG[code];
      expect(entry.helpfulContext).toBeNull();
      expect(entry.longExplanation).not.toBeNull();
      expect(entry.title).not.toBeNull();
      expect(entry.helpHref).toBe(helpHrefOverride ?? `/help/errors#${code}`);
      expect(entry.dougFacing).not.toBeNull();
      expect(entry.dougFacing).toContain(dougFacingSubstring);
    },
  );

  test("all 15 batch-B codes are present in MESSAGE_CATALOG", () => {
    for (const { code } of BATCH_B) {
      expect(MESSAGE_CATALOG[code]).toBeDefined();
    }
    expect(BATCH_B).toHaveLength(15);
  });
});

/**
 * Full-sweep copy batch C (spec docs/superpowers/specs/2026-07-18-alert-copy-
 * full-sweep-design.md §6.c — 17 codes). Same data-driven shape as batch A/B.
 */
const BATCH_C: ReadonlyArray<{ code: MessageCode; dougFacingSubstring: string }> = [
  {
    code: "SHOW_FIRST_PUBLISHED",
    dougFacingSubstring: "is now live for crew at its share-token URL",
  },
  {
    code: "SHOW_UNPUBLISHED",
    dougFacingSubstring: "crew who open its link see a 'not available right now' page",
  },
  {
    code: "EMAIL_DELIVERY_FAILED",
    dougFacingSubstring: "couldn't be sent. We'll keep retrying automatically",
  },
  {
    code: "EMAIL_NOT_CONFIGURED",
    dougFacingSubstring: "sync-problem alerts, the daily digest, and auto-publish undo emails",
  },
  {
    code: "PENDING_SNAPSHOT_PROMOTE_STUCK",
    dougFacingSubstring: "has been stuck for more than 15 minutes",
  },
  {
    code: "PENDING_SNAPSHOT_ROLLBACK_STUCK",
    dougFacingSubstring: "stalled after moving some assets",
  },
  {
    code: "PENDING_SNAPSHOT_DELETE_STUCK",
    dougFacingSubstring: "is stuck — crew pages are still protected",
  },
  {
    code: "REPORT_ORPHANED_LOST_LEASE",
    dougFacingSubstring: "was auto-closed during a retry race",
  },
  {
    code: "REPORT_LOOKUP_INCONCLUSIVE",
    dougFacingSubstring: "couldn't confirm whether a report for",
  },
  {
    code: "REPORT_DUPLICATE_LIVE_MATCHES",
    dougFacingSubstring: "Recovery is paused until Eric reviews the duplicates",
  },
  {
    code: "REPORT_OPEN_ORPHAN_LABEL",
    dougFacingSubstring: "carries the orphan-cleanup label",
  },
  {
    code: "REPORT_LEASE_THRASHING",
    dougFacingSubstring: "retries are racing against leases",
  },
  {
    code: "STALE_ORPHAN_REPORT",
    dougFacingSubstring: "expired before it could create a GitHub issue",
  },
  {
    code: "TILE_SERVER_RENDER_FAILED",
    dougFacingSubstring: "a section failed to load on the server",
  },
  {
    code: "TILE_PROJECTION_FETCH_FAILED",
    dougFacingSubstring: "one or more data sources couldn't load",
  },
  {
    code: "BRANCH_PROTECTION_DRIFT",
    dougFacingSubstring: "no longer matches the X.6 contract",
  },
  {
    code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    dougFacingSubstring: "cannot authenticate with GitHub",
  },
];

describe("full-sweep copy batch C (§6.c — 17 codes)", () => {
  test.each(BATCH_C)(
    "$code: helpfulContext null, longExplanation/title non-null, helpHref pinned, dougFacing updated",
    ({ code, dougFacingSubstring }) => {
      const entry = MESSAGE_CATALOG[code];
      expect(entry.helpfulContext).toBeNull();
      expect(entry.longExplanation).not.toBeNull();
      expect(entry.title).not.toBeNull();
      expect(entry.helpHref).toBe(`/help/errors#${code}`);
      expect(entry.dougFacing).not.toBeNull();
      expect(entry.dougFacing).toContain(dougFacingSubstring);
    },
  );

  test("all 17 batch-C codes are present in MESSAGE_CATALOG", () => {
    for (const { code } of BATCH_C) {
      expect(MESSAGE_CATALOG[code]).toBeDefined();
    }
    expect(BATCH_C).toHaveLength(17);
  });

  test("SHOW_FIRST_PUBLISHED title is filled per spec §3 ratified decision", () => {
    expect(messageFor("SHOW_FIRST_PUBLISHED").title).toBe("Show published");
  });
});

/**
 * Task 9 (docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md
 * §4.4): every one of the 45 ADMIN_ALERTS_CODES — the canonical registry of
 * codes used in a production admin_alerts.upsert call, incl. the two
 * severity:"info" codes ROLE_FLAGS_NOTICE and SHOW_FIRST_PUBLISHED — must be
 * renderable on /help/errors: it satisfies the shared catalogDocsValidator
 * predicate AND carries non-null title/longExplanation/helpHref (the
 * `isRenderable`-shape check app/help/errors/page.tsx applies at render
 * time). The WARN_/PARSE_ parse-warnings carve-out (spec §4.4, ratified
 * E-content.md R2) changes helpHref's TARGET, not whether the code is
 * renderable at all, so it is not exempted here.
 */
describe("full-sweep copy: all 45 ADMIN_ALERTS_CODES are renderable on /help/errors", () => {
  test("registry has exactly 45 entries", () => {
    expect(ADMIN_ALERTS_CODES).toHaveLength(45);
  });

  test.each(ADMIN_ALERTS_CODES)("%s satisfies the shared renderability predicate", (code) => {
    const entry = MESSAGE_CATALOG[code];
    expect(predicate(entry), `${code}: predicate(entry) must be true`).toBe(true);
    expect(
      allM12FieldsNonNull(entry),
      `${code}: title/longExplanation/helpHref must all be non-null`,
    ).toBe(true);
  });
});
