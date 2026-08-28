import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCollectedSets,
  runCli,
  type CliDeps,
  type CollectionSpawnRecord,
  type SpawnResult,
} from "../../scripts/spec-lint";
import { premise, premiseHolds } from "../_shared/premise";

/**
 * Expect-N wiring (spec
 * `docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md` §6)
 * and the tested-adapter contract of plan review R1 F4: `buildCollectedSets`
 * and the `--exec-red` spawn plan are exercised executably, not only through
 * an injected final map. Failure modes caught: raw reporter basenames used as
 * membership keys (0/301 match — spec §5.2), a failed spawn minting a fail
 * verdict instead of the advisory, missing per-config dedup, wrong `--list`
 * command construction, and silent-drop of either code in the render path
 * (the CHECK_ORDER incident class, `lib/specLint/types.ts:14-33` — both arms
 * report under `taskContract`, so no renderer edit is needed and these cases
 * prove it).
 */

const FIXTURE = join(__dirname, "__fixtures__", "playwright-list-report.json");

describe("buildCollectedSets (adapter unit — spec §5.2 normalization)", () => {
  const fixtureStdout = (): string => readFileSync(FIXTURE, "utf8");

  it("normalizes reporter files into repo-relative token spelling via the report's own rootDir", () => {
    const raw = fixtureStdout();
    const parsed = JSON.parse(raw) as {
      config: { rootDir: string };
      suites: { specs: { file: string }[] }[];
    };
    const firstRaw = parsed.suites[0]!.specs[0]!.file;
    premiseHolds(
      "fixture carries a spec entry whose raw file value is NOT repo-relative token spelling",
      !firstRaw.startsWith("tests/e2e/"),
    );
    premise("fixture spec entries", parsed.suites.length, 0);

    const out = buildCollectedSets(
      [
        {
          config: "tests/e2e/standalone.config.ts",
          outcome: { kind: "exit", code: 0 },
          stdout: raw,
          stderrTail: "",
        },
      ],
      "/repo",
    );
    const entry = out.get("tests/e2e/standalone.config.ts")!;
    premiseHolds("entry is a collected set, not unavailable", entry instanceof Set);
    const set = entry as ReadonlySet<string>;
    // Derived from the fixture, never hand-copied: the raw basename joined to
    // the fixture's own rootDir and repo-relativized.
    expect(set.has(`tests/e2e/${firstRaw}`)).toBe(true);
    // The RAW reporter value is not a member — a raw-value passthrough fails here.
    expect(set.has(firstRaw)).toBe(false);
  });

  it("a timeout outcome becomes { unavailable } carrying the reason AND the stderr tail — never a set", () => {
    const out = buildCollectedSets(
      [
        {
          config: "(default)",
          outcome: { kind: "timeout" },
          stdout: "",
          stderrTail: "Error: browserType.launch: something broke",
        },
      ],
      "/repo",
    );
    const entry = out.get("(default)")!;
    premiseHolds("entry present", entry !== undefined);
    expect("unavailable" in entry).toBe(true);
    const u = (entry as { unavailable: string }).unavailable;
    expect(u).toContain("timed out");
    expect(u).toContain("Error: browserType.launch: something broke");
  });

  it("a non-zero exit becomes { unavailable } with the code and tail", () => {
    const out = buildCollectedSets(
      [
        {
          config: "(default)",
          outcome: { kind: "exit", code: 1 },
          stdout: "",
          stderrTail: "no tests found",
        },
      ],
      "/repo",
    );
    const u = out.get("(default)") as { unavailable: string };
    expect(u.unavailable).toContain("exited 1");
    expect(u.unavailable).toContain("no tests found");
  });

  it("unparseable stdout becomes { unavailable }, never a throw and never an empty set", () => {
    const out = buildCollectedSets(
      [
        {
          config: "(default)",
          outcome: { kind: "exit", code: 0 },
          stdout: "definitely not json",
          stderrTail: "tail",
        },
      ],
      "/repo",
    );
    const entry = out.get("(default)")!;
    expect("unavailable" in entry).toBe(true);
    expect((entry as { unavailable: string }).unavailable).toContain("not parseable");
  });

  it("one record per config in, one map entry per config out", () => {
    const records: CollectionSpawnRecord[] = [
      {
        config: "(default)",
        outcome: { kind: "exit", code: 0 },
        stdout: fixtureStdout(),
        stderrTail: "",
      },
      {
        config: "tests/e2e/standalone.config.ts",
        outcome: { kind: "exit", code: 0 },
        stdout: fixtureStdout(),
        stderrTail: "",
      },
    ];
    expect([...buildCollectedSets(records, "/repo").keys()].sort()).toEqual([
      "(default)",
      "tests/e2e/standalone.config.ts",
    ]);
  });
});

// ---- CLI-level: spawn-plan dedup + render, through injected deps ----

const ARM_A_LINE = "git status --porcelain | wc -l   # expect 0";
const CAND_DEFAULT = "pnpm exec playwright test tests/e2e/alpha.spec.ts";
const CAND_DEFAULT_2 = "pnpm exec playwright test tests/e2e/beta.spec.ts";
const CAND_STANDALONE =
  "pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/gamma.spec.ts";

