// tests/mutation/source/surfaceCases.ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EXPECTED_LEDGER_KINDS } from "./expectedLedgerKinds";
import { type GateResult, evaluateGate } from "./gate";
import { emitRunRecord } from "./records";
import type { GuardSurface } from "./registry";
import { type ControlVerdict, type RunResult, runControl, runSurface } from "./runner";

const root = process.cwd();

/**
 * The seven per-surface gate cases, in ONE copy, called by each shard with its
 * own slice (wall-clock spec §3.2). Lifted unmodified out of the retired
 * tests/mutation/guardSurfaces.gate.test.ts.
 *
 * `runSurface` runs at MODULE scope inside describe.each -- deliberate and
 * load-bearing. It is why the gate's cost is vitest IMPORT time, and it is why a
 * shard must filter BEFORE calling this: a `describe.skip` or a filtered `it`
 * would still pay the full run during collection.
 */
/**
 * Run one surface, evaluate its gate, and EMIT its notices.
 *
 * Extracted so the emission is drivable in-process without registering a whole
 * generated gate suite, and so the emit rides on a call `registerSurfaceCases`
 * CANNOT FUNCTION WITHOUT — every one of its cases consumes the `run` and
 * `result` returned here, so deleting the call breaks them all rather than
 * silently dropping the channel. That is what makes this WIRING rather than
 * rendering: a helper the registrar could stop calling would prove nothing.
 */
/**
 * AC-3's decision, as a pure function of what the control child was observed to do.
 *
 * DOCUMENTED LIMIT, and it is the reason the `ran-clean` message names two causes rather than
 * one. A clean report does NOT establish that the overlay applied the mutant: `overlay.ts:8`
 * records that a hook failing to recognise its target falls through to clean source and every
 * case passes. So a dead overlay and a live overlay with an inadequate control produce the same
 * observations, and no arrangement of THIS function's inputs tells them apart. An earlier version
 * of this message asserted "the overlay is live", which was a liveness claim the verdict had not
 * earned -- the same defect the whole ControlVerdict exists to remove, one level up. Closing it
 * for real needs the child to report whether the hook fired, which is a change to the overlay's
 * own contract and to what every mutant run costs.
 *
 * Extracted so the decision is testable without running the registrar: its
 * generated cases live inside a `describe.each` at collection scope, so an
 * assertion about them can only be reached by running a real surface. This is
 * the same reason `lib/ci/shardBudget.ts` keeps its decision in a function and
 * its CLI in another file.
 *
 * Returns `null` when the surface passes, and otherwise a message naming the
 * cause the verdict actually establishes. THAT is the point. The version this
 * replaces said "the suite did not notice this surface's control mutant" for
 * every non-zero outcome, which reads as a dead overlay -- and on 2026-08-31 the
 * overlay was live, the control row was simply false, and two nights of triage
 * went to the wrong surface.
 */
export function controlProblem(verdict: ControlVerdict): string | null {
  if (verdict.kind === "noticed") return null;
  if (verdict.kind === "no-observations") {
    return (
      `the control child produced NO OBSERVATIONS from ${verdict.dark.join(", ")}: ` +
      `no test EXECUTED there, or its report could not be read. This says nothing about the ` +
      `control mutant either way. Causes, and this verdict does not separate them: the child ` +
      `never started; it started and collected nothing (a mistyped suitePaths entry, a ` +
      `collection failure, a name filter matching nothing); it ran and its report was missing, ` +
      `unparseable or short a counter, which is DARK by design rather than counted as zero. ` +
      `Read it as an infrastructure fault and look at the leg's log, not at the registry row`
    );
  }
  const ran = verdict.observations.map((o) => `${o.suite} (${String(o.ranTests)} tests)`);
  return (
    `every declared suite RAN and none rejected the control mutant: ${ran.join(", ")}. ` +
    `TWO causes produce this, and this verdict does not separate them: either the control row or ` +
    `the deciding suite is wrong -- the registry \`control\` names an edit no case distinguishes ` +
    `-- OR the overlay never applied the mutant at all, because a load hook that does not ` +
    `recognise its target falls through to CLEAN source and every case passes ` +
    `(tests/mutation/source/overlay.ts:8). Check the control row against the suite FIRST, since ` +
    `AC-3 runs beside AC-4 and the other surfaces on this leg; an overlay dead for every surface ` +
    `would not report only this one`
  );
}

