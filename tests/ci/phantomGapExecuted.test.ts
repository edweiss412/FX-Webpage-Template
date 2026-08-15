/**
 * tests/ci/phantomGapExecuted.test.ts
 *
 * The referring suite for `scripts/lib/phantomGapExecuted.mjs` — the
 * (case title, project) executed-count oracle the phantom-gap job's diagram step
 * runs after its Playwright invocation.
 *
 * WHY THE FIXTURE IS A REAL REPORT. `tests/ci/fixtures/phantom-gap-diagrams-report.json`
 * is a captured `--reporter=list,json` run of that exact step (both projects,
 * 2026-08-10), trimmed to the fields the oracle reads and otherwise verbatim —
 * nesting, ids, per-project `tests[]` and all. A hand-built fixture would encode
 * the report shape the oracle's author BELIEVED in, which is the one shape a
 * shape bug cannot be caught in. Every doctored variant below is derived FROM
 * that report by one edit, so each red is a single named difference from reality.
 *
 * WHY THE TITLES ARE RECONCILED AGAINST THE LIVE SPEC. A required title is a
 * string typed in two places; a rename in the spec file silently retires the
 * requirement and the step goes dark green. The last case greps the live spec
 * for every required title.
 *
 * This suite is also what makes the oracle ENROLLABLE in the source-mutation
 * registry (`tests/mutation/source/registry.ts`): the overlay can only reach a
 * module some suite imports.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_REPORT_RELATIVE,
  REQUIRED_PAIRS,
  executedPairs,
  formatFailure,
  formatSuccess,
  missingPairs,
  pairKey,
  resolveReportPath,
  runCheck,
} from "@/scripts/lib/phantomGapExecuted.mjs";
import { premise, premiseHolds } from "@/tests/_shared/premise";

type ReportResult = { status: string };
type ReportTest = { projectName?: string; status?: string; results?: ReportResult[] };
type ReportSpec = {
  title?: string;
  file?: string;
  line?: number;
  id?: string;
  tests?: ReportTest[];
};
type ReportSuite = { title?: string; file?: string; specs?: ReportSpec[]; suites?: ReportSuite[] };
type Report = { suites?: ReportSuite[] };

const FIXTURE_PATH = "tests/ci/fixtures/phantom-gap-diagrams-report.json";
const SPEC_PATH = "tests/e2e/crew-layout-dimensions.spec.ts";
const CLI = "scripts/check-phantom-gap-executed.mjs";

/**
 * Spawned, because an exit code is the one thing an import cannot observe.
 *
 * Declared at MODULE SCOPE deliberately. `premiseScan` registers declaration
 * extents module-scope only (premiseScan.ts:146-161), and `isModuleScope`
 * (:187-200) returns false at the first enclosing function -- which a `describe`
 * body is. A helper nested there has no registered extent, so every test calling
 * it classifies as environment-free: silently, and forever. This helper reaches
 * `node:child_process`, so hiding it from the recognizer would make the premise
 * contract report a clean corpus it no longer understands. The recognizer's
 * blindness is the wider class, filed as BL-PREMISESCAN-NESTED-HELPER-SCOPE.
 */
function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

function loadReport(): Report {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Report;
}

/** Walk every spec in a report, in place. Used to build the doctored variants. */
function forEachSpec(report: Report, visit: (spec: ReportSpec) => void): void {
  const walk = (suites: ReportSuite[] | undefined): void => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) visit(spec);
      walk(suite.suites);
    }
  };
  walk(report.suites);
}

/**
 * The spec node AND its per-project test arm for one required pair.
 *
 * Keyed on the pair, not the title alone, because Playwright emits ONE SPEC NODE
 * PER PROJECT — ten nodes for five cases across two projects, each with a single
 * `tests[]` entry and its own id (verified in the captured fixture). A
 * title-only lookup returns whichever project's node came last, which is how a
 * hand-built "one spec, two test arms" fixture would have quietly mis-modelled
 * the report the oracle actually has to read.
 */
function findArm(
  report: Report,
  title: string,
  project: string,
): { spec: ReportSpec; test: ReportTest } | undefined {
  let hit: { spec: ReportSpec; test: ReportTest } | undefined;
  forEachSpec(report, (spec) => {
    if (spec.title !== title) return;
    for (const test of spec.tests ?? []) {
      if (test.projectName === project) hit = { spec, test };
    }
  });
  return hit;
}

