/**
 * Full-sweep copy batch A (spec docs/superpowers/specs/2026-07-18-alert-copy-
 * full-sweep-design.md §6.a — 13 codes). Data-driven: every batch-A code gets
 * helpfulContext:null, non-null longExplanation/title, helpHref pinned to
 * /help/errors#<CODE>, and dougFacing containing a distinctive substring of
 * the §6.a new_dougFacing text (a fragment, not the full string — x1-catalog-
 * parity already pins the full §12.4 string verbatim).
 */
import { describe, expect, test } from "vitest";

import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/lookup";

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
const BATCH_B: ReadonlyArray<{ code: MessageCode; dougFacingSubstring: string }> = [
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

  test("all 15 batch-B codes are present in MESSAGE_CATALOG", () => {
    for (const { code } of BATCH_B) {
      expect(MESSAGE_CATALOG[code]).toBeDefined();
    }
    expect(BATCH_B).toHaveLength(15);
  });
});
