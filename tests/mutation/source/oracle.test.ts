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
    expect(() => assertCleanBaseline(1, "tests/x.test.ts", "someSurface")).toThrow(
      BaselineNotGreenError,
    );
    expect(() => assertCleanBaseline(1, "tests/x.test.ts", "someSurface")).toThrow(
      /tests\/x\.test\.ts/,
    );
  });

  it("proceeds when the unmutated baseline is green", () => {
    expect(() => assertCleanBaseline(0, "tests/x.test.ts", "someSurface")).not.toThrow();
  });

  it("names the SURFACE, not only the suites, so a triager need not re-derive the partition", () => {
    // The annotation this produces is read off a shard leg that holds several
    // surfaces, and the leg number is not a stable name for any of them -- the
    // partition is recomputed from the registry on every runner. Without the
    // surface id, "which surface owns these two test files?" costs a local
    // partition derivation before triage can begin. The browser side already
    // does this (tests/mutation/browser/runner.ts composes the surface into the
    // message); the source side did not.
    const thrown = () =>
      assertCleanBaseline(1, "tests/a.test.ts, tests/b.test.ts", "retryableRpcVolatilityScan");
    // BOTH halves. An implementation that swapped the suite list for the id
    // would satisfy a surface-only assertion while losing the information a
    // triager opens the file with.
    expect(thrown).toThrow(/retryableRpcVolatilityScan/);
    expect(thrown).toThrow(/tests\/a\.test\.ts, tests\/b\.test\.ts/);
    expect(thrown).toThrow(BaselineNotGreenError);
  });
});
