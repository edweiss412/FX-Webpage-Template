import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ENV_BOUND_EXCLUDES, PARALLEL_TEST_GLOBS } from "@/vitest.projects";

// Structural guard for the REQUIRED unit-suite gate. String-match on the workflow
// YAML (no yaml dep), mirroring tests/cross-cutting/ci-workflow-speedup.test.ts.
// Pins the load-bearing properties whose silent regression would either drop test
// coverage or let a red leg green the required `unit-suite` check.
//
// Topology (CI probe run 29758568301 measured serial=690s, parallel=294s whole):
// the suite is split by PROJECT across two matrix jobs, not by file across one.
//   unit-suite-db   — 8 legs, boots Supabase, runs ONLY the serial project
//   unit-suite-nodb — 3 legs, boots NOTHING,  runs ONLY the parallel project
// Leg counts are bounded by RUNNER CONCURRENCY, not by the timing arithmetic:
// 12+4 hit every per-leg target and REGRESSED the wall (171s of start stagger,
// run 29760670825); 8+3 still staggered 43s and gained only 16s (run
// 29761339451). Total legs are capped at 8, the count measured to start within
// 3s. See the workflow header for all three measurements.
// The parallel project is DB-free (that same probe is the proof), so its legs
// skip the ~71s Supabase boot entirely. Both feed one aggregator that keeps the
// required check-context name.
//
// The coverage invariant this file CANNOT prove on its own: that the two projects
// together cover every test file. That is vitest-projects-partition.test.ts's job
// (every non-nightly file lands in exactly one default project). This file pins
// that each workflow job runs exactly one project and that both jobs exist — so
// the two guarantees compose into "every file runs exactly once."

const YAML = readFileSync(join(process.cwd(), ".github", "workflows", "unit-suite.yml"), "utf8");

const DB_LEGS = 8;
const NODB_LEGS = 3;

/**
 * Comment-free view of a block. A forbidden-token guard that scans raw YAML also
 * matches the prose EXPLAINING why the token is absent ("No supabase/setup-cli,
 * no psql..."), which fails the job for saying the right thing. Strip whole-line
 * comments so the guards read directives only.
 */
