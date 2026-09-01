import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateMutants } from "./generate";
import { type Verdict, assertCleanBaseline, classify } from "./oracle";
import { enumerateSites, siteId } from "./operators";
import type { GuardSurface } from "./registry";
import { MUTANT_TIMEOUT_MS, spawnBounded } from "./spawnBounded";

/**
 * The bounded-spawn mechanism and its wall-clock ceiling live in
 * `./spawnBounded`, shared with `./childRun`. Re-exported here because both
 * were part of this module's public surface before the split and its consumers
 * import them from it.
 */
export { MUTANT_TIMEOUT_MS, WATCHDOG_ARGV } from "./spawnBounded";

/**
 * The per-mutant runner (spec §3.3/§3.4).
 *
 * Serial by design (spec R6 / limit L-4): one `vitest` child per mutant, ~0.75 s
 * each, 102 mutants on the first enrolled surface.
 *
 * The mutant is written to a TEMP directory and served to Vite from memory by
 * the overlay's `load` hook. The tracked source file is never written, so a
 * crashed or killed run cannot leave a mutant on disk.
 */
/**
 * One record per suite-child ACTUALLY EXECUTED, in execution order.
 *
 * Kinds are named for what was OBSERVED, never for what it was interpreted to
 * mean: `exit` and `timeout` mirror `SpawnOutcome`. An `infra` kind does not
 * appear because that path THROWS and is fatal to the run.
 *
 * A `kind: "exit"` record certifies THAT the child exited non-zero and cannot
 * certify WHY — child stdio is discarded by design against a 1 MB `maxBuffer`
 * cliff, so an assertion rejection, a compile failure and a collection failure
 * are ONE category (design §6 limit 7).
 */
export type ChildRecord = {
  suite: string;
  kind: "exit" | "timeout";
  /** `null` iff `kind === "timeout"` — a timed-out child produced no status. */
  exitCode: number | null;
  durationMs: number;
};

/**
 * EVERY child, not a `decidedBy` summary.
 *
 * `runMutantRecorded` short-circuits on the first non-zero, so the deciding
 * child is DERIVABLE — it is the last one — while the reverse is not true.
 * Recording all of them also makes a SURVIVOR attributable (every suite returned
 * 0, and here is how long each took), which a summary field cannot express.
 */
export type MutantOutcome = {
  siteId: string;
  verdict: Verdict;
  /**
   * OPTIONAL, and the reason is a measured constraint rather than a preference.
   *
   * Making it required forces an edit to `tests/mutation/browser/mutate.test.ts`,
   * which constructs `MutantOutcome` fixtures and is the SOLE deciding suite of
   * the enrolled `browserMutate` surface (floor 1) — so a required field would
   * RETIRE that surface's score, which rule 27 grants no test-side exception to,
   * and would falsify this design's claim that no enrolled score is retired.
   *
   * The strength a required field would buy is bought instead by ASSERTION:
   * AC-4 pins `runSurface`'s children by deep equality over the whole array, so
   * a producer that silently omitted them fails a test rather than a type check.
   * The browser runner genuinely has no per-suite children — it drives Playwright
   * directly rather than spawning one vitest child per declared suite — so
   * absence there is the honest value, not an omission.
   */
  children?: readonly ChildRecord[];
};

export type RunResult = {
  surfaceId: string;
  mutantCount: number;
  noOps: string[];
  baselineGreen: boolean;
  killed: number;
  survivors: string[];
  outcomes: MutantOutcome[];
};

const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";

/**
 * The exit code a timed-out run reports.
 *
 * 124 is `timeout(1)`'s convention; all that matters mechanically is non-zero,
 * which `classify` reads as KILLED. That is the right verdict and the standard
 * one (Stryker and PIT both count a timeout as detected): a mutant that stops
 * the guard terminating cannot ship silently, because the suite never goes green
 * again. It is detection by a different mechanism, not a missed mutant.
 */
export const MUTANT_TIMEOUT_EXIT = 124;

/**
 * A child that produced NO numeric exit status — a signal death, an OOM kill, or
 * a spawn failure.
 *
 * This is fatal to the run, and deliberately NOT folded into `KILLED`. A compile
 * failure is a real non-zero exit from a real process and legitimately counts as
 * detection (limit L-3); a signalled death is the HARNESS failing, and scoring it
 * as detection inflates the score with a kill the suite never earned. On this
 * machine that is not hypothetical — an idle-process reaper has been observed
 * SIGTERM-ing long-running children
 * (`docs/agents/codex-silent-death-2026-07-24.md`).
 */
export class MutantRunInfraError extends Error {
  constructor(
    readonly context: string,
    readonly signal: NodeJS.Signals | null,
    readonly code: string | undefined,
  ) {
    super(
      `mutation run produced no exit status for ${context} ` +
        `(signal=${signal ?? "none"}, code=${code ?? "none"}). ` +
        `This is an infrastructure fault, not a KILLED mutant — scoring it as detection ` +
        `would inflate the mutation score with a kill the suite never earned.`,
    );
    this.name = "MutantRunInfraError";
  }
}

