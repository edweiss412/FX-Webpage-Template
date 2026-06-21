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

  test("PIN (name-only contract): matching is by error NAME only — reworded messages with name AuthSessionMissingError still match", () => {
    // Owner decision (2026-06-12, supersedes the earlier literal-message
    // fragility pin): the helper matches `err.name === "AuthSessionMissingError"`
    // and NOTHING else. This mirrors the SDK's own type guard
    // (@supabase/auth-js src/lib/errors.ts:140-142, `isAuthError(error) &&
    // error.name === 'AuthSessionMissingError'`) and the name set by
    // CustomAuthError's constructor (errors.ts:113-121). A future SDK release
    // rewording the message (punctuation, casing, phrasing) cannot break the
    // signed-out redirect as long as the class name survives.
    expect(
      isAuthSessionMissingError({
        name: "AuthSessionMissingError",
        message: "Auth session missing.",
        status: 400,
      }),
    ).toBe(true);
    expect(
      isAuthSessionMissingError({
        name: "AuthSessionMissingError",
        message: "auth session missing!",
        status: 400,
      }),
    ).toBe(true);
    expect(
      isAuthSessionMissingError({
        name: "AuthSessionMissingError",
        message: "No auth session found",
        status: 400,
      }),
    ).toBe(true);
    expect(
      isAuthSessionMissingError({
        name: "AuthSessionMissingError",
        message: "session could not be found",
        status: 400,
      }),
    ).toBe(true);
  });

  test("PIN: the literal message WITHOUT the name does NOT match — the message arm is deleted", () => {
    // All production call sites receive the error in-process from
    // supabase.auth.getUser() (lib/auth/requireAdmin.ts:176,
    // lib/auth/isAdminSession.ts:31, lib/auth/validateGoogleSession.ts:94,
    // lib/auth/validateGoogleIdentity.ts:45, app/auth/sign-in/page.tsx:124) —
    // real AuthSessionMissingError instances always carry the name; no caller
    // crosses a serialization boundary that would strip the class name. A
    // generic Error carrying the old literal message is therefore NOT a
    // session-missing signal.
    expect(
      isAuthSessionMissingError({
        name: "Error",
        message: "Auth session missing!",
        status: 400,
      }),
    ).toBe(false);
    expect(isAuthSessionMissingError(new Error("Auth session missing!"))).toBe(false);
  });
});
