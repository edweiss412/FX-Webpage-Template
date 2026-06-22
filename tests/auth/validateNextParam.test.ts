import { beforeEach, describe, expect, test } from "vitest";

import { validateNextParam, validateNextParamDetailed } from "@/lib/auth/validateNextParam";

describe("validateNextParam", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
  });

  test.each([
    [
      "/show/rpas-central/a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345",
      "/show/rpas-central/a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345",
    ],
    // M9 final-review R15: /admin is back to a real route
    // (app/admin/page.tsx added in R15). Sub-paths under /admin
    // also valid. /admin/dev added too (still a real route in dev
    // builds; gated out of prod but the regex doesn't care).
    ["/admin", "/admin"],
    ["/admin/dev", "/admin/dev"],
    ["/admin/settings/admins", "/admin/settings/admins"],
    ["/admin/show/foo", "/admin/show/foo"],
    ["/me", "/me"],
    ["/me/profile", "/me/profile"],
    ["https://crew.fxav.test/me/profile", "/me/profile"],
  ])("allows and canonicalizes %s", (raw, expected) => {
    expect(validateNextParam(raw)).toBe(expected);
  });

  test.each([
    null,
    undefined,
    "",
    "   ",
    42,
    "/show/rpas-central",
    "/show/rpas-central/p",
    "/show/rpas-central/abc123",
    "/show/rpas-central/g1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345",
    "/show/rpas-central/A1B2C3D4E5F6789012345678901234567890ABCDEF0123456789ABCDEF012345",
    "//attacker.example/x",
    "https://attacker.example",
    "/auth/sign-in",
    "/show/x/../../auth/sign-in",
    String.raw`/admin\..\..\foo`,
    "/show/x%2e%2e/p",
    "/me/\u0000profile",
  ])("falls back to /admin for invalid input %#", (raw) => {
    // M9 R15: DEFAULT_AUTH_NEXT_PATH restored to "/admin" after
    // R15 created the production-safe landing.
    expect(validateNextParam(raw)).toBe("/admin");
  });

  test("reports detailed success only for tokenized show URLs", () => {
    const path =
      "/show/sample-show/a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";

    expect(validateNextParamDetailed(path)).toEqual({ ok: true, path });
    expect(validateNextParamDetailed("/show/sample-show")).toEqual({
      ok: false,
      path: "/admin",
      code: "OAUTH_REDIRECT_INVALID",
    });
  });
});
