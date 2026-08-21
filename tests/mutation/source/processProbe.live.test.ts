import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../../_shared/premise";
import { CONTROL_SURFACE } from "./fixtures/processProbe/surface";
import { FLIP_AT_RUN, STATE_DIR_ENV } from "./fixtures/processProbe/state";
import { generateMutants } from "./generate";
import { siteId } from "./operators";
import { DEFAULT_RECORD_DIR } from "./records";
import { GUARD_SURFACES, type GuardSurface } from "./registry";
import { runMutantRecorded, runSurface } from "./runner";
import { type TrialPlan, makeParentDeps, observeTrial, resolveTarget } from "./processProbe";

/**
 * The LIVE half: real child processes, real vitest children, real disk.
 *
 * Env-gated out of the fast suite (`RUN_PROCESS_PROBE_LIVE=1`, the
 * `build-artifact-gate` precedent) because each case spawns a child that itself
 * spawns one vitest per declared suite. The gate is a NAMED, runnable command,
 * not a skip nobody can reach.
 *
 * Everything here is verification, not a red-then-green contract: every
 * production surface it exercises is built by the in-process tasks, so an
 * authored red would fail for a test-local reason. What it owes instead is that
 * every claim is PROVEN ABLE TO FAIL — each is paired with a named perturbation
 * observed red and restored (see the probe record).
 */
const RUN = process.env.RUN_PROCESS_PROBE_LIVE === "1";

const REPO_ROOT = resolve(__dirname, "../../..");
const CHILD = ["pnpm", "exec", "tsx", "scripts/mutation-process-probe-child.ts", "--invocation"];

const scratchRoot = RUN ? mkdtempSync(join(tmpdir(), "fx-probe-live-")) : "";
afterAll(() => {
  if (scratchRoot !== "") rmSync(scratchRoot, { recursive: true, force: true });
});

let trialSeq = 0;
const nextScratch = (label: string): string => {
  trialSeq += 1;
  return join(scratchRoot, `${label}-${trialSeq}`);
};

type LiveOptions = {
  surfaceId: string;
  site: string;
  surfaces?: readonly GuardSurface[];
  prefix?: readonly string[];
  env?: Record<string, string>;
  label: string;
};

const liveTrial = (options: LiveOptions) => {
  const resolved = resolveTarget({
    root: REPO_ROOT,
    surfaceId: options.surfaceId,
    site: options.site,
    ...(options.surfaces === undefined ? {} : { surfaces: options.surfaces }),
  });
  if (resolved.kind === "refusal") {
    throw new Error(`live fixture did not resolve: ${resolved.input} — ${resolved.detail}`);
  }
  const prefix = options.prefix ?? [];
  const plan: TrialPlan = {
    arm: "A",
    kind: prefix.length === 0 ? "isolated" : "shuffled",
    seed: 20260821,
    index: trialSeq,
    surfaceId: options.surfaceId,
    targetSiteId: options.site,
    prefix,
    position: prefix.length + 1,
  };
  const scratch = nextScratch(options.label);
  const deps = makeParentDeps({
    root: REPO_ROOT,
    scratchDir: scratch,
    surfaceId: options.surfaceId,
    siteId: options.site,
  });
  const outcome = observeTrial(plan, resolved.target, deps, {
    argv: CHILD,
    env: options.env ?? {},
    cwd: REPO_ROOT,
  });
  return { outcome, deps, scratch, target: resolved.target };
};