/** The suite node that actually holds the spec rows (the describe, not the file). */
function specHolder(report: Report): ReportSuite {
  let hit: ReportSuite | undefined;
  const walk = (suites: ReportSuite[] | undefined): void => {
    for (const suite of suites ?? []) {
      if ((suite.specs ?? []).length > 0) hit = suite;
      walk(suite.suites);
    }
  };
  walk(report.suites);
  premiseHolds("the fixture has a suite holding spec rows", hit !== undefined);
  return hit!;
}

describe("check-phantom-gap-executed — the captured report is a valid premise", () => {
  test("the fixture really executed every required pair, or every red below is vacuous", () => {
    const report = loadReport();
    premise("the oracle requires at least one pair", REQUIRED_PAIRS.length, 0);
    premiseHolds(
      "the fixture covers BOTH projects, so a single-project report cannot stand in for the split",
      new Set(REQUIRED_PAIRS.map((pair) => pair.project)).size === 2,
    );

    expect(missingPairs(report)).toEqual([]);
  });

  test("every required pair resolves to exactly one spec identity (no repeat inflation)", () => {
    const found = executedPairs(loadReport());
    for (const pair of REQUIRED_PAIRS) {
      const ids = found.get(pairKey(pair.title, pair.project));
      expect(ids, `${pair.project} / ${pair.title} is absent from the fixture`).toBeDefined();
      expect(ids!.size).toBe(1);
    }
  });
});

describe("check-phantom-gap-executed — a case that did not run is caught", () => {
  test("THE CONSTRUCTED RED: the desktop-only zoom case skipped fails the oracle", () => {
    // The exact regression the split creates. Adding --project=desktop-chromium
    // without this oracle lets a chromium-gated case skip while four mobile
    // executions keep any per-file count satisfied.
    const target = REQUIRED_PAIRS.find((pair) => pair.project === "desktop-chromium")!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project);
    premiseHolds(`the fixture carries the case to doctor (${target.title})`, arm !== undefined);
    premiseHolds(
      "that case really executed under desktop-chromium before doctoring",
      (arm!.test.results ?? []).some((result) => result.status === "passed"),
    );

    arm!.test.status = "skipped";
    arm!.test.results = [{ status: "skipped" }];

    expect(missingPairs(report)).toEqual([target]);
  });

  test("a mobile-only case skipped fails the oracle too (the split is symmetric)", () => {
    const target = REQUIRED_PAIRS.find(
      (pair) =>
        pair.project === "mobile-safari" && pair.title.includes("opens on a clamped variant"),
    )!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project)!;
    arm.test.results = [{ status: "skipped" }];

    expect(missingPairs(report)).toEqual([target]);
  });

  test("a case that ran under the WRONG project does not satisfy its pair", () => {
    // The whole reason the key is a pair. Re-labelling the desktop execution as
    // mobile leaves the same number of passing results in the report.
    const target = REQUIRED_PAIRS.find((pair) => pair.project === "desktop-chromium")!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project)!;
    arm.test.projectName = "mobile-safari";

    expect(missingPairs(report)).toEqual([target]);
  });

  test("a quarantined case (test.fail: expected, but no passing result) is NOT executed", () => {
    // `test.fail()` reports outcome "expected" while the case failed before its
    // real assertions. Reading `status` instead of the results would count it.
    const target = REQUIRED_PAIRS[0]!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project)!;
    arm.test.status = "expected";
    arm.test.results = [{ status: "failed" }];

    expect(missingPairs(report)).toEqual([target]);
  });

  test("a repeated case is one identity, not two", () => {
    const target = REQUIRED_PAIRS[0]!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project)!;
    arm.test.results = [{ status: "passed" }, { status: "passed" }];

    const ids = executedPairs(report).get(pairKey(target.title, target.project))!;
    expect(ids.size).toBe(1);
  });

  test("two DISTINCT specs sharing a title and project count as two identities", () => {
    const target = REQUIRED_PAIRS[0]!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project)!;
    const clone = JSON.parse(JSON.stringify(arm.spec)) as ReportSpec;
    clone.id = `${arm.spec.id}-clone`;
    specHolder(report).specs!.push(clone);

    const ids = executedPairs(report).get(pairKey(target.title, target.project))!;
    expect(ids.size).toBe(2);
  });

  test("a spec with no id falls back to file:line:title rather than colliding", () => {
    const target = REQUIRED_PAIRS[0]!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project)!;
    delete arm.spec.id;

    const ids = executedPairs(report).get(pairKey(target.title, target.project))!;
    expect([...ids]).toEqual([`${arm.spec.file}:${arm.spec.line}:${arm.spec.title}`]);
  });
});

