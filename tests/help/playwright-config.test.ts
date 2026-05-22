import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const configPath = join(process.cwd(), "playwright.config.ts");
const screenshotConfigPath = join(process.cwd(), "playwright.screenshots.config.ts");
const gitignorePath = join(process.cwd(), ".gitignore");
const setupPath = join(process.cwd(), "tests/e2e/screenshots-help-setup.ts");
const helpDocsSetupPath = join(process.cwd(), "tests/e2e/help-docs-setup.ts");

describe("Playwright screenshot-help project config (Task F.4)", () => {
  it("declares screenshots-help setup and capture projects on port 3004", () => {
    const config = readFileSync(configPath, "utf8");

    expect(config).toContain('name: "screenshots-help-setup"');
    expect(config).toContain("testMatch: /screenshots-help-setup\\.ts/");
    expect(config).toContain('name: "screenshots-help"');
    expect(config).toContain('dependencies: ["screenshots-help-setup"]');
    expect(config).toContain("testMatch: /help-screenshots-clock-pipeline\\.spec\\.ts/");
    expect(config).toContain('baseURL: "http://localhost:3004"');
    expect(config).toContain("pnpm exec next start --port 3004");
    expect(config).toContain('NEXT_DIST_DIR: ".next-screenshots-help"');
    expect(config).toContain('url: "http://localhost:3004"');
  });

  it("sets test-auth env for the screenshot webServer", () => {
    const config = readFileSync(configPath, "utf8");

    expect(config).toContain('ENABLE_TEST_AUTH: "true"');
    expect(config).toContain('TEST_AUTH_SECRET: "test-secret-fixture"');
  });

  it("sets a local database URL for the production screenshot webServer", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");

    expect(config).toContain("process.env.TEST_DATABASE_URL ??");
    expect(config).toContain('"postgresql://postgres:postgres@127.0.0.1:54322/postgres"');
  });

  it("allows the screenshot webServer to point Supabase HTTP clients at a container host URL", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");

    expect(config).toContain("process.env.SUPABASE_URL ??");
    expect(config).toContain('"http://127.0.0.1:54321"');
    expect(config).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL ??");
  });

  it("provides local Supabase anon-key defaults for every screenshot server-client alias", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");
    const localAnonKeySegments = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      "eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9",
      "CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    ];

    expect(config).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??");
    expect(config).toContain("process.env.SUPABASE_ANON_KEY ??");
    expect(config).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??");
    for (const segment of localAnonKeySegments) {
      expect(config).toContain(segment);
    }
  });

  it("provides local Supabase service-role defaults for production screenshot server reads", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");
    const localServiceRoleKeySegments = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      "eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0",
      "EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    ];

    expect(config).toContain("process.env.SUPABASE_SECRET_KEY ??");
    expect(config).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY ??");
    for (const segment of localServiceRoleKeySegments) {
      expect(config).toContain(segment);
    }
  });

  it("sets JWT signing env for the screenshot webServer", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");

    expect(config).toContain('JWT_SIGNING_SECRET: "redeem-link-test-secret-32-bytes-min"');
  });

  it("uses the established 300s cold-build timeout for the port-3004 screenshot webServer", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");
    const screenshotServerBlock = config.match(
      /Phase F screenshot\/help-docs server[\s\S]*?url: "http:\/\/localhost:3004",[\s\S]*?timeout: 300_000,/,
    );

    expect(screenshotServerBlock).not.toBeNull();
  });

  it("sets an explicit Node heap for the screenshot build command", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");

    expect(config).toContain("NODE_OPTIONS=--max-old-space-size=8192 pnpm build");
  });

  it("keeps the screenshot-only config scoped to the port-3004 webServer", () => {
    const config = readFileSync(screenshotConfigPath, "utf8");

    expect(config).toContain('url: "http://localhost:3004"');
    expect(config).not.toContain("localhost:3000");
    expect(config).not.toContain("localhost:3001");
    expect(config).not.toContain("localhost:3002");
    expect(config).not.toContain("localhost:3003");
  });

  it("declares the help-docs project for deep-link, auth, and mobile specs", () => {
    const config = readFileSync(configPath, "utf8");

    expect(config).toContain('name: "help-docs"');
    expect(config).toContain("testMatch: /(deep-link-walker|help-auth|help-mobile)\\.spec\\.ts/");
    expect(config).toContain('dependencies: ["help-docs-setup"]');
    expect(config).toContain('baseURL: "http://localhost:3004"');
  });

  it("splits help-docs setup into a wizard-active seed state", () => {
    for (const path of [configPath, screenshotConfigPath]) {
      const config = readFileSync(path, "utf8");

      expect(config).toContain('name: "help-docs-setup"');
      expect(config).toContain("testMatch: /help-docs-setup\\.ts/");
      expect(config).toContain('dependencies: ["help-docs-setup"]');
    }

    expect(existsSync(helpDocsSetupPath)).toBe(true);
    const setupSource = readFileSync(helpDocsSetupPath, "utf8");
    expect(setupSource).toContain('spawnSync("pnpm", ["db:seed"]');
    expect(setupSource).toContain("pending_wizard_session_id");
    expect(setupSource).toContain("watched_folder_id: null");
  });

  it("uses a real setup-project test file, not a default-export globalSetup", () => {
    expect(existsSync(setupPath)).toBe(true);

    const setupSource = readFileSync(setupPath, "utf8");
    expect(setupSource).toContain("test(");
    expect(setupSource).toContain('spawnSync("pnpm", ["db:seed"]');
    expect(setupSource).toContain('expect(process.env.ENABLE_TEST_AUTH).toBe("true")');
    expect(setupSource).toContain(
      'expect(process.env.TEST_AUTH_SECRET).toBe("test-secret-fixture")',
    );
    expect(setupSource).not.toMatch(/export\s+default\s+async\s+function\s+globalSetup/);
  });

  it("keeps the screenshots-help Next dist dir out of git", () => {
    const gitignore = readFileSync(gitignorePath, "utf8");

    expect(gitignore).toContain(".next-screenshots-help/");
  });
});
