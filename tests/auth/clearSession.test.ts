/**
 * tests/auth/clearSession.test.ts (M5 paragraph-B Task 5.7 follow-up)
 *
 * Unit tests for the LOCAL `next` validator that lives in
 * `app/auth/clear-session/route.ts`. The clear-session route uses its own
 * narrower allowlist instead of `lib/auth/validateNextParam` because that
 * helper is the OAuth-callback contract (paragraph-A territory) - its
 * allowlist deliberately excludes `/auth/sign-in`, but the paragraph-B
 * chain commonly redirects through clear-session on its way to sign-in.
 *
 * The local validator is permitted to grow the allowlist with `/auth/sign-in`
 * because there are no external consumers of /auth/clear-session - only the
 * paragraph-B chain in `app/show/[slug]/page.tsx` calls it. The route file
 * owns its own contract.
 *
 * Coverage:
 *   - Accepts /show/<slug>, /show/<slug>?...
 *   - Accepts /auth/sign-in, /auth/sign-in?...
 *   - Accepts /me, /me?..., /me/profile, /me/profile?...
 *   - Accepts /admin, /admin?..., /admin/sub, /admin/sub?...
 *   - Rejects external origins -> failsafe '/'
 *   - Rejects /auth/callback (OAuth callback - not a clear-session target)
 *   - Rejects /show/<slug>/p (bootstrap surface - not a clear-session target)
 *   - Rejects %2e%2e traversal
 *   - Rejects backslash injection
 *   - Rejects control chars (NUL, 0x1f, 0x7f) injected via String.fromCharCode
 *   - Rejects missing / empty input -> failsafe '/'
 *   - Failsafe path is '/' (NOT '/admin' - different from validateNextParam)
 */
import { describe, expect, test } from "vitest";

import {
  CLEAR_SESSION_FAILSAFE_PATH,
  validateClearSessionNext,
} from "@/app/auth/clear-session/route";

const ORIGIN = "https://crew.fxav.test";
const NUL = String.fromCharCode(0);
const UNIT_SEP = String.fromCharCode(0x1f);
const DEL = String.fromCharCode(0x7f);

describe("validateClearSessionNext (clear-session local allowlist)", () => {
  describe("accepts allowed paths", () => {
    test.each([
      ["/show/rpas-central", "/show/rpas-central", ""],
      ["/show/rpas-central?as=admin", "/show/rpas-central", "?as=admin"],
      ["/auth/sign-in", "/auth/sign-in", ""],
      [
        "/auth/sign-in?next=/show/rpas-central",
        "/auth/sign-in",
        "?next=/show/rpas-central",
      ],
      ["/me", "/me", ""],
      ["/me?tab=info", "/me", "?tab=info"],
      ["/me/profile", "/me/profile", ""],
      ["/admin", "/admin", ""],
      ["/admin?foo=bar", "/admin", "?foo=bar"],
      ["/admin/show/foo", "/admin/show/foo", ""],
      ["/admin/show/foo?x=y", "/admin/show/foo", "?x=y"],
    ])("accepts %s", (raw, expectedPath, expectedSearch) => {
      const outcome = validateClearSessionNext(raw, ORIGIN);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.pathname).toBe(expectedPath);
        expect(outcome.search).toBe(expectedSearch);
      }
    });

    test("accepts an absolute URL on the same origin", () => {
      const outcome = validateClearSessionNext(
        `${ORIGIN}/show/foo?as=admin`,
        ORIGIN,
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.pathname).toBe("/show/foo");
        expect(outcome.search).toBe("?as=admin");
      }
    });
  });

  describe("rejects to failsafe '/'", () => {
    const cases: Array<[string | null, string]> = [
      // Missing / empty
      [null, "null"],
      ["", "empty"],
      ["   ", "whitespace-only"],
      // External origin
      ["https://attacker.example/steal", "external https"],
      ["//attacker.example/x", "protocol-relative external"],
      // Not in allowlist
      ["/auth/callback", "auth/callback (OAuth callback, not clear target)"],
      ["/auth/sign-out", "auth/sign-out (sign-out endpoint)"],
      ["/show/foo/p", "bootstrap surface /show/<slug>/p"],
      ["/random", "random unknown route"],
      ["/api/auth/redeem-link", "API route"],
      // Traversal vectors. Note: a literal `..` such as
      // `/show/x/../../auth/sign-in` collapses via WHATWG URL parsing to
      // `/auth/sign-in` which IS an allowed clear-session target — so a
      // path-traversal attempt that happens to land in the allowlist is
      // not a vulnerability, just a no-op. We assert the encoded `%2e%2e`
      // form (which the validator's pre-check rejects) and the backslash
      // form (same defense as validateNextParam).
      ["/show/x%2e%2e/p", "%2e%2e encoded traversal"],
      ["/show/x%2E%2E/p", "%2E%2E (uppercase) encoded traversal"],
      [String.raw`/admin\..\..\foo`, "backslash injection"],
      // Control chars - injected via String.fromCharCode so the source file
      // stays printable ASCII.
      [`/me/${NUL}profile`, "NUL control char"],
      [`/me/${UNIT_SEP}profile`, "0x1f unit-separator control char"],
      [`/me/${DEL}profile`, "0x7f DEL control char"],
    ];

    test.each(cases)("rejects (case: %s)", (raw, _label) => {
      const outcome = validateClearSessionNext(raw, ORIGIN);
      expect(outcome.ok).toBe(false);
      expect(outcome.pathname).toBe(CLEAR_SESSION_FAILSAFE_PATH);
      expect(outcome.search).toBe("");
    });
  });

  test("failsafe is '/' (NOT validateNextParam's '/admin' default)", () => {
    expect(CLEAR_SESSION_FAILSAFE_PATH).toBe("/");
    const outcome = validateClearSessionNext(null, ORIGIN);
    expect(outcome.ok).toBe(false);
    expect(outcome.pathname).toBe("/");
  });
});
