/**
 * tests/mutation/enrolmentPresence.test.ts — Task 6 of the transient-502 plan.
 *
 * The red that fails for ABSENCE, which none of the existing guards does.
 *
 * `_metaGuardSurfaceRegistry.test.ts` validates entries already PRESENT in `GUARD_SURFACES`
 * and never discovers unenrolled modules — the registry says enrolment is opt-in in as many
 * words (`tests/mutation/source/registry.ts`, search `Enrollment is opt-in`). The two
 * companion parity tables can only fail AFTER a row exists. So every guard in that tree
 * validates what is DECLARED, and a surface that is silently dropped from the registry takes
 * its parity rows with it and the whole tree stays green.
 *
 * That is the specific failure this file exists to catch: not a malformed row, but a missing
 * one.
 *
 * The dark state was OBSERVED on this branch, not argued. Before either row was added,
 * `pnpm vitest run tests/mutation/` reported 33 files and 1083 tests passing with both modules
 * sitting unenrolled — the entire guard tree green over a surface it was not scoring. Dropping
 * a row LATER is also caught by the parity tables, since their entries are left behind; the
 * case only this file catches is the surface that is never enrolled at all, where no parity row
 * exists to be orphaned and nothing anywhere goes red.
 */
import { existsSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { GUARD_SURFACES } from "./source/registry";

/**
 * BL-ADMIN-LOADER-CI-TRANSIENT's three scored surfaces.
 *
 * `lib/supabase/retryEligibility.ts` was deliberately absent while its defect class really was set
 * membership. Round 4's P0 lived in it and the repair moved the ownership decision INTO it, so it
 * is enrolled now and belongs in this list — a guard that names two of three surfaces cannot fail
 * for the third going missing, which is the one thing it exists to do.
 */
const REQUIRED_ENROLMENTS: ReadonlyMap<string, string> = new Map([
  ["supabaseRetryingFetch", "lib/supabase/retryingFetch.ts"],
  ["supabaseRetryEligibility", "lib/supabase/retryEligibility.ts"],
  ["retryableRpcVolatilityScan", "tests/supabase/retryableRpcVolatilityScan.ts"],
]);

describe("the transient-502 surfaces stay enrolled", () => {
  test("every required id is present in GUARD_SURFACES", () => {
    const present = new Set(GUARD_SURFACES.map((s) => s.id));
    const missing = [...REQUIRED_ENROLMENTS.keys()].filter((id) => !present.has(id));
    expect(missing).toEqual([]);
  });

  test("each one still names the sourcePath it was enrolled for", () => {
    const wrong: string[] = [];
    for (const [id, sourcePath] of REQUIRED_ENROLMENTS) {
      const row = GUARD_SURFACES.find((s) => s.id === id);
      if (row === undefined) continue; // the test above owns absence
      if (row.sourcePath !== sourcePath) wrong.push(`${id}: enrolled ${row.sourcePath}`);
    }
    expect(wrong).toEqual([]);
  });

  /**
   * A row pointing at a module no suite imports yields a surface where every mutant survives
   * for reasons that have nothing to do with the guard's quality, so presence alone is not the
   * whole claim.
   */
  test("each one names a real module and at least one real deciding suite", () => {
    const broken: string[] = [];
    for (const id of REQUIRED_ENROLMENTS.keys()) {
      const row = GUARD_SURFACES.find((s) => s.id === id);
      if (row === undefined) continue;
      if (!existsSync(row.sourcePath)) broken.push(`${id}: sourcePath missing on disk`);
      if (row.suitePaths.length === 0) broken.push(`${id}: no deciding suite`);
      for (const suite of row.suitePaths) {
        if (!existsSync(suite)) broken.push(`${id}: deciding suite missing on disk: ${suite}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
