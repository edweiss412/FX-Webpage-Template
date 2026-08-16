import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { BaselineNotGreenError } from "../source/oracle";
import { MutantRunInfraError, type MutantOutcome, type RunResult } from "../source/runner";
import {
  accountOutcomes,
  applyEdits,
  buildManifest,
  classifyChild,
  killsMutant,
  reportEvidence,
  type ReportEvidence,
} from "./mutate";
import {
  browserSiteId,
  validateBrowserSurface,
  type BrowserGuardSurface,
  type DecidingSuite,
  type ExplicitMutant,
} from "./registry";

/**
 * The browser-mutant runner (spec §3.3).
 *
 * SERIAL by design, like the vitest runner (`tests/mutation/source/runner.ts:13`)
 * and for one more reason besides: every playwright child overwrites the same
 * untracked json report, and this runner DEPENDS on that report per child as its
 * execution evidence (spec §3.4, limit §8.3). Parallelising the mutant loop
 * without redesigning the report plumbing would make every verdict unreliable.
 *
 * Mutant text lives in `mkdtempSync` scratch directories and is served from
 * memory by the overlay layers; tracked source files are never written, so a
 * crashed or killed run cannot leave a mutant on disk.
 */

/** The standalone config's json report, relative to the repo root. */
const REPORT = join("test-results", "standalone-report.json");

const OVERLAY_CONFIG = "tests/mutation/browser/vitestOverlay.config.ts";

/** The overlay-liveness sentinel every overlay layer writes after validating. */
export const sentinelPath = (manifestPath: string): string => `${manifestPath}.ok`;

/**
 * Cheap suites first.
 *
 * A vitest child costs seconds; a playwright child costs a browser boot plus an
 * esbuild bundle and a Tailwind compile. Short-circuiting on the first kill only
 * pays if the cheap suites run first — payload #17 is killed by the vitest suite
 * alone, so this ordering saves a full browser boot on that mutant every run.
 */
export function orderSuites(suites: readonly DecidingSuite[]): DecidingSuite[] {
  return [
    ...suites.filter((s) => s.kind === "vitest"),
    ...suites.filter((s) => s.kind === "playwright"),
  ];
}

/** The exact child invocation for a suite. Pure, so the argv itself is pinnable. */
export function childCommand(suite: DecidingSuite): { file: string; args: string[] } {
  // Through `pnpm exec`, exactly as the existing harness spawns vitest
  // (tests/mutation/source/childRun.ts:18): the `node_modules/.bin/*` entries
  // are shell shims and are never handed to `process.execPath`.
  return suite.kind === "playwright"
    ? {
        file: "pnpm",
        args: [
          "exec",
          "playwright",
          "test",
          "--config",
          suite.config,
          suite.filter,
          "--project",
          suite.project,
        ],
      }
    : {
        file: "pnpm",
        args: ["exec", "vitest", "run", "--config", OVERLAY_CONFIG, suite.path],
      };
}

export type BaselineResult = {
  label: string;
  /** `null` means the child produced no numeric status: a signal, an OOM, a spawn failure. */
  exitStatus: number | null;
  /** Executed test count where the kind reports one; `null` where it does not. */
  executed: number | null;
};

/**
 * The baseline must be green AND must have run something.
 *
 * Green-but-empty is the no-tests trap: a playwright filter or project resolving
 * zero tests exits 0, and every mutant would then run nothing and score
 * SURVIVED — a perfect-looking score for a surface nothing tested.
 */
export function assertBrowserBaseline(surfaceId: string, results: readonly BaselineResult[]): void {
  for (const result of results) {
    if (result.exitStatus === null) {
      throw new MutantRunInfraError(`${surfaceId} baseline [${result.label}]`, null, undefined);
    }
    if (result.exitStatus !== 0) {
      throw new BaselineNotGreenError(`${surfaceId} baseline [${result.label}]`);
    }
    if (result.executed !== null && result.executed === 0) {
      throw new Error(
        `${surfaceId} baseline [${result.label}]: exited 0 but executed 0 tests. ` +
          `A suite selector that resolves no tests would score every mutant SURVIVED, ` +
          `reporting a perfect-looking run of a surface nothing tested.`,
      );
    }
  }
}

/** A suite's label in run output and error messages. */
const suiteLabel = (suite: DecidingSuite): string =>
  suite.kind === "playwright" ? `playwright:${suite.filter}` : `vitest:${basename(suite.path)}`;

type ChildRun = { exitStatus: number | null; report?: ReportEvidence };

/**
 * Spawn ONE suite child.
 *
 * `env` carries the mode's single variable; the caller passes it unset for the
 * baseline. For the playwright kind the previous run's report is deleted first
 * and re-read after, so "tests ran" is evidence from THIS child rather than an
 * artefact of an earlier one.
 */