/**
 * Run one suite with `mutantFile` overlaid.
 *
 * Returns the numeric exit code, or throws `MutantRunInfraError` when the child
 * died without one.
 */
export function runSuiteRecorded(
  root: string,
  target: string,
  mutantFile: string,
  suite: string,
  context: string,
  /**
   * The wall-clock ceiling for THIS child, defaulting to the shared constant so
   * every existing call site is unchanged BY CONSTRUCTION.
   *
   * It is a parameter rather than the constant it defaults to, and that is the
   * whole reason the timeout arm is testable: with the ceiling hardcoded, no
   * test could reach that branch without a real 180-second hang, so the arm read
   * as protection while being unreachable code.
   */
  timeoutMs: number = MUTANT_TIMEOUT_MS,
  /**
   * Appended to the child's argv, and EMPTY by default so the per-mutant path is
   * unchanged BY CONSTRUCTION rather than by review. Only the control path passes
   * anything, because only it needs a report, and it runs once per surface while
   * the per-mutant path runs once per mutant.
   */
  extraArgs: readonly string[] = [],
): { code: number; record: ChildRecord } {
  const env = {
    ...process.env,
    MUTATION_ROOT: root,
    MUTATION_TARGET: target,
    MUTATION_MUTANT: mutantFile,
    MUTATION_SUITE: suite,
  };
  // A timeout kill and this machine's idle-process reaper arrive in the SAME
  // shape — no exit status, a signal — so the code is the only thing that tells
  // them apart, and they must not share a verdict. The reaper steals a run that
  // would have finished, and folding it into KILLED would score a kill the suite
  // never earned; a timeout is the mutant's own doing (see MUTANT_TIMEOUT_EXIT).
  // The group reap on the timeout and infra arms runs inside `spawnBounded`.
  const startedAt = Date.now();
  const { outcome } = spawnBounded(["pnpm", ...CHILD_ARGS, ...extraArgs], {
    cwd: root,
    env,
    timeoutMs,
  });
  const durationMs = Date.now() - startedAt;
  if (outcome.kind === "timeout") {
    return {
      code: MUTANT_TIMEOUT_EXIT,
      record: { suite, kind: "timeout", exitCode: null, durationMs },
    };
  }
  if (outcome.kind === "exit") {
    return {
      code: outcome.code,
      record: { suite, kind: "exit", exitCode: outcome.code, durationMs },
    };
  }
  throw new MutantRunInfraError(`${context} [${suite}]`, outcome.signal, outcome.code);
}

/** The exit code alone, for callers that record nothing (`runControl`). */
export function runSuite(
  root: string,
  target: string,
  mutantFile: string,
  suite: string,
  context: string,
  timeoutMs: number = MUTANT_TIMEOUT_MS,
  extraArgs: readonly string[] = [],
): number {
  return runSuiteRecorded(root, target, mutantFile, suite, context, timeoutMs, extraArgs).code;
}

const CHILD_ARGS = ["exec", "vitest", "run", "--config", CONFIG] as const;

/**
 * Run EVERY declared suite; the mutant is KILLED if any of them rejects it.
 *
 * Short-circuits on the first rejection: later suites cannot change the verdict
 * and each costs a full vitest boot. Running only `suitePaths[0]` would report a
 * mutant killed solely by a later suite as SURVIVED — a wrong verdict, and a
 * silent contradiction of the plural registry contract in spec §3.7.
 *
 * The short-circuit is also what makes `children.at(-1)` THE DECIDING CHILD. A
 * version that ran on after a kill would record children AFTER the deciding
 * event and could attach a later timeout to a verdict already settled.
 */
export function runMutantRecorded(
  root: string,
  target: string,
  mutantFile: string,
  suites: readonly string[],
  context: string,
  timeoutMs: number = MUTANT_TIMEOUT_MS,
): { code: number; children: ChildRecord[] } {
  const children: ChildRecord[] = [];
  for (const suite of suites) {
    const { code, record } = runSuiteRecorded(root, target, mutantFile, suite, context, timeoutMs);
    children.push(record);
    if (code !== 0) return { code, children };
  }
  return { code: 0, children };
}

