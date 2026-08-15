/**
 * tests/ci/appE2eAnnotationPrint.test.ts
 *
 * The app-e2e oracle's SECOND duty: printing every `infra-recovery` annotation
 * into the job log. Spec:
 * docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §4.4
 *
 * Why end-to-end (child process), not a collector unit test: a collector whose
 * rows nobody prints keeps recoveries invisible, which is the whole defect —
 * green runs upload no Playwright artifact and the list reporter prints no
 * annotations, so stdout is the only surface an operator ever sees. The seam
 * under test is therefore `node scripts/check-app-e2e-executed.mjs --report <r>`
 * and its stdout, not an exported function's return value.
 *
 * Anti-tautology: the synthetic report is GENERATED from the live `REQUIRED`
 * table the script itself reads, so the floor check passes without this file
 * hardcoding any count. A row added to `REQUIRED` changes the fixture, never
 * this test's expectations.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { premise } from "../_shared/premise";

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

type ReportSpec = {
  title: string;
  file: string;
  line: number;
  tests: ReportTest[];
};

type ReportSuite = {
  title: string;
  file: string;
  specs: ReportSpec[];
  suites?: ReportSuite[];
};

function passingTest(projectId: string): ReportTest {
  return {
    timeout: 30_000,
    annotations: [],
    expectedStatus: "passed",
    projectId,
    projectName: projectId,
    status: "expected",
    // FIRST-ATTEMPT semantics: exactly one result, passed (the oracle refuses a
    // fail-then-pass retry).
    results: [{ status: "passed" }],
  };
}

async function loadRequired(): Promise<Record<string, number>> {
  const mod = (await import("../../scripts/check-app-e2e-executed.mjs")) as {
    REQUIRED: Record<string, number>;
  };
  return mod.REQUIRED;
}

function buildReport(required: Record<string, number>): {
  report: { suites: ReportSuite[] };
  annotatedSpecs: ReportSpec[];
} {
  // Real describe-wrapped reports NEST specs under suite.suites (the live
  // fixture tests/ci/fixtures/phantom-gap-diagrams-report.json has this shape);
  // every spec here is nested one level down, so a collector that drops the
  // walk(suite.suites) recursion finds ZERO specs and the count assertions fail.
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

describe("check-app-e2e-executed annotation print seam", () => {
  test("prints one line per infra-recovery from tests[].annotations only, plus a total", async () => {
    const required = await loadRequired();
    const { report, annotatedSpecs } = buildReport(required);

    // The three annotation cases below need three distinct specs in the first
    // REQUIRED row; with fewer, the duplicate-location and wrong-type cases
    // would never be constructed and this test would pass without exercising
    // them.
    premise(
      "the first REQUIRED row carries enough cases to host all three annotation shapes",
      annotatedSpecs.length,
      2,
    );

    // (a) one test carrying TWO recoveries — both must print.
    annotatedSpecs[0]!.tests[0]!.annotations = [
      { type: "infra-recovery", description: "recovery one" },
      { type: "infra-recovery", description: "recovery two" },
    ];
    // (b) the SAME annotation serialized at both locations Playwright writes it
    //     to; the merged tests[] location is read, so it prints exactly once.
    annotatedSpecs[1]!.tests[0]!.annotations = [{ type: "infra-recovery", description: "dup" }];
    annotatedSpecs[1]!.tests[0]!.results[0]!.annotations = [
      { type: "infra-recovery", description: "dup" },
    ];
    // (c) a DIFFERENT annotation type that must NOT print — deleting the type
    //     filter fails the count assertion on this row.
    annotatedSpecs[2]!.tests[0]!.annotations = [{ type: "slow", description: "not a recovery" }];

    const dir = mkdtempSync(join(tmpdir(), "app-e2e-annot-"));
    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(report));

    // execFileSync throws on a non-zero exit, which doubles as the exit-0
    // assertion: the floor check must still pass on this synthetic report.
    const stdout = execFileSync(
      "node",
      ["scripts/check-app-e2e-executed.mjs", "--report", reportPath],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const lines = stdout.split("\n").filter((l) => l.startsWith("infra-recovery:"));
    expect(lines).toHaveLength(3); // two from spec[0], ONE from the duplicated spec[1]
    // Row format pins TITLE + description; a printer that drops the test
    // identity (which case recovered?) fails here, not just on the description.
    expect(lines[0]).toContain("case 0");
    expect(lines[0]).toContain("recovery one");
    expect(stdout).toContain("recovery two");
    expect(stdout).not.toContain("not a recovery"); // the type filter is load-bearing
    expect(stdout).toContain("infra-recovery total: 3");
  });
});
