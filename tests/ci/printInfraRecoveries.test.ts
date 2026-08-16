/**
 * tests/ci/printInfraRecoveries.test.ts
 *
 * Two duties, both proved through child processes rather than an exported
 * function's return value.
 *
 * 1. `scripts/print-infra-recoveries.mjs` — the thin printer every member
 *    workflow step runs under `if: always()`. It must print rows from
 *    `tests[].annotations` ONLY (Playwright serializes a runtime-pushed
 *    annotation at both locations; traversing both double-counts every
 *    recovery), and it must ALWAYS exit 0, because a non-zero exit under
 *    `always()` would convert a passing run red for a recovery the design
 *    expects.
 *
 * 2. PRINT-BEFORE-GATE in both gating oracles (spec §4.3). Each is run against
 *    a report carrying BOTH an `infra-recovery` annotation AND an
 *    executed-count floor shortfall, asserting the annotation IS printed and
 *    the exit code is still 1. Without these two the ordering rule is asserted
 *    NOWHERE: the printer case exercises an always-zero process, and
 *    tests/ci/appE2eAnnotationPrint.test.ts exercises a successful run.
 *
 * Anti-tautology: every fixture is generated from the live `REQUIRED` table the
 * script under test reads, so a row added there changes the fixture and never
 * this file's expectations. The shortfall is produced by REMOVING cases from
 * that generated report, so it cannot be satisfied by a report the oracle would
 * have rejected for some other reason.
 *
 * Spec: docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md §4.3
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";

type Annotation = { type: string; description?: string };

type ReportTest = {
  timeout: number;
  annotations: Annotation[];
  expectedStatus: string;
  projectId: string;
  projectName: string;
  status: string;
  results: Array<{ status: string; annotations?: Annotation[] }>;
};

type ReportSpec = { title: string; file: string; line: number; tests: ReportTest[] };
type ReportSuite = { title: string; file: string; specs: ReportSpec[]; suites?: ReportSuite[] };
type Report = { suites: ReportSuite[] };

function passingTest(projectId: string): ReportTest {
  return {
    timeout: 30_000,
    annotations: [],
    expectedStatus: "passed",
    projectId,
    projectName: projectId,
    status: "expected",
    results: [{ status: "passed" }],
  };
}

async function loadRequired(script: string): Promise<Record<string, number>> {
  const mod = (await import(`../../scripts/${script}`)) as { REQUIRED: Record<string, number> };
  return mod.REQUIRED;
}

/** A report satisfying every floor in `required`, nested one describe level deep. */
function buildReport(required: Record<string, number>): {
  report: Report;
  annotatedSpecs: ReportSpec[];
} {
  const suites: ReportSuite[] = Object.entries(required).map(([file, count]) => ({
    title: file,
    file: `tests/e2e/${file}`,
    specs: [],
    suites: [
      {
        title: "describe block",
        file: `tests/e2e/${file}`,
        specs: Array.from({ length: count }, (_, i) => ({
          title: `case ${i}`,
          file: `tests/e2e/${file}`,
          line: 10 + i,
          tests: [passingTest(`proj-${i % 2}`)],
        })),
      },
    ],
  }));
  const first = suites[0]?.suites?.[0];
  if (!first) throw new Error("REQUIRED produced no rows — the fixture cannot be built");
  return { report: { suites }, annotatedSpecs: first.specs };
}

function writeReport(prefix: string, report: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const path = join(dir, "report.json");
  writeFileSync(path, JSON.stringify(report));
  return path;
}

/**
 * Runs a node script and returns stdout, stderr AND the exit code.
 *
 * spawnSync, not execFileSync: the latter returns stdout only and throws on a
 * non-zero exit, so the exit-0 cases below would have no stderr to assert
 * against — which is exactly how the first draft of this file passed its
 * missing-report case against an empty string.
 */