describe.skipIf(!RUN)("processProbe LIVE — real children (AC-2, AC-4, AC-5, AC-6)", () => {
  it(
    "AC-2: N trials yield N DISTINCT parent-observed pids, each equal to its child's self-report",
    { timeout: 600_000 },
    () => {
      const pids: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const { outcome } = liveTrial({
          surfaceId: CONTROL_SURFACE.id,
          site: controlSite("gate"),
          surfaces: [CONTROL_SURFACE],
          env: { [STATE_DIR_ENV]: nextScratch("state") },
          label: "pid",
        });
        if (outcome.kind === "refusal") {
          throw new Error(`trial refused: ${outcome.input} — ${outcome.detail}`);
        }
        expect(outcome.observation.parentPid).toBe(outcome.observation.report.childPid);
        pids.push(outcome.observation.parentPid);
      }
      premise("more than one trial ran, so distinctness is a real claim", pids.length, 1);
      expect(new Set(pids).size).toBe(pids.length);
    },
  );

  it(
    "AC-4: a SHARED state scope reports the flip at the authored index, decided by suite 2",
    { timeout: 900_000 },
    () => {
      const shared = nextScratch("shared-state");
      const verdicts: string[] = [];
      const decidingSuites: string[] = [];
      for (let trial = 0; trial < 3; trial += 1) {
        const { outcome } = liveTrial({
          surfaceId: CONTROL_SURFACE.id,
          site: controlSite("gate"),
          surfaces: [CONTROL_SURFACE],
          env: { [STATE_DIR_ENV]: shared },
          label: "shared",
        });
        if (outcome.kind === "refusal") {
          throw new Error(`trial refused: ${outcome.input} — ${outcome.detail}`);
        }
        const target = outcome.observation.report.steps.find((s) => s.role === "target");
        if (target === undefined) throw new Error("no target step in the report");
        verdicts.push(target.verdict);
        decidingSuites.push((target.children.at(-1)?.suite ?? "none") as string);
        // Both children present on the flipping trial: suite 1 exits 0, suite 2
        // decides. The flip is attributably suite 2's, not "some flip".
        if (target.verdict === "KILLED") {
          expect(target.children).toHaveLength(2);
          expect(target.children[0]?.exitCode).toBe(0);
          expect(target.children[1]?.exitCode).not.toBe(0);
        }
      }
      // Each trial runs suite 2 twice (baseline + mutant), so a shared scope
      // reaches FLIP_AT_RUN during trial 3. The RULE that decided is the run
      // index, asserted here as the index of the flipping trial rather than as
      // "at least one flip somewhere".
      const flipTrial = verdicts.indexOf("KILLED");
      expect(flipTrial).toBe(Math.ceil(FLIP_AT_RUN / 2) - 1);
      expect(decidingSuites[flipTrial]).toContain("suite2");
    },
  );

  it(
    "AC-4: a FRESH state scope per trial reports STABLE across the same trial count",
    { timeout: 900_000 },
    () => {
      const verdicts: string[] = [];
      for (let trial = 0; trial < 3; trial += 1) {
        const { outcome } = liveTrial({
          surfaceId: CONTROL_SURFACE.id,
          site: controlSite("gate"),
          surfaces: [CONTROL_SURFACE],
          env: { [STATE_DIR_ENV]: nextScratch("fresh-state") },
          label: "fresh",
        });
        if (outcome.kind === "refusal") {
          throw new Error(`trial refused: ${outcome.input} — ${outcome.detail}`);
        }
        verdicts.push(
          outcome.observation.report.steps.find((s) => s.role === "target")?.verdict ?? "none",
        );
      }
      premiseHolds(
        "the same trial count that flipped under a shared scope was run",
        verdicts.length === 3,
      );
      expect(new Set(verdicts)).toEqual(new Set(["SURVIVED"]));
    },
  );

  it(
    "AC-4: a PREFIX-BEARING trial's deterministically-killed prefix mutant comes back KILLED",
    { timeout: 900_000 },
    () => {
      // The prefix mutant is decided by suite BYTES alone, with no state
      // dependence on that path. An implementation that skips the prefix writes
      // and emits planned-text receipts passes every sha check and reports this
      // SURVIVED — no receipt check can catch that, and this behavioural
      // assertion is what does.
      const { outcome } = liveTrial({
        surfaceId: CONTROL_SURFACE.id,
        site: controlSite("gate"),
        surfaces: [CONTROL_SURFACE],
        prefix: [controlSite("always")],
        env: { [STATE_DIR_ENV]: nextScratch("prefix-state") },
        label: "prefix",
      });
      if (outcome.kind === "refusal") {
        throw new Error(`trial refused: ${outcome.input} — ${outcome.detail}`);
      }
      const prefixStep = outcome.observation.report.steps.find((s) => s.role === "prefix");
      if (prefixStep === undefined) throw new Error("no prefix step in the report");
      expect(prefixStep.verdict).toBe("KILLED");
    },
  );

  it(
    "AC-5: spawnBounded trial verdicts agree with the shipped runSurface, whole surface",
    { timeout: 1_800_000 },
    () => {
      const surface = GUARD_SURFACES.find((s) => s.id === "spawnBounded");
      if (surface === undefined) throw new Error("spawnBounded is not enrolled");
      // The literal AC form — the SHIPPED whole-surface run — on the surface
      // where it is affordable: 12 mutants at ~1.19 s each.
      const shipped = runSurface(REPO_ROOT, surface);
      premise("the shipped run produced outcomes to agree with", shipped.outcomes.length, 0);
      const first = shipped.outcomes[0];
      if (first === undefined) throw new Error("no outcome to compare");
      const { outcome } = liveTrial({
        surfaceId: surface.id,
        site: first.siteId,
        label: "agree-spawnBounded",
      });
      if (outcome.kind === "refusal") {
        throw new Error(`trial refused: ${outcome.input} — ${outcome.detail}`);
      }
      const target = outcome.observation.report.steps.find((s) => s.role === "target");
      expect(target?.verdict).toBe(first.verdict);
    },
  );

  it(
    "AC-5: premiseScan trial agrees with the shipped per-mutant call, with the suite sequence",
    { timeout: 1_800_000 },
    () => {
      const surface = GUARD_SURFACES.find((s) => s.id === "premiseScan");
      if (surface === undefined) throw new Error("premiseScan is not enrolled");
      premise(
        "premiseScan really is the MULTI-suite surface this case needs",
        surface.suitePaths.length,
        1,
      );

      // DELIBERATE, DECLARED DEVIATION from the AC's literal `runSurface` form,
      // taken on cost and reported to the orchestrator rather than folded in
      // silently. `runSurface` on this surface is 170 mutants x ~3.09 s ~= 9
      // minutes of a TWO-slot machine shared by five arcs, and the comparison it
      // would provide for the ONE site trialled here is computed by
      // `runMutantRecorded` — the exact call `runSurface` makes per mutant
      // (`runner.ts`, inside its mutant loop). The literal whole-surface form is
      // asserted on spawnBounded above; what premiseScan is here FOR is the
      // multi-suite per-child sequence, which needs one mutant, not 170.
      const source = readFileSync(surface.sourcePath, "utf8");
      const generated = generateMutants(surface.sourcePath, source, surface.operators);
      const first = generated.mutants[0];
      if (first === undefined) throw new Error("premiseScan generated no mutants");
      const site = siteId(first.site);

      const scratch = nextScratch("shipped-premise");
      mkdirSync(scratch, { recursive: true });
      const mutantFile = join(scratch, "mutant.ts");
      writeFileSync(mutantFile, first.text, "utf8");
      const shipped = runMutantRecorded(
        REPO_ROOT,
        resolve(REPO_ROOT, surface.sourcePath),
        mutantFile,
        surface.suitePaths,
        site,
      );

      const { outcome } = liveTrial({ surfaceId: surface.id, site, label: "agree-premiseScan" });
      if (outcome.kind === "refusal") {
        throw new Error(`trial refused: ${outcome.input} — ${outcome.detail}`);
      }
      const target = outcome.observation.report.steps.find((s) => s.role === "target");
      expect(target?.exitCode).toBe(shipped.code);

      // The per-child suite sequence must be the registry row's `suitePaths`
      // prefix the short-circuit implies. A `suitePaths[0]`-only reimplementation
      // agrees on every single-suite surface and mis-scores any mutant a LATER
      // suite decides.
      const suites = (target?.children ?? []).map((c) => c.suite);
      expect(surface.suitePaths.slice(0, suites.length)).toEqual(suites);
      expect(suites).toEqual(shipped.children.map((c) => c.suite));
    },
  );

  it(
    "AC-6: a real trial's records land in the redirect, and the DEFAULT directory is unchanged",
    { timeout: 900_000 },
    () => {
      const before = existsSync(DEFAULT_RECORD_DIR) ? readdirSync(DEFAULT_RECORD_DIR).sort() : [];
      const redirect = nextScratch("records");
      const { outcome } = liveTrial({
        surfaceId: CONTROL_SURFACE.id,
        site: controlSite("gate"),
        surfaces: [CONTROL_SURFACE],
        env: { [STATE_DIR_ENV]: nextScratch("rec-state"), MUTATION_RECORD_DIR: redirect },
        label: "records",
      });
      if (outcome.kind === "refusal") {
        throw new Error(`trial refused: ${outcome.input} — ${outcome.detail}`);
      }
      // `recordDir` reads the CHILD's environment, so a spawner that omits the
      // override from the child env writes PRODUCTION records into the gate's
      // own channel while every in-process pair stays green. This case is the
      // one that can see it.
      const landed = existsSync(redirect) ? readdirSync(redirect) : [];
      premise("the trial wrote at least one record, so isolation has a subject", landed.length, 0);
      const after = existsSync(DEFAULT_RECORD_DIR) ? readdirSync(DEFAULT_RECORD_DIR).sort() : [];
      expect(after).toEqual(before);
    },
  );
});

/** The control surface's two site ids, taken from the SHIPPED generator. */
function controlSite(which: "gate" | "always"): string {
  const source = readFileSync(CONTROL_SURFACE.sourcePath, "utf8");
  const generated = generateMutants(CONTROL_SURFACE.sourcePath, source, CONTROL_SURFACE.operators);
  const needle = which === "gate" ? "n <= 3" : "n <= 100";
  const mutant = generated.mutants.find((m) => m.text.includes(needle));
  if (mutant === undefined) {
    throw new Error(
      `the control surface no longer generates a ${which} mutant containing ${needle}; ` +
        `saw ${generated.mutants.map((m) => siteId(m.site)).join(", ")}`,
    );
  }
  return siteId(mutant.site);
}
