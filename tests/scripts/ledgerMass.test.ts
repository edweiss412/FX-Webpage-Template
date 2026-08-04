/**
 * `pnpm ledger:mass` oracle (AC-B1).
 *
 * Spec: `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §3.1-§3.2.
 *
 * ANTI-TAUTOLOGY: every expected number below is HARD-CODED from spec §0's
 * census table, never recomputed with the script's own functions. A test that
 * asks `buildReport` what the mass is and then asserts it equals that passes
 * under any weights at all, including a table of zeroes — which is exactly the
 * mutant this oracle exists to kill. The fixture is a frozen copy of the
 * 2026-08-04 ledgers, so the numbers are facts about a specific tree.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EFFORT_WEIGHTS,
  SEVERITY_MULTIPLIERS,
  buildReport,
  parseEffort,
  parseSeverity,
} from "../../scripts/ledger-mass";

const ROOT = join(__dirname, "..", "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "ledger-mass", "2026-08-04");

/** Spec §0, verbatim. Change these only when the spec's census changes. */
const ORACLE = {
  backlog: { entries: 95, XS: 1, S: 18, M: 30, L: 15, unsized: 31, mass: 306 },
  deferred: { entries: 15, XS: 1, S: 1, M: 1, L: 1, unsized: 11, mass: 15 },
  total: { entries: 110, XS: 2, S: 19, M: 31, L: 16, unsized: 42, mass: 321 },
  /** Spec §3.1 names both by id: each carries `very low`, which is not a tier. */
  severityUnrecognized: ["BL-AGENDA-PROSE-SECOND-DAY", "BL-AGENDA-POSITIONAL-DAYSET-FALLBACK"],
  /** Spec §7 AC-B1 pins this rev as reproducing the same numbers from history. */
  rev: "8d78cdf13",
} as const;

const queue = (report: ReturnType<typeof buildReport>, file: string) => {
  const q = report.queues.find((x) => x.file === file);
  expect(q, `${file} missing from the report`).toBeDefined();
  return q!;
};

describe("the weights are the spec's, not whatever the code happens to hold", () => {
  it("pins every effort weight and severity multiplier by value", () => {
    // The whole metric rests on these ten numbers. Asserting the table itself
    // means a silent re-weighting fails HERE, naming the constant, rather than
    // surfacing three suites later as an unexplained mass drift.
    expect(EFFORT_WEIGHTS).toEqual({ XS: 1, S: 2, M: 4, L: 8 });
    expect(SEVERITY_MULTIPLIERS).toEqual({
      low: 1,
      "low-medium": 1.5,
      medium: 2,
      "medium-high": 2.5,
      high: 3,
    });
  });
});

describe("field parsing reads the LEADING token, and only the leading token", () => {
  it.each([
    ["S", "S"],
    ["  m  ", "M"],
    ["XS", "XS"],
    // The three corpus shapes spec §3.1 names by example.
    ["S–M depending on whether the fold is real", "S"],
    ["S (read CI history) to M (if real)", "S"],
    ["L — the whole surface", "L"],
  ])("parseEffort(%j) is %s", (raw, want) => {
    expect(parseEffort(raw)).toBe(want);
  });

  it.each([
    // A hedge in front of the value means no size was committed to. This is the
    // case that separates the canonical rule from mdview Rev 14's `\b(XS|S|M|L)\b`
    // anywhere-in-the-value read, which called `likely S` a sized S.
    ["likely S", "likely S is a hedge, not a size"],
    ["", "absent"],
    ["TBD", "unrecognized token"],
    ["depends", "prose"],
    ["Small", "not a tier spelling"],
  ])("parseEffort(%j) is unsized — %s", (raw) => {
    expect(parseEffort(raw)).toBeNull();
  });

  it("parseEffort treats absent and unrecognized as one state, both excluded", () => {
    expect(parseEffort(undefined)).toBeNull();
  });

  it.each([
    ["low", "low"],
    ["HIGH", "high"],
    ["Medium", "medium"],
    // Longest spelling first, or this reads as bare `low` at multiplier 1.
    ["LOW-MEDIUM (false operator alert; no data impact)", "low-medium"],
    ["medium-high, blocks an operator", "medium-high"],
  ])("parseSeverity(%j) is %s", (raw, want) => {
    expect(parseSeverity(raw)).toEqual({ tier: want, unrecognized: false });
  });

  it("severity ABSENT is silent — absence is the corpus norm and refines nothing", () => {
    expect(parseSeverity(undefined)).toEqual({ tier: null, unrecognized: false });
    expect(parseSeverity("   ")).toEqual({ tier: null, unrecognized: false });
  });

  it("severity PRESENT but unrecognized is multiplier 1 AND a named signal", () => {
    // The distinction that matters: a mistyped severity must never contribute a
    // plausible mass with nothing reported. `very low` is the live corpus case.
    expect(parseSeverity("very low")).toEqual({ tier: null, unrecognized: true });
    expect(parseSeverity("critical")).toEqual({ tier: null, unrecognized: true });
  });
});

