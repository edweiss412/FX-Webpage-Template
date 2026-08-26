// scripts/check-lifecycle-layout-executed.mjs
//
// Post-run oracle for the lifecycle-layout-e2e job's tap-target step: did the spec it names
// actually EXECUTE?
//
// The defect this closes is the one its app-e2e and crew-e2e siblings close. A `beforeEach`
// calling `test.skip(<condition>)` skips every case at RUNTIME while `--list` still reports them,
// so a collected-but-skipped suite exits green and the step proves nothing. Static analysis cannot
// close that — a runtime skip is a runtime fact — so this reads the run's OWN json report and
// requires each named spec to have really run.
//
// Job-specific by construction, exactly like scripts/check-app-e2e-executed.mjs:9 says of itself:
// the REQUIRED map below is a hardcoded module constant keyed to THIS job's step, and the report
// path default is that step's own PLAYWRIGHT_JSON_OUTPUT_NAME. Reusing one script across jobs
// would mean one REQUIRED table spanning steps that run separately, so a whole missing step would
// read as a shortfall in the other's numbers.
//
//   node scripts/check-lifecycle-layout-executed.mjs [--report <path>]
//
// Zero-args reads test-results/lifecycle-layout-tap-target-report.json so the workflow step
// literal stays fixed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Specs the tap-target step exists to run, with the minimum each must EXECUTE. */
// Derived from an ACTUAL run's report — the same shape this script reads — never from `--list`
// arithmetic, which cannot see a runtime skip (the exact blindness this oracle closes).
//
// The count is the spec's FULL executable set, not a floor of 1: a floor of 1 would let a nested
// `beforeEach(() => test.skip())` runtime-skip every case but one while the step stayed green, and
// a partially dark suite is the same defect as a wholly dark one, just quieter.
export const REQUIRED = {
  // 4 cases x 1 project — the spec resolves under mobile-safari only
  // (playwright.config.ts testMatch), so 4 is the whole suite.
  // 4 -> 5 (2026-08-16, fix/step3-tap-cluster): the site-5 no-details case. The
  // second seedable SheetTitleLink render site is the TIGHTER of the two filed
  // overlap contexts (a `mt-1` warning line, 4px of clearance against the old
  // 10px downward bleed), so a half-fix would still fail there.
  // 5 -> 6 (2026-08-25, fix/e2e-proof-retired-route-subpixel): the premise +
  // barrier case. It is the reason the other five stopped flaking, so it is the
  // one case whose absence would be least visible — a run that skipped only it
  // would look identical to a healthy run until the next unrelated PR ate a red.
  "tap-target-inline-controls.layout.spec.ts": 6,
};

/** The report path the workflow step registers, and this script's zero-arg default. */
export const REPORT_PATH = "test-results/lifecycle-layout-tap-target-report.json";

// Importable table, runnable script — no side effects on import, so the wiring guard can pin these
// thresholds against live Playwright resolution without executing the checker.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argv = process.argv.slice(2);
  const reportFlag = argv.indexOf("--report");
  const reportPath = reportFlag === -1 ? join(process.cwd(), REPORT_PATH) : argv[reportFlag + 1];

  if (reportPath === undefined || !existsSync(reportPath)) {
    console.error(`check-lifecycle-layout-executed: no report at ${reportPath}`);
    console.error("The run must emit one (--reporter=json + PLAYWRIGHT_JSON_OUTPUT_NAME).");
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"));

  /**
   * file basename -> set of UNIQUE (case x project) identities that passed ON THEIR FIRST ATTEMPT.
   *
   * The identity is `file:line:title|projectId`, NOT `spec.id`: the app-e2e sibling probed the
   * id-based form and it does not hold — `--repeat-each=2` over N cases produces 2N distinct ids
   * while only N logical cases ran, so `--grep` selecting half the cases plus a repeat keeps the
   * count at its floor with half the coverage dark. Deduplicating on the logical identity makes a
   * repeat count once. Counting per PROJECT is deliberate: the floor is cases x resolving
   * projects, so losing a whole project must drop the count rather than be absorbed.
   *
   * FIRST ATTEMPT: the step pins `--retries=0`, so no retry should exist at all. Requiring exactly
   * one result, passed, means this fails LOUDLY if that flag is ever dropped
   * (playwright.config.ts sets `retries: CI ? 2 : 0`) instead of laundering a fail-then-pass retry
   * as green.
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
          executed
            .get(base)
            .add(`${spec.file}:${spec.line}:${spec.title}|${test.projectId ?? "?"}`);
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);

  // A floor must DEMAND something: `executed >= 0` is vacuously true, so a row of 0 — the natural
  // thing to write when promoting a spec whose cases are all skipped or env-gated off — would make
  // this oracle green on a spec that executed nothing, which is the exact failure it exists to
  // catch. Refuse the row rather than evaluate it.
  const invalidFloors = Object.entries(REQUIRED).filter(
    ([, min]) => !Number.isInteger(min) || min < 1,
  );
  if (invalidFloors.length > 0) {
    console.error("check-lifecycle-layout-executed: REQUIRED holds a floor that demands nothing:");
    for (const [file, min] of invalidFloors) console.error(`  ${file}: ${min}`);
    console.error("Every floor must be a positive integer — `executed >= 0` proves nothing.");
    process.exit(1);
  }

  const failures = [];
  for (const [file, min] of Object.entries(REQUIRED)) {
    const n = executed.get(file)?.size ?? 0;
    if (n < min) failures.push(`${file}: executed ${n}, expected at least ${min}`);
  }

  if (failures.length > 0) {
    console.error(
      "check-lifecycle-layout-executed: guarded specs did not run on a clean first attempt:",
    );
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      "A collected-but-skipped suite reports green, and so does a fail-then-pass retry. If a " +
        "shortfall is deliberate, change the REQUIRED table in this script and say why.",
    );
    process.exit(1);
  }

  console.log(
    `check-lifecycle-layout-executed: ok — ${[...executed.entries()]
      .map(([f, ids]) => `${f} ${ids.size}`)
      .sort()
      .join(", ")}`,
  );
}
