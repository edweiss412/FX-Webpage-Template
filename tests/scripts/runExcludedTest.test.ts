/**
 * tests/scripts/runExcludedTest.test.ts
 *
 * Behavioral contract for scripts/run-excluded-test.mjs (spec
 * 2026-07-26-ci-dark-descoped-closeout §6.1): the execution oracle behind the
 * `pnpm run-excluded <file>` registry literal. Vitest's bare exit code proves
 * COLLECTION, not execution — `passWithNoTests` and an all-skipped file both
 * exit 0 — so the script requires BOTH child exit 0 AND a JSON report with
 * `numPassedTests >= 1 && numFailedTests === 0` (field names verified against
 * real vitest 4 output: `--reporter=json` emits them top-level), exiting
 * non-zero otherwise. Same guard-tests-the-real-control posture as the §4.1
 * baseline-script pin: a no-op script would satisfy the workflow's step
 * literal while destroying the proof, so the thing pinned HERE is rejection
 * behavior.
 *
 * Test seam: RUN_EXCLUDED_CMD_OVERRIDE (JSON `{cmd, args}`) replaces the
 * spawned vitest command; the stub still receives `--outputFile=<tmpfile>` as
 * its final argument and must write the canned report there. The seam is
 * REFUSED under GITHUB_ACTIONS so CI always runs real vitest (adversarial
 * R2 F4 / R3 F5).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "run-excluded-test.mjs");

/** Run the script; return its exit code (the A1 `run()` pattern). */
function run(env: Record<string, string>): number {
  const cleaned = { ...process.env };
  delete cleaned.GITHUB_ACTIONS;
  try {
    execFileSync("node", [SCRIPT, "tests/whatever.test.ts"], {
      cwd: ROOT,
      stdio: "pipe",
      env: { ...cleaned, ...env },
    });
    return 0;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return typeof status === "number" ? status : -1;
  }
}

/**
 * Build a stub child in a temp dir: writes `report` (or raw bytes, or nothing)
 * to the path carried by its LAST argv entry (`--outputFile=<path>`), then
 * exits with `exitCode`. Returns the RUN_EXCLUDED_CMD_OVERRIDE value.
 */
function stub(opts: { report?: unknown; rawBytes?: string; exitCode: number }): string {
  const dir = mkdtempSync(join(tmpdir(), "run-excluded-stub-"));
  const payload = join(dir, "payload.json");
  if (opts.report !== undefined) writeFileSync(payload, JSON.stringify(opts.report));
  if (opts.rawBytes !== undefined) writeFileSync(payload, opts.rawBytes);
  const body = [
    `const { copyFileSync } = require("node:fs");`,
    `const out = process.argv[process.argv.length - 1].replace(/^--outputFile=/, "");`,
    opts.report !== undefined || opts.rawBytes !== undefined
      ? `copyFileSync(${JSON.stringify(payload)}, out);`
      : `// deliberately writes no report`,
    `process.exit(${opts.exitCode});`,
  ].join("\n");
  const stubPath = join(dir, "stub.cjs");
  writeFileSync(stubPath, body);
  return JSON.stringify({ cmd: "node", args: [stubPath] });
}

// Reports carry per-file attribution (R1-B F1): vitest positionals are
// SUBSTRING filters (cli-api filterFiles, case-insensitive), so aggregate
// counts alone cannot prove the NAMED file supplied the passing tests — a
// sibling matching the filter (a JSX-flavored extension twin, a case-only
// variant, a longer containing pathname) could pass while the registered
// file skips. The oracle requires >=1 passed assertion in a testResults
// entry whose name IS the named file (exact, or suffix at a / boundary).
const forFile = (file: string, passed: number, failed = 0) => ({
  name: join(ROOT, file),
  assertionResults: [
    ...Array.from({ length: passed }, () => ({ status: "passed" })),
    ...Array.from({ length: failed }, () => ({ status: "failed" })),
  ],
});
const NAMED = "tests/whatever.test.ts";
const passing = {
  numPassedTests: 3,
  numFailedTests: 0,
  numPendingTests: 0,
  testResults: [forFile(NAMED, 3)],
};

