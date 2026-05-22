import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = join(process.cwd(), "package.json");
const playwrightConfigPath = join(process.cwd(), "playwright.config.ts");
const captureSpecPath = join(process.cwd(), "tests/e2e/screenshots-help-capture.spec.ts");
const workflowPath = join(process.cwd(), ".github/workflows/screenshots-drift.yml");
const seedPath = join(process.cwd(), "supabase/seed.ts");

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("screenshot:help capture project + drift gate (Task F.5)", () => {
  it("routes pnpm screenshot:help through the Playwright capture project with runner auth env", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["screenshot:help"]).toBe(
      "ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture playwright test -c playwright.screenshots.config.ts --project=screenshots-help --project=screenshots-help-capture",
    );
  });

  it("declares screenshots-help-capture as a dependent Playwright project on port 3004", () => {
    const config = readFileSync(playwrightConfigPath, "utf8");

    expect(config).toContain('name: "screenshots-help-capture"');
    expect(config).toContain("testMatch: /screenshots-help-capture\\.spec\\.ts/");
    expect(config).toContain('dependencies: ["screenshots-help-setup"]');
    expect(config).toContain('baseURL: "http://localhost:3004"');
  });

  it("runs captureAll from a real Playwright spec file", () => {
    const spec = readIfExists(captureSpecPath);

    expect(existsSync(captureSpecPath)).toBe(true);
    expect(spec).toContain('import { test } from "@playwright/test"');
    expect(spec).toContain('import { captureAll } from "@/scripts/help-screenshots"');
    expect(spec).toContain("test(");
    expect(spec).toContain("await captureAll()");
    expect(spec).not.toMatch(/export\s+default\s+async\s+function\s+globalSetup/);
  });

  it("adds a screenshots drift workflow that lets Playwright own seeding and server lifecycle", () => {
    const workflow = readIfExists(workflowPath);

    expect(existsSync(workflowPath)).toBe(true);
    expect(workflow).toContain("supabase/setup-cli");
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("mcr.microsoft.com/playwright:v1.59.1-jammy");
    expect(workflow).toContain("docker run --rm --network host");
    expect(workflow).toContain("postgresql-client");
    expect(workflow).toContain("pnpm screenshot:help");
    expect(workflow).toContain("git diff --exit-code public/help/screenshots/");
    expect(workflow).toContain("git ls-files --others --exclude-standard public/help/screenshots/");
    expect(workflow).toContain("cron:");
    expect(workflow).not.toContain("pnpm db:seed");
  });

  it("db:seed settles app_settings into dashboard mode for /admin screenshot capture", () => {
    const seed = readIfExists(seedPath);

    expect(existsSync(seedPath)).toBe(true);
    expect(seed).toMatch(/update\s+public\.app_settings[\s\S]*watched_folder_id\s*=/i);
    expect(seed).toMatch(/update\s+public\.app_settings[\s\S]*pending_wizard_session_id\s*=\s*null/i);
    expect(seed).toMatch(/update\s+public\.app_settings[\s\S]*pending_folder_id\s*=\s*null/i);
  });
});