export function evaluateSurface(
  surface: GuardSurface,
  options: { write?: (text: string) => void; root?: string; recordDir?: string } = {},
): { run: RunResult; result: GateResult } {
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const run = runSurface(options.root ?? root, surface);
  const result = evaluateGate({
    surfaceId: surface.id,
    mutantCount: run.mutantCount,
    noOps: run.noOps,
    baselineGreen: run.baselineGreen,
    killed: run.killed,
    survivors: run.survivors,
    ledger: surface.accepted,
    scoreFloor: surface.scoreFloor,
    outcomes: run.outcomes,
  });

  // Emitted at MODULE SCOPE, before any `it`, so notices appear in the leg's
  // output whether the gate passed or failed. A passing gate otherwise prints
  // NOTHING AT ALL — measured in probe 1, where a passing surface's output is
  // the empty string — and emitting only on failure would rebuild exactly the
  // CI-only, failure-only blind spot design §1.0 measures.
  for (const notice of result.notices) write(`${notice.detail}\n`);

  // The DURABLE half. Unconditional on the verdict, on the gate outcome and on
  // the environment — WHEN a record is written and WHETHER it survives are
  // independent requirements, and this module owns only the first. A write
  // failure reports on stderr and never reaches the gate (AC-14).
  // The return is deliberately NOT re-reported here: `writeRunRecord` already
  // writes the failure to stderr, and a second message on one failure is noise
  // that reads like two failures. What matters at this call site is that a
  // typed failure NEVER becomes a throw — proved on this path, not the helper's.
  void emitRunRecord({
    surfaceId: surface.id,
    passed: result.passed,
    score: result.score.value,
    outcomes: run.outcomes,
    ...(options.recordDir === undefined ? {} : { dir: options.recordDir }),
  });

  return { run, result };
}

/**
 * The registrar the seven cases are declared through.
 *
 * ONE resolution point, and the identifiers SHADOW this module's vitest imports
 * inside `registerSurfaceCases`, so the injected registrar and the production
 * default are the same code after the `??`. That is deliberate and it is the
 * repair for a defect four review rounds kept finding: any design with two
 * paths lets an implementation register seven cases on the observed one and
 * return early on the other, which is the silent drop this whole mechanism
 * exists to prevent. There is no branch for it to hide in.
 *
 * Shadowing rather than renaming, because `guardSurfaces.gates.test.ts` counts
 * bare `it(` literals in this file and expects exactly 7 -- its enrolment
 * arithmetic reads a run's surface count as `(tests - 2) / 7`. Writing
 * `registrar.it(` would zero that count and red the corpus-wide gates file,
 * which is one half of the pull-request smoke leg.
 */
export type CaseRegistrar = { describe: typeof describe; it: typeof it };
const VITEST_REGISTRAR: CaseRegistrar = { describe, it };

/** What a surface's evaluation produced, or why it produced nothing. */
type SurfaceOutcome =
  | { kind: "evaluated"; before: Buffer; run: RunResult; result: GateResult }
  | { kind: "faulted"; error: unknown };

/**
 * Evaluate one surface without letting its failure reach the caller.
 *
 * `evaluateSurface` runs at describe-callback time, which is vitest COLLECTION,
 * and a throw there aborts the whole shard file. Measured on run 32958581720:
 * leg 5 held 8 surfaces, one of them needed a database the job does not
 * provide, and SEVEN produced no gate verdict at all. The records channel pins
 * it to the exact surface -- 50 records for 52 enrolled surfaces, the two
 * absent being the surface that threw and the one after it in slice order.
 */
