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
// Measured 2026-08-09, full batch, both projects, --retries=0: 54 executions across the SEVEN
// specs wired at that point, all green. (An earlier eight-spec measurement read 60;
// admin-changes-feed-layout then left the batch under AC-4 on a CI-reproduced flake, taking its 6
// with it.) help-pages joined 2026-08-10 once its blocker closed
// (BL-HELP-TOUR-HYDRATION-MISMATCH), measured at 15 on its own run — eight wired specs, 69
// executions. admin-changes-feed-layout RE-ENTERED 2026-08-15 with the wait-helper repair (its
// root cause was a transient gateway 502, not the filed fixture collision — spec
// docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md), adding a fourth
// case, so it returns at 8 rather than its old 6 — NINE wired specs, 77 executions.
//
// Each count is the spec's FULL executable set, not a floor of 1: a floor of 1 would let a nested
// `beforeEach(() => test.skip())` runtime-skip every case but one while the job stayed green, and a
// partially dark suite is the same defect as a wholly dark one, just quieter.
export const REQUIRED = {
  // 3 width bands + the dead-slug helper-diagnostics case, x 2 projects.
  "admin-changes-feed-layout.spec.ts": 8,
  // 2 cases x 2 projects.
  "admin-layout.spec.ts": 4,
  // 4 cases x 1 project — admin-phase2-surfaces resolves under mobile-safari only
  // (playwright.config.ts testMatch), so 4 is the whole suite, not half of it.
  "admin-phase2-surfaces.spec.ts": 4,
  // 14 NAV routes + the NAV-parity guard, x 1 project — help-pages resolves under mobile-safari
  // only (playwright.config.ts testMatch), and the route list derives from app/help/_nav.ts, so a
  // NAV row added without a HELP_ROUTES row fails the parity guard rather than quietly lowering
  // this count.
  "help-pages.spec.ts": 15,
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

/**
 * Every `infra-recovery` annotation in the run, one row per occurrence.
 *
 * tests/e2e/helpers/openShowReviewModal.ts pushes one whenever it recovers from the admin route
 * error boundary (a transient gateway 502 — spec
 * docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §4.4). Those runs
 * are GREEN by design, and a green run uploads no Playwright artifact while the list reporter
 * prints no annotations — so this stdout is the only place an operator ever sees them.
 *
 * READ LOCATION: Playwright serializes a runtime-pushed annotation at BOTH `tests[].annotations`
 * and `results[].annotations`. Read the merged `tests[]` location ONLY — traversing both
 * double-counts every recovery, and reading results first-match-only drops later ones.
 */
export function collectInfraRecoveries(report) {
  const rows = [];
  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          for (const a of test.annotations ?? []) {
            if (a.type !== "infra-recovery") continue;
            rows.push({
              title: `${spec.file}:${spec.line} ${spec.title}`,
              description: a.description ?? "",
            });
          }
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);
  return rows;
}

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
   * file basename -> set of UNIQUE (case x project) identities that passed ON THEIR FIRST ATTEMPT.
   *
   * The identity is `file:line:title|projectId`, NOT `spec.id`. Whole-diff review round 1
   * (finding 3) probed the id-based form this script first shipped with and it does not hold:
   * repeating seven mobile-safari cases produced FOURTEEN distinct ids while only SEVEN logical
   * cases ran, so `--grep` selecting half the cases plus `--repeat-each=2` kept the count at its
   * floor with half the coverage dark. Deduplicating on the logical identity makes a repeat count
   * once, which is what the id-based comment wrongly claimed. Counting per PROJECT is deliberate:
   * the floors are cases x resolving projects, so losing a whole project must drop the count
   * rather than be absorbed by the other one.
   *
   * Two independent guards, neither subsuming the other: this one observes the RUN, and
   * tests/cross-cutting/app-e2e-ci-wiring.test.ts pins these floors against live Playwright
   * resolution and refuses a narrowing flag on the workflow's command in the first place.
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
          executed
            .get(base)
            .add(`${spec.file}:${spec.line}:${spec.title}|${test.projectId ?? "?"}`);
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);

  // A floor must DEMAND something. Diff review round 3: `executed >= 0` is vacuously true, so a
  // row of 0 — the natural thing to write when promoting a spec whose cases are all skipped or
  // env-gated off — makes this oracle green on a spec that executed nothing, which is the exact
  // failure it exists to catch. Refuse the row rather than evaluate it.
  const invalidFloors = Object.entries(REQUIRED).filter(
    ([, min]) => !Number.isInteger(min) || min < 1,
  );
  if (invalidFloors.length > 0) {
    console.error("check-app-e2e-executed: REQUIRED holds a floor that demands nothing:");
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

  // Informational, never a gate: a recovered run is a green run by design. The count is printed
  // even when zero, so "no recoveries" and "the print duty regressed" stay distinguishable.
  const recoveries = collectInfraRecoveries(report);
  for (const r of recoveries) console.log(`infra-recovery: ${r.title} :: ${r.description}`);
  console.log(`infra-recovery total: ${recoveries.length}`);
}
