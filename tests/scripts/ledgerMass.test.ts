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
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * The frozen 2026-08-04 ledgers, materialized into a temp dir.
 *
 * They are COMMITTED AS JSON rather than as `BACKLOG.md` / `DEFERRED.md`, and
 * materialized here, because a committed `.md` copy sits in the prose namespace
 * that an OPEN SET of guards walk by extension: the referential-integrity
 * citation scan, the retired-identifier walk, the M9.5 trust-domain scan, and
 * whichever one lands next. Three failed on it before this moved — a frozen
 * 226 KB copy of BACKLOG.md names nearly every surface the repo has ever
 * retired — and each wanted its own exemption. A historical snapshot is DATA,
 * not prose, so it does not live where prose lives.
 *
 * The bytes are unchanged: `--at 8d78cdf13` reads the same blobs out of git
 * history and is asserted below to agree with this materialization.
 */
function materializeFixture(): string {
  const raw = JSON.parse(
    readFileSync(join(ROOT, "tests", "fixtures", "ledger-mass", "2026-08-04.ledgers.json"), "utf8"),
  ) as { files: Record<string, string> };
  const dir = mkdtempSync(join(tmpdir(), "ledger-mass-fixture-"));
  for (const [name, body] of Object.entries(raw.files))
    writeFileSync(join(dir, name), body, "utf8");
  return dir;
}

const FIXTURE = materializeFixture();

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
  // The oracle's second source is git history, and CI checks out at
  // `fetch-depth: 1` — the default — so the fixture rev is NOT in the object
  // store unless the workflow fetches it. This pins that wiring: without it the
  // test below fails in CI with a bare `fatal: invalid object name`, which reads
  // like a bad rev rather than a missing fetch (real failure: run 30954820760).
  //
  // Pinned to the FIXTURE's rev, not to a literal, so regenerating the fixture
  // at a new date fails here until the workflow is updated with it.
  it("the unit-suite-db job fetches this rev (CI checks out shallow)", () => {
    const yaml = readFileSync(join(ROOT, ".github", "workflows", "unit-suite.yml"), "utf8");
    const dbJob = yaml.slice(yaml.indexOf("  unit-suite-db:"), yaml.indexOf("  unit-suite-nodb:"));
    const fetched = [...dbJob.matchAll(/git fetch [^\n]*?\borigin\s+([0-9a-f]{40})\b/g)].map(
      (m) => m[1]!,
    );
    expect(
      fetched.filter((sha) => sha.startsWith(ORACLE.rev)),
      `unit-suite-db must \`git fetch\` a full 40-char SHA starting ${ORACLE.rev} — the rev this ` +
        "oracle reads out of git history. Found: " +
        (fetched.join(", ") || "no full-SHA fetch at all"),
    ).toHaveLength(1);
  });

  it("an unreachable rev fails with the shallow-clone cause, not `invalid object name`", () => {
    // What CI actually printed was `fatal: invalid object name '8d78cdf13'`,
    // which reads as a WRONG rev — the rev was right and the object store was
    // truncated. The workflow step above is the fix for CI; this is the fix for
    // every other shallow context, where nobody has a workflow to edit.
    let message = "";
    try {
      buildReport({ kind: "rev", value: "0".repeat(40) });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("0".repeat(40));
    expect(message).toMatch(/shallow/i);
    expect(message).toContain("git fetch");
  });

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
