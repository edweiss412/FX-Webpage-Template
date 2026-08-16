// scripts/lib/infraRecoveryAnnotations.mjs
//
// The `infra-recovery` annotation collector and printer, in ONE place.
//
// tests/e2e/helpers/openShowReviewModal.ts pushes one annotation whenever it recovers from the
// admin route error boundary (a transient gateway 502 — spec
// docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §4.4). Those runs
// are GREEN by design, and a green run uploads no Playwright artifact while the list reporter
// prints no annotations — so this stdout is the only place an operator ever sees them.
//
// Extracted from scripts/check-app-e2e-executed.mjs by the adoption sweep (spec
// docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md §4.3): every
// workflow step that runs a member spec now prints recoveries, and two copies of the read-location
// semantics would drift.

/**
 * Every `infra-recovery` annotation in the run, one row per occurrence.
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
  walk(report?.suites);
  return rows;
}

/**
 * The exact two-line-shape stdout the app oracle has always emitted. The total is printed even
 * when zero, so "no recoveries" and "the print duty regressed" stay distinguishable.
 */
export function printInfraRecoveries(recoveries) {
  for (const r of recoveries) console.log(`infra-recovery: ${r.title} :: ${r.description}`);
  console.log(`infra-recovery total: ${recoveries.length}`);
}
