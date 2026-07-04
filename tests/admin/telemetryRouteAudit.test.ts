import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTECTED_ROUTES } from "@/lib/audit/trustDomains";

describe("telemetry route is auth-chain registered", () => {
  test("PROTECTED_ROUTES has the page with requireDeveloper chain", () => {
    // developer-tier §6 row 5: Telemetry swapped requireAdmin → requireDeveloper.
    const row = PROTECTED_ROUTES.find((r) => r.path === "app/admin/dev/telemetry/page.tsx");
    expect(row).toBeTruthy();
    expect(row!.chain).toContain("requireDeveloper");
  });
  test("settings page links to /admin/dev/telemetry (the ONLY mobile route into desktopOnly Telemetry)", () => {
    // Telemetry is desktopOnly (absent from mobile bottom tabs), so the Settings link is the
    // mobile reachability path — guard against it being omitted or mislinked.
    const src = readFileSync(join(__dirname, "..", "..", "app/admin/settings/page.tsx"), "utf8");
    expect(src).toContain("/admin/dev/telemetry");
    expect(src).toMatch(/Telemetry/);
  });
  test("dev layout harness is BOTH build-gated (with-admin-dev-flag FILES) AND auth-chain registered", () => {
    // The harness must be renamed-aside at build time when ADMIN_DEV_PANEL_ENABLED!=='true' (so it
    // never ships to prod) AND carry the requireDeveloper chain (developer-tier §6: /admin/dev
    // surfaces swapped requireAdmin → requireDeveloper) — regressing either is a leak.
    const harness = "app/admin/dev/telemetry-dim/page.tsx";
    const gate = readFileSync(
      join(__dirname, "..", "..", "scripts/with-admin-dev-flag.mjs"),
      "utf8",
    );
    expect(gate).toContain(harness);
    const row = PROTECTED_ROUTES.find((r) => r.path === harness);
    expect(row).toBeTruthy();
    expect(row!.chain).toContain("requireDeveloper");
  });
});
