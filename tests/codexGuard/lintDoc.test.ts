import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkRun, readCalls, readResult, runGuard, writeScenario, type Run } from "./harness";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");
const T = 60000;

const APPROVE = [
  {
    onCall: 1,
    actions: [
      { type: "stdout", text: "reviewing\n" },
      { type: "lastMessage", text: "VERDICT: APPROVE\n" },
      { type: "exit", code: 0 },
    ],
  },
];

/**
 * A doc inside the run's --cwd. Reports for it are produced by the REAL CLI, so
 * the expected embed is derived from a live run rather than hardcoded — a
 * hardcoded expectation passes against a broken embed.
 */
function plantDoc(run: Run, rel: string, text: string): string {
  const abs = join(run.cwdDir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, text);
  // codex-guard resolves --lint-doc against --cwd's repository.
  execFileSync("git", ["init", "-q"], { cwd: run.cwdDir });
  return rel;
}

/**
 * Defects across MULTIPLE check families, so the report carries more than one
 * finding, a `detail:` line, and several section labels. A single-finding
 * fixture makes the ordered/multiplicity/detail assertions below vacuous —
 * transforms that reorder, deduplicate, or delete details all pass against it.
 */
const PLAN_WITH_DEFECT = [
  "# Plan",
  "",
  "See `lib/specLint/parse.ts:99999` and `lib/specLint/run.ts:99998`.",
  "",
  "The budget covers 3 reports here and 7 reports there.",
  "",
  "<!-- tasks: depth=2 -->",
  "",
  "## Task 1",
  "",
  "prose with no marker",
  "",
  "## Task 2",
  "",
  "<!-- task: red=`` ac=AC-1 -->",
  "",
  "<!-- tasks: end -->",
  "",
].join("\n");

/** Findings only — the lines a reviewer actually reads. */
const findingLines = (s: string) =>
  s.split("\n").filter((l) => /^\s+(FAIL|ADVISORY)\s+[A-Z_]+\s/.test(l));

describe("codex-guard --lint-doc (design §2.2)", () => {
  it(
    "AC-2: --lint-doc is accepted without --fallback",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel]);
      expect(r.code).toBe(0);
      expect(readResult(run).verdict).toBe("APPROVE");
    },
    T,
  );

  it(
    "AC-1/AC-20/M43/M48/M54: the embedded block carries every finding and drops INVENTORY",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      await runGuard(run, ["--lint-doc", rel]);

      const prompt = readCalls(run)[0]!.stdin;
      expect(prompt).toContain(`===== SPEC-LINT: ${rel} =====`);

      // Derived from a live CLI run, never hardcoded.
      // The CLI exits 1 when it has findings, which is the expected case here.
      let raw = "";
      try {
        raw = execFileSync(process.execPath, [TSX, join(ROOT, "scripts/spec-lint.ts"), rel], {
          cwd: run.cwdDir,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (e) {
        raw = String((e as { stdout?: string }).stdout ?? "");
      }
      expect(findingLines(raw).length).toBeGreaterThan(0);
      // The fixture must not be vacuous: independent `toContain` assertions on a
      // one-finding, zero-detail report pass against transforms that reorder,
      // deduplicate, or drop details.
      const rawFindings = findingLines(raw);
      expect(rawFindings.length).toBeGreaterThan(1);
      expect(raw).toMatch(/^\s+detail: /m);
      expect(raw).toMatch(/^INVENTORY$/m);

      // ORDERED SEQUENCE, with multiplicity — not a set, not containment.
      const block = prompt
        .split(`===== SPEC-LINT: ${rel} =====\n`)[1]!
        .split("\n===== END SPEC-LINT =====")[0]!;
      const sentLines = block.split("\n");
      const inv = raw.split("\n").indexOf("INVENTORY");
      const sum = raw.split("\n").findIndex((l) => l.startsWith("summary:"));
      const expected = [...raw.split("\n").slice(0, inv === -1 ? sum : inv), raw.split("\n")[sum]!];
      expect(sentLines).toEqual(expected);
      expect(block).not.toMatch(/^INVENTORY$/m);
      expect(block.trimEnd().split("\n").pop()).toMatch(/^summary: /);
    },
    T,
  );

  it(
    "AC-4: a doc with hard findings still dispatches — the report is why the reviewer is there",
    async () => {
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel]);
      expect(r.code).toBe(0);
      expect(readCalls(run).length).toBeGreaterThan(0);
    },
    T,
  );

  it(
    "AC-5/M68: lintArm records present/absent — from EVERY writer, not just the happy path",
    async () => {
      const a = mkRun();
      const rel = plantDoc(a, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(a, APPROVE);
      await runGuard(a, ["--lint-doc", rel]);
      expect(readResult(a).lintArm).toBe("present");

      const b = mkRun();
      writeScenario(b, APPROVE);
      await runGuard(b, []);
      expect(readResult(b).lintArm).toBe("absent");
    },
    T,
  );

  it(
    "AC-19: a --lint-doc outside the --cwd repository exits 2 and dispatches NOTHING",
    async () => {
      const run = mkRun();
      plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", "/etc/hosts"]);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/outside the repository/i);
      expect(readCalls(run)).toEqual([]);
    },
    T,
  );

  it(
    "AC-18/M20: the lint child runs with cwd = --cwd, not the wrapper's launch cwd",
    async () => {
      // Invariant 11 makes launch-cwd and --cwd differ on every worktree run, so
      // this is the case that breaks the feature in normal use.
      const run = mkRun();
      const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", rel]);
      expect(r.code).toBe(0);
      expect(readCalls(run)[0]!.stdin).toContain("TASK_MARKER_MISSING");
    },
    T,
  );

  it(
    "M81: any child status outside {0,1} refuses — 2, 3 and 255 alike",
    async () => {
      // The CLI defines exactly 0 and 1. An undefined status means it is not the
      // CLI, so dispatching a report built from whatever it printed would arm
      // the reviewer with something no contract describes.
      for (const status of [2, 3, 255]) {
        const run = mkRun();
        const rel = plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
        const stub = join(run.dir, `exit-${status}.mjs`);
        writeFileSync(
          stub,
          `process.stdout.write("spec:lint ${rel}\\nkind: plan (inferred)\\n\\nsummary: 0 hard, 0 advisory\\n");\nprocess.exit(${status});\n`,
        );
        writeScenario(run, APPROVE);
        const r = await runGuard(run, ["--lint-doc", rel], { CODEX_GUARD_SPEC_LINT: stub });
        expect(`status=${status} exit=${r.code}`).toBe(`status=${status} exit=2`);
        expect(readCalls(run)).toEqual([]);
      }
    },
    T,
  );

  it(
    "AC-3: a --lint-doc the CLI cannot read exits 2 and dispatches nothing",
    async () => {
      const run = mkRun();
      plantDoc(run, "docs/superpowers/plans/p.md", PLAN_WITH_DEFECT);
      writeScenario(run, APPROVE);
      const r = await runGuard(run, ["--lint-doc", "docs/superpowers/plans/does-not-exist.md"]);
      expect(r.code).toBe(2);
      expect(readCalls(run)).toEqual([]);
    },
    T,
  );
});
