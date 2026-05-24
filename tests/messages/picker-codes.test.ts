import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { SPEC_CODES } from "@/lib/messages/__generated__/spec-codes";
import type { AdminAlertCode } from "@/lib/adminAlerts/upsertAdminAlert";

const PICKER_MESSAGE_CODES = [
  "PICKER_EPOCH_RESET",
  "PICKER_SELECTION_RACE",
  "PICKER_EPOCH_STALE_BANNER",
  "PICKER_REMOVED_FROM_ROSTER_BANNER",
  "PICKER_EMPTY_ROSTER",
  "PICKER_SHOW_UNAVAILABLE",
  "PICKER_INVALID_INPUT",
  "PICKER_CREW_MEMBER_NOT_FOUND",
  "PICKER_CREW_MEMBER_WRONG_SHOW",
  "PICKER_INVALID_SHARE_TOKEN",
  "PICKER_RESOLVER_LOOKUP_FAILED",
  "PICKER_IDENTITY_CLAIMED",
  "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
  "PICKER_BOOTSTRAP_RPC_FAILED",
  "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
  "OAUTH_IDENTITY_CLAIMED",
  "CALLBACK_CLAIM_THREW",
  "SIGN_IN_OR_SKIP_PROMPT",
  "SIGN_IN_OR_SKIP_PROMPT_MISMATCH",
  "IDENTITY_DEACTIVATED_LOCK_HINT",
] as const satisfies readonly MessageCode[];

const R41_ADMIN_ALERT_CODES = [
  "OAUTH_IDENTITY_CLAIMED",
  "PICKER_BOOTSTRAP_RPC_FAILED",
  "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
  "CALLBACK_CLAIM_THREW",
  "PICKER_SELECTION_RACE",
  "PICKER_EPOCH_RESET",
] as const satisfies readonly AdminAlertCode[];

describe("M11.5 picker catalog codes", () => {
  test("all picker message codes are present in live catalog and generated spec-code manifest", () => {
    for (const code of PICKER_MESSAGE_CODES) {
      expect(MESSAGE_CATALOG[code], `${code} live catalog row`).toBeDefined();
      expect(SPEC_CODES[code], `${code} generated spec-code row`).toBeDefined();
    }
  });

  test("R41 admin-alert codes are admitted by the AdminAlertCode union", () => {
    expect(R41_ADMIN_ALERT_CODES).toEqual([
      "OAUTH_IDENTITY_CLAIMED",
      "PICKER_BOOTSTRAP_RPC_FAILED",
      "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
      "CALLBACK_CLAIM_THREW",
      "PICKER_SELECTION_RACE",
      "PICKER_EPOCH_RESET",
    ]);
  });

  test("removed ambiguous picker identity codes stay unregistered", () => {
    expect("PICKER_IDENTITY_AMBIGUOUS" in MESSAGE_CATALOG).toBe(false);
    expect("PICKER_IDENTITY_AMBIGUOUS_BANNER" in MESSAGE_CATALOG).toBe(false);
  });
});
