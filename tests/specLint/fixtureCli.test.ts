/**
 * The fixture arm end to end: a real filesystem, a real vitest child, and the
 * real JSON reporter (fixture spec §6).
 *
 * A NEW file rather than an extension of tests/specLint/cli.test.ts, whose
 * subject is the pre-existing CLI surface. Every case here exists because the
 * pure ladder can be entirely right while the ADAPTER hands it a
 * differently-shaped report — the module-scope premise is the sharpest instance
 * in the arc and is unreachable from any pure test — and because §2.5's
 * all-skipped shape exits 0, so only a real run proves the adapter surfaces
 * per-assertion statuses at all.
 *
 * Trivial blocks only: no heavy phase, no DB, no browser.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeDeps, runCli, type CliDeps, type SpawnResult } from "../../scripts/spec-lint";

const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
/** Matches the .gitignore glob the same PR lands, so a crash leaves nothing tracked. */
const TMP = "tests/.spec-lint-fixtures-cli-tmp";
/** The shipped splice directory: a FIXED name since review round 2. */
const SPLICE_DIR = "tests/.spec-lint-fixtures";

const spliceDirsUnderTests = (): string[] =>
  readdirSync(join(REPO, "tests")).filter(
    (name) => name.startsWith(".spec-lint-fixtures") && join("tests", name) !== TMP,
  );

/**
 * The SHIPPED deps (`nodeDeps`), with two narrowings, each the point of a case
 * rather than a convenience:
 *   - `mkdir` and `spawn` are recorded, which is how "ZERO vitest spawns" is
 *     asserted as an observation rather than inferred from a finding;
 *   - `listTrackedFiles` returns [] because these documents cite nothing and a
 *     real `git ls-files` per case would dominate the suite's runtime.
 *
 * Nothing else is varied. The splice directory is a fixed name since review
 * round 2, so the §4.2 collision refusal is constructible without injecting
 * anything.
 */
function spyDeps(): { deps: CliDeps; spawns: string[]; mkdirs: string[] } {
  const base = nodeDeps(REPO);
  const spawns: string[] = [];
  const mkdirs: string[] = [];
  const deps: CliDeps = {
    ...base,
    listTrackedFiles: () => [],
    mkdir: (relPath: string) => {
      mkdirs.push(relPath);
      base.mkdir(relPath);
    },
    spawn: (
      command: string,
      cwd: string,
      timeoutMs: number,
      mode: "parse" | "exec",
    ): SpawnResult => {
      spawns.push(command);
      return base.spawn(command, cwd, timeoutMs, mode);
    },
  };
  return { deps, spawns, mkdirs };
}

let docCounter = 0;

interface Run {
  codes: string[];
  details: string[];
  exitCode: number;
  vitestSpawns: string[];
  mkdirs: string[];
}

/** One enrolled block per element, each a complete vitest file. */
function lintPlan(blocks: string[]): Run {
  mkdirSync(join(REPO, TMP), { recursive: true });
  const rel = `${TMP}/plan-${++docCounter}.md`;
  const text = [
    "# Temp plan",
    "",
    ...blocks.flatMap((block) => [
      "<!-- fixture: why=`re-enactment` -->",
      "```ts",
      block,
      "```",
      "",
    ]),
  ].join("\n");
  writeFileSync(join(REPO, rel), text);
  const { deps, spawns, mkdirs } = spyDeps();
  const out = runCli(["--json", "--exec-red", "--kind", "plan", rel], deps);
  const parsed = JSON.parse(out.stdout) as {
    findings: { code: string; detail?: string }[];
  };
  const fixture = parsed.findings.filter((f) => f.code.startsWith("FIXTURE_"));
  return {
    codes: fixture.map((f) => f.code),
    details: fixture.map((f) => f.detail ?? ""),
    exitCode: out.exitCode,
    vitestSpawns: spawns.filter((c) => c.includes("vitest")),
    mkdirs,
  };
}