describe("the 2026-08-04 fixture reproduces the spec §0 census exactly", () => {
  const report = buildReport({ kind: "root", value: FIXTURE });

  it("BACKLOG.md — 95 open, 306 mass, 31 unsized", () => {
    const q = queue(report, "BACKLOG.md");
    expect(q.entries).toBe(ORACLE.backlog.entries);
    expect(q.byTier).toEqual({
      XS: ORACLE.backlog.XS,
      S: ORACLE.backlog.S,
      M: ORACLE.backlog.M,
      L: ORACLE.backlog.L,
    });
    expect(q.unsized).toHaveLength(ORACLE.backlog.unsized);
    expect(q.mass).toBe(ORACLE.backlog.mass);
  });

  it("DEFERRED.md — 15 open, 15 mass, 11 unsized", () => {
    const q = queue(report, "DEFERRED.md");
    expect(q.entries).toBe(ORACLE.deferred.entries);
    expect(q.byTier).toEqual({
      XS: ORACLE.deferred.XS,
      S: ORACLE.deferred.S,
      M: ORACLE.deferred.M,
      L: ORACLE.deferred.L,
    });
    expect(q.unsized).toHaveLength(ORACLE.deferred.unsized);
    expect(q.mass).toBe(ORACLE.deferred.mass);
  });

  it("totals — 110 open, 321 mass, 42 unsized", () => {
    expect(report.totals).toEqual({
      entries: ORACLE.total.entries,
      byTier: {
        XS: ORACLE.total.XS,
        S: ORACLE.total.S,
        M: ORACLE.total.M,
        L: ORACLE.total.L,
      },
      mass: ORACLE.total.mass,
      unsized: ORACLE.total.unsized,
      severityUnrecognized: ORACLE.severityUnrecognized.length,
    });
  });

  it("reports the two `very low` entries by id, not merely as a count", () => {
    // A count says something is wrong; an id says which entry to go fix.
    expect(queue(report, "BACKLOG.md").severityUnrecognized).toEqual([
      ...ORACLE.severityUnrecognized,
    ]);
  });

  it("lists unsized ids, so an entry invisible to mass is still actionable", () => {
    const unsized = queue(report, "DEFERRED.md").unsized;
    expect(unsized).toContain("VOICEOVER-ANNOUNCER-SPOTCHECK");
    expect(unsized).not.toContain("PSQL-GUARD-RECALL-RESIDUAL"); // sized S at that rev
  });
});

describe("--at reads the same numbers back out of git history", () => {
  it(`--at ${ORACLE.rev} equals the committed fixture`, () => {
    const fromGit = buildReport({ kind: "rev", value: ORACLE.rev });
    expect(fromGit.totals.mass).toBe(ORACLE.total.mass);
    expect(fromGit.totals.entries).toBe(ORACLE.total.entries);
    expect(queue(fromGit, "BACKLOG.md").mass).toBe(ORACLE.backlog.mass);
    expect(queue(fromGit, "DEFERRED.md").mass).toBe(ORACLE.deferred.mass);
    // Same tree, two sources: if the fixture were ever edited to make a number
    // pass, git history would still hold the truth and this would diverge.
    const fromFixture = buildReport({ kind: "root", value: FIXTURE });
    expect(queue(fromGit, "BACKLOG.md").unsized).toEqual(queue(fromFixture, "BACKLOG.md").unsized);
    expect(queue(fromGit, "DEFERRED.md").unsized).toEqual(
      queue(fromFixture, "DEFERRED.md").unsized,
    );
  });
});

