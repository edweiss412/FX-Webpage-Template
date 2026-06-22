/**
 * tests/scripts/extract-spec-codes-cli.test.ts — edge-case coverage.
 *
 * Pins the CLI exit-code contract of scripts/extract-spec-codes.ts
 * (`pnpm gen:spec-codes`, package.json:21).
 *
 * PINNED — NOT the "void main" class: the script's entrypoint is fully
 * SYNCHRONOUS (`if (invokedPath) { generateSpecCodesFile(); }` at
 * scripts/extract-spec-codes.ts:449-452 — no async main(), no top-level
 * await). A throw anywhere in generation propagates as an uncaught
 * exception, so Node/tsx exits non-zero WITHOUT needing the
 * `main().catch((err) => { console.error(err); process.exitCode = 1; })`
 * producer idiom used by the async scripts (scripts/validation-reseed.ts:248,
 * scripts/verify-branch-protection.ts:300-303, etc.). These tests pin that
 * contract at the same spawn seam tests/scripts/_cli-helpers.ts uses, so a
 * future refactor that makes generation async (and accidentally
 * fire-and-forgets it) fails here instead of silently exiting 0 on a
 * broken §12.4 parse.
 *
 * Spawn style mirrors tests/scripts/_cli-helpers.ts (hermetic tmpdir cwd +
 * tsx --tsconfig so `@/*` aliases resolve); a local helper is used instead
 * because this test must seed spec fixture files into the cwd and inspect
 * the generated output after the run — runValidationCli only supports
 * .env.local seeding and deletes its tmpdir before returning.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = process.cwd();
const TSCONFIG_PATH = join(REPO_ROOT, "tsconfig.json");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/extract-spec-codes.ts");
// Mirrors SPEC_PATH / OUTPUT_PATH in scripts/extract-spec-codes.ts:31-32
// (both resolved relative to cwd, which is the hermetic tmpdir here).
const SPEC_RELATIVE_PATH = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";
const OUTPUT_RELATIVE_PATH = "lib/messages/__generated__/spec-codes.ts";

type CliRun = { code: number; stdout: string; stderr: string };

function runExtractSpecCodes(setup?: (cwd: string) => void): {
  run: CliRun;
  readOutput: () => string | null;
  cleanup: () => void;
} {
  const hermeticCwd = mkdtempSync(join(tmpdir(), "extract-spec-codes-cli-test-"));
  setup?.(hermeticCwd);
  let run: CliRun;
  try {
    const stdout = execFileSync("npx", ["tsx", "--tsconfig", TSCONFIG_PATH, SCRIPT_PATH], {
      encoding: "utf-8",
      cwd: hermeticCwd,
      env: process.env,
    });
    run = { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    run = {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
  return {
    run,
    readOutput: () => {
      const outputPath = join(hermeticCwd, OUTPUT_RELATIVE_PATH);
      return existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;
    },
    cleanup: () => rmSync(hermeticCwd, { recursive: true, force: true }),
  };
}

// Minimal-but-valid §12.4 fixture: one active code with a matching
// helpfulContext appendix entry (the extractor enforces dougFacing ↔
// helpfulContext pairing at scripts/extract-spec-codes.ts:358-371).
const MINIMAL_SPEC = `# Fixture spec

### 12.4 User-facing message catalog

| Code | Trigger | Doug-facing | Crew-facing | Follow-up |
| :--- | :--- | :--- | :--- | :--- |
| TEST_FIXTURE_CODE | fixture trigger | Fixture Doug message. | — | Doug → retry |

<!-- §12.4 helpfulContext appendix -->

\`\`\`yaml
TEST_FIXTURE_CODE: "Fixture helpful context."
\`\`\`
`;

describe("scripts/extract-spec-codes.ts CLI exit-code contract", () => {
  test("exits NON-ZERO with the error on stderr when the spec file is missing (pinned: synchronous throw is not swallowed)", () => {
    // Concrete failure mode caught: a refactor to `async function main()`
    // invoked as bare `main();` (the X.6 "void main" class) would swallow
    // the ENOENT rejection and exit 0 — gen:spec-codes would then
    // "succeed" in CI while generating nothing.
    const { run, readOutput, cleanup } = runExtractSpecCodes();
    try {
      expect(run.code).not.toBe(0);
      expect(run.stderr).toMatch(/ENOENT/);
      expect(run.stderr).toContain(SPEC_RELATIVE_PATH);
      expect(readOutput()).toBeNull();
    } finally {
      cleanup();
    }
  }, 60_000);

  test("exits 0 and writes the generated catalog when the spec parses (positive control for the exit-code pin)", () => {
    const { run, readOutput, cleanup } = runExtractSpecCodes((cwd) => {
      const specPath = join(cwd, SPEC_RELATIVE_PATH);
      mkdirSync(dirname(specPath), { recursive: true });
      writeFileSync(specPath, MINIMAL_SPEC);
    });
    try {
      expect(run.stderr).toBe("");
      expect(run.code).toBe(0);
      expect(run.stdout).toContain("Generated");
      const output = readOutput();
      expect(output).not.toBeNull();
      expect(output).toContain('"TEST_FIXTURE_CODE"');
      expect(output).toContain('"Fixture helpful context."');
    } finally {
      cleanup();
    }
  }, 60_000);
});
