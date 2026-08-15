// scripts/lib/phantomGapExecuted.mjs
//
// Post-run oracle for the phantom-gap job's DIAGRAM step: did each guarded case
// actually EXECUTE, under the project it was written for?
//
// Why this is not scripts/check-crew-e2e-executed.mjs. That oracle collapses a
// run to `basename -> set of executed spec ids` and asserts a per-FILE count. It
// cannot express this step's contract, because the two cases added by the
// zoom-gate arc are DELIBERATELY single-project: the network-order gate runs
// under desktop-chromium (its trigger is the keyboard zoom path) and the tier
// assertion under mobile-safari. A per-file count of 5 is satisfied by five
// mobile executions with the chromium case skipped — the exact hole the split
// creates. So this checker keys on the (case title, project) PAIR.
//
// What the pair table deliberately OMITS is as load-bearing as what it holds.
// The three pre-existing T-DIAGRAM-VARIANTS cases are engine-specific geometry
// and URL assertions: they DECLARE a skip off mobile-safari, so they contribute
// nothing under desktop-chromium and are required under mobile-safari only.
// (They carried bare `if (project !== "mobile-safari") return;` gates until this
// arc; adding a project would have turned each into a passing desktop no-op, the
// false-coverage shape the repo's own guard names at
// tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:623. The arc converted
// them to declared skips so the no-op cannot exist, and this table would not
// have counted it either way.)
//
//   node scripts/check-phantom-gap-executed.mjs [--report <path>]
//
// Zero-args reads test-results/phantom-gap-diagrams-report.json so the workflow
// step literal stays fixed.
//
// WHY THE LOGIC IS A MODULE AND THE CLI IS A WRAPPER. The sibling oracle
// (scripts/check-crew-e2e-executed.mjs) is one file: an exported table plus a
// `import.meta.url === argv[1]` main block. That shape is un-enrollable in the
// source-mutation registry, and not by opinion — measured. Enrolled as one file
// this surface scored 0.27, with 18 of its 19 survivors inside the main block,
// because a referring Vitest suite imports the module and therefore never runs
// that block: every mutant in it is unreachable by construction and survives
// forever. Splitting moves the decisions (which report, ran or not, what to say)
// into a module the suite really executes, and leaves the wrapper holding only
// process I/O — which the suite covers by SPAWNING it, since exit codes are the
// one thing an import cannot observe.
//
// It lives under scripts/lib/ rather than lib/ because plain-JS modules are
// barred from lib/ and app/ by tests/cross-cutting/no-absolute-self-redirect.ts:
// tsconfig's `include` covers TS extensions with `checkJs` off, so `tsc --noEmit`
// proves nothing about a `.mjs` there and that guard would go blind on it.
// scripts/lib/ is the established home for script-support modules
// (scripts/lib/ledger-claims-core.ts). ESM rather than TS because the CLI must
// import it under plain `node`, with no transpile step in the CI job.
import { join } from "node:path";

/**
 * The (case title, project) pairs this step exists to run.
 *
 * DERIVED FROM A REAL RUN (2026-08-10, `--project=mobile-safari
 * --project=desktop-chromium`, json reporter), never from arithmetic over the
 * case list — the whole point is that collected != executed.
 */
export const REQUIRED_PAIRS = [
  {
    title: "T-DIAGRAM-VARIANTS thumbnails: every gallery image box === its grid-cell content box",
    project: "mobile-safari",
  },
  {
    title:
      "T-DIAGRAM-VARIANTS network: thumbnails fetch manifest-listed variant URLs with zero /_next/image requests",
    project: "mobile-safari",
  },
  {
    title:
      "T-DIAGRAM-VARIANTS lightbox: the no-dims fill image measures equal to its containing block as the ACTIVE slide (TransformComponent wrapper) and as an INACTIVE slide (inner relative wrapper)",
    project: "mobile-safari",
  },
  {
    title:
      "T-DIAGRAM-VARIANTS lightbox zoom gate: the active slide opens on a clamped variant, never the original",
    project: "mobile-safari",
  },
  {
    title:
      "T-DIAGRAM-VARIANTS lightbox zoom gate: the ORIGINAL is not requested until zoom intent, then it is",
    project: "desktop-chromium",
  },
];

