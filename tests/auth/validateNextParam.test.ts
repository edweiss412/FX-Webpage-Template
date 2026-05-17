import { beforeEach, describe, expect, test } from "vitest";

import { validateNextParam } from "@/lib/auth/validateNextParam";

describe("validateNextParam", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
  });

  test.each([
    ["/show/rpas-central", "/show/rpas-central"],
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
    "/show/rpas-central/p",
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
});
