/**
 * tests/planFences/baselineGuard.test.ts — the shrink-only decision, exercised.
 *
 * R3 finding 2: the refusal was correct and untested, so deleting it left every
 * suite green. A rule nothing exercises is a rule the next person removes.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { decideRegeneration } from "@/lib/planFences/baselineGuard";

const committed = (rows: number, total: number): string =>
  `export const FROZEN_ROWS = ${rows};\nexport const FROZEN_TOTAL = ${total};\n`;

describe("shrink-only baseline decision", () => {
  it("allows the first generation when no baseline is committed", () => {
    expect(decideRegeneration("", 100, 120)).toMatchObject({ ok: true });
  });

  it("allows a shrink", () => {
    expect(decideRegeneration(committed(100, 120), 90, 110)).toMatchObject({ ok: true });
  });

  it("allows an unchanged regeneration", () => {
    expect(decideRegeneration(committed(100, 120), 100, 120)).toMatchObject({ ok: true });
  });

  it("REFUSES a row raise", () => {
    const d = decideRegeneration(committed(100, 120), 101, 120);
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toContain("shrink-only");
  });

  it("REFUSES a total raise even when the row count holds", () => {
    // The two ceilings are not redundant: a count bump on an existing row leaves
    // the row count untouched.
    const d = decideRegeneration(committed(100, 120), 100, 121);
    expect(d.ok).toBe(false);
  });

  it("FAILS CLOSED when a committed baseline's ceilings cannot be parsed", () => {
    // The bypass this closes: reformat the constants (a type annotation, a
    // numeric separator), and an Infinity default turns the refusal off.
    const reformatted =
      "export const FROZEN_ROWS: number = 1_00;\nexport const FROZEN_TOTAL = 120;\n";
    const d = decideRegeneration(reformatted, 999, 999);
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toContain("unreadable ceiling is not an absent one");
  });

  it("treats an ABSENT file differently from an unreadable one", () => {
    // Deleting the baseline is the documented way to raise it deliberately, and
    // it is visible in the diff. Corrupting it is not.
    expect(decideRegeneration("", 999, 999).ok).toBe(true);
    expect(decideRegeneration("nonsense", 999, 999).ok).toBe(false);
  });
});

/**
 * INTEGRATION, not just the decision. R4 finding 3: every case above passes with
 * the generator's import and decision block deleted, because none of them runs
 * the generator. This one does — it drives the real script in a temp tree and
 * asserts the refusal reaches the exit code.
 */
describe("the generator ENFORCES the decision (R4 finding 3)", () => {
  it("exits non-zero and writes nothing when regeneration would raise a ceiling", () => {
    const dir = mkdtempSync(join(tmpdir(), "planfences-"));
    try {
      // A plans tree with one violating fence, and a committed baseline whose
      // ceilings are already at zero — so any finding is a raise.
      const plans = join(dir, "docs/superpowers/plans/x");
      mkdirSync(plans, { recursive: true });
      writeFileSync(
        join(plans, "plan.md"),
        ["In `lib/a.ts`:", "", "```ts", "const n = rows[0].name;", "```", ""].join("\n"),
      );
      const out = join(dir, "baseline.ts");
      writeFileSync(
        out,
        "export const PLAN_FENCE_BASELINE: readonly string[] = [];\n" +
          "export const FROZEN_ROWS = 0;\nexport const FROZEN_TOTAL = 0;\n",
      );
      const before = readFileSync(out, "utf8");

      // Run from the REPO root so tsx resolves, but point the script's plans
      // root and output at the temp tree.
      const res = spawnSync("pnpm", ["tsx", "scripts/gen-plan-fences-baseline.ts"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PLAN_FENCES_OUT: out,
          PLAN_FENCES_ROOT: join(dir, "docs/superpowers/plans"),
        },
      });

      expect(res.status, "the generator must refuse, not warn").not.toBe(0);
      expect(`${res.stderr}${res.stdout}`).toMatch(/shrink-only|could not be parsed/);
      expect(readFileSync(out, "utf8"), "a refused run writes nothing").toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
