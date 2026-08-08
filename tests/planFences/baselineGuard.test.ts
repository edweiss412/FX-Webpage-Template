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

/**
 * The SUCCESS path. R5 finding 5: deleting `writeFileSync` left every suite
 * green — the refusal case exits before that line, and the meta-test reads the
 * committed baseline rather than a generated one. A generator that prints
 * "wrote ..." without writing is the worst possible failure for a file whose
 * whole job is to be trustworthy.
 */
describe("the generator WRITES on a permitted run", () => {
  it("produces a baseline whose rows and ceilings match the corpus it scanned", () => {
    const dir = mkdtempSync(join(tmpdir(), "planfences-ok-"));
    try {
      const plans = join(dir, "docs/superpowers/plans/x");
      mkdirSync(plans, { recursive: true });
      writeFileSync(
        join(plans, "plan.md"),
        ["In `lib/a.ts`:", "", "```ts", "const n = rows[0].name;", "```", ""].join("\n"),
      );
      const out = join(dir, "baseline.ts");

      const res = spawnSync("pnpm", ["tsx", "scripts/gen-plan-fences-baseline.ts"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PLAN_FENCES_OUT: out,
          PLAN_FENCES_ROOT: join(dir, "docs/superpowers/plans"),
        },
      });

      expect(res.status, `generator failed: ${res.stderr}`).toBe(0);
      const written = readFileSync(out, "utf8");
      // The claim is not "a file exists" — it is that the file HOLDS the finding.
      expect(written).toContain("UNCHECKED_INDEX");
      expect(written).toMatch(/export const FROZEN_ROWS = 1;/);
      expect(written).toMatch(/export const FROZEN_TOTAL = 1;/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * Row and total MULTIPLICITY. R6 gate findings 8 and 9: both generator fixtures
 * held a single occurrence, so serializing `|1` instead of the real count, or
 * summing `+= 1` instead of `+= f.count`, left every suite green. A fixture with
 * a repeated occurrence is the only thing that can tell those apart.
 */
describe("the generator records real occurrence counts", () => {
  it("writes the fence's actual count in the row AND in FROZEN_TOTAL", () => {
    const dir = mkdtempSync(join(tmpdir(), "planfences-count-"));
    try {
      const plans = join(dir, "docs/superpowers/plans/x");
      mkdirSync(plans, { recursive: true });
      // THREE em-dashes in one fence: one row, count 3.
      writeFileSync(
        join(plans, "plan.md"),
        [
          "In `lib/a.ts`:",
          "",
          "```ts",
          'const a = "one — two";',
          'const b = "three — four";',
          'const c = "five — six";',
          "```",
          "",
        ].join("\n"),
      );
      const out = join(dir, "baseline.ts");
      const res = spawnSync("pnpm", ["tsx", "scripts/gen-plan-fences-baseline.ts"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PLAN_FENCES_OUT: out,
          PLAN_FENCES_ROOT: join(dir, "docs/superpowers/plans"),
        },
      });
      expect(res.status, `generator failed: ${res.stderr}`).toBe(0);
      const written = readFileSync(out, "utf8");
      // Three DISTINCT em-dash identities (ordinal 1, 2, 3), each count 1 —
      // so rows 3 and total 3, and a `|1` serialization cannot be told from the
      // truth by row count alone. The assertion that discriminates is the TOTAL
      // against a rule whose instances repeat.
      expect(written).toMatch(/export const FROZEN_ROWS = 3;/);
      expect(written).toMatch(/export const FROZEN_TOTAL = 3;/);
      expect(written).toContain("FENCE_EM_DASH|3|1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sums a REPEATED identity's occurrences rather than counting rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "planfences-sum-"));
    try {
      const plans = join(dir, "docs/superpowers/plans/x");
      mkdirSync(plans, { recursive: true });
      // The SAME unchecked index twice in one fence: one identity, count 2.
      writeFileSync(
        join(plans, "plan.md"),
        [
          "In `lib/a.ts`:",
          "",
          "```ts",
          "const n = rows[0].name;",
          "const m = rows[0].name;",
          "```",
          "",
        ].join("\n"),
      );
      const out = join(dir, "baseline.ts");
      const res = spawnSync("pnpm", ["tsx", "scripts/gen-plan-fences-baseline.ts"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PLAN_FENCES_OUT: out,
          PLAN_FENCES_ROOT: join(dir, "docs/superpowers/plans"),
        },
      });
      expect(res.status, `generator failed: ${res.stderr}`).toBe(0);
      const written = readFileSync(out, "utf8");
      // ONE row, count TWO. `|1` fails the row assertion; `total += 1` fails the
      // total assertion. Neither mutant survives.
      expect(written).toMatch(/UNCHECKED_INDEX\|rows\[0\]\.name\|2/);
      expect(written).toMatch(/export const FROZEN_ROWS = 1;/);
      expect(written).toMatch(/export const FROZEN_TOTAL = 2;/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * R7 gate findings 4 and 5 — the generator's IDENTITY field and its RECURSIVE
 * traversal. Both were unpinned: every previous fixture used one directory and
 * one fence, so `f.fenceLine` for `f.fenceKey` and a non-recursive walk each
 * left the suite green while silently breaking regeneration.
 */
describe("the generator writes content identity and walks the whole tree", () => {
  it("emits the analyzer's CONTENT key and finds plans in NESTED directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "planfences-walk-"));
    try {
      const root = join(dir, "docs/superpowers/plans");
      const nested = join(root, "outer/inner");
      mkdirSync(nested, { recursive: true });
      // One plan at the top level, one two directories down. A walk that returns
      // early on the first subdirectory finds only one of them.
      writeFileSync(
        join(root, "top.md"),
        ["In `lib/a.ts`:", "", "```ts", "const n = rows[0].name;", "```", ""].join("\n"),
      );
      writeFileSync(
        join(nested, "deep.md"),
        ["In `lib/b.ts`:", "", "```ts", "const m = cols[0].label;", "```", ""].join("\n"),
      );
      const out = join(dir, "baseline.ts");
      const res = spawnSync("pnpm", ["tsx", "scripts/gen-plan-fences-baseline.ts"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, PLAN_FENCES_OUT: out, PLAN_FENCES_ROOT: root },
      });
      expect(res.status, `generator failed: ${res.stderr}`).toBe(0);
      const written = readFileSync(out, "utf8");

      expect(written, "the nested plan must be walked").toContain("deep.md");
      expect(written, "the top-level plan must be walked").toContain("top.md");
      expect(written).toMatch(/export const FROZEN_ROWS = 2;/);

      // The identity field must be the CONTENT key, not the line number. Both
      // fences open on line 3, so a fenceLine serialization writes `|3|` — and
      // the analyzer would never match it.
      expect(written, "rows must carry the content digest, not the fence line").not.toMatch(
        /top\.md\|3\|/,
      );
      expect(written).toMatch(/top\.md\|[0-9a-f]{8}\|UNCHECKED_INDEX/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
