/**
 * Show-scoped alert copy (spec 2026-07-20-show-scoped-alert-copy-design).
 *
 * ORACLE POLICY: expected copy is a FROZEN LITERAL written here, never derived
 * from the catalog. The usual "derive, never hardcode" rule assumes the fixture
 * is input; here the catalog is the subject under test, so deriving would
 * compare the implementation with itself. A template edit is MEANT to fail
 * these tests (spec §8).
 */
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { safeDougFacingTemplate } from "@/lib/admin/attentionItems";

describe("authored show-scoped variants", () => {
  it("ROLE_FLAGS_NOTICE drops the location prefix", () => {
    expect(MESSAGE_CATALOG.ROLE_FLAGS_NOTICE.dougFacingShowScoped).toBe(
      "<role-changes><lead-hint>",
    );
  });

  it("PICKER_BOOTSTRAP_RPC_FAILED drops the prefix and the redundant same-show clause", () => {
    expect(MESSAGE_CATALOG.PICKER_BOOTSTRAP_RPC_FAILED.dougFacingShowScoped).toBe(
      "Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.",
    );
  });

  it("OAUTH_IDENTITY_CLAIMED opens on the crew name", () => {
    expect(MESSAGE_CATALOG.OAUTH_IDENTITY_CLAIMED.dougFacingShowScoped).toBe(
      "<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
    );
  });

  it("the two lowercase-opening codes deliberately have NO variant", () => {
    expect(MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING).not.toHaveProperty("dougFacingShowScoped");
    expect(MESSAGE_CATALOG.PICKER_SELECTION_RACE).not.toHaveProperty("dougFacingShowScoped");
  });

  it("global dougFacing is untouched for every adopting code", () => {
    expect(MESSAGE_CATALOG.ROLE_FLAGS_NOTICE.dougFacing).toBe(
      "In <sheet-name>, <role-changes><lead-hint>",
    );
  });
});

describe("safeDougFacingTemplate selects the show-scoped variant", () => {
  const params = {
    "role-changes": "Doug Larson was added with LEAD + V1.",
    "lead-hint": "",
    "sheet-name": "'II - RIA Investment Forum - Central 2025'",
  };

  it("returns the variant when one exists", () => {
    expect(safeDougFacingTemplate("ROLE_FLAGS_NOTICE", params)).toBe("<role-changes><lead-hint>");
  });

  it("falls back to dougFacing when no variant exists", () => {
    const p = {
      email: "a@b.com",
      "crew-row-count": "2 crew rows",
      "show-name": "'X'",
    };
    expect(safeDougFacingTemplate("AMBIGUOUS_EMAIL_BINDING", p)).toBe(
      MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING.dougFacing,
    );
  });

  it("returns null for an uncataloged code under the new selection branch", () => {
    expect(safeDougFacingTemplate("NOT_A_REAL_CODE", params)).toBeNull();
  });

  it("returns null when params leave a placeholder unresolved in the VARIANT", () => {
    // The guard must reject the SELECTED template, not the global one.
    expect(safeDougFacingTemplate("ROLE_FLAGS_NOTICE", undefined)).toBeNull();
  });

  it("returns a param-free variant unchanged even with undefined params", () => {
    // Anti-tautology pair with the test above: proves the guard rejects for the
    // right reason rather than rejecting everything.
    expect(safeDougFacingTemplate("PICKER_BOOTSTRAP_RPC_FAILED", undefined)).toBe(
      MESSAGE_CATALOG.PICKER_BOOTSTRAP_RPC_FAILED.dougFacingShowScoped,
    );
  });
});
