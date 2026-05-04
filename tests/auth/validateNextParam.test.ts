import { beforeEach, describe, expect, test } from "vitest";

import { validateNextParam } from "@/lib/auth/validateNextParam";

describe("validateNextParam", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
  });

  test.each([
    ["/show/rpas-central", "/show/rpas-central"],
    ["/admin", "/admin"],
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
    expect(validateNextParam(raw)).toBe("/admin");
  });
});
