/**
 * tests/scripts/_cli-helpers.ts — Codex Phase 0.C R25-F1.
 *
 * Spawn a validation CLI with a hermetic tmpdir cwd + a test-controlled
 * .env.local containing the supplied VALIDATION_* values. Replaces the
 * pre-R25 VALIDATION_ENV_SKIP_LOCAL_FILE escape hatch — that env-flag
 * gate was bypassable via env injection. Tests now use the same code
 * path production does (loadValidationEnv reads <cwd>/.env.local) but
 * with a tmpdir cwd that contains test fixtures.
 *
 * tsx is invoked with --tsconfig pointing at the repo's tsconfig.json
 * so `@/*` path aliases still resolve from the tmpdir cwd.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const TSCONFIG_PATH = join(REPO_ROOT, "tsconfig.json");

export type CliRun = { code: number; stdout: string; stderr: string };

export type CliRunOptions = {
  /** Absolute path to the validation script (scripts/validation-*.ts). */
  scriptPath: string;
  /** Extra CLI args after the script name. */
  args?: string[];
  /** VALIDATION_* values to seed via a test-controlled .env.local. */
  envLocalValues?: Record<string, string>;
};

export function runValidationCli(opts: CliRunOptions): CliRun {
  const hermeticCwd = mkdtempSync(join(tmpdir(), "validation-cli-test-"));
  // Write the test-controlled .env.local with VALIDATION_* values. The
  // script's loadValidationEnv() reads <cwd>/.env.local — placing it
  // here means the test supplies exactly the values the script sees.
  if (opts.envLocalValues) {
    const lines = Object.entries(opts.envLocalValues)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    writeFileSync(join(hermeticCwd, ".env.local"), lines + "\n");
  }
  try {
    const stdout = execFileSync(
      "npx",
      ["tsx", "--tsconfig", TSCONFIG_PATH, opts.scriptPath, ...(opts.args ?? [])],
      {
        encoding: "utf-8",
        cwd: hermeticCwd,
        env: process.env,
        // CAPTURE stderr (don't inherit). execFileSync's default outputs the
        // child's stderr to the PARENT's stderr, so the many NEGATIVE tests here
        // (which deliberately drive the CLI to print `[validation-check-seed] FAIL
        // predicate (X)` and exit 1) leaked those EXPECTED-failure lines into the
        // CI log of GREEN runs — reading like real failures and sending debuggers
        // (incl. this one) down a false trail. Piping keeps the assertions working
        // (the catch reads `e.stderr`) while the lines stay out of the CI log; a
        // genuinely-unexpected stderr still surfaces via the failing assertion diff.
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as {
      status?: number;
      stdout?: Buffer;
      stderr?: Buffer;
    };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  } finally {
    rmSync(hermeticCwd, { recursive: true, force: true });
  }
}