describe("check-phantom-gap-executed — degenerate reports fail closed", () => {
  test.each([
    ["an empty report", {} as Report],
    ["a report with no suites", { suites: [] } as Report],
    ["a suite with no specs", { suites: [{ title: "x" }] } as Report],
    ["a spec with no tests", { suites: [{ specs: [{ title: "x" }] }] } as Report],
    [
      "a test with no results",
      { suites: [{ specs: [{ title: "x", tests: [{ projectName: "y" }] }] }] } as Report,
    ],
  ])("%s reports every required pair missing, and does not throw", (_label, report) => {
    expect(() => executedPairs(report)).not.toThrow();
    expect(missingPairs(report)).toEqual(REQUIRED_PAIRS);
  });

  test("nested suites are walked, not just the top level", () => {
    // The real report nests file suite > describe suite > specs. An oracle that
    // read only the first level would find nothing in a real run — and would
    // still pass a flat hand-built fixture, which is why this is asserted
    // against depth explicitly.
    const report = loadReport();
    premiseHolds(
      "the fixture's required specs live BELOW the top-level suite, or depth is untested",
      (report.suites ?? []).every((suite) => (suite.specs ?? []).length === 0),
    );

    expect(executedPairs(report).size).toBeGreaterThan(0);
  });
});

describe("check-phantom-gap-executed — operator-facing output", () => {
  test("the failure text names every missing pair with its project", () => {
    const text = formatFailure([...REQUIRED_PAIRS]);
    for (const pair of REQUIRED_PAIRS) {
      expect(text).toContain(pair.title);
      expect(text).toContain(`[${pair.project}]`);
    }
  });

  test("the success line names each executed pair with its project", () => {
    const text = formatSuccess(executedPairs(loadReport()));
    for (const pair of REQUIRED_PAIRS) {
      expect(text).toContain(pair.title);
      expect(text).toContain(`[${pair.project}]`);
    }
    // The key's two halves must come back apart: a separator that appeared in a
    // title would render the project into the title and this would fail.
    expect(text).not.toContain("\u0000");
  });

  test("the failure text closes with the operator instruction, not just the list", () => {
    // The last line is what tells whoever hits this in CI what to DO. Without an
    // assertion on it the line is decoration a refactor can silently drop.
    const text = formatFailure([...REQUIRED_PAIRS]);
    expect(text).toContain("A collected-but-skipped case reports green.");
    expect(text).toContain("REQUIRED_PAIRS");
  });

  test("pairKey does not collide across a title/project boundary", () => {
    expect(pairKey("a", "b c")).not.toBe(pairKey("a b", "c"));
  });
});

describe("check-phantom-gap-executed — the required titles are the LIVE ones", () => {
  test("every required title appears verbatim in the spec file it guards", () => {
    const spec = readFileSync(SPEC_PATH, "utf8");
    premiseHolds("the guarded spec file is readable and non-empty", spec.length > 0);
    for (const pair of REQUIRED_PAIRS) {
      expect(
        spec.includes(pair.title),
        `${SPEC_PATH} no longer declares "${pair.title}" — a rename here retires the ` +
          `requirement silently and the CI step goes dark green`,
      ).toBe(true);
    }
  });

  test("the pre-existing cases are required under mobile-safari ONLY", () => {
    // They declare a skip off mobile-safari (engine-specific geometry), so they
    // contribute nothing under desktop-chromium. Requiring those pairs would
    // demand executions that cannot happen — and if someone "fixed" that by
    // reverting the declared skips to bare returns, the requirement would then
    // be met by passing no-ops. This pins the omission against both directions.
    const preExisting = REQUIRED_PAIRS.filter(
      (pair) => !pair.title.includes("lightbox zoom gate:"),
    );
    premise("there are pre-existing cases to make this claim about", preExisting.length, 0);
    expect(preExisting.every((pair) => pair.project === "mobile-safari")).toBe(true);
    expect(
      REQUIRED_PAIRS.filter((pair) => pair.project === "desktop-chromium").map((p) => p.title),
    ).toEqual([
      "T-DIAGRAM-VARIANTS lightbox zoom gate: the ORIGINAL is not requested until zoom intent, then it is",
    ]);
  });
});

