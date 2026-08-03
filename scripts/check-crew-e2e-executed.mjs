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
import { pathToFileURL } from "node:url";

/** Specs the crew-e2e job exists to run, with the minimum each must EXECUTE. */
// Every count is the spec's FULL executable set, not a floor of 1. Whole-diff review R12 (HIGH):
// a minimum of 1 let a nested `beforeEach(() => test.skip())` runtime-skip 5 of 6, 5 of 6 and 3 of
// 4 cases respectively while one cheap case kept the job green — a partially dark suite is the
// same defect as a wholly dark one, just quieter. picker-flow is 6 because one of its 7 collected
// cases is the registered static skip (its own comment at picker-flow.spec.ts:354).
export const REQUIRED = {
  "crew-section-toggle.spec.ts": 6,
  "picker-flow.spec.ts": 6,
  "alert-action-links.spec.ts": 4,
  // 3 SFS-1 cases + 3 seeded agenda-fold cases.
  "stage-restricted-crew-schedule.spec.ts": 6,
};

// Importable table, runnable script. The wiring guard imports REQUIRED to pin these thresholds
// against live Playwright resolution (whole-diff review R14: nothing stopped someone lowering a
// threshold to match a degraded run), so the module must have no side effects on import.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
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

  /**
   * file basename -> set of UNIQUE spec ids that produced a passing result.
   *
   * Identities, not result rows. Whole-diff review R13 (HIGH): a config-level `grep` selecting half
   * the cases plus `repeatEach: 2` preserves every count while half the unique coverage — Theo and
   * the unrestricted admin control among them — never runs. Counting `spec.id` makes a repeat a
   * repeat rather than a second test.
   */
  const executed = new Map();
  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        const base = String(spec.file ?? "")
          .split("/")
          .pop();
        for (const test of spec.tests ?? []) {
          // PASSED, not merely "not skipped". Whole-diff review R11 (HIGH): `test.fail()` sets
          // expectedStatus="failed", so the case runs, fails immediately before its real
          // assertions, counts as outcome "expected", and does not fail the run — a quarantined
          // suite that looks executed. A test that proves something ends green.
          const ran = (test.results ?? []).some((r) => r.status === "passed");
          if (!ran) continue;
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
      .map(([f, ids]) => `${f} ${ids.size}`)
      .sort()
      .join(", ")}`,
  );
}
