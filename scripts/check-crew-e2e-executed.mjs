// scripts/check-crew-e2e-executed.mjs
//
// Post-run oracle for the crew-e2e job: did the specs it names actually EXECUTE?
//
// Whole-diff review R10 (HIGH) escaping mutant: a `beforeEach` calling `test.skip(<condition>)`
// skips every case at RUNTIME while `--list` still reports them, so the wiring guard's count
// comparison, its EXPECTED_SKIPS registry, and the job's exit code all stay green while the suite
// executed nothing. Static analysis cannot close that — a runtime skip is a runtime fact — so this
// reads the run's OWN json report and requires each guarded spec to have really run.
//
// Same shape as scripts/check-standalone-baseline.mjs (the post-run comparator that closed
// BL-CI-ENV-DEPENDENT-CONFIG-NARROWING): the artifact compared is the run's own output, which is
// the only artifact guaranteed to share the run's environment.
//
//   node scripts/check-crew-e2e-executed.mjs [--report <path>]
//
// Zero-args reads test-results/crew-e2e-report.json so the workflow step literal stays fixed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Specs the crew-e2e job exists to run, with the minimum each must EXECUTE. */
const REQUIRED = {
  "crew-section-toggle.spec.ts": 1,
  "picker-flow.spec.ts": 1,
  "alert-action-links.spec.ts": 1,
  // The seeded agenda-fold suite is the reason this file exists: 3 SFS-1 cases + 3 fold cases.
  // Pinned at 6 rather than 1 so a runtime skip of just the fold block is caught too.
  "stage-restricted-crew-schedule.spec.ts": 6,
};

const argv = process.argv.slice(2);
const reportFlag = argv.indexOf("--report");
const reportPath =
  reportFlag === -1
    ? join(process.cwd(), "test-results", "crew-e2e-report.json")
    : argv[reportFlag + 1];

if (reportPath === undefined || !existsSync(reportPath)) {
  console.error(`check-crew-e2e-executed: no report at ${reportPath}`);
  console.error("The run must emit one (--reporter=json + PLAYWRIGHT_JSON_OUTPUT_NAME).");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));

/** file basename -> number of tests that actually produced a non-skipped result. */
const executed = new Map();
const walk = (suites) => {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      const base = String(spec.file ?? "")
        .split("/")
        .pop();
      for (const test of spec.tests ?? []) {
        const ran = (test.results ?? []).some(
          (r) => r.status !== "skipped" && r.status !== undefined,
        );
        if (ran) executed.set(base, (executed.get(base) ?? 0) + 1);
      }
    }
    walk(suite.suites);
  }
};
walk(report.suites);

const failures = [];
for (const [file, min] of Object.entries(REQUIRED)) {
  const n = executed.get(file) ?? 0;
  if (n < min) failures.push(`${file}: executed ${n}, expected at least ${min}`);
}

if (failures.length > 0) {
  console.error("check-crew-e2e-executed: guarded specs did not run:");
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "A collected-but-skipped suite reports green. If a skip is deliberate, change the " +
      "REQUIRED table in this script and say why.",
  );
  process.exit(1);
}

console.log(
  `check-crew-e2e-executed: ok — ${[...executed.entries()]
    .map(([f, n]) => `${f} ${n}`)
    .sort()
    .join(", ")}`,
);
