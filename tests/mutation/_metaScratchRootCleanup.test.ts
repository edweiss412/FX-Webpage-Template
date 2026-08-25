/**
 * Every deciding suite removes the scratch roots it creates.
 *
 * Behavioral, not a text scan: a "does this file contain `rmSync`" check is
 * satisfied by an `rmSync` for something else, and a recognizer over test
 * source grows a spelling per review round. Running the suites and looking at
 * what they left is total over the property and has nothing to widen.
 *
 * TWO child runs, not one per suite-set. Per-set spawning was 28 children for
 * a 14-set subject list, which makes a guard against a machine-load incident
 * into a heavy phase of its own. Running the whole subject list in one child
 * checks the identical property, and attribution survives because every
 * recorded root carries its producer's prefix.
 *
 * Spec: docs/superpowers/specs/ci/2026-08-24-mutation-scratch-fs-event-storm-design.md
 * Row:  BL-MUTATION-SCRATCH-FS-EVENT-STORM
 */
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "../_shared/premise";
import { familyOf, runSuiteSet, subjectFiles } from "./_scratchRootCleanupHarness";

const SUBJECTS = subjectFiles();
const families = (paths: readonly string[]) => [...new Set(paths.map(familyOf))].sort();

describe("scratch-root cleanup (BL-MUTATION-SCRATCH-FS-EVENT-STORM)", () => {
  // Unconditional and OUTSIDE any `.each`: an `.each` over an empty array
  // registers no case, so a premise inside its callback is unreachable in
  // exactly the degenerate state it exists to catch.
  it("has scratch-creating deciding suites to check", () => {
    premise("enrolled deciding suites that create scratch roots", SUBJECTS.length, 0);
  });

  // The derivation's OUTPUT is pinned, which is what makes its known blind spot
  // SURFACED instead of silent.
  //
  // `callsMkdtemp` reads callee text, so an ordinary refactor of a subject to an
  // alias, a destructured binding, or a re-exported helper would drop that file
  // out of `SUBJECTS`. The other thirteen keep the non-empty premise green,
  // neither arm ever runs the omitted file, and it could leak while this suite
  // passed. A conservative outcome nobody is told about is not a documented
  // limit — it is a hole with a comment next to it.
  //
  // With the list pinned, a file leaving the derivation fails HERE, loudly,
  // naming the file. Adding a scratch-creating deciding suite fails here too,
  // which is correct: enrolling it is the point. The pin is not the subject set
  // — `subjectFiles()` still derives that — it is a tripwire on the derivation.
  it("pins what the derivation produces, so a subject cannot leave it silently", () => {
    expect(SUBJECTS).toEqual([
      "tests/ci/_metaModalWaitCandidateV2.test.ts",
      "tests/ci/_metaModalWaitHelper.test.ts",
      "tests/cross-cutting/psqlStartupFileSuppression.test.ts",
      "tests/docs/_metaReviewRoundEconomy.test.ts",
      "tests/docs/interactionTimingScan.test.ts",
      "tests/log/mutationSurface/enumerate.test.ts",
      "tests/log/mutationSurface/totality.test.ts",
      "tests/mutation/browser/mutate.test.ts",
      "tests/mutation/browser/registry.test.ts",
      "tests/mutation/source/premiseScan.test.ts",
      "tests/mutationWeight/instrument.test.ts",
      "tests/scripts/ledgerClaimsCheck.test.ts",
      "tests/styles/_metaControlOutlineFill.test.ts",
      "tests/styles/_metaControlOutlineResidue.test.ts",
      "tests/styles/interactiveScanCore.test.ts",
    ]);
  });

  it("removes every root it creates on a passing run", { timeout: 600_000 }, () => {
    const run = runSuiteSet(SUBJECTS);
    // Exit code first: a child that fails to COLLECT creates nothing and leaves
    // nothing, which is indistinguishable from cleanliness if the only question
    // asked is "what remains".
    premiseHolds(`the subject suites ran and passed (exit ${run.exitCode})`, run.exitCode === 0);
    premise("scratch roots created during the run", run.created.length, 0);
    expect(families(run.survivors)).toEqual([]);
  });

  // The failure arm runs PER FILE, unlike the success arm above: one child with
  // an injected failure dies partway, so a single combined run would only ever
  // exercise whichever suite started first and would report the rest as covered.
  //
  // Injection is keyed to ROOTS CREATED, not to a write count. Firing on the
  // first write always lands in the earliest case, so a later root-creating case
  // whose cleanup ran only on success would never be reached.
  //
  // DOCUMENTED LIMIT, stated because the cheap version of this is a trap: at two
  // roots the injection reaches the SECOND root-creating case, not an
  // arbitrarily late one. Reaching the last would need a passing run per file to
  // learn its root count plus a second run to inject there, roughly doubling a
  // ~120 s guard on every unit-suite run. A regression in a suite's tenth
  // root-creating case is not caught here. Re-file trigger: a leak found in the
  // field that this ordinal would have missed.
  it.each(SUBJECTS)(
    "removes every root it creates even when a case fails: %s",
    (file) => {
      // Prefer the LATE injection. Three subjects create exactly one root, so
      // the roots-2 arm never fires for them and the child exits 0 -- which the
      // premise correctly refuses to accept as evidence. Fall back to the
      // write-count arm there rather than weakening the premise, and rather
      // than skipping those files: a single-root suite still has to clean up.
      let run = runSuiteSet([file], { failAfterRoots: 2 });
      let late = true;
      if (run.exitCode === 0) {
        late = false;
        run = runSuiteSet([file], { failAfter: 1 });
      }
      premiseHolds(`the injected failure took (exit ${run.exitCode})`, run.exitCode !== 0);
      premise(
        `scratch roots created before the failure (${late ? "late" : "early"} injection)`,
        run.created.length,
        0,
      );
      expect(families(run.survivors)).toEqual([]);
    },
    120_000,
  );
});
