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

  it("removes every root it creates on a passing run", { timeout: 600_000 }, () => {
    const run = runSuiteSet(SUBJECTS);
    // Exit code first: a child that fails to COLLECT creates nothing and leaves
    // nothing, which is indistinguishable from cleanliness if the only question
    // asked is "what remains".
    premiseHolds(`the subject suites ran and passed (exit ${run.exitCode})`, run.exitCode === 0);
    premise("scratch roots created during the run", run.created.length, 0);
    expect(families(run.survivors)).toEqual([]);
  });

  // The failure arm runs PER FILE, unlike the success arm above. One child with
  // an injected fail-on-first-write dies early, so a single run would only ever
  // exercise whichever suite happened to start first and would report the other
  // twelve as covered. Per file is affordable precisely because each child dies
  // fast: the cost is startup, not suite time.
  it.each(SUBJECTS)(
    "removes every root it creates even when a case fails: %s",
    (file) => {
      // Fail on a write that lands after roots exist. A failure in a case that
      // created no root proves nothing: the other cases clean up after themselves
      // and there is nothing left behind to find.
      const run = runSuiteSet([file], { failAfter: 1 });
      premiseHolds(`the injected failure took (exit ${run.exitCode})`, run.exitCode !== 0);
      premise("scratch roots created before the failure", run.created.length, 0);
      expect(families(run.survivors)).toEqual([]);
    },
    120_000,
  );
});
