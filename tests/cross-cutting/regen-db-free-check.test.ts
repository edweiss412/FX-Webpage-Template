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
// booted DB (Codex plan R1 — a workflow with no test can silently no-op).
describe("db-free-drift.yml wiring", () => {
  const yml = readFileSync(join(ROOT, ".github/workflows/db-free-drift.yml"), "utf8");
  it("runs on a nightly schedule and manual dispatch", () => {
    expect(yml).toMatch(/schedule:/);
    expect(yml).toMatch(/cron:\s*["']0 7 \* \* \*["']/);
    expect(yml).toMatch(/workflow_dispatch:/);
  });
  it("boots Supabase and runs the --check", () => {
    expect(yml).toMatch(/supabase-local-bootstrap\.sh/);
    expect(yml).toMatch(/ci:regen-db-free --check|regen-db-free\.mjs --check/);
  });
});
