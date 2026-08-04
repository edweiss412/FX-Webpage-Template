import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs"); // .bin/tsx is a shell wrapper
const DIR = "tests/specLint/fixtures/docs/superpowers/plans";
const T = 30000;

/** A plan whose ONLY defect is a task-contract one. */
const DEFECTIVE = [
  "# Plan",
  "",
  "<!-- tasks: depth=2 -->",
  "",
  "## Task 1",
  "",
  "prose with no marker",
  "",
  "<!-- tasks: end -->",
  "",
].join("\n");

const WAIVED = DEFECTIVE.replace(
  "## Task 1",
  "<!-- spec-lint: ignore — deliberate, under test -->\n## Task 1",
);
const WAIVER_ON_PROSE = DEFECTIVE.replace(
  "prose with no marker",
  "<!-- spec-lint: ignore — targets prose, suppresses nothing -->\nprose with no marker",
);

const cli = (rel: string) => {
  const r = spawnSync(process.execPath, [TSX, "scripts/spec-lint.ts", rel], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout ?? "" };
};

const write = (name: string, text: string) => {
  writeFileSync(join(ROOT, DIR, name), text);
  return `${DIR}/${name}`;
};

let defective = "";
let waived = "";
let onProse = "";
let asSpec = "";

beforeAll(() => {
  mkdirSync(join(ROOT, DIR), { recursive: true });
  mkdirSync(join(ROOT, "tests/specLint/fixtures/docs/superpowers/specs"), { recursive: true });
  defective = write("_tc-defective.md", DEFECTIVE);
  waived = write("_tc-waived.md", WAIVED);
  onProse = write("_tc-waiver-on-prose.md", WAIVER_ON_PROSE);
  asSpec = "tests/specLint/fixtures/docs/superpowers/specs/_tc-as-spec.md";
  writeFileSync(join(ROOT, asSpec), DEFECTIVE);
});

afterAll(() => {
  for (const f of [defective, waived, onProse, asSpec]) {
    rmSync(join(ROOT, f), { force: true });
  }
});

describe("taskContract wiring (design §3.4)", () => {
  /**
   * One minimal plan per code, driven from the §3.4 catalog rather than
   * hand-picked. A single-finding fixture kills only the mutant that downgrades
   * EVERY code; ten singleton mutants exist, and one fixture covers one.
   */
  const CODE_FIXTURES: Record<string, string> = {
    TASK_ENROLL_MALFORMED: ["<!-- tasks: depth=x -->", "", "## Task 1", ""].join("\n"),
    TASK_ENROLL_DUPLICATE: [
      "<!-- tasks: depth=2 -->",
      "",
      "## Task 1",
      "",
      "<!-- task: red=`x` ac=AC-1 -->",
      "",
      "AC-1 here.",
      "",
      "<!-- tasks: end -->",
      "",
      "<!-- tasks: depth=2 -->",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
    TASK_ENROLL_EMPTY: [
      "<!-- tasks: depth=2 -->",
      "",
      "### deeper",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
    TASK_MARKER_MISSING: DEFECTIVE,
    TASK_MARKER_ORPHANED: [
      "<!-- tasks: depth=2 -->",
      "",
      "<!-- task: red=`x` ac=AC-1 -->",
      "",
      "## Task 1",
      "",
      "<!-- task: red=`y` ac=AC-1 -->",
      "",
      "AC-1 here.",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
    TASK_MARKER_DUPLICATE: [
      "<!-- tasks: depth=2 -->",
      "",
      "## Task 1",
      "",
      "<!-- task: red=`x` ac=AC-1 -->",
      "<!-- task: red=`y` ac=AC-1 -->",
      "",
      "AC-1 here.",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
    TASK_MARKER_MALFORMED: [
      "<!-- tasks: depth=2 -->",
      "",
      "## Task 1",
      "",
      "<!-- task: red=x ac=AC-1 -->",
      "",
      "AC-1 here.",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
    TASK_RED_EMPTY: [
      "<!-- tasks: depth=2 -->",
      "",
      "## Task 1",
      "",
      "<!-- task: red=`` ac=AC-1 -->",
      "",
      "AC-1 here.",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
    TASK_AC_MISSING: [
      "<!-- tasks: depth=2 -->",
      "",
      "## Task 1",
      "",
      "<!-- task: red=`x` -->",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
    TASK_AC_UNRESOLVED: [
      "<!-- tasks: depth=2 -->",
      "",
      "## Task 1",
      "",
      "<!-- task: red=`x` ac=AC-99 -->",
      "",
      "<!-- tasks: end -->",
      "",
    ].join("\n"),
  };

  it(
    "AC-47/M75/M80: ALL TEN codes are hard — exit 1 and rendered FAIL, never ADVISORY",
    () => {
      for (const [code, text] of Object.entries(CODE_FIXTURES)) {
        const rel = write(`_tc-sev-${code}.md`, text);
        try {
          const r = cli(rel);
          expect(`${code} exit=${r.code}`).toBe(`${code} exit=1`);
          expect(r.stdout).toMatch(new RegExp(`FAIL ${code} `));
          expect(r.stdout).not.toMatch(new RegExp(`ADVISORY ${code} `));
        } finally {
          rmSync(join(ROOT, rel), { force: true });
        }
      }
    },
    T,
  );

  it(
    "AC-25/M21: findings render under their own taskContract: heading in real stdout",
    () => {
      const out = cli(defective).stdout;
      const lines = out.split("\n");
      const sec = lines.findIndex((l) => l === "taskContract:");
      expect(sec).toBeGreaterThan(-1);
      expect(lines.slice(sec + 1).join("\n")).toMatch(/TASK_MARKER_MISSING \d+:\d+ /);
    },
    T,
  );

  it(
    "AC-25/M76: the section precedes INVENTORY — after it, the embed drops every finding",
    () => {
      // §2.2.2 removes everything from the bare INVENTORY line to `summary:`, so
      // a renderer appending taskContract after the inventory satisfies a
      // presence-only check while the review prompt contains none of it.
      const lines = cli(defective).stdout.split("\n");
      const inv = lines.findIndex((l) => l === "INVENTORY");
      const sec = lines.findIndex((l) => l === "taskContract:");
      expect(sec).toBeGreaterThan(-1);
      if (inv !== -1) expect(sec).toBeLessThan(inv);
    },
    T,
  );

  it(
    "AC-40/M42: a plan draws taskContract findings and ZERO sections-family findings",
    () => {
      // The fixture lacks every heading checkSections requires of a spec, so
      // removing the kind short-circuit would light it up. Asserted on output,
      // not by grepping the source for an unchanged line.
      const out = cli(defective).stdout;
      expect(out).toMatch(/TASK_MARKER_MISSING/);
      expect(out).not.toMatch(/SECTION_MISSING_/);
    },
    T,
  );

  it(
    "AC-10: byte-identical text linted as a spec draws no task-contract finding",
    () => {
      expect(cli(asSpec).stdout).not.toMatch(/TASK_/);
    },
    T,
  );

  it(
    "M50: a waiver suppresses a task-contract finding like any other hard finding",
    () => {
      // Suppression applies only to severity "fail", so this doubles as a
      // severity assertion. The second case stops it being a tautology: a
      // waiver targeting ordinary prose must leave the finding standing.
      expect(cli(waived).stdout).not.toMatch(/TASK_MARKER_MISSING/);
      expect(cli(onProse).stdout).toMatch(/TASK_MARKER_MISSING/);
    },
    T,
  );
});