const TRIVIAL = [
  'import { it, expect } from "vitest";',
  'it("passes", () => { expect(1).toBe(1); });',
].join("\n");

const PREMISE_IN_TEST = [
  'import { it, expect } from "vitest";',
  'import { premiseHolds } from "@/tests/_shared/premise";',
  'it("the constructed fixture reaches the parser", () => {',
  '  premiseHolds("the constructed fixture reached the parser", false);',
  "  expect(1).toBe(1);",
  "});",
].join("\n");

// spec §2.9: a premise at MODULE scope throws during collection, so the file
// registers no test case and the message arrives at FILE level and nowhere else.
const PREMISE_AT_MODULE_SCOPE = [
  'import { it, expect } from "vitest";',
  'import { premise } from "@/tests/_shared/premise";',
  'premise("the producer yielded cases", 0, 0);',
  'it("never registers", () => { expect(1).toBe(1); });',
].join("\n");

const UNRESOLVABLE_IMPORT = [
  'import { it, expect } from "vitest";',
  'import { nope } from "@/lib/does/not/exist";',
  'it("never runs", () => { expect(nope).toBe(1); });',
].join("\n");

// spec §2.5: both bodies would FAIL if executed; the run reports zero failures
// and exits 0.
const ALL_SKIPPED = [
  'import { describe, it, expect } from "vitest";',
  'describe.skip("skipped wholesale", () => {',
  '  it("would fail", () => { expect(1).toBe(2); });',
  "});",
].join("\n");

/**
 * The §2.4 historical pair, against the LIVE parser. The r4 defect was a
 * two-column v2 header, which `parseTransportation` returns null for before any
 * membership branch (lib/parser/blocks/transport.ts:388); the merged
 * three-column header opens the block and yields the schedule row.
 */
const historical = (header: string) =>
  [
    'import { it, expect } from "vitest";',
    'import { premiseHolds } from "@/tests/_shared/premise";',
    'import { parseTransportation } from "@/lib/parser/blocks/transport";',
    `const v2md = ["${header}", "| Rental Pickup | 5/12 @ 8:00 AM |  |"].join("\\n");`,
    'it("the constructed header reaches the schedule branch", () => {',
    '  const row = parseTransportation(v2md, "v2");',
    '  premiseHolds("the live v2 matcher opened a block on the constructed header", row !== null);',
    '  expect(row!.schedule.map((s) => s.stage)).toContain("Rental Pickup");',
    "});",
  ].join("\n");

const HISTORICAL_R4 = historical("| TRANSPORTATION | PHONE |");
const HISTORICAL_MERGED = historical("| TRANSPORTATION | TRANSPORTATION | PHONE |");

afterEach(() => {
  rmSync(join(REPO, TMP), { recursive: true, force: true });
});