describe("check-phantom-gap-executed — the CLI decision layer", () => {
  test("resolveReportPath defaults to the path the workflow step writes", () => {
    expect(resolveReportPath([], "/repo")).toBe(join("/repo", ...DEFAULT_REPORT_RELATIVE));
    // Reconciled against the workflow, not just against itself: the step's
    // PLAYWRIGHT_JSON_OUTPUT_NAME and this default are the same string in two
    // files, and a drift between them makes the oracle read nothing.
    const workflow = readFileSync(".github/workflows/phantom-gap-e2e.yml", "utf8");
    expect(workflow).toContain(DEFAULT_REPORT_RELATIVE.join("/"));
  });

  test("resolveReportPath honours an explicit --report", () => {
    expect(resolveReportPath(["--report", "/tmp/other.json"], "/repo")).toBe("/tmp/other.json");
  });

  test("--report with no value resolves to undefined, NOT silently to the default", () => {
    // Falling back would read a different run's report and pass judgement on it
    // as if it were the one the operator named.
    expect(resolveReportPath(["--report"], "/repo")).toBeUndefined();
  });

  test("runCheck reports ok with the success text when every pair executed", () => {
    const result = runCheck(loadReport());
    expect(result.ok).toBe(true);
    expect(result.message).toContain("check-phantom-gap-executed: ok");
  });

  test("runCheck reports not-ok with the failure text when a pair is missing", () => {
    const target = REQUIRED_PAIRS.find((pair) => pair.project === "desktop-chromium")!;
    const report = loadReport();
    findArm(report, target.title, target.project)!.test.results = [{ status: "skipped" }];

    const result = runCheck(report);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(target.title);
  });
});

describe("check-phantom-gap-executed — the shipped CLI", () => {
  test("exits 0 and prints the summary on a report where every pair ran", () => {
    premiseHolds("the CLI this suite spawns is present to be spawned", existsSync(CLI));
    const result = runCli(["--report", FIXTURE_PATH]);
    premiseHolds(`node actually ran the CLI (${result.error?.message ?? "ran"})`, !result.error);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("check-phantom-gap-executed: ok");
  });

  test("exits 1 and names the missing pair on a doctored report", () => {
    premiseHolds("the CLI this suite spawns is present to be spawned", existsSync(CLI));
    const target = REQUIRED_PAIRS.find((pair) => pair.project === "desktop-chromium")!;
    const report = loadReport();
    const arm = findArm(report, target.title, target.project);
    premiseHolds(`the fixture carries the arm to doctor (${target.title})`, arm !== undefined);
    // Without this, a fixture whose arm was ALREADY skipped would make the exit
    // code below prove nothing about the doctoring.
    premiseHolds(
      "the arm ran before doctoring, so the skip is this test's doing",
      (arm!.test.results ?? []).some((r) => r.status === "passed"),
    );
    arm!.test.results = [{ status: "skipped" }];
    const doctored = join(tmpdir(), `phantom-gap-doctored-${process.pid}.json`);
    writeFileSync(doctored, JSON.stringify(report));

    try {
      const result = runCli(["--report", doctored]);
      premiseHolds(`node actually ran the CLI (${result.error?.message ?? "ran"})`, !result.error);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(target.title);
    } finally {
      rmSync(doctored, { force: true });
    }
  });

  test("exits 1 when the run produced no report at all", () => {
    premiseHolds("the CLI this suite spawns is present to be spawned", existsSync(CLI));
    // Fail CLOSED. A missing report is the shape of a Playwright invocation that
    // died before writing one, which is precisely when a green step would lie.
    const absent = join(tmpdir(), "phantom-gap-absent.json");
    premiseHolds("the report this test calls absent is genuinely absent", !existsSync(absent));
    const result = runCli(["--report", absent]);
    premiseHolds(`node actually ran the CLI (${result.error?.message ?? "ran"})`, !result.error);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no report at");
  });
});
