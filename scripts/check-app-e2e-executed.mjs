// scripts/check-app-e2e-executed.mjs
//
// Post-run oracle for the app-e2e job: did the specs it names actually EXECUTE?
//
// Same defect this closes as its crew-e2e sibling: a `beforeEach` calling `test.skip(<condition>)`
// skips every case at RUNTIME while `--list` still reports them, so a collected-but-skipped suite
// exits green and the job proves nothing. Static analysis cannot close that — a runtime skip is a
// runtime fact — so this reads the run's OWN json report and requires each named spec to have
// really run. The crew script is not reusable: its REQUIRED map is a hardcoded module constant
// keyed to the crew-e2e specs.
//
//   node scripts/check-app-e2e-executed.mjs [--report <path>]
//
// Zero-args reads test-results/app-e2e-report.json so the workflow step literal stays fixed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Specs the app-e2e job exists to run, with the minimum each must EXECUTE. */
// Every count below is derived from an ACTUAL run's report — the same shape this script reads,
// summed over the projects each spec resolves under — never from `--list` arithmetic. `--list`
// cannot see a runtime skip, which is the exact blindness this oracle exists to close (spec AC-5).
// Measured 2026-08-09, full batch, both projects, --retries=0: 60 executions, all green.
//
// Each count is the spec's FULL executable set, not a floor of 1: a floor of 1 would let a nested
// `beforeEach(() => test.skip())` runtime-skip every case but one while the job stayed green, and a
// partially dark suite is the same defect as a wholly dark one, just quieter.
export const REQUIRED = {
  // 3 width bands x 2 projects.
  "admin-changes-feed-layout.spec.ts": 6,
  // 2 cases x 2 projects.
  "admin-layout.spec.ts": 4,
  // 4 cases x 1 project — admin-phase2-surfaces resolves under mobile-safari only
  // (playwright.config.ts testMatch), so 4 is the whole suite, not half of it.
  "admin-phase2-surfaces.spec.ts": 4,
  // 7 cases x 2 projects.
  "me-page.spec.ts": 14,
  // 6 width bands + the dispatch case, x 2 projects.
  "notify-toggles.spec.ts": 14,
  // 4 cases x 2 projects.
  "report-modal.spec.ts": 8,
  // 4 cases x 2 projects.
  "root-landing.spec.ts": 8,
  // 1 case x 2 projects.
  "sample.spec.ts": 2,
};

// Importable table, runnable script — no side effects on import, so a guard can pin these
// thresholds against live Playwright resolution without executing the checker.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argv = process.argv.slice(2);
  const reportFlag = argv.indexOf("--report");
  const reportPath =
    reportFlag === -1
      ? join(process.cwd(), "test-results", "app-e2e-report.json")
      : argv[reportFlag + 1];

  if (reportPath === undefined || !existsSync(reportPath)) {
    console.error(`check-app-e2e-executed: no report at ${reportPath}`);
    console.error("The run must emit one (--reporter=json + PLAYWRIGHT_JSON_OUTPUT_NAME).");
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"));

  /**
   * file basename -> set of UNIQUE spec ids that passed ON THEIR FIRST ATTEMPT.
   *
   * Identities, not result rows: a config-level `grep` selecting half the cases plus
   * `repeatEach: 2` would preserve every count while half the unique coverage never runs.
   * Counting `spec.id` makes a repeat a repeat rather than a second test.
   *
   * FIRST ATTEMPT is the deliberate strengthening over the crew sibling, which accepts
   * `results.some(r => r.status === "passed")`. The workflow pins `--retries=0`, so no retry
   * should exist at all; requiring exactly one result, passed, means the oracle fails LOUDLY if
   * that flag is ever dropped (playwright.config.ts sets `retries: CI ? 2 : 0`) instead of
   * laundering a fail-then-pass retry as green and silently defeating AC-3's zero-retry bar.
   *
   * PASSED, not merely "not skipped": `test.fail()` sets expectedStatus="failed", so the case runs,
   * fails before its real assertions, counts as outcome "expected", and does not fail the run — a
   * quarantined suite that looks executed. A test that proves something ends green.
   */
  const executed = new Map();
  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        const base = String(spec.file ?? "")
          .split("/")
          .pop();
        for (const test of spec.tests ?? []) {
          const results = test.results ?? [];
          const passedFirstAttempt = results.length === 1 && results[0].status === "passed";
          if (!passedFirstAttempt) continue;
          if (!executed.has(base)) executed.set(base, new Set());
          executed.get(base).add(spec.id ?? `${spec.file}:${spec.line}:${spec.title}`);
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);

  const failures = [];
  for (const [file, min] of Object.entries(REQUIRED)) {
    const n = executed.get(file)?.size ?? 0;
    if (n < min) failures.push(`${file}: executed ${n}, expected at least ${min}`);
  }

  if (failures.length > 0) {
    console.error("check-app-e2e-executed: guarded specs did not run on a clean first attempt:");
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      "A collected-but-skipped suite reports green, and so does a fail-then-pass retry. If a " +
        "shortfall is deliberate, change the REQUIRED table in this script and say why.",
    );
    process.exit(1);
  }

  console.log(
    `check-app-e2e-executed: ok — ${[...executed.entries()]
      .map(([f, ids]) => `${f} ${ids.size}`)
      .sort()
      .join(", ")}`,
  );
}