describe("run-excluded-test execution oracle (spec §6.1)", () => {
  it("exit 0 IFF child exit 0 AND >=1 passed AND 0 failed", () => {
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: passing, exitCode: 0 }) })).toBe(0);
  });

  it("rejects a zero-passed report (collection is not execution)", () => {
    const r = { numPassedTests: 0, numFailedTests: 0, numPendingTests: 0 };
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: r, exitCode: 0 }) })).not.toBe(0);
  });

  it("rejects an all-skipped report (skipIf can zero a file while it collects green)", () => {
    const r = { numPassedTests: 0, numFailedTests: 0, numPendingTests: 4 };
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: r, exitCode: 0 }) })).not.toBe(0);
  });

  it("rejects a failing report", () => {
    const r = { numPassedTests: 2, numFailedTests: 2, numPendingTests: 0 };
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: r, exitCode: 1 }) })).not.toBe(0);
  });

  it("rejects a child that writes NO report file", () => {
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ exitCode: 0 }) })).not.toBe(0);
  });

  it("rejects a malformed report", () => {
    expect(
      run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ rawBytes: "not json {", exitCode: 0 }) }),
    ).not.toBe(0);
  });

  it("rejects a passing report whose child exited non-zero (R3 F5: run-level failure with green cases)", () => {
    // Collection, setup, teardown, and unhandled-runtime failures can coexist
    // with passed test cases — BOTH conditions must hold, not either.
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: passing, exitCode: 1 }) })).not.toBe(0);
  });

  it("rejects a failing report even when the child exits 0 (independent third condition)", () => {
    // Without this case, deleting the numFailedTests check leaves every other
    // rejection green via the child-exit condition — the IFF needs each
    // condition pinned alone (R1-B F6).
    const r = {
      numPassedTests: 2,
      numFailedTests: 1,
      numPendingTests: 0,
      testResults: [forFile(NAMED, 2, 1)],
    };
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: r, exitCode: 0 }) })).not.toBe(0);
  });

  it("rejects aggregate passes attributed to a DIFFERENT file than the named one (R1-B F1)", () => {
    // A case-only variant matches vitest's case-insensitive substring filter
    // while being a different file; attribution is case-sensitive and rejects.
    const r = {
      numPassedTests: 3,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [forFile("TESTS/whatever.test.ts", 3)],
    };
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: r, exitCode: 0 }) })).not.toBe(0);
  });

  it("rejects a report with NO testResults attribution at all", () => {
    const r = { numPassedTests: 3, numFailedTests: 0, numPendingTests: 0 };
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: r, exitCode: 0 }) })).not.toBe(0);
  });

  it("rejects a NESTED-suffix impostor path (R2-B F1: suffix matching is not identity)", () => {
    // /repo/tests/shadow/tests/whatever.test.ts ends with /tests/whatever.test.ts
    // yet is a different file vitest's substring filter can collect — only
    // normalized absolute-path equality against cwd + the named file counts.
    const r = {
      numPassedTests: 3,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        { name: `${ROOT}/tests/shadow/${NAMED}`, assertionResults: [{ status: "passed" }] },
      ],
    };
    expect(run({ RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: r, exitCode: 0 }) })).not.toBe(0);
  });

  it("guards the alias against pnpm-level redirection (R2-B F3)", () => {
    // `pnpm run-excluded` executes MORE than scripts["run-excluded"]: pnpm runs
    // pre/post lifecycle scripts by default, and project-level scriptShell /
    // nodeOptions settings replace the shell or preload code. Each route could
    // consume the workflow's exact literal without running the oracle.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      pnpm?: Record<string, unknown>;
    };
    expect(pkg.scripts["prerun-excluded"], "prerun-excluded lifecycle script").toBeUndefined();
    expect(pkg.scripts["postrun-excluded"], "postrun-excluded lifecycle script").toBeUndefined();
    for (const key of ["scriptShell", "nodeOptions", "executionEnv"]) {
      expect(pkg.pnpm?.[key], `package.json pnpm.${key}`).toBeUndefined();
    }
    const npmrcPath = join(ROOT, ".npmrc");
    if (existsSync(npmrcPath)) {
      const npmrc = readFileSync(npmrcPath, "utf8");
      for (const key of ["script-shell", "node-options"]) {
        expect(new RegExp(`^\\s*${key}\\s*=`, "m").test(npmrc), `.npmrc ${key}=`).toBe(false);
      }
    }
  });

  it("REFUSES the override seam under GITHUB_ACTIONS (CI always runs real vitest)", () => {
    expect(
      run({
        RUN_EXCLUDED_CMD_OVERRIDE: stub({ report: passing, exitCode: 0 }),
        GITHUB_ACTIONS: "true",
      }),
    ).not.toBe(0);
  });

  it("alias pin: package.json wires run-excluded to exactly this script", () => {
    // An alias rewired to a no-op would satisfy the workflow's exact-literal
    // step check while running nothing — the mapping is part of the oracle.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["run-excluded"]).toBe("node scripts/run-excluded-test.mjs");
  });
});