export function runSurface(root: string, surface: GuardSurface): RunResult {
  const target = resolve(root, surface.sourcePath);
  const text = readFileSync(target, "utf8");
  const scratch = mkdtempSync(join(tmpdir(), "fx-mutation-"));
  const mutantFile = join(scratch, "mutant.ts");

  try {
    // Baseline FIRST, across EVERY suite: against an already-red suite every
    // mutant scores KILLED and the run would report a meaningless perfect score.
    writeFileSync(mutantFile, text);
    assertCleanBaseline(
      runMutantRecorded(root, target, mutantFile, surface.suitePaths, `${surface.id} baseline`)
        .code,
      surface.suitePaths.join(", "),
      surface.id,
    );

    const sites = enumerateSites(target, text, surface.operators);
    const { mutants, noOps } = generateMutants(target, text, surface.operators, sites);

    const outcomes: MutantOutcome[] = [];
    for (const m of mutants) {
      const id = siteId(m.site);
      writeFileSync(mutantFile, m.text);
      const { code, children } = runMutantRecorded(
        root,
        target,
        mutantFile,
        surface.suitePaths,
        id,
      );
      outcomes.push({ siteId: id, verdict: classify(code), children });
    }

    return {
      surfaceId: surface.id,
      mutantCount: mutants.length,
      noOps,
      baselineGreen: true,
      killed: outcomes.filter((o) => o.verdict === "KILLED").length,
      survivors: outcomes.filter((o) => o.verdict === "SURVIVED").map((o) => o.siteId),
      outcomes,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Read one child's JSON report, or say plainly that there was none.
 *
 * A missing, unreadable or unparseable file is `reportRead: false` rather than a
 * throw: a child that died before writing is exactly the case this exists to
 * REPORT, and turning it into an exception would put it back in the same bucket
 * as an infrastructure fault.
 *
 * A missing counter reads as zero, which is the conservative direction: a report
 * whose shape changed under a vitest upgrade is reported DARK rather than
 * silently counted as a suite that ran and found nothing.
 */
function readControlReport(path: string): {
  reportRead: boolean;
  totalTests: number;
  failedTests: number;
} {
  try {
    const r = JSON.parse(readFileSync(path, "utf8")) as {
      numTotalTests?: unknown;
      numFailedTests?: unknown;
    };
    const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return {
      reportRead: true,
      totalTests: num(r.numTotalTests),
      failedTests: num(r.numFailedTests),
    };
  } catch {
    return { reportRead: false, totalTests: 0, failedTests: 0 };
  }
}

/**
 * What a control child was OBSERVED to do, per declared suite.
 *
 * `reportRead` is FALSE for a child that wrote nothing at all, which is a
 * different fact from one that wrote a report saying zero tests ran. Both are
 * dark, and keeping them apart is what lets the message name the right cause.
 */
export type ControlObservation = {
  suite: string;
  reportRead: boolean;
  totalTests: number;
  failedTests: number;
  exitCode: number;
};

/**
 * The control's verdict, as three kinds rather than one number.
 *
 * THE FAIL-OPEN THIS REPLACES, measured against this repo's own overlay config on
 * 2026-09-01 rather than imagined:
 *
 *   a suite that rejected the mutant     numTotalTests 60  numFailedTests 1  exit 1
 *   a suite that ran and did not notice  numTotalTests 60  numFailedTests 0  exit 0
 *   a child that collected NOTHING       numTotalTests  0  numFailedTests 0  exit 1
 *
 * The previous version returned the exit code and AC-3 asserted it was not 0. The
 * third row exits NON-ZERO, so a mistyped `suitePaths` entry, a collection
 * failure, a dead overlay and an OOM all read as "the suite noticed" and
 * certified an overlay liveness the run never earned. The second row is the
 * other half: it reported as "the suite did not notice", which reads as a dead
 * overlay, and sent two nights of triage at the wrong surface when the honest
 * answer was that the registry's declared control was simply not killed.
 *
 * A dark suite OUTRANKS a clean one. A two-suite surface whose second child never
 * ran would otherwise be reported as "did not notice" while half the evidence was
 * missing.
 */
export type ControlVerdict =
  | { kind: "noticed"; observations: ControlObservation[] }
  | { kind: "ran-clean"; observations: ControlObservation[] }
  | { kind: "no-observations"; observations: ControlObservation[]; dark: string[] };

/**
 * Run ONE hand-written mutant against a surface's suites and report what each
 * child was observed to do.
 *
 * The liveness control needs this because the declared operator set cannot
 * synthesize an arbitrary edit, and the control's whole point is an edit a
 * human chose BECAUSE the suite must obviously notice it. The version this
 * replaces computed the mutant text and then never ran it, so it asserted only
 * that a string occurred in a file; the version after that ran it and read only
 * the exit code, which is the fail-open documented above.
 */
export function runControl(
  root: string,
  surface: GuardSurface,
  mutantText: string,
): ControlVerdict {
  const dir = mkdtempSync(join(tmpdir(), "mutation-control-"));
  try {
    const mutantFile = join(dir, "control.ts");
    writeFileSync(mutantFile, mutantText, "utf8");
    const observations: ControlObservation[] = [];
    for (const [n, suite] of surface.suitePaths.entries()) {
      const reportPath = join(dir, `report-${String(n)}.json`);
      const code = runSuite(
        root,
        resolve(root, surface.sourcePath),
        mutantFile,
        suite,
        `${surface.id}:control`,
        MUTANT_TIMEOUT_MS,
        ["--reporter=json", `--outputFile=${reportPath}`],
      );
      observations.push({ suite, exitCode: code, ...readControlReport(reportPath) });
      // Short-circuit on a NOTICED suite only. A dark or clean one says nothing
      // about the suites after it, and the verdict below needs all of them.
      if (observations.at(-1)!.failedTests > 0) break;
    }
    const dark = observations
      .filter((o) => !o.reportRead || o.totalTests === 0)
      .map((o) => o.suite);
    if (observations.some((o) => o.failedTests > 0)) return { kind: "noticed", observations };
    if (dark.length > 0) return { kind: "no-observations", observations, dark };
    return { kind: "ran-clean", observations };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
