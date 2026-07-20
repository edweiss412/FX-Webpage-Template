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
import { readFileSync } from "node:fs";
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

/**
 * Extract the argument text of the first `deriveAlertMessageParams(...)` call
 * by walking to its matching close paren. A regex cannot do this: the call in
 * bellFeed.ts is multi-line, contains a nested `get(...)`, and sits inside an
 * object literal so it ends with ")," rather than ");".
 */
function callArgs(src: string): string | null {
  const needle = "deriveAlertMessageParams(";
  const start = src.indexOf(needle);
  if (start < 0) return null;
  let i = start + needle.length;
  let depth = 1;
  let inString: string | null = null;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i]!;
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inString = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  return depth === 0 ? src.slice(start + needle.length, i - 1) : null;
}

describe("production callers pass the correct scope", () => {
  // The three callers are a closed set (spec §2), so pin each one's literal.
  // Unit tests exercise deriveAlertMessageParams directly, so without this a
  // caller could pass the wrong scope and every other gate would still pass:
  // typecheck proves an argument EXISTS, not that it is the right one.
  it.each([
    ["lib/adminAlerts/fetchPerShowAlerts.ts", '"show"'],
    ["lib/admin/bellFeed.ts", '"global"'],
    ["components/admin/telemetry/HealthAlertsPanel.tsx", '"global"'],
  ])("%s passes %s", (file, scope) => {
    const args = callArgs(readFileSync(file, "utf8"));
    expect(args, `${file} no longer calls deriveAlertMessageParams`).not.toBeNull();
    // The scope must be the FINAL argument, not merely present somewhere in the
    // argument text: a comment or an earlier argument could otherwise satisfy it.
    const parts = args!
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(parts[parts.length - 1], `${file} passes the wrong scope`).toBe(scope);
  });
});
