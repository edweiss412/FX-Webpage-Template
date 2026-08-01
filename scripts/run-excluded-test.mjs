// scripts/run-excluded-test.mjs
//
// Execution oracle for env-bound excluded test files (spec
// docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md §6.1).
//
//   pnpm run-excluded <test-file>
//
// Runs vitest on exactly that file with a JSON reporter written to a temp
// file (no shell pipes), then exits 0 IFF ALL THREE hold:
//   1. the child vitest process exited 0 (collection/setup/teardown/runtime
//      failures can coexist with green test cases — adversarial R3 F5);
//   2. the report shows numPassedTests >= 1 (a bare exit code proves
//      COLLECTION, not execution: passWithNoTests and an all-skipped file
//      both exit 0);
//   3. the report shows numFailedTests === 0.
// Field names verified against real vitest 4 `--reporter=json` output
// (top-level numPassedTests / numFailedTests / numPendingTests).
//
// Test seam: RUN_EXCLUDED_CMD_OVERRIDE (JSON `{cmd, args}`) replaces the
// spawned command; the override still receives `--outputFile=<tmpfile>` as
// its final argument. REFUSED under GITHUB_ACTIONS so CI always runs real
// vitest. Behaviorally pinned at tests/scripts/runExcludedTest.test.ts.
//
// GUARD BOUNDARY (R2-B F2, accepted ceiling): the child executes
// repository code (vitest config, setup files), and code that runs inside
// the child can fabricate the report it writes (e.g. a process exit
// handler overwriting the JSON after vitest finishes). No in-repo oracle
// can defend against that actor — the same commit could edit the oracle,
// the registry, or the meta-test itself. In-repo guards catch DRIFT and
// accident; adversarial coordinator code is code review's jurisdiction.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function fail(msg) {
  console.error(`run-excluded-test: ${msg}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail("usage: node scripts/run-excluded-test.mjs <test-file>");

const reportPath = join(mkdtempSync(join(tmpdir(), "run-excluded-")), "report.json");

let cmd = "pnpm";
let args = ["vitest", "run", file, "--reporter=json"];
const override = process.env.RUN_EXCLUDED_CMD_OVERRIDE;
if (override) {
  if (process.env.GITHUB_ACTIONS) {
    fail("RUN_EXCLUDED_CMD_OVERRIDE is refused under GITHUB_ACTIONS — CI runs real vitest");
  }
  let parsed;
  try {
    parsed = JSON.parse(override);
  } catch (e) {
    fail(`RUN_EXCLUDED_CMD_OVERRIDE is not valid JSON: ${e}`);
  }
  if (typeof parsed.cmd !== "string" || !Array.isArray(parsed.args)) {
    fail("RUN_EXCLUDED_CMD_OVERRIDE must be {cmd: string, args: string[]}");
  }
  cmd = parsed.cmd;
  args = [...parsed.args];
}
args.push(`--outputFile=${reportPath}`);

let childExit = 0;
try {
  execFileSync(cmd, args, { cwd: process.cwd(), stdio: "pipe", timeout: 300_000 });
} catch (e) {
  childExit = typeof e.status === "number" ? e.status : -1;
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  fail(`child wrote no readable JSON report at ${reportPath}: ${e}`);
}

const passed = report?.numPassedTests;
const failed = report?.numFailedTests;
if (typeof passed !== "number" || typeof failed !== "number") {
  fail("report lacks numeric numPassedTests/numFailedTests — refusing to classify (fail-closed)");
}
// Per-file attribution (R1-B F1, tightened R2-B F1): vitest positionals are
// SUBSTRING filters (cli-api filterFiles, case-insensitive), so the
// aggregate counts alone cannot prove the NAMED file supplied the passes —
// a JSX-extension twin, a case variant, or a NESTED path containing the
// name (tests/shadow/tests/x.test.ts, which defeats suffix matching too)
// could pass while the registered file skips entirely. Require >=1 passed
// assertion in a testResults entry whose name resolves to EXACTLY the named
// file against this cwd — identity, not suffix.
const results = Array.isArray(report?.testResults) ? report.testResults : null;
if (results === null) {
  fail("report lacks a testResults array — cannot attribute passes to the named file");
}
const namedAbs = resolve(process.cwd(), file);
const namedEntry = results.filter(
  (r) => typeof r?.name === "string" && resolve(r.name) === namedAbs,
);
const namedPassed = namedEntry
  .flatMap((r) => (Array.isArray(r.assertionResults) ? r.assertionResults : []))
  .filter((a) => a?.status === "passed").length;
if (childExit !== 0) {
  fail(`child vitest exited ${childExit} (run-level failure, even if test cases passed)`);
}
if (passed < 1) {
  fail(`report shows ${passed} passed tests — collection without execution proves nothing`);
}
if (failed !== 0) {
  fail(`report shows ${failed} failed tests`);
}
if (namedPassed < 1) {
  fail(
    `no passed assertion is attributed to ${file} itself (${passed} aggregate passes came from ` +
      "other files matching the substring filter)",
  );
}
console.log(
  `run-excluded-test: ${file} executed ${namedPassed} passed in-file / ${passed} total / 0 failed (child exit 0)`,
);
