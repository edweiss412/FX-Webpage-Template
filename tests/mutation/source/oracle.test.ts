import { describe, expect, it } from "vitest";
import { BaselineNotGreenError, assertCleanBaseline, classify } from "./oracle";

describe("mutation oracle (spec §3.4, AC-6)", () => {
  it("scores a passing suite as SURVIVED and a failing suite as KILLED", () => {
    expect(classify(0)).toBe("SURVIVED");
    expect(classify(1)).toBe("KILLED");
  });

  it("scores every non-zero exit as KILLED, including a compile failure (limit L-3)", () => {
    // The typechecker is part of the suite's gate, so a mutant that fails to
    // compile counts as detected. Stated in the spec as a documented limit and
    // pinned here so it is not re-derived as a finding later.
    for (const code of [1, 2, 7, 130, 255]) expect(classify(code)).toBe("KILLED");
  });

  it("aborts the whole run when the UNMUTATED baseline is not green", () => {
    // Without this, a surface whose suite is already red scores every mutant
    // KILLED and reports a perfect result — the harness would be measuring the
    // broken suite, not the mutants.
    expect(() => assertCleanBaseline(1, "tests/x.test.ts")).toThrow(BaselineNotGreenError);
    expect(() => assertCleanBaseline(1, "tests/x.test.ts")).toThrow(/tests\/x\.test\.ts/);
  });

  it("proceeds when the unmutated baseline is green", () => {
    expect(() => assertCleanBaseline(0, "tests/x.test.ts")).not.toThrow();
  });
});