/**
 * The composite key. NUL joins the two halves because it cannot occur in a
 * Playwright title or project name, so no title ending in the project's name can
 * collide with a different pair.
 */
export function pairKey(title, project) {
  return `${title}\u0000${project}`;
}

/**
 * pair key -> the set of UNIQUE spec ids that produced a PASSING result.
 *
 * Two deliberate choices, both from the sibling oracle's review history:
 *
 *   PASSED, not "not skipped" — `test.fail()` sets expectedStatus="failed", so a
 *   quarantined case runs, fails before its real assertions, reports outcome
 *   "expected", and does not fail the run. A case that proves something ends
 *   green.
 *
 *   Spec IDENTITIES, not result rows — `repeatEach: 2` doubles every result row
 *   while the unique coverage is unchanged, so counting rows would let a config
 *   that halves the selected cases keep its totals.
 */
export function executedPairs(report) {
  const found = new Map();
  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const ran = (test.results ?? []).some((result) => result.status === "passed");
          if (!ran) continue;
          const key = pairKey(String(spec.title ?? ""), String(test.projectName ?? ""));
          const ids = found.get(key) ?? new Set();
          ids.add(spec.id ?? `${spec.file}:${spec.line}:${spec.title}`);
          found.set(key, ids);
        }
      }
      walk(suite.suites);
    }
  };
  walk(report?.suites);
  return found;
}

/** The required pairs with no passing execution in `report`, in table order. */
export function missingPairs(report, required = REQUIRED_PAIRS) {
  const found = executedPairs(report);
  return required.filter((pair) => !found.has(pairKey(pair.title, pair.project)));
}

/** The operator-facing failure text. Names every missing pair, not just a count. */
export function formatFailure(missing) {
  const lines = ["check-phantom-gap-executed: guarded cases did not run:"];
  for (const pair of missing) lines.push(`  [${pair.project}] ${pair.title}`);
  lines.push(
    "A collected-but-skipped case reports green. If a skip is deliberate, change " +
      "REQUIRED_PAIRS in this script and say why.",
  );
  return lines.join("\n");
}

/** The one-line success summary: every executed pair, sorted. */
export function formatSuccess(found) {
  const rendered = [...found.entries()]
    .map(([key, ids]) => {
      const [title, project] = key.split("\u0000");
      return `[${project}] ${title} (${ids.size})`;
    })
    .sort();
  return `check-phantom-gap-executed: ok. ${rendered.join("; ")}`;
}

/** Where the workflow step writes its report when the CLI is given no `--report`. */
export const DEFAULT_REPORT_RELATIVE = ["test-results", "phantom-gap-diagrams-report.json"];

/**
 * The report path a CLI invocation should read.
 *
 * `undefined` means the caller passed `--report` with nothing after it - a
 * distinct outcome from the default, because silently falling back to the
 * default there would read a DIFFERENT run's report than the operator asked for
 * and report on it as if it were theirs.
 */
export function resolveReportPath(argv, cwd) {
  const flag = argv.indexOf("--report");
  if (flag === -1) return join(cwd, ...DEFAULT_REPORT_RELATIVE);
  return argv[flag + 1];
}

/**
 * The whole decision, so the CLI wrapper holds no branch of its own beyond
 * process I/O: `ok` selects the stream and the exit code, `message` is the text.
 */
export function runCheck(report, required = REQUIRED_PAIRS) {
  const missing = missingPairs(report, required);
  if (missing.length > 0) return { ok: false, message: formatFailure(missing) };
  return { ok: true, message: formatSuccess(executedPairs(report)) };
}