function directives(block: string): string {
  return block
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

/** Body of a top-level job block, bounded by the next 2-space job key or EOF. */
function jobBlock(key: string): string {
  const m = new RegExp(`\\n {2}${key}:\\n([\\s\\S]*?)(?=\\n {2}[A-Za-z0-9_-]+:\\n|$)`).exec(YAML);
  expect(m, `job block \`${key}:\` not found in unit-suite.yml`).not.toBeNull();
  return m?.[1] ?? "";
}

describe("unit-suite matrix topology", () => {
  // Anti-vacuity: prove we actually read the unit-suite workflow, so a wrong
  // path or empty read fails loudly instead of vacuously passing every regex.
  it("reads the unit-suite workflow (guards against an empty/wrong-file read)", () => {
    expect(YAML).toContain("name: Unit + DB suite");
    expect(YAML.length).toBeGreaterThan(500);
  });

  it.each([
    ["unit-suite-db", DB_LEGS],
    ["unit-suite-nodb", NODB_LEGS],
  ])("%s declares fail-fast:false and a matrix of %i legs", (key, legs) => {
    const body = jobBlock(String(key));
    const m = /strategy:\n\s+fail-fast:\s*false\n\s+matrix:\n\s+shard:\s*\[([^\]]*)\]/.exec(body);
    expect(
      m,
      `${key} must declare strategy.fail-fast:false with a matrix.shard list`,
    ).not.toBeNull();
    const entries = (m?.[1] ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    expect(entries, `${key} matrix must be 1..${legs}`).toEqual(
      Array.from({ length: Number(legs) }, (_, i) => i + 1),
    );
  });

  it.each([
    ["unit-suite-db", DB_LEGS, "serial"],
    ["unit-suite-nodb", NODB_LEGS, "parallel"],
  ])("%s runs --shard=i/%i against ONLY the %s project", (key, legs, project) => {
    const body = jobBlock(String(key));
    const m = /--project=(\S+)\s+--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/.exec(body);
    expect(
      m,
      `${key} must run \`vitest run --project=<name> --shard=\${{ matrix.shard }}/N\``,
    ).not.toBeNull();
    expect(m?.[1], `${key} must pin --project=${project}`).toBe(project);
    expect(
      Number(m?.[2]),
      `${key}'s --shard denominator must equal its matrix length (${legs}); a mismatch drops or double-runs files`,
    ).toBe(Number(legs));

    // Matching the FIRST invocation is not enough. A job could keep this correct
    // command and add a second, unprojected or cross-project `vitest run` after
    // it — every assertion above would still pass while files ran twice, which is
    // exactly what the exactly-once claim forbids.
    expect(
      (directives(body).match(/vitest run/g) ?? []).length,
      `${key} must invoke \`vitest run\` exactly once; a second invocation breaks exactly-once execution`,
    ).toBe(1);
  });

  // The whole point of the split. If the no-DB job ever boots Supabase it silently
  // gives back the ~71s per leg the split exists to save; if the DB job ever stops
  // booting, every serial test fails on a closed port.
  it("only the DB job boots Supabase — the no-DB job installs no CLI, no psql, no database", () => {
    const db = directives(jobBlock("unit-suite-db"));
    const nodb = directives(jobBlock("unit-suite-nodb"));
    expect(
      db.includes("bash scripts/ci/supabase-local-bootstrap.sh"),
      "unit-suite-db must boot its own local Supabase via the shared bootstrap",
    ).toBe(true);
    // Naming three exact spellings would let `supabase start`, a docker-compose
    // bring-up, a renamed wrapper action, or `apt-get install postgresql-16`
    // through. Assert the CATEGORY instead: no mention of supabase or postgres in
    // any form, and no database-ish install, anywhere in the job's directives.
    for (const forbidden of [/supabase/i, /postgres/i, /pg_ctl|pg_isready|initdb/i]) {
      expect(
        forbidden.test(nodb),
        `unit-suite-nodb must not reference ${forbidden} in any form — its legs run the ` +
          "DB-free project and skip the boot entirely (that saving IS the split)",
      ).toBe(false);
    }
    // Only the two setup actions plus the vitest step; a new `uses:` is how a
    // database would most plausibly sneak back in.
    expect(
      (nodb.match(/uses:/g) ?? []).length,
      "unit-suite-nodb must use exactly two actions (checkout + setup); a third is how a " +
        "database bring-up would return",
    ).toBe(2);
  });

  it("both jobs set VITEST_EXCLUDE_ENV_BOUND=1", () => {
    for (const key of ["unit-suite-db", "unit-suite-nodb"]) {
      expect(
        jobBlock(key).includes('VITEST_EXCLUDE_ENV_BOUND: "1"'),
        `${key} must keep VITEST_EXCLUDE_ENV_BOUND=1 (project-level env-bound exclude)`,
      ).toBe(true);
    }
  });

  it("never sets continue-on-error: true (would mask a failed leg as success in the rollup)", () => {
    expect(
      /continue-on-error:\s*true/.test(YAML),
      "continue-on-error:true on a leg makes needs.<job>.result report `success` even " +
        "when that leg failed — a silent coverage hole that greens the required aggregator.",
    ).toBe(false);
  });

  it("the aggregator explicitly sets `name: unit-suite` — pins the REQUIRED check-context name", () => {
    // The status-check CONTEXT name is the job's `name:`. The job KEY being
    // `unit-suite` is not enough: a `name: Unit suite` override would orphan the
    // required `unit-suite` context (blocking ALL PRs) while a key-only check
    // still passes.
    const body = jobBlock("unit-suite");
    expect(
      /\n {4}name:\s*unit-suite\n/.test(body),
      "the aggregator must set `name: unit-suite` so the required check-context name is preserved " +
        "(a rename like `name: Unit suite` orphans the required context and blocks all PRs)",
    ).toBe(true);
  });

  // The failure this guards is the expensive one: adding a second matrix job and
  // forgetting to gate on it. The aggregator would go green on the DB legs alone
  // while every parallel-project test silently stopped gating merges.
  it("the aggregator needs BOTH matrix jobs and fails unless BOTH rolled up success", () => {
    const body = jobBlock("unit-suite");
    expect(
      /needs:\s*\[\s*unit-suite-db\s*,\s*unit-suite-nodb\s*\]/.test(body),
      "the aggregator must `needs: [unit-suite-db, unit-suite-nodb]` — omitting either " +
        "stops that half of the suite from gating merge",
    ).toBe(true);
    expect(
      /if:\s*always\(\)/.test(body),
      "the aggregator must run with `if: always()` so a failed leg yields an explicit failure, not a never-reported skip",
    ).toBe(true);
    for (const job of ["unit-suite-db", "unit-suite-nodb"]) {
      expect(
        body.includes(`needs.${job}.result`),
        `the aggregator must read needs.${job}.result`,
      ).toBe(true);
    }
    // Counting two `= "success"` fragments is NOT the claim. An aggregator that
    // assigns both results and then tests "$db" TWICE would satisfy a count while
    // letting a failed no-DB rollup green the required check. Assert the two
    // guards RELATIONALLY: each variable must be bound to its own job's result,
    // and each must be the subject of its own equality test.
    const bindings = new Map([
      ["db", "unit-suite-db"],
      ["nodb", "unit-suite-nodb"],
    ]);
    for (const [variable, job] of bindings) {
      expect(
        new RegExp(`\\b${variable}='\\$\\{\\{\\s*needs\\.${job}\\.result\\s*\\}\\}'`).test(body),
        `the aggregator must bind \`${variable}\` to needs.${job}.result`,
      ).toBe(true);
      expect(
        new RegExp(`test\\s+"\\$${variable}"\\s*=\\s*"success"`).test(body),
        `the aggregator must assert \`${variable}\` equals "success" — without its OWN test, ` +
          `a failed ${job} rollup still greens the REQUIRED check`,
      ).toBe(true);
    }
  });

  // The exactly-once claim is scoped: under VITEST_EXCLUDE_ENV_BOUND=1 (which BOTH
  // jobs set) the env-bound files are excluded from serial and run ZERO times
  // here. That is intended — each is gated elsewhere (x-audits runs them directly)
  // — so the honest invariant is "exactly once, EXCEPT the env-bound three."
  //
  // The latent hazard the exclusion asymmetry creates: envBoundExcludes is applied
  // only to the serial project. An env-bound file added inside a PARALLEL dir
  // would therefore NOT be excluded — it would run in the no-DB leg, in the very
  // environment it was excluded for needing. All three currently live in serial
  // dirs; this pins that they stay there.
  it("every env-bound exclude lives in a SERIAL dir (the exclusion is serial-only)", () => {
    for (const g of ENV_BOUND_EXCLUDES) {
      const path = g.replace(/^\*\*\//, "");
      const inParallelDir = PARALLEL_TEST_GLOBS.some((pg) => {
        const star = pg.indexOf("/**");
        return star >= 0 && path.startsWith(pg.slice(0, star + 1));
      });
      expect(
        inParallelDir,
        `${path} is env-bound but sits in a PARALLEL dir. envBoundExcludes is applied ONLY to ` +
          "the serial project, so it would still run in the no-DB leg — the exact environment " +
          "it is excluded for needing. Move it to a serial dir.",
      ).toBe(false);
    }
  });

  // Ties the workflow to the partition's single source of truth: the no-DB job is
  // only safe because PARALLEL_TEST_GLOBS is a non-trivial set of verified-DB-free
  // dirs. If that set ever collapsed to empty, the split would be a no-op and this
  // file's project pins would still pass.
  it("the parallel project is a non-trivial set (the no-DB job is not vacuous)", () => {
    expect(PARALLEL_TEST_GLOBS.length).toBeGreaterThan(10);
  });
});

describe("unit-suite has no cache lever (reverted per spec 2026-07-19 §6.1)", () => {
  it("no soft-failed commands and no cache steps remain", () => {
    expect(
      YAML.match(/\|\| true/g) ?? [],
      "a reverted cache lever must leave zero soft-fail sites",
    ).toHaveLength(0);
    expect(YAML.includes("supabase-image-cache"), "no cache step may remain after reversion").toBe(
      false,
    );
  });
});
