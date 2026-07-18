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
