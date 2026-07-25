import { describe, expect, test } from "vitest";

import { isSupabaseAuthCookieName } from "@/lib/auth/supabaseAuthCookieNames";

describe("isSupabaseAuthCookieName", () => {
  test.each([
    "sb-abc-auth-token",
    "sb-abc-auth-token.0",
    "sb-abc-auth-token.1",
    "sb-abc-auth-token-code-verifier",
    "sb-abc-auth-token-code-verifier.0",
  ])("matches the auth cookie %s", (name) => {
    // A narrowed matcher leaves a session shard behind, so the chunked and
    // code-verifier variants have to match too.
    expect(isSupabaseAuthCookieName(name)).toBe(true);
  });

  test.each([
    "sb-abc-other",
    "__Host-fxav_picker",
    "sb--auth-token",
    "sb-abc-auth-token-extra",
    "",
  ])("rejects %s", (name) => {
    // An over-broad matcher would clear unrelated cookies — including the
    // picker envelope, which the guest sign-out sweep must never touch.
    expect(isSupabaseAuthCookieName(name)).toBe(false);
  });
});