const PLAN_DOC = [
  "# P",
  "",
  "```bash",
  ARM_A_LINE,
  CAND_DEFAULT,
  CAND_DEFAULT_2,
  CAND_STANDALONE,
  "```",
  "",
].join("\n");

function makeDeps(planText: string): {
  deps: CliDeps;
  spawns: { command: string; mode: string }[];
} {
  const spawns: { command: string; mode: string }[] = [];
  const files: Record<string, string> = {
    "/repo/docs/superpowers/plans/p.md": planText,
  };
  // A reporter document whose rootDir resolves under /repo/tests/e2e and whose
  // one file is alpha — so beta and gamma are absent from every collection.
  const report = JSON.stringify({
    config: { rootDir: "/repo/tests/e2e" },
    suites: [{ file: "alpha.spec.ts", specs: [{ file: "alpha.spec.ts" }], suites: [] }],
  });
  const deps: CliDeps = {
    cwd: () => "/repo",
    repoRoot: () => "/repo",
    listTrackedFiles: () => ["docs/superpowers/plans/p.md"],
    lstatKind: (p) => (files[p] !== undefined ? "file" : "missing"),
    readFileBytes: (p) => {
      const c = files[p];
      if (c === undefined) {
        const e = new Error("ENOENT") as Error & { code?: string };
        e.code = "ENOENT";
        throw e;
      }
      return Buffer.from(c, "utf8");
    },
    realpath: (p) => p,
    repairDiff: () => {
      throw new Error("repairDiff: not expected in this suite");
    },
    spawn: (command, _cwd, _timeoutMs, mode): SpawnResult => {
      spawns.push({ command, mode });
      if (command.includes("--list")) {
        return { status: 0, signal: null, stderr: "", stdout: report };
      }
      // Red commands and parse checks: report success so nothing else fires.
      return { status: 0, signal: null, stderr: "", stdout: "" };
    },
    mkdirExclusive: () => true,
    write: () => {},
    readFile: () => "",
    rm: () => {},
  };
  return { deps, spawns };
}

describe("--exec-red spawn plan (§5.2 — one spawn per DISTINCT config)", () => {
  it("three candidates across two configs spawn EXACTLY TWO --list commands with the right flags", () => {
    const { deps, spawns } = makeDeps(PLAN_DOC);
    runCli(["--exec-red", "docs/superpowers/plans/p.md"], deps);
    const lists = spawns.filter((s) => s.command.includes("--list"));
    expect(lists).toHaveLength(2);
    const [a, b] = [lists[0]!.command, lists[1]!.command].sort();
    expect(a).toBe("pnpm exec playwright test --list --reporter=json");
    expect(b).toBe(
      "pnpm exec playwright test --list --reporter=json --config tests/e2e/standalone.config.ts",
    );
  });
});

describe("render (§5.3, AC-5)", () => {
  it("Arm A renders in the default no-flag run; Arm B renders NOTHING without --exec-red", () => {
    const { deps, spawns } = makeDeps(PLAN_DOC);
    const out = runCli(["docs/superpowers/plans/p.md"], deps);
    // Word-bounded: a containment check passes for a suffixed code (pre-dispatch
    // mutant b2); the boundary kills it.
    expect(out.stdout).toMatch(/EXPECT_N_UNENFORCED(?![A-Za-z0-9_])/);
    expect(out.stdout).not.toContain("PLAYWRIGHT_COLLECTS_NOTHING");
    expect(out.stdout).not.toContain("PLAYWRIGHT_COLLECTION_UNVERIFIED");
    expect(spawns.filter((s) => s.command.includes("--list"))).toHaveLength(0);
  });

  it("with --exec-red, the absent files render the fail and the codes flow through the taskContract group", () => {
    const { deps } = makeDeps(PLAN_DOC);
    const out = runCli(["--exec-red", "docs/superpowers/plans/p.md"], deps);
    expect(out.stdout).toContain("PLAYWRIGHT_COLLECTS_NOTHING");
    expect(out.stdout).toContain("tests/e2e/beta.spec.ts");
    expect(out.stdout).toContain("tests/e2e/gamma.spec.ts");
    // alpha is collected under (default); no fail names it.
    expect(out.stdout).not.toMatch(/PLAYWRIGHT_COLLECTS_NOTHING.*alpha/);
    expect(out.exitCode).toBe(1);
  });

  it("with --exec-red and a failing --list spawn, the advisory renders WITH the stderr tail, never the fail", () => {
    const { deps } = makeDeps(["# P", "", "```bash", CAND_DEFAULT, "```", ""].join("\n"));
    // Override: the --list spawn dies.
    const failing: CliDeps = {
      ...deps,
      spawn: (command, _cwd, _t, _m): SpawnResult =>
        command.includes("--list")
          ? { status: 1, signal: null, stderr: "Error: kaboom at launch", stdout: "" }
          : { status: 0, signal: null, stderr: "", stdout: "" },
    };
    const out = runCli(["--exec-red", "docs/superpowers/plans/p.md"], failing);
    expect(out.stdout).not.toContain("PLAYWRIGHT_COLLECTS_NOTHING");
    expect(out.stdout).toContain("PLAYWRIGHT_COLLECTION_UNVERIFIED");
    expect(out.stdout).toContain("Error: kaboom at launch");
  });
});