describe("the CLI envelope", () => {
  const run = (args: string[]) =>
    execFileSync("pnpm", ["--silent", "ledger:mass", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    });

  it("--json round-trips the full report, every field the human view summarizes", () => {
    const parsed = JSON.parse(run(["--root", FIXTURE, "--json"]));
    expect(parsed).toEqual(
      JSON.parse(JSON.stringify(buildReport({ kind: "root", value: FIXTURE }))),
    );
    // Named explicitly, because the mdview parity oracle (§3.4) compares the
    // FULL envelope: a viewer that dropped the severity warnings or an unsized
    // id must fail that comparison by construction, which needs them present.
    for (const q of parsed.queues) {
      expect(Object.keys(q).sort()).toEqual([
        "byTier",
        "entries",
        "file",
        "mass",
        "severityUnrecognized",
        "unsized",
      ]);
    }
    expect(parsed.queues.map((q: { file: string }) => q.file)).toEqual([
      "BACKLOG.md",
      "DEFERRED.md",
    ]);
  });

  it("the human view prints the same totals it computed", () => {
    const text = run(["--root", FIXTURE]);
    expect(text).toMatch(/BACKLOG\.md\s+95(\s+\d+){4}\s+31\s+306/);
    expect(text).toMatch(/DEFERRED\.md\s+15(\s+\d+){4}\s+11\s+15/);
    expect(text).toMatch(/TOTAL\s+110(\s+\d+){4}\s+42\s+321/);
  });

  it("--at and --root together is a usage error, not a silent winner", () => {
    expect(() => run(["--at", "HEAD", "--root", FIXTURE])).toThrow();
  });
});

describe("scratch fixtures — archives, and a planted unrecognized severity", () => {
  const scratch = () => mkdtempSync(join(tmpdir(), "ledger-mass-"));

  const entry = (id: string, meta: string) => `## ${id} — a planted entry\n\n${meta}\n\nBody.\n`;

  it("skips *-archive.md — mass measures the OPEN queues", () => {
    const dir = scratch();
    writeFileSync(join(dir, "BACKLOG.md"), `# B\n\n${entry("BL-OPEN-ONE", "**Effort:** S")}`);
    writeFileSync(
      join(dir, "BACKLOG-archive.md"),
      `# BA\n\n${entry("BL-ARCHIVED-ONE", "**Effort:** L")}`,
    );
    const report = buildReport({ kind: "root", value: dir });
    expect(report.queues.map((q) => q.file)).toEqual(["BACKLOG.md"]);
    // An L is 8; if the archive leaked in, the mass would be 10, not 2.
    expect(report.totals.mass).toBe(2);
  });

  it("reports a planted present-but-unrecognized severity BY ID, at multiplier 1", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "BACKLOG.md"),
      `# B\n\n${entry("BL-PLANTED-BAD-SEVERITY", "**Severity:** catastrophic · **Effort:** M")}${entry("BL-PLANTED-GOOD-SEVERITY", "**Severity:** high · **Effort:** M")}`,
    );
    const report = buildReport({ kind: "root", value: dir });
    expect(report.queues[0]!.severityUnrecognized).toEqual(["BL-PLANTED-BAD-SEVERITY"]);
    // 4 (M × unrecognized→1) + 12 (M × high 3). A silent auto-correct to `high`
    // would give 24; a silent drop of the row would give 12.
    expect(report.totals.mass).toBe(16);
  });

  it("an unsized entry contributes nothing to mass and is listed by id", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "BACKLOG.md"),
      `# B\n\n${entry("BL-SIZED", "**Effort:** XS")}${entry("BL-UNSIZED", "**Severity:** high")}${entry("BL-HEDGED", "**Effort:** likely L")}`,
    );
    const report = buildReport({ kind: "root", value: dir });
    expect(report.totals.mass).toBe(1);
    expect(report.queues[0]!.unsized).toEqual(["BL-UNSIZED", "BL-HEDGED"]);
    expect(report.totals.entries).toBe(3);
  });
});
