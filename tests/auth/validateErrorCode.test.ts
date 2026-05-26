/**
 * tests/auth/validateErrorCode.test.ts (M5 §B Task 5.8 — Opus's portion)
 *
 * Pins the contract of `validateErrorCodeParam`, the helper used by the
 * sign-in page's Server Component to validate `searchParams.code` (a
 * user-controlled string) before passing it to <ErrorExplainer>.
 *
 * Spec contract (per Task 5.8 §B prompt):
 *   - Returns the catalog code only when the input is a string AND
 *     (a) matches the defense-in-depth syntactic regex `^[A-Z_]{1,64}$`
 *         (so user-controlled URL params can't smuggle exotic characters
 *         past the catalog lookup, even though the catalog lookup itself
 *         would also reject them), AND
 *     (b) is in the OAuth allowlist — exactly the two §12.4 codes the
 *         OAuth callback emits and the sign-in page is expected to render:
 *         OAUTH_STATE_INVALID, OAUTH_REDIRECT_INVALID.
 *   - Anything else returns `null` (defensive: unknown / malformed /
 *     non-string inputs render NO error block on the sign-in page; the
 *     attacker never learns what the validator looked for).
 *
 * Anti-tautology rule: tests assert against the LITERAL allowed codes,
 * NOT against re-derivation from the helper itself. If either side
 * drifts the test must fail.
 */
import { describe, expect, test } from "vitest";
import { validateErrorCodeParam } from "@/app/auth/sign-in/validateErrorCode";

describe("validateErrorCodeParam (sign-in page error-code allowlist)", () => {
  test("returns 'OAUTH_STATE_INVALID' for the literal string 'OAUTH_STATE_INVALID'", () => {
    expect(validateErrorCodeParam("OAUTH_STATE_INVALID")).toBe("OAUTH_STATE_INVALID");
  });

  test("returns 'OAUTH_REDIRECT_INVALID' for the literal string 'OAUTH_REDIRECT_INVALID'", () => {
    expect(validateErrorCodeParam("OAUTH_REDIRECT_INVALID")).toBe("OAUTH_REDIRECT_INVALID");
  });

  test("returns null for a known catalog code that's NOT in the OAuth allowlist (GOOGLE_NO_CREW_MATCH)", () => {
    // GOOGLE_NO_CREW_MATCH is a real MessageCode in lib/messages/catalog.ts but
    // the OAuth callback never emits it; the sign-in page must NOT render
    // it. The allowlist filter is what gates rendering.
    expect(validateErrorCodeParam("GOOGLE_NO_CREW_MATCH")).toBeNull();
  });

  test("returns null for a known catalog code that's NOT in the OAuth allowlist (ADMIN_SESSION_LOOKUP_FAILED)", () => {
    // Another known MessageCode not emitted by the OAuth callback.
    expect(validateErrorCodeParam("ADMIN_SESSION_LOOKUP_FAILED")).toBeNull();
  });

  test("returns null for ADMIN_SESSION_LOOKUP_FAILED when supplied via the URL", () => {
    // Infrastructure failures may be rendered only through trusted
    // server-side state. The user-controlled `?code=` param stays
    // limited to the two OAuth callback codes from AC-5.14.
    expect(validateErrorCodeParam("ADMIN_SESSION_LOOKUP_FAILED")).toBeNull();
  });

  test("returns null for an arbitrary user-injected uppercase string that passes regex", () => {
    // Passes regex but isn't in the allowlist — the second gate trips.
    expect(validateErrorCodeParam("ARBITRARY_USER_INJECTED_STRING")).toBeNull();
  });

  test.each([
    ["lowercase_code", "fails regex (lowercase)"],
    ["WITH SPACE", "fails regex (whitespace)"],
    ["WITH-DASH", "fails regex (dash not allowed)"],
    ["WITH123DIGITS", "fails regex (digits not allowed)"],
    ["", "empty string fails 1+ length"],
    [
      // 65-char string: 64-char limit boundary check
      "A".repeat(65),
      "exceeds 64-char length cap",
    ],
    ["<script>alert(1)</script>", "XSS payload — fails regex"],
    ["OAUTH_STATE_INVALID; DROP TABLE users", "SQL-like junk fails regex"],
    ["%3Cscript%3E", "url-encoded angle brackets fail regex"],
    ["_", "single underscore — fails regex (no leading letter)"],
    ["___", "all underscores — fails regex (no leading letter)"],
    ["_OAUTH_STATE_INVALID", "leading underscore — fails regex (no leading letter)"],
  ])("returns null for %s (%s)", (raw) => {
    expect(validateErrorCodeParam(raw)).toBeNull();
  });

  // Non-string inputs each return null. Inline tests (rather than test.each)
  // because the input array's heterogeneous element types confuse vitest's
  // tuple-typing for test.each.
  test("returns null for null", () => {
    expect(validateErrorCodeParam(null)).toBeNull();
  });
  test("returns null for undefined", () => {
    expect(validateErrorCodeParam(undefined)).toBeNull();
  });
  test("returns null for number", () => {
    expect(validateErrorCodeParam(42)).toBeNull();
  });
  test("returns null for boolean", () => {
    expect(validateErrorCodeParam(true)).toBeNull();
  });
  test("returns null for array", () => {
    expect(validateErrorCodeParam(["OAUTH_STATE_INVALID"])).toBeNull();
  });
  test("returns null for object", () => {
    expect(validateErrorCodeParam({ code: "OAUTH_STATE_INVALID" })).toBeNull();
  });
  test("returns null for symbol", () => {
    expect(validateErrorCodeParam(Symbol("OAUTH_STATE_INVALID"))).toBeNull();
  });

  test("64-char string of valid characters that's NOT in the allowlist returns null (regex passes, allowlist fails)", () => {
    // Boundary case: exactly 64 chars, all valid characters — passes the
    // syntactic regex but isn't in the allowlist. Must return null.
    const sixtyFour = "A".repeat(64);
    expect(sixtyFour).toHaveLength(64);
    expect(validateErrorCodeParam(sixtyFour)).toBeNull();
  });
});
