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
});
