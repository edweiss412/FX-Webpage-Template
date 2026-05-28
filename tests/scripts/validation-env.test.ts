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
  // prints whichever VALIDATION_TEST_URL it sees. Strip the var from
  // the inherited env to keep the test hermetic — the parent shell (vitest)
  // may have unrelated VALIDATION_* values that would pollute the result.
  const childEnv = { ...process.env, NODE_ENV: "development" } as Record<
    string,
    string | undefined
  >;
  delete childEnv.VALIDATION_TEST_URL;
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
    { cwd: probeCwd, encoding: "utf8", env: childEnv as NodeJS.ProcessEnv },
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

  test("R11-F1 — .env (no `.local`) does NOT seed VALIDATION_* (only .env.local is read)", () => {
    // Narrow-loader contract: only .env.local is read. Other files are
    // intentionally ignored to eliminate the wrong-database class.
    writeEnv(".env", "VALIDATION_TEST_URL=from-env-base\n");
    const result = runProbeIn(cwd);
    expect(result).toBe("<unset>");
  });

  test(".env.local wins over .env when both are present (and .env is ignored)", () => {
    writeEnv(".env", "VALIDATION_TEST_URL=from-env-base\n");
    writeEnv(".env.local", "VALIDATION_TEST_URL=from-env-local\n");
    const result = runProbeIn(cwd);
    expect(result).toBe("from-env-local");
  });

  test("R11-F1 — .env.production.local must NOT override .env.local for VALIDATION_*", () => {
    writeEnv(".env.local", "VALIDATION_TEST_URL=from-env-local\n");
    writeEnv(
      ".env.production.local",
      "VALIDATION_TEST_URL=from-env-production-local\n",
    );
    const result = runProbeIn(cwd);
    expect(
      result,
      ".env.local must be canonical; .env.production.local must NOT override " +
        "it. Pre-R11 the loader used @next/env loadEnvConfig(false) which puts " +
        ".env.production.local FIRST in precedence — a coherent wrong-target " +
        "config there would mutate the wrong DB with the service-role key.",
    ).toBe("from-env-local");
  });

  test("R11-F1 — .env.production must NOT override .env.local", () => {
    writeEnv(".env.local", "VALIDATION_TEST_URL=from-env-local\n");
    writeEnv(".env.production", "VALIDATION_TEST_URL=from-env-production\n");
    const result = runProbeIn(cwd);
    expect(result).toBe("from-env-local");
  });

  test("R11-F1 structural defense — every other env-file source loses to .env.local", () => {
    // Parameterized assertion: the SET of files @next/env would honor in
    // any mode (.env.development.local, .env.development, .env.production.local,
    // .env.production, .env) — ALL must lose to .env.local for the
    // R11-F1 invariant to hold.
    const conflicting = [
      ".env.development.local",
      ".env.development",
      ".env.production.local",
      ".env.production",
      ".env",
    ];
    writeEnv(".env.local", "VALIDATION_TEST_URL=from-env-local\n");
    for (const file of conflicting) {
      writeEnv(file, `VALIDATION_TEST_URL=overridden-by-${file}\n`);
    }
    const result = runProbeIn(cwd);
    expect(
      result,
      "Validation env loader must read ONLY .env.local — every other dotenv " +
        "source overriding it is a wrong-database risk for destructive " +
        "service-role tooling.",
    ).toBe("from-env-local");
  });

  test("R16-F1 (CRITICAL) — .env.local OVERRIDES inherited process.env for VALIDATION_* keys", () => {
    // Pre-R16 the loader respected pre-existing process.env (parent-
    // shell wins). For destructive VALIDATION_* keys, that was a
    // wrong-database escape hatch: a developer shell, direnv, CI env,
    // or prior dotenv export setting VALIDATION_SUPABASE_URL would
    // override .env.local and pass the URL/ref binding guard (both
    // values consistent with each other, just for the WRONG target).
    //
    // R16-F1: VALIDATION_* keys ALWAYS take their value from .env.local
    // when the file exists. Inherited process.env loses.
    writeEnv(".env.local", "VALIDATION_TEST_URL=from-env-local\n");
    const result = execFileSync(
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
      {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          VALIDATION_TEST_URL: "from-parent-shell-WRONG_TARGET",
        },
      },
    );
    expect(
      result,
      "VALIDATION_* keys must come from .env.local — inherited process.env " +
        "is not trusted for destructive prod-equivalent tooling. R16-F1 " +
        "closes the wrong-database escape hatch.",
    ).toBe("from-env-local");
  });

  test("R16-F1 — non-VALIDATION_* keys still respect inherited process.env (no security concern)", () => {
    // Only VALIDATION_* keys get the override-from-.env.local treatment.
    // Other keys retain the conventional inherited-wins behavior.
    writeEnv(".env.local", "UNRELATED_KEY=from-env-local\n");
    const result = execFileSync(
      "npx",
      [
        "tsx",
        "-e",
        `
          import { loadValidationEnv } from "${VALIDATION_ENV_TS}";
          loadValidationEnv();
          process.stdout.write(process.env.UNRELATED_KEY ?? "<unset>");
        `,
      ],
      {
        cwd,
        encoding: "utf8",
        env: { ...process.env, UNRELATED_KEY: "from-parent-shell" },
      },
    );
    expect(result).toBe("from-parent-shell");
  });

  // R22-F1 escape-hatch test deleted per R25-F1 — the
  // VALIDATION_ENV_SKIP_LOCAL_FILE mechanism was removed entirely
  // because env-injection could bypass any env-flag gate. Tests now
  // use tests/scripts/_cli-helpers.ts which spawns child CLIs in
  // a tmpdir cwd with a test-controlled .env.local; same production
  // code path, no escape hatch.

  test("R16-F1 — CI scenario (no .env.local present) still honors inherited VALIDATION_* keys", () => {
    // GitHub Actions workflow exports VALIDATION_SUPABASE_URL via secret;
    // there's no .env.local in CI. The loader becomes a no-op and the
    // inherited values flow through unchanged. This is the intended
    // production path.
    const result = execFileSync(
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
      {
        cwd,
        encoding: "utf8",
        env: { ...process.env, VALIDATION_TEST_URL: "from-ci-secret" },
      },
    );
    expect(result).toBe("from-ci-secret");
  });
});
