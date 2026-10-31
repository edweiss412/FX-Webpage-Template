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

import { collectInfraRecoveries, printInfraRecoveries } from "./lib/infraRecoveryAnnotations.mjs";

/** Specs the crew-e2e job exists to run, with the minimum each must EXECUTE. */
// Every count is the spec's FULL executable set, not a floor of 1. Whole-diff review R12 (HIGH):
// a minimum of 1 let a nested `beforeEach(() => test.skip())` runtime-skip 5 of 6, 5 of 6 and 3 of
// 4 cases respectively while one cheap case kept the job green — a partially dark suite is the
// same defect as a wholly dark one, just quieter. picker-flow is 7 because one of its 8 collected
// cases is the registered static skip (its own comment in picker-flow.spec.ts, the
// "Admin Reset + Rotate flow" case).
export const REQUIRED = {
  "crew-section-toggle.spec.ts": 6,
  "picker-flow.spec.ts": 7,
  "alert-action-links.spec.ts": 4,
  // 3 SFS-1 cases + 3 seeded agenda-fold cases.
  "stage-restricted-crew-schedule.spec.ts": 6,
  // Three binding routes (/admin behind signInAs, the public /auth/sign-in, a
  // seeded crew route) + the measured one-line row + six feature-rendering cases
  // added by BL-INTER-NUMERAL-DISAMBIGUATION. All ten, or the oracle is dark on
  // whichever tree stopped binding or whichever feature stopped rendering.
  "font-binding.spec.ts": 10,
  // ── wired 2026-08-09 by BL-RESURRECT-MOBILE-SAFARI-E2E ──────────────────────
  // Every count below is derived from an ACTUAL run's report (the same shape this
  // script reads: unique spec ids with a passing result, summed over the projects
  // the spec is wired for), NOT from arithmetic — same rule as the census above.
  //
  // 15 = the §4.9 layout invariants + the Task-3 nav/preview/footer cases, under
  // mobile-safari ALONE. crew-page is deliberately absent from the
  // desktop-chromium testMatch: its cases used to early-return off
  // testInfo.project.name, so a desktop execution was a passing no-op this oracle
  // would have counted. Those gates are gone and the project set is now honest.
  // The 4 statically-skipped §4.10 transition-audit cases are excluded by
  // construction (they never produce a passing result) and are registered by
  // exact title in the wiring guard's EXPECTED_SKIPS.
  // 16 as of the crew-chrome branch: the 15 above plus the anchored-footer
  // short-page case (AC-U2), which asserts both width regimes in one test.
  // 21 as of the wifi-password-legibility branch: the 16 above plus the five
  // "wifi password transcription affordance (production route)" cases, which
  // measure the shipped route rather than a harness mount (spec
  // 2026-08-10-wifi-password-legibility §6(b) splits production-route topology
  // here from the standalone geometry harness). Counted from the observed
  // mobile-safari run (21 passed / 4 skipped), not from arithmetic.
  "crew-page.spec.ts": 21,
  // 9, and the number is the MATRIX rather than a multiple (plan
  // 2026-08-09-quick-wins-2 "e2e harness readiness"). theme-toggle runs two arms:
  //   arm (a) — 4 standalone-toggle cases, BOTH projects            = 8
  //   arm (b) — 1 avatar-menu case, desktop-chromium ONLY           = 1
  // Arm (b) is Chromium-gated by a DECLARED `test.skip(...)` because the picker
  // identity it needs cannot exist under WebKit over plain http (the `__Host-`
  // Secure envelope is never stored), so it can never pass under mobile-safari.
  // 9 is therefore TIGHT, not slack: mobile-safari can contribute at most 4 and
  // desktop-chromium at most 5, so demanding 9 forces both to be complete. The
  // wiring guard derives this same number from live per-project resolution minus
  // its PROJECT_GATED registry — it is not trusted as a literal here.
  "theme-toggle.spec.ts": 9,
  // 5 — REWRITTEN 2026-08-26 when the persist-failure note was removed by product
  // ruling (spec 2026-08-15-theme-persistence-note-design §2.2, "Amendment,
  // 2026-08-26"). It was 4: two consumers x two claims about a bubble and the
  // wrapper anchoring it, both of which are now deleted. It is now two consumers
  // (help header, admin nav cluster) x two claims (a blocked write applies the
  // theme and renders no note; the toggle keeps its 44px target and its row at
  // 320px), plus one help-header case that the trailing "Back to admin" link
  // still sits clear of the toggle. That last one is the wrapper-removal
  // regression check: the toggle became a direct flex child of a
  // width-engineered row. desktop-chromium ALONE, which is the spec's only
  // project: the cases size the viewport in-test, so a second project would
  // re-run an identical assertion rather than add cover. The wiring guard
  // re-derives this from live per-project resolution.
  "theme-persistence-note.spec.ts": 5,
  // ── wired 2026-08-10 by M-wave 2 W-E2E (BL-RIGHTNOW-SECTION57-FIXTURE-INERT +
  // BL-RIGHTNOW-RECOVERY-CASE-NEEDS-RESTRICTED-VIEWER) ────────────────────────
  // 3 = the §5.7 anchor pair (Day-1 anchor, midnight rollover) + the restricted-
  // viewer recovery case, desktop-chromium ALONE (the picker-bootstrap __Host-
  // envelope is dark on WebKit over plain http — the spec header records the
  // measured failure). Derived from the 2026-08-10 local run's report: 3 passing
  // unique spec ids under desktop-chromium.
  "right-now-transitions.spec.ts": 3,
  // ── wired by the crew show search branch (plan Task 19) ─────────────────────
  // 8 = four cases (wifi flow, miss POST, spec §6.9 dimensions, the field's single
  // focus ring) at each of two viewports (390px, 1280px), desktop-chromium ALONE
  // (the spec drives the picker, whose `__Host-` envelope WebKit will not store
  // over plain http). Counted from
  // `playwright test --project=desktop-chromium tests/e2e/crew-search.spec.ts --list`
  // ("Total: 8 tests in 1 file"), not from arithmetic. Re-derive with --list after
  // adding or removing a case.
  "crew-search.spec.ts": 8,
  // The census, across mobile-safari + desktop-chromium. The checker enforces
  // `executed >= min`, so THE NUMBER IS THE GUARD: a row of 1 would let every
  // case but one skip while CI stayed green, which is exactly what the registry
  // exists to prevent.
  //
  // 88, derived from an actual --list run, NOT from arithmetic on the route
  // count. It was 112 when the census asserted every page surface; two reasoned
  // exclusions removed 12 cases per project -- /auth/sign-in, which redirects
  // by design once the census has signed in, and the /admin/dev subtree, which
  // is gated on a build flag this job does not set. Re-derive with --list after
  // any change to the route census or the exclusions.
  "font-rendering-census.spec.ts": 88,
  // ── wired by the crew page saved copy branch (plan Task 28) ─────────────────
  // Spec docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md §7.
  // Each count is the spec's full executable set under the two offline projects,
  // read off the `Total:` line of
  //   pnpm heavy pnpm exec playwright test --list --project=crew-offline-chromium --project=crew-offline-webkit <spec>
  // not from arithmetic. None of the three skips a case; each project's testMatch
  // decides which engine runs which file. Re-derive with that command after adding
  // or removing a case.
  //
  // Re-derived 2026-10-31 (Codex R1 D1: the layout row was a stale 12 against 16,
  // and the UI gate re-check E4 added layout case 9), after every D edit; the
  // crew-offline row re-derived again after Codex R3 C added case 11c:
  //   == crew-offline.spec.ts
  //     [crew-offline-webkit] › crew-offline.spec.ts:943:5 › 15. hydration is clean on a served copy, offline and ended
  //   Total: 34 tests in 1 file
  //   == crew-offline-realtime.spec.ts
  //     [crew-offline-chromium] › crew-offline-realtime.spec.ts:150:5 › an unpublish arriving by realtime refresh wipes the copy
  //   Total: 3 tests in 1 file
  //   == crew-offline-layout.spec.ts
  //     [crew-offline-webkit] › crew-offline-layout.spec.ts:636:5 › 9. one bottom edge: under the detail at rest, under the pinned line once the detail has scrolled away
  //   Total: 18 tests in 1 file
  //
  // 34 = 17 cases under each of Chromium and WebKit.
  "crew-offline.spec.ts": 34,
  // 3 = three realtime cases, Chromium alone by testMatch.
  "crew-offline-realtime.spec.ts": 3,
  // 18 = 9 layout cases under each engine.
  "crew-offline-layout.spec.ts": 18,
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

  // PRINT-BEFORE-GATE (spec §4.3). This oracle is the crew job's only consumer of the run report,
  // so it carries the recovery print duty rather than a separate step — and the duty is worthless
  // in its tail, because `process.exit(1)` on a floor shortfall would run first. The gating exit is
  // therefore the LAST statement of this function, with the print unconditionally above it. A
  // `finally` block is NOT the mechanism: `process.exit()` does not run `finally`.
  if (failures.length > 0) {
    console.error("check-crew-e2e-executed: guarded specs did not run:");
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      "A collected-but-skipped suite reports green. If a skip is deliberate, change the " +
        "REQUIRED table in this script and say why.",
    );
  } else {
    console.log(
      `check-crew-e2e-executed: ok — ${[...executed.entries()]
        .map(([f, ids]) => `${f} ${ids.size}`)
        .sort()
        .join(", ")}`,
    );
  }

  // Informational, never a gate: a recovered run is a green run by design.
  printInfraRecoveries(collectInfraRecoveries(report));

  if (failures.length > 0) process.exit(1);
}
