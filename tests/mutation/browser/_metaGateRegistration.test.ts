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
    expect(source, "the gate must fan out over BROWSER_SURFACES").toMatch(
      /describe\.each\(\s*BROWSER_SURFACES/,
    );
    expect(source, "the per-surface block must actually run the surface").toMatch(
      /runBrowserSurface\(/,
    );
  });

  it("keeps the control case AND its assertion — an empty test passes", () => {
    // Two distinct deletions with the same consequence: drop the `it(...)` and
    // the control never runs; drop the assertion inside it and the case passes
    // having asserted nothing. A dead overlay is then indistinguishable from a
    // perfect run, which is the failure the control exists to make impossible.
    expect(source, "the control must be invoked").toMatch(/runBrowserControl\(/);
    expect(source, "and its result must be asserted KILLED, not merely computed").toMatch(
      /expect\([\s\S]{0,200}runBrowserControl\([\s\S]{0,200}\)[\s\S]{0,200}\.toBe\("KILLED"\)/,
    );
  });

  it("asserts the run left every mutant target byte-identical", () => {
    // The overlay serves mutant text from memory; a rewrite that patched files
    // in place would pass every scoring assertion while a crash could strand a
    // mutant on disk. Deleting this check is silent by construction.
    expect(source).toMatch(/byte-identical|\.equals\(/);
  });
});