function evaluateSurfaceOutcome(
  surface: GuardSurface,
  options: { write?: (text: string) => void; root?: string; recordDir?: string },
): SurfaceOutcome {
  try {
    const before = readFileSync(surface.sourcePath);
    const { run, result } = evaluateSurface(surface, options);
    return { kind: "evaluated", before, run, result };
  } catch (error) {
    return { kind: "faulted", error };
  }
}

const faultText = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

export function registerSurfaceCases(
  surfaces: readonly GuardSurface[],
  options: {
    write?: (text: string) => void;
    recordDir?: string;
    register?: CaseRegistrar;
  } = {},
): void {
  const { describe, it } = options.register ?? VITEST_REGISTRAR;
  for (const surface of surfaces) {
    describe(`source-mutation gate — ${surface.id}`, () => {
      const outcome = evaluateSurfaceOutcome(surface, options);

      if (outcome.kind === "faulted") {
        // The fault reports on three channels, none asked to carry the proof
        // alone. (1) The NOTICE, through the same sink the TIMEOUT-KILL notices
        // use, emitted here at collection scope so it appears whether or not a
        // case runs. (2) The RECORD, so the leg's artifact upload is not empty
        // -- `if-no-files-found: error` is licensed by the premise that every
        // surface emits one, and leg 0 holds exactly one surface today, so a
        // faulted-only leg writing nothing would red the upload with "no files
        // found", a second red saying nothing about the cause. (3) The seven
        // cases below, registered unconditionally.
        const detail = faultText(outcome.error);
        const write = options.write ?? ((text: string) => process.stdout.write(text));
        write(
          `SURFACE-FAULT ${surface.id}: could not be evaluated -- ${detail}\n` +
            `Every other surface on this leg still reported; this one did not run.\n`,
        );
        void emitRunRecord({
          surfaceId: surface.id,
          passed: false,
          score: 0,
          outcomes: [],
          fault: `${detail} [${surface.suitePaths.join(", ")}]`,
          ...(options.recordDir === undefined ? {} : { dir: options.recordDir }),
        });
      }

      // REGISTERED UNCONDITIONALLY. No branch sits between here and the seven
      // `it(` calls, so a faulted surface contributes exactly seven cases just
      // as an evaluated one does. That keeps the gates file's `(tests - 2) / 7`
      // arithmetic exact AND makes "the fault was reported but its cases were
      // skipped" unreachable rather than merely untaken. Each body consults the
      // outcome first; a faulted surface fails all seven, and seven truthful
      // failures beat one failure plus six cases reporting green for a surface
      // that never ran.
      const faulted = outcome.kind === "faulted" ? faultText(outcome.error) : null;
      const failFault = (): never => {
        throw new Error(
          `${surface.id} could not be evaluated: ${faulted}. ` +
            `Every other surface on this leg still reported; this one did not run.`,
        );
      };
      const before = outcome.kind === "evaluated" ? outcome.before : Buffer.alloc(0);
      const run = outcome.kind === "evaluated" ? outcome.run : ({} as RunResult);
      const result = outcome.kind === "evaluated" ? outcome.result : ({} as GateResult);

      it("passes every gate condition", () => {
        if (faulted !== null) failFault();
        expect(
          result.failures.map((f) => `${f.condition}: ${f.detail}`).join("\n"),
          "gate failures",
        ).toBe("");
        expect(result.passed).toBe(true);
      });

      it("holds the exact ledger-kind counts declared for THIS surface (AC-13)", () => {
        if (faulted !== null) failFault();
        // The score floor is deliberately COARSE (spec §4.3): from the shipping
        // state it takes three further blessed gaps to breach 0.95, so the floor
        // cannot detect one or two rows silently migrating between kinds.
        // Expectations are per-surface: §4.3's numbers belong to the FIRST
        // CUSTOMER, while §3.7 enrollment is per-surface, so a legitimate second
        // surface must not be measured against taskContract's ledger.
        const kinds = surface.accepted.reduce<Record<string, number>>((acc, row) => {
          acc[row.kind] = (acc[row.kind] ?? 0) + 1;
          return acc;
        }, {});
        expect(kinds).toEqual(EXPECTED_LEDGER_KINDS[surface.id]);
      });

      it("classifies every generated mutant exactly once", () => {
        if (faulted !== null) failFault();
        // The consequence bound in one assertion: killed + survivors must account
        // for every mutant produced. A dropped outcome leaves the gate green while
        // the run tested less than it claims.
        expect(run.killed + run.survivors.length).toBe(run.mutantCount);
        expect(new Set(run.survivors).size).toBe(run.survivors.length);
        expect(run.outcomes).toHaveLength(run.mutantCount);
      });

      it("generated mutants at all, and none was a no-op", () => {
        if (faulted !== null) failFault();
        // Guards the vacuity hole from the other side: a run that silently
        // produced nothing would satisfy the ledger and floor conditions.
        expect(run.mutantCount).toBeGreaterThan(0);
        expect(run.noOps).toEqual([]);
      });

      it("scores at or above the surface's floor", () => {
        if (faulted !== null) failFault();
        expect(result.score.value).toBeGreaterThanOrEqual(surface.scoreFloor);
      });

      it("leaves the tracked source byte-identical (AC-4)", () => {
        if (faulted !== null) failFault();
        // The overlay serves mutant text from memory. If this ever fails, the
        // harness has been rewritten to patch files in place and a crashed run
        // can leave a mutant on disk.
        expect(readFileSync(surface.sourcePath).equals(before)).toBe(true);
      });

      it("kills THIS surface's own control mutant, proving the overlay is live (AC-3)", () => {
        if (faulted !== null) failFault();
        // Without this, a harness whose overlay silently failed to apply reports a
        // PERFECT score -- every mutant running against clean source -- and every
        // other assertion here still passes.
        //
        // The exit code alone could not carry this verdict. Three outcomes reach
        // one number -- a suite that rejected the mutant (exit 1), a suite that
        // ran and did not notice (exit 0), and a child that collected NOTHING
        // (exit 1, and the fail-open) -- so `runControl` reports observations and
        // `controlProblem` names which of the three happened.
        //
        // The previous version READ as if it made this assertion and did not: it
        // computed `broken`, asserted it differed from the source, and then called
        // runSurface with the surface's own operators, never passing `broken` to
        // anything. So it proved a string occurred in a file. It also hardcoded
        // taskContract's text inside this describe.each, which meant enrolling a
        // second surface red the gate.
        const source = readFileSync(surface.sourcePath, "utf8");
        // Replacer function: `control.to` is registry-AUTHORED code text, so a `$` sequence in it
        // would apply as something other than its declared text and this liveness proof would
        // then be testing bytes nobody wrote.
        const broken = source.replace(surface.control.from, () => surface.control.to);
        expect(
          broken,
          "control did not apply; validateSurface should have rejected this row",
        ).not.toBe(source);
        expect(controlProblem(runControl(root, surface, broken))).toBeNull();
        // Explicit budget, because this case SPAWNS A FULL CHILD SUITE RUN and
        // the shared 30s default is a per-test budget meant for in-process work.
        // The gate's other cases run runSurface at module scope, outside any
        // `it`, so no timeout applies to them -- this one moved inside an `it`
        // precisely so the control's verdict is asserted, and inherited a budget
        // that fits an ordinary test rather than a child vitest process. Green
        // locally at ~33s and RED on CI's slower runner, which is the whole
        // reason "real CI green" is a separate gate from "local green".
      }, 600_000);
    });
  }
}