describe("fixture arm end to end, through the real reporter (spec §6)", () => {
  it("a premise failing INSIDE a test draws the verdict, and the directory does not survive", () => {
    const run = lintPlan([PREMISE_IN_TEST]);
    expect(run.codes).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(run.details[0]).toContain("the constructed fixture reached the parser");
    expect(run.exitCode).toBe(1);
    expect(run.vitestSpawns).toHaveLength(1);
    expect(spliceDirsUnderTests()).toEqual([]);
  });

  it("a premise failing at MODULE scope draws the VERDICT, never the advisory", () => {
    // The red for this task. After the assertion channel alone is forwarded,
    // this block arrives at the core with no failure text at all: zero test
    // cases, sentinel only in the file-level message, so it classifies as the
    // advisory and the one verdict this arm exists to emit is suppressed --
    // on exactly the shape the live corpus already contains
    // (docs/superpowers/plans/2026-08-04-guard-premise-reachability.md:1174).
    const run = lintPlan([PREMISE_AT_MODULE_SCOPE]);
    expect(run.codes).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(run.codes).not.toContain("FIXTURE_PROBE_UNVERIFIED");
    expect(run.details[0]).toContain("the producer yielded cases");
    expect(run.exitCode).toBe(1);
    expect(spliceDirsUnderTests()).toEqual([]);
  });

  it("the §2.4 historical pair reproduces: r4 header verdict, merged header silent", () => {
    const bad = lintPlan([HISTORICAL_R4]);
    expect(bad.codes).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(bad.details[0]).toContain("the live v2 matcher opened a block");
    const good = lintPlan([HISTORICAL_MERGED]);
    expect(good.codes).toEqual([]);
    expect(good.exitCode).toBe(0);
    expect(spliceDirsUnderTests()).toEqual([]);
  });

  it("an unresolvable import draws the advisory, naming what the runner said", () => {
    const run = lintPlan([UNRESOLVABLE_IMPORT]);
    expect(run.codes).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
    expect(run.details[0]).toContain("@/lib/does/not/exist");
    expect(spliceDirsUnderTests()).toEqual([]);
  });

  it("a skipped describe draws NO fixture code — entries present means the report has test cases", () => {
    // §2.5's shape exits 0 with a `passed` file status and two skipped entries.
    // The arm makes no claim about it (limit §8 item 4): not the advisory,
    // because the report DOES carry test cases, and not a verdict, because no
    // premise failed. Only a real run proves the adapter carries per-assertion
    // statuses through at all.
    const run = lintPlan([ALL_SKIPPED]);
    expect(run.codes).toEqual([]);
    expect(run.exitCode).toBe(0);
    expect(run.vitestSpawns).toHaveLength(1);
    expect(spliceDirsUnderTests()).toEqual([]);
  });

  it("two blocks in one doc share ONE vitest boot and map back to their own markers", () => {
    const run = lintPlan([TRIVIAL, PREMISE_IN_TEST]);
    expect(run.vitestSpawns).toHaveLength(1);
    expect(run.codes).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(spliceDirsUnderTests()).toEqual([]);
  });

  it("a pre-existing splice directory spawns NO vitest, draws the advisory, and is left alone", () => {
    // Round 2's finding, and the reason the directory name no longer carries a
    // pid: a survivor of an ABRUPT crash — where `finally` never runs at all —
    // was invisible to every later process, because each checked only a name
    // derived from its own pid. Here the survivor is created by nobody this
    // process knows about, exactly as a crash leaves one, and the next
    // invocation must refuse on it.
    mkdirSync(join(REPO, SPLICE_DIR), { recursive: true });
    writeFileSync(join(REPO, SPLICE_DIR, "line-9.fixture.test.ts"), "// stranded by a crash\n");
    try {
      const run = lintPlan([TRIVIAL]);
      expect(run.mkdirs).toEqual([]);
      expect(run.vitestSpawns).toEqual([]);
      expect(run.codes).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
      expect(run.details[0]).toContain(SPLICE_DIR);
      // The refusal is not a takeover: whatever left it there keeps it, and the
      // stranded file is still on disk for the author to see and remove.
      expect(existsSync(join(REPO, SPLICE_DIR, "line-9.fixture.test.ts"))).toBe(true);
    } finally {
      rmSync(join(REPO, SPLICE_DIR), { recursive: true, force: true });
    }
    expect(spliceDirsUnderTests()).toEqual([]);
  });

  it("the directory a completed run creates is the SAME one the next run checks", () => {
    // The property the pid destroyed: two runs in sequence must agree on the
    // name, or a survivor of the first is invisible to the second.
    const first = lintPlan([TRIVIAL]);
    const second = lintPlan([TRIVIAL]);
    expect(first.mkdirs).toEqual([SPLICE_DIR]);
    expect(second.mkdirs).toEqual([SPLICE_DIR]);
    expect(spliceDirsUnderTests()).toEqual([]);
  });
});