function runChild(root: string, suite: DecidingSuite, manifestPath: string | null): ChildRun {
  const { file, args } = childCommand(suite);
  const reportPath = join(root, REPORT);
  if (suite.kind === "playwright") rmSync(reportPath, { force: true });

  const spawnedAt = Date.now();
  let exitStatus: number | null;
  try {
    execFileSync(file, args, {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
      env: {
        ...process.env,
        ...(manifestPath ? { MUTATION_OVERLAY_MANIFEST: manifestPath } : {}),
      },
    });
    exitStatus = 0;
  } catch (e) {
    const err = e as { status?: number | null };
    exitStatus = typeof err.status === "number" ? err.status : null;
  }

  return suite.kind === "playwright"
    ? { exitStatus, report: reportEvidence({ path: reportPath, spawnedAt }) }
    : { exitStatus };
}

/** Write one mutant's files and its manifest into a fresh scratch directory. */
function stageMutant(
  root: string,
  mutant: ExplicitMutant,
): { scratch: string; manifestPath: string } {
  const targets = [...new Set(mutant.edits.map((e) => resolve(root, e.file)))];
  const sources = new Map(targets.map((t) => [t, readFileSync(t, "utf8")]));
  const edits = mutant.edits.map((e) => ({ ...e, file: resolve(root, e.file) }));
  const mutated = applyEdits(sources, edits);

  const scratch = mkdtempSync(join(tmpdir(), "fx-browser-mutant-"));
  const entries = [...mutated.entries()].map(([target, text], i) => {
    // Same extension as the target: esbuild picks its loader from it, and
    // Tailwind's `@source` scan (spec §3.2) reads the file by extension too.
    const dot = basename(target).lastIndexOf(".");
    const ext = dot === -1 ? "" : basename(target).slice(dot);
    const mutantFile = join(scratch, `${i}-${basename(target, ext)}${ext}`);
    writeFileSync(mutantFile, text, "utf8");
    return { target, mutant: mutantFile };
  });

  const manifestPath = join(scratch, "manifest.json");
  writeFileSync(manifestPath, buildManifest(entries), "utf8");
  return { scratch, manifestPath };
}

/**
 * Run every declared suite against ONE staged mutant and return its verdict.
 *
 * KILLED as soon as any suite rejects it; SURVIVED only when every suite ran,
 * observed the mutant (sentinel present, and for playwright a fresh report with
 * executed tests), and passed. Anything else throws — a fabricated kill or a
 * fabricated survival are both worse than a loud abort.
 */
function runMutant(
  root: string,
  surface: BrowserGuardSurface,
  mutant: ExplicitMutant,
): "KILLED" | "SURVIVED" {
  const { scratch, manifestPath } = stageMutant(root, mutant);
  try {
    for (const suite of orderSuites(surface.suites)) {
      // Deleted BEFORE the child, so a present sentinel afterwards is this
      // child's overlay validating rather than a previous child's leftover.
      rmSync(sentinelPath(manifestPath), { force: true });
      const { exitStatus, report } = runChild(root, suite, manifestPath);
      const verdict = classifyChild({
        kind: suite.kind,
        sentinelPresent: existsSync(sentinelPath(manifestPath)),
        exitStatus,
        // Spread rather than pass `undefined`: under exactOptionalPropertyTypes
        // an absent property and a present-but-undefined one are different
        // types, and the vitest kind genuinely has no report.
        ...(report ? { report } : {}),
      });
      if (typeof verdict === "object") {
        // The imported class, never subclassed: it is the type the harness
        // treats as fatal, and the specific cause rides in the context string.
        throw new MutantRunInfraError(
          `${surface.id}:${browserSiteId(mutant)} [${suiteLabel(suite)}] — ${verdict.infra}`,
          null,
          undefined,
        );
      }
      if (killsMutant(verdict)) return "KILLED";
    }
    return "SURVIVED";
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function runBrowserSurface(root: string, surface: BrowserGuardSurface): RunResult {
  const problems = validateBrowserSurface(surface);
  if (problems.length > 0) {
    throw new Error(
      `browser surface ${surface.id} failed validation; no child was spawned:\n  ` +
        problems.join("\n  "),
    );
  }

  // Baseline FIRST, unmutated: against an already-red suite every mutant scores
  // KILLED and the run would report a meaningless perfect score.
  assertBrowserBaseline(
    surface.id,
    orderSuites(surface.suites).map((suite) => {
      const { exitStatus, report } = runChild(root, suite, null);
      return { label: suiteLabel(suite), exitStatus, executed: report ? report.executed : null };
    }),
  );

  const outcomes: MutantOutcome[] = surface.mutants.map((mutant) => ({
    siteId: browserSiteId(mutant),
    verdict: runMutant(root, surface, mutant),
  }));

  return accountOutcomes({ surfaceId: surface.id, baselineGreen: true, outcomes });
}

/**
 * Run the surface's liveness control under the identical per-mutant procedure.
 *
 * A control no suite kills means a dead overlay or a dead suite — and a harness
 * whose overlay silently failed reports a PERFECT score with every other gate
 * condition still passing.
 */
export function runBrowserControl(
  root: string,
  surface: BrowserGuardSurface,
): "KILLED" | "SURVIVED" {
  return runMutant(root, surface, surface.control);
}
