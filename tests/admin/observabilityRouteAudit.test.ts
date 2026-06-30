import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTECTED_ROUTES } from "@/lib/audit/trustDomains";

describe("observability route is auth-chain registered", () => {
  test("PROTECTED_ROUTES has the page with requireAdmin chain", () => {
    const row = PROTECTED_ROUTES.find((r) => r.path === "app/admin/observability/page.tsx");
    expect(row).toBeTruthy();
    expect(row!.chain).toContain("requireAdmin");
  });
  test("settings page links to /admin/observability (the ONLY mobile route into desktopOnly Activity)", () => {
    // Activity is desktopOnly (absent from mobile bottom tabs), so the Settings link is the
    // mobile reachability path — guard against it being omitted or mislinked.
    const src = readFileSync(join(__dirname, "..", "..", "app/admin/settings/page.tsx"), "utf8");
    expect(src).toContain("/admin/observability");
    expect(src).toMatch(/Activity/);
  });
});
