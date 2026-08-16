import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { premiseHolds } from "../../_shared/premise";
import { BROWSER_SURFACES } from "./registry";

/**
 * The browser gate cannot prove its own registration (diff review round 2, P0).
 *
 * `browserSurfaces.gate.test.ts` runs every mutant and the liveness control. If
 * the block that registers that work is DELETED, the file still passes: the two
 * structural cases at the top remain green, `describe.each` over nothing
 * registers nothing, and a suite that executed zero mutants reports success.
 * Three declared `statement-removal` mutants reach that state — dropping the
 * `describe.each`, dropping the control case, dropping the control's assertion —
 * and none of them can be caught from inside the file they empty.
 *
 * So the check lives HERE, in a file the deletion does not touch, and it is a
 * source scan on purpose: the property is "this suite still registers its work",
 * which is a statement about the file's text, not about a value any run
 * produces. Its own deletion is covered the same way every other suite's is —
 * by the filesystem-walked meta-tests that require a gate surface to exist.
 *
 * This is the narrow twin of the runner repair in the same round: there the flip
 * site MOVED into an enrolled module, because it was ordinary logic; here it
 * cannot move, because the thing at risk is the registration itself.
 */
const ROOT = process.cwd();
const GATE = "tests/mutation/browser/browserSurfaces.gate.test.ts";
const source = readFileSync(join(ROOT, GATE), "utf8");

/**
 * The gate's EXECUTABLE text: comments and test titles removed.
 *
 * Every scan below runs against this rather than the raw file, and that is the
 * class-level repair for a defect round 3 found in ONE of them — a check whose
 * pattern the surrounding prose could satisfy on its own. The same weakness sat
 * in the sibling scans for `runBrowserSurface(` and `runBrowserControl(`, where
 * a comment naming the call would have kept them green after the call was
 * deleted. Prose is not a predicate; strip it once, centrally, so a future scan
 * added here inherits the property instead of re-deriving it.
 */
const RUNNER = "tests/mutation/browser/runner.ts";
const runnerSource = readFileSync(join(ROOT, RUNNER), "utf8");

