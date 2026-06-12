import { describe, expect, test } from "vitest";

import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";

describe("isAuthSessionMissingError", () => {
  test("recognizes Supabase's no-session error shape", () => {
    expect(
      isAuthSessionMissingError({
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      }),
    ).toBe(true);
  });

  test("does not classify unrelated 400 auth errors as missing session", () => {
    expect(
      isAuthSessionMissingError({
        name: "AuthApiError",
        message: "invalid JWT",
        status: 400,
      }),
    ).toBe(false);
  });

  test("PIN (fragility contract): message match is the LITERAL string 'Auth session missing!' — reworded session-missing errors are NOT recognized by message alone", () => {
    // lib/auth/supabaseAuthError.ts:10 matches `err.message === "Auth session
    // missing!"` exactly. If a future @supabase/supabase-js release rewords
    // the message (punctuation, casing, phrasing) AND drops the
    // AuthSessionMissingError name, this helper returns false and callers
    // treat the unauthenticated case as an infra fault (500) instead of a
    // sign-in redirect / continue. That limitation is intentional-as-shipped
    // and pinned here. Loosening the match (substring/regex/status-based) is
    // an SDK-version-semantics decision needing an owner call — OPEN QUESTION:
    // rely solely on the error NAME, or broaden the message arm? Do NOT
    // change the matcher without that decision.
    expect(
      isAuthSessionMissingError({
        name: "AuthApiError",
        message: "Auth session missing.",
        status: 400,
      }),
    ).toBe(false);
    expect(
      isAuthSessionMissingError({
        name: "AuthApiError",
        message: "auth session missing!",
        status: 400,
      }),
    ).toBe(false);
    expect(
      isAuthSessionMissingError({
        name: "AuthApiError",
        message: "No auth session found",
        status: 400,
      }),
    ).toBe(false);
  });

  test("PIN: the error NAME alone is sufficient — a reworded message with name AuthSessionMissingError still matches", () => {
    // The two checks are OR'd, so the name arm survives SDK message rewording
    // as long as the SDK keeps the class name. This is the existing hedge
    // against the literal-message fragility pinned above.
    expect(
      isAuthSessionMissingError({
        name: "AuthSessionMissingError",
        message: "session could not be found",
        status: 400,
      }),
    ).toBe(true);
  });
});
