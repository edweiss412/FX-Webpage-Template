/**
 * tests/scripts/validation-env.test.ts — Codex Phase 0.C R10-F1 regression.
 *
 * Validates that loadValidationEnv() uses PRODUCTION-mode @next/env
 * precedence (.env.development.local is NOT in the precedence chain).
 * A developer with a coherent .env.development.local pointing at a
 * different hosted Supabase project could otherwise have validation:reseed
 * mutate the wrong database via the service-role key.
 *
 * The test creates a temp cwd with conflicting .env.local +
 * .env.development.local entries, then spawns a child node process that
 * imports loadValidationEnv() and prints process.env.VALIDATION_TEST_URL.
 * Asserts the value comes from .env.local (canonical source).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

let cwd: string;
const REPO_ROOT = process.cwd();
const VALIDATION_ENV_TS = join(REPO_ROOT, "scripts/lib/validation-env.ts");

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "validation-env-precedence-"));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeEnv(file: string, contents: string): void {
  writeFileSync(join(cwd, file), contents);
}

function runProbeIn(probeCwd: string): string {
  // Spawn a node child that imports loadValidationEnv from the repo and
  // prints whichever VALIDATION_TEST_URL it sees. tsx runs the TS file
  // directly — no need to compile first.
  return execFileSync(
    "npx",
    [
      "tsx",
      "-e",
      `
        import { loadValidationEnv } from "${VALIDATION_ENV_TS}";
        loadValidationEnv();
        process.stdout.write(process.env.VALIDATION_TEST_URL ?? "<unset>");
      `,
    ],
    { cwd: probeCwd, encoding: "utf8", env: { ...process.env, NODE_ENV: "development" } },
  );
}

describe("loadValidationEnv() precedence (R10-F1)", () => {
  test(".env.local wins over .env.development.local for VALIDATION_* vars", () => {
    writeEnv(".env.local", "VALIDATION_TEST_URL=from-env-local\n");
    writeEnv(
      ".env.development.local",
      "VALIDATION_TEST_URL=from-env-development-local\n",
    );

    const result = runProbeIn(cwd);
    expect(
      result,
      ".env.local must be canonical; .env.development.local must NOT override it. " +
        "Production-mode loadEnvConfig precedence is the load-bearing safety property.",
    ).toBe("from-env-local");
  });

  test("falls back to .env when neither .local file is present", () => {
    writeEnv(".env", "VALIDATION_TEST_URL=from-env-base\n");
    const result = runProbeIn(cwd);
    expect(result).toBe("from-env-base");
  });

  test(".env.local wins over .env when both are present", () => {
    writeEnv(".env", "VALIDATION_TEST_URL=from-env-base\n");
    writeEnv(".env.local", "VALIDATION_TEST_URL=from-env-local\n");
    const result = runProbeIn(cwd);
    expect(result).toBe("from-env-local");
  });
});
