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
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
if (childExit !== 0) {
  fail(`child vitest exited ${childExit} (run-level failure, even if test cases passed)`);
}
if (passed < 1) {
  fail(`report shows ${passed} passed tests — collection without execution proves nothing`);
}
if (failed !== 0) {
  fail(`report shows ${failed} failed tests`);
}
console.log(`run-excluded-test: ${file} executed ${passed} passed / 0 failed (child exit 0)`);