const stripProse = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/(it|describe)\((["'`])[\s\S]*?\2/g, "$1(<title>");

const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
  .replace(/(it|describe)\((["'`])[\s\S]*?\2/g, "$1(<title>");
const runnerCode = stripProse(runnerSource);

describe("the browser gate still registers the work it claims to run", () => {
  it("reads a non-trivial gate file (anti-vacuity for every scan below)", () => {
    // A missing or emptied file would make every `toMatch` below fail loudly
    // rather than pass vacuously, but an empty STRING would not — assert the
    // premise so the scans are known to be running against real source.
    expect(source.length).toBeGreaterThan(1000);
    // Identify the file by what only the gate imports — the shared scoring
    // entry point it is required to reuse unforked (spec §1.1.6) — rather than
    // by its own name, which the source has no reason to contain.
    expect(source).toMatch(/import \{ evaluateGate \} from "\.\.\/source\/gate";/);
  });

  it("registers a per-surface block driven by the REGISTRY, not a literal list", () => {
    // `statement-removal` on the whole `describe.each(...)` leaves the two
    // structural cases green with zero mutants run. A hand-written
    // `describe("tapTargetFloor")` would also defeat the derived cover, so the
    // scan requires the registry to be the iterand.
    premiseHolds(
      "the registry has surfaces to iterate; an empty one would make this vacuous",
      BROWSER_SURFACES.length > 0,
    );
    expect(code, "the gate must fan out over BROWSER_SURFACES").toMatch(
      /describe\.each\(\s*BROWSER_SURFACES/,
    );
    expect(code, "the per-surface block must actually run the surface").toMatch(
      /runBrowserSurface\(/,
    );
  });

  it("keeps the control case AND its assertion — an empty test passes", () => {
    // Two distinct deletions with the same consequence: drop the `it(...)` and
    // the control never runs; drop the assertion inside it and the case passes
    // having asserted nothing. A dead overlay is then indistinguishable from a
    // perfect run, which is the failure the control exists to make impossible.
    expect(code, "the control must be invoked").toMatch(/runBrowserControl\(/);
    expect(code, "and its result must be asserted KILLED, not merely computed").toMatch(
      /expect\([\s\S]{0,200}runBrowserControl\([\s\S]{0,200}\)[\s\S]{0,200}\.toBe\("KILLED"\)/,
    );
  });

  it("asserts the run left every mutant target byte-identical — the CALL, not the wording", () => {
    // The overlay serves mutant text from memory; a rewrite that patched files
    // in place would pass every scoring assertion while a crash could strand a
    // mutant on disk. Deleting this check is silent by construction.
    //
    // This case was itself vacuous for one round (diff review round 3). It read
    // `/byte-identical|\.equals\(/` — an ALTERNATION, so the phrase
    // "byte-identical" in the surrounding test TITLE satisfied it while the
    // executable assertion underneath was deleted. Prose is not a predicate: the
    // pin has to be the call that does the comparing, and the title is now
    // explicitly disqualified from carrying it.
    premiseHolds(
      "the executable view kept the code and dropped the prose",
      code.includes("readFileSync") && !code.includes("byte-identical"),
    );
    expect(
      code,
      "the byte check must be an .equals() comparison of the file against its captured bytes",
    ).toMatch(/expect\(\s*readFileSync\([^)]*\)\.equals\(/);
    expect(code, "and its result must be asserted true").toMatch(
      /\.equals\([\s\S]{0,200}\.toBe\(true\)/,
    );
  });
});

/**
 * The runner's fail-open CLASS, not its instances (diff review rounds 2, 4, 5).
 *
 * Three rounds landed on one axis: `runner.ts` cannot be enrolled in the
 * mutation registry — its other half is a spawn boundary — so a
 * `statement-removal` there can make the gate report success. Round 2 was the
 * kill fold, round 4 the exit-status assignment, round 5 the baseline call.
 * Patching a fourth instance would only invite a fifth, so what is pinned here
 * is the SHAPE that makes any of them possible: a success value asserted as a
 * literal beside the check that is supposed to establish it.
 *
 * Each repair removed the literal rather than guarding it — the value is now
 * obtained only by running the check, so deleting the check leaves it unbound
 * instead of leaving a forged claim behind. These scans keep it that way.
 */
describe("the runner cannot assert success it did not compute", () => {
  it("reads the runner's executable text (anti-vacuity)", () => {
    expect(runnerCode).toContain("export function runBrowserSurface");
    premiseHolds(
      "prose was stripped but code survived",
      runnerCode.includes("accountOutcomes") && !runnerCode.includes("Baseline FIRST"),
    );
  });

  it("derives baselineGreen from the baseline check, never from a literal", () => {
    expect(
      runnerCode,
      "baselineGreen must be BOUND from assertBrowserBaseline, so deleting the call unbinds it",
    ).toMatch(/const baselineGreen = assertBrowserBaseline\(/);
    expect(
      runnerCode,
      "a literal `baselineGreen: true` is the fail-open shape rounds 2/4/5 all wore",
    ).not.toMatch(/baselineGreen:\s*true/);
  });

  it("keeps the exit status defaulted to the CONSERVATIVE value", () => {
    // Round 4: unassigned, a removed assignment leaves `undefined`, which scores
    // KILLED. Defaulted to null it classifies infra instead.
    expect(runnerCode).toMatch(/let exitStatus: number \| null = null;/);
  });

  it("folds the per-suite verdict through the ENROLLED predicate", () => {
    // Round 2: an inline `verdict === "KILLED"` is an equality-flip site in a
    // module the registry cannot score.
    expect(runnerCode).toMatch(/if \(killsMutant\(verdict\)\) return "KILLED";/);
    expect(runnerCode).not.toMatch(/verdict\s*[!=]==\s*"KILLED"/);
  });
});
