import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Structural guard for the matrix-shard restructure of the REQUIRED unit-suite
// gate (PR D). String-match on the workflow YAML (no yaml dep), mirroring
// tests/cross-cutting/ci-workflow-speedup.test.ts. Pins the load-bearing
// properties whose silent regression would either drop test coverage or let a
// red shard green the required `unit-suite` check.

const YAML = readFileSync(join(process.cwd(), ".github", "workflows", "unit-suite.yml"), "utf8");

describe("unit-suite matrix-shard topology", () => {
  // Anti-vacuity: prove we actually read the unit-suite workflow, so a wrong
  // path or empty read fails loudly instead of vacuously passing every regex.
  it("reads the unit-suite workflow (guards against an empty/wrong-file read)", () => {
    expect(YAML).toContain("name: Unit + DB suite");
    expect(YAML.length).toBeGreaterThan(500);
  });

  it("defines a unit-suite-shard matrix job with fail-fast:false and shard:[1, 2]", () => {
    const m =
      /\n {2}unit-suite-shard:\n[\s\S]*?strategy:\n\s+fail-fast:\s*false\n\s+matrix:\n\s+shard:\s*\[\s*1\s*,\s*2\s*\]/.exec(
        YAML,
      );
    expect(
      m,
      "unit-suite.yml must declare a `unit-suite-shard` job with strategy.fail-fast:false and matrix.shard:[1, 2]",
    ).not.toBeNull();
  });

  it("runs vitest with --shard=${{ matrix.shard }}/N where N equals the matrix length (2)", () => {
    const m = /--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/.exec(YAML);
    expect(m, "shard step must run `vitest run --shard=${{ matrix.shard }}/N`").not.toBeNull();
    expect(
      Number(m![1]),
      "the --shard denominator must equal the matrix length (2); a mismatch drops or double-runs files",
    ).toBe(2);
  });

  it("the shard job sets VITEST_EXCLUDE_ENV_BOUND=1 and boots local Supabase", () => {
    expect(
      YAML.includes('VITEST_EXCLUDE_ENV_BOUND: "1"'),
      "the shard run step must keep VITEST_EXCLUDE_ENV_BOUND=1 (project-level env-bound exclude)",
    ).toBe(true);
    expect(
      YAML.includes("bash scripts/ci/supabase-local-bootstrap.sh"),
      "each shard leg must boot its own local Supabase via the shared bootstrap",
    ).toBe(true);
  });

  it("never sets continue-on-error: true (would mask a failed leg as success in the rollup)", () => {
    expect(
      /continue-on-error:\s*true/.test(YAML),
      "continue-on-error:true on a leg makes needs.unit-suite-shard.result report `success` even " +
        "when that leg failed — a silent coverage hole that greens the required aggregator.",
    ).toBe(false);
  });

  it("the aggregator explicitly sets `name: unit-suite` — pins the REQUIRED check-context name", () => {
    // The status-check CONTEXT name is the job's `name:`. The job KEY being
    // `unit-suite` is not enough: a `name: Unit suite` override would orphan the
    // required `unit-suite` context (blocking ALL PRs) while a key-only check
    // still passes. Scope to the aggregator block (bounded by the next 2-space
    // job key or EOF) so the shard job's `name: unit-suite-shard` can't satisfy
    // it, and tie it to `needs: [unit-suite-shard]` to prove it's the aggregator.
    const agg = /\n {2}unit-suite:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/.exec(YAML);
    expect(agg, "aggregator job block `unit-suite:` not found").not.toBeNull();
    const body = agg?.[1] ?? "";
    expect(
      /\n {4}name:\s*unit-suite\n/.test(body),
      "the aggregator must set `name: unit-suite` so the required check-context name is preserved " +
        "(a rename like `name: Unit suite` orphans the required context and blocks all PRs)",
    ).toBe(true);
    expect(
      /needs:\s*\[\s*unit-suite-shard\s*\]/.test(body),
      "the block matched must be the aggregator (it `needs: [unit-suite-shard]`), not another job",
    ).toBe(true);
  });

  it("an aggregator job named `unit-suite` needs the matrix, runs if: always(), and fails unless the rollup is success", () => {
    expect(
      /\n {2}unit-suite:\n/.test(YAML),
      "must keep a job keyed exactly `unit-suite` (the required check-context name)",
    ).toBe(true);
    expect(
      /\n {2}unit-suite:\n[\s\S]*?needs:\s*\[\s*unit-suite-shard\s*\]/.test(YAML),
      "the `unit-suite` aggregator must `needs: [unit-suite-shard]`",
    ).toBe(true);
    expect(
      /\n {2}unit-suite:\n[\s\S]*?if:\s*always\(\)/.test(YAML),
      "the aggregator must run with `if: always()` so a failed shard yields an explicit failure, not a never-reported skip",
    ).toBe(true);
    expect(
      YAML.includes("needs.unit-suite-shard.result"),
      "the aggregator must read needs.unit-suite-shard.result",
    ).toBe(true);
    expect(
      /test\s+"\$result"\s*=\s*"success"/.test(YAML),
      "the aggregator must exit non-zero unless the rollup result is exactly `success`",
    ).toBe(true);
  });
});
