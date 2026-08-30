/**
 * Structural guard: no file under `app/` binds the identifier `approvedRows`.
 *
 * WHY THIS EXISTS. `selectFinishableCleanRows` returns every finishable clean
 * row, approved or not — deliberate, per Task B2. The local that held its result
 * was named `approvedRows`, asserting a filter the query does not apply, and the
 * progress stream then reported that count under a publish verb. The misnomer is
 * the proximate cause of the shipped defect this arc repaired, so the name is
 * pinned rather than merely corrected.
 *
 * Scope is ALL of `app/`, matching the acceptance criterion, not just the
 * onboarding API tree: a guard whose coverage is narrower than its claim passes
 * while the claim goes unproven.
 */
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { premise, premiseHolds } from "../_shared/premise";

const APP_DIR = join(__dirname, "..", "..", "app");
// Every extension Next.js will execute under app/, not just the ones this repo happens to
// use most. The guard's name claims 'no file under app/', so an omission is a false claim,
// not a narrow scope. `.mdx` is included because next.config.ts:54 enables MDX and app/
// holds 13 MDX pages today — an ESM binding named `approvedRows` in one of them would have
// violated AC-5 while this passed (whole-diff R4 finding 4). Unlike the Tailwind class
// grammar this arc stopped modelling, the set of extensions Next executes is genuinely
// finite and documented, so completing it closes the question rather than widening a
// recognizer.
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|md|mdx)$/;

/** Word-matched, so `approvedRowsCount` neither satisfies nor evades the guard. */
const MISNOMER = /\bapprovedRows\b/;

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkFiles(full) : CODE.test(entry) ? [full] : [];
  });
}

describe("no approvedRows misnomer under app/", () => {
  test("the identifier appears in no source file", () => {
    const files = walkFiles(APP_DIR);

    // Premise, not assertion: a walk that scanned nothing — or scanned around the
    // one file the guard is about — would pass the check below while proving
    // nothing at all.
    premise("the walk reached source files under app/", files.length, 0);
    premiseHolds(
      "the finalize route is in the scanned set",
      files.some((f) => f.endsWith(join("api", "admin", "onboarding", "finalize", "route.ts"))),
    );

    // An offenders LIST, not a per-file expect: one run names every violator
    // instead of dying on the first.
    const offenders = files
      .filter((f) => MISNOMER.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(APP_DIR.length + 1))
      .sort();

    expect(offenders).toEqual([]);
  });
});
