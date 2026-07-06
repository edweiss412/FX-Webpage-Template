import { describe, expect, test } from "vitest";
import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";

describe("isAutoResolving", () => {
  test("auto codes true, manual codes false, unknown false (fail-visible)", () => {
    expect(isAutoResolving("EMAIL_NOT_CONFIGURED")).toBe(true);
    expect(isAutoResolving("SYNC_STALLED")).toBe(true);
    expect(isAutoResolving("GITHUB_BOT_LOGIN_MISSING")).toBe(true);
    expect(isAutoResolving("OAUTH_IDENTITY_CLAIMED")).toBe(false); // event → manual
    expect(isAutoResolving("SOMETHING_UNCATALOGED")).toBe(false); // unknown → fail-visible
  });

  test("autoResolveNote returns human copy, never a code, with a generic fallback", () => {
    expect(autoResolveNote("EMAIL_NOT_CONFIGURED")).toMatch(/email/i);
    expect(autoResolveNote("SOMETHING_UNCATALOGED")).toMatch(/clears automatically/i);
    expect(autoResolveNote("EMAIL_NOT_CONFIGURED")).not.toMatch(/EMAIL_NOT_CONFIGURED/);
  });

  test("BRANCH_PROTECTION_* are auto-resolving with specific notes (spec §9 / ARTRUTH-1)", () => {
    expect(isAutoResolving("BRANCH_PROTECTION_DRIFT")).toBe(true);
    expect(isAutoResolving("BRANCH_PROTECTION_MONITOR_AUTH_FAILED")).toBe(true);
    expect(autoResolveNote("BRANCH_PROTECTION_DRIFT")).toMatch(/monitor/i);
    expect(autoResolveNote("BRANCH_PROTECTION_MONITOR_AUTH_FAILED")).toMatch(/authenticat/i);
  });
});