function run(args: string[]): { stdout: string; stderr: string; code: number } {
  const result = spawnSync("node", args, { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? -1 };
}

describe("print-infra-recoveries (the thin printer)", () => {
  test("prints rows from tests[].annotations only, exactly once, plus a total", async () => {
    const { report, annotatedSpecs } = buildReport(
      await loadRequired("check-app-e2e-executed.mjs"),
    );
    premise(
      "the first REQUIRED row hosts enough cases for all three annotation shapes",
      annotatedSpecs.length,
      2,
    );

    // (a) one test carrying TWO recoveries — both print.
    annotatedSpecs[0]!.tests[0]!.annotations = [
      { type: "infra-recovery", description: "recovery one" },
      { type: "infra-recovery", description: "recovery two" },
    ];
    // (b) the SAME annotation at both locations Playwright writes it to; the
    //     merged tests[] location is read, so it prints exactly once.
    annotatedSpecs[1]!.tests[0]!.annotations = [{ type: "infra-recovery", description: "dup" }];
    annotatedSpecs[1]!.tests[0]!.results[0]!.annotations = [
      { type: "infra-recovery", description: "dup" },
    ];
    // (c) a different annotation type that must NOT print.
    annotatedSpecs[2]!.tests[0]!.annotations = [{ type: "slow", description: "not a recovery" }];

    const { stdout, code } = run([
      "scripts/print-infra-recoveries.mjs",
      "--report",
      writeReport("print-infra-", report),
    ]);

    expect(code, "informational, never a gate").toBe(0);
    const rows = stdout.split("\n").filter((l) => l.startsWith("infra-recovery:"));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("case 0");
    expect(rows[0]).toContain("recovery one");
    expect(stdout).toContain("recovery two");
    expect(stdout).not.toContain("not a recovery");
    expect(stdout).toContain("infra-recovery total: 3");
  });

  test("a report with zero recoveries still prints the total", async () => {
    // "No recoveries" and "the print duty regressed" must stay distinguishable.
    const { report } = buildReport(await loadRequired("check-app-e2e-executed.mjs"));
    const { stdout, code } = run([
      "scripts/print-infra-recoveries.mjs",
      "--report",
      writeReport("print-infra-zero-", report),
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("infra-recovery total: 0");
    expect(stdout.split("\n").filter((l) => l.startsWith("infra-recovery:"))).toHaveLength(0);
  });

  test("a missing or malformed report surfaces a message and STILL exits 0", () => {
    const missing = run(["scripts/print-infra-recoveries.mjs", "--report", "/nope/absent.json"]);
    expect(missing.code).toBe(0);
    expect(missing.stderr).toContain("no report at");

    const dir = mkdtempSync(join(tmpdir(), "print-infra-bad-"));
    const badPath = join(dir, "report.json");
    writeFileSync(badPath, "{ this is not json");
    const malformed = run(["scripts/print-infra-recoveries.mjs", "--report", badPath]);
    expect(malformed.code, "under if: always(), a parse error must not turn a run red").toBe(0);
    expect(malformed.stderr).toContain("could not parse");

    const noFlag = run(["scripts/print-infra-recoveries.mjs"]);
    expect(noFlag.code).toBe(0);
  });
});

describe.each([
  ["check-app-e2e-executed.mjs", "check-app-e2e-executed"],
  ["check-crew-e2e-executed.mjs", "check-crew-e2e-executed"],
])("print-before-gate: %s", (script, prefix) => {
  test("prints the recovery AND still exits 1 on an executed-count shortfall", async () => {
    const required = await loadRequired(script);
    const { report, annotatedSpecs } = buildReport(required);

    annotatedSpecs[0]!.tests[0]!.annotations = [
      { type: "infra-recovery", description: "boundary recovered, then a later assertion failed" },
    ];

    // Produce the shortfall by deleting cases from the LAST required row, so the
    // annotated first row survives to be printed. Derived from the live table:
    // a row added to REQUIRED changes this fixture, never these expectations.
    const lastFile = Object.keys(required).at(-1)!;
    const lastSuite = report.suites.find((s) => s.file === `tests/e2e/${lastFile}`)?.suites?.[0];
    premiseHolds("the shortfall row exists in the generated report", lastSuite !== undefined);
    lastSuite!.specs = [];
    premise("the shortfall row had cases to remove", required[lastFile] ?? 0, 0);

    const { stdout, stderr, code } = run([
      `scripts/${script}`,
      "--report",
      writeReport(`${prefix}-shortfall-`, report),
    ]);

    // The gate still gates. If this ever reads 0, the repair converted a red run
    // green, which is the one thing the ordering rule must not do.
    expect(code, "the floor shortfall must still fail the job").toBe(1);
    expect(stderr).toContain("guarded specs did not run");
    // ...and the recovery is named anyway, which it was not before the repair:
    // process.exit(1) sat above the reporting tail in BOTH oracles.
    expect(stdout).toContain("boundary recovered, then a later assertion failed");
    expect(stdout).toContain("infra-recovery total: 1");
  });
});
