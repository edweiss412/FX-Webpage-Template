// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// `scripts/regen-db-free.mjs --check` must fail-closed on drift (Codex plan R1).
// Both outcomes are exercised via REGEN_DB_FREE_STUB, which skips the (DB-bound)
// probe run: "committed" feeds back the committed lists (no diff, exit 0),
// "drift" feeds a fixture that differs (diff, exit 1 + message).
const ROOT = process.cwd();
const run = (stub: string) =>
  execFileSync("pnpm", ["exec", "tsx", "scripts/regen-db-free.mjs", "--check"], {
    cwd: ROOT,
    env: { ...process.env, REGEN_DB_FREE_STUB: stub },
    stdio: "pipe",
    encoding: "utf8",
  });

describe("ci:regen-db-free --check", () => {
  it("exits 0 when the stub classification equals the committed lists", () => {
    expect(() => run("committed")).not.toThrow();
  });

  it("exits nonzero and reports a diff when the stub classification differs", () => {
    let code = 0;
    let out = "";
    try {
      run("drift");
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? -1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(code).not.toBe(0);
    expect(out).toMatch(/drift|differ|db-free-movable/i);
  });
});

// Structural wiring: the nightly drift workflow must actually run the check on a
// booted DB (Codex plan R1 — a workflow with no test can silently no-op). Hand-
// parse the YAML (the repo has no `yaml` dep; mirrors unit-suite-shard-topology.
// test.ts) and assert the bootstrap runs strictly BEFORE the --check IN ONE JOB,
// with real run-step lines (comments stripped), rather than raw substrings a
// comment or separate job could satisfy (Codex guards-4).
describe("db-free-drift.yml wiring", () => {
  const YAML = readFileSync(join(ROOT, ".github/workflows/db-free-drift.yml"), "utf8");
  // Directive lines only (drop whole-line `#` comments), so a token in prose
  // cannot satisfy an assertion.
  const directives = YAML.split("\n").filter((l) => !/^\s*#/.test(l));
  // The jobs: block, then the single 2-space-indented job key under it.
  const jobsIdx = directives.findIndex((l) => /^jobs:\s*$/.test(l));
  // Job keys are the 2-space-indented keys AFTER `jobs:` (not the 2-space keys
  // under `on:`, e.g. `schedule:`).
  const jobKeys = directives.slice(jobsIdx + 1).filter((l) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));

  it("declares exactly one job (so 'same job' is unambiguous)", () => {
    expect(jobsIdx).toBeGreaterThanOrEqual(0);
    expect(jobKeys.length).toBe(1);
  });

  it("runs on a nightly cron and manual dispatch", () => {
    expect(directives.some((l) => /cron:\s*["']0 7 \* \* \*["']/.test(l))).toBe(true);
    expect(directives.some((l) => /^\s*workflow_dispatch:/.test(l))).toBe(true);
  });

  it("boots Supabase strictly BEFORE the --check, in that one job", () => {
    const body = directives.slice(jobsIdx);
    const bootIdx = body.findIndex((l) => /supabase-local-bootstrap\.sh/.test(l));
    const checkIdx = body.findIndex((l) => /regen-db-free(\.mjs)? --check/.test(l));
    expect(bootIdx, "bootstrap step present").toBeGreaterThanOrEqual(0);
    expect(checkIdx, "--check step present").toBeGreaterThanOrEqual(0);
    expect(bootIdx, "bootstrap must precede --check").toBeLessThan(checkIdx);
  });
});
