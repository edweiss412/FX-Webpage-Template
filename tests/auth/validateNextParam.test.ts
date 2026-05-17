import { beforeEach, describe, expect, test } from "vitest";

import { validateNextParam } from "@/lib/auth/validateNextParam";

describe("validateNextParam", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
  });

  test.each([
    ["/show/rpas-central", "/show/rpas-central"],
    // M9 final-review R14: bare "/admin" no longer accepted (route
    // tree has no app/admin/page.tsx → 404). Sub-paths remain valid.
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
  ])("falls back to /admin/dev for invalid input %#", (raw) => {
    expect(validateNextParam(raw)).toBe("/admin/dev");
  });

  test("M9 R14: bare /admin is rejected (route tree has no app/admin/page.tsx)", () => {
    expect(validateNextParam("/admin")).toBe("/admin/dev");
  });
});
